import { supabase } from '../lib/supabaseClient';
import { User, WorkoutSessionEntry, WorkoutSessionExercise, WorkoutSetEntry, MuscleGroup } from '../types/domain';
import { mapSessionRow } from '../utils/workoutSessionMapper';
import { getAppTimeZone } from '../utils/time';
import { formatLocalDateYMD } from '../utils/date';
import type { AdaptationMode } from './planningRules';
export { fetchExerciseCatalog, type ExerciseCatalogEntry } from './exerciseProvider';
import { replacePlanExercisesForDate } from './planRuntimeService';

type WorkoutTemplateExerciseRow = {
  id: string;
  exercise_id: string | null;
  exercise_name: string;
  movement_pattern: string | null;
  body_parts: string[] | null;
  sets: number | null;
  reps: string | null;
  display_order: number | null;
  notes: string | null;
};

type WorkoutTemplateRow = {
  id: string;
  title: string;
  description: string | null;
  difficulty: string | null;
  equipment_level: string | null;
  estimated_time_minutes: number | null;
  goal_tags: string[] | null;
  created_by: string | null;
  is_public: boolean;
  is_deprecated: boolean;
  exercises: WorkoutTemplateExerciseRow[];
};

export const fetchWorkoutTemplates = async (
  userId: string
): Promise<WorkoutTemplateRow[]> => {
  const { data, error } = await supabase
    .from('fitarc_workout_templates')
    .select(
      `
      id,
      title,
      description,
      difficulty,
      equipment_level,
      estimated_time_minutes,
      goal_tags,
      created_by,
      is_public,
      is_deprecated,
      exercises:fitarc_workout_template_exercises (
        id,
        exercise_id,
        exercise_name,
        movement_pattern,
        body_parts,
        sets,
        reps,
        display_order,
        notes
      )
    `
    )
    .eq('is_deprecated', false)
    .or(`is_public.eq.true,created_by.eq.${userId}`);

  if (error) throw error;
  return (data ?? []) as WorkoutTemplateRow[];
};

export type ExerciseDefaultRecord = {
  id: string;
  user_id: string;
  exercise_id: string | null;
  user_exercise_id: string | null;
  default_weight: number | null;
  default_reps: number | null;
  default_sets: number | null;
  default_rest_seconds: number | null;
  notes: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type ExerciseDefault = {
  id: string;
  exerciseId?: string | null;
  userExerciseId?: string | null;
  defaultWeight?: number | null;
  defaultReps?: number | null;
  defaultSets?: number | null;
  defaultRestSeconds?: number | null;
  notes?: string | null;
  updatedAt?: string;
};

const mapExerciseDefaultRecord = (record: ExerciseDefaultRecord): ExerciseDefault => ({
  id: record.id,
  exerciseId: record.exercise_id,
  userExerciseId: record.user_exercise_id,
  defaultWeight: record.default_weight,
  defaultReps: record.default_reps,
  defaultSets: record.default_sets,
  defaultRestSeconds: record.default_rest_seconds,
  notes: record.notes ?? undefined,
  updatedAt: record.updated_at,
});

export const fetchExerciseDefaults = async (userId: string): Promise<ExerciseDefault[]> => {
  const { data, error } = await supabase
    .from('fitarc_user_exercise_defaults')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((record) => mapExerciseDefaultRecord(record as ExerciseDefaultRecord));
};

export type UpsertExerciseDefaultInput = {
  id?: string;
  userId: string;
  exerciseId?: string | null;
  userExerciseId?: string | null;
  defaultWeight?: number | null;
  defaultReps?: number | null;
  defaultSets?: number | null;
  defaultRestSeconds?: number | null;
  notes?: string | null;
};

export const upsertExerciseDefault = async (
  input: UpsertExerciseDefaultInput
): Promise<ExerciseDefault> => {
  const {
    id,
    userId,
    exerciseId = null,
    userExerciseId = null,
    defaultWeight = null,
    defaultReps = null,
    defaultSets = null,
    defaultRestSeconds = null,
    notes = null,
  } = input;

  if (!exerciseId && !userExerciseId) {
    throw new Error('exerciseId or userExerciseId must be provided');
  }

  const payload = {
    user_id: userId,
    exercise_id: exerciseId,
    user_exercise_id: userExerciseId,
    default_weight: defaultWeight,
    default_reps: defaultReps,
    default_sets: defaultSets,
    default_rest_seconds: defaultRestSeconds,
    notes,
  };

  const query = supabase.from('fitarc_user_exercise_defaults');
  const { data, error } = id
    ? await query.update(payload).eq('id', id).select().single()
    : await query
        .upsert(payload, { onConflict: 'user_id,exercise_id,user_exercise_id' })
        .select()
        .single();

  if (error) {
    throw error;
  }

  return mapExerciseDefaultRecord(data as ExerciseDefaultRecord);
};

export const deleteExerciseDefault = async (id: string) => {
  const { error } = await supabase.from('fitarc_user_exercise_defaults').delete().eq('id', id);
  if (error) {
    throw error;
  }
};

type CreateWorkoutSessionInput = {
  userId: string;
  planId: string;
  date: string;
  splitDayId?: string | null;
};

export const createWorkoutSession = async ({
  userId,
  planId,
  date,
  splitDayId = null,
}: CreateWorkoutSessionInput): Promise<WorkoutSessionEntry> => {
  const performedAt = normalizeDate(date);
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .insert({
      user_id: userId,
      plan_id: planId,
      performed_at: performedAt,
      split_day_id: splitDayId,
      planned_date: normalizeDate(date),
    })
    .select('id, user_id, plan_id, performed_at, notes, complete')
    .single();

  if (error) throw error;

  return mapSessionRow(
    {
      ...data,
      session_exercises: [],
    },
    planId,
    getAppTimeZone()
  );
};

type CreateSessionFromPlanInput = {
  userId: string;
  planId: string;
  date: string;
  exercises: WorkoutSessionExercise[];
  splitDayId?: string | null;
};

export const createSessionFromPlanWorkout = async ({
  userId,
  planId,
  date,
  exercises,
  splitDayId = null,
}: CreateSessionFromPlanInput): Promise<string> => {
  const existingRes = await supabase
    .from('fitarc_workout_sessions')
    .select('id, session_exercises:fitarc_workout_session_exercises(id)')
    .eq('plan_id', planId)
    .eq('planned_date', normalizeDate(date))
    .maybeSingle();
  if (existingRes.error) throw existingRes.error;
  if (existingRes.data?.id) {
    const sessionId = existingRes.data.id;
    const existingExercises = (existingRes.data as any).session_exercises ?? [];
    // Session exists but has no exercises — populate them now
    if (existingExercises.length === 0 && exercises.length > 0) {
      for (let index = 0; index < exercises.length; index += 1) {
        try {
          await addExerciseToSession({
            sessionId,
            exercise: exercises[index],
            displayOrder: exercises[index].displayOrder ?? index + 1,
          });
        } catch {
          // ignore duplicate_exercise errors (exercise already added concurrently)
        }
      }
    }
    return sessionId;
  }

  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .insert({
      user_id: userId,
      plan_id: planId,
      performed_at: normalizeDate(date),
      planned_date: normalizeDate(date),
      split_day_id: splitDayId,
    })
    .select('id')
    .single();
  if (error) throw error;

  for (let index = 0; index < exercises.length; index += 1) {
    const exercise = exercises[index];
    await addExerciseToSession({
      sessionId: data.id,
      exercise,
      displayOrder: exercise.displayOrder ?? index + 1,
    });
  }

  return data.id;
};

export type WorkoutSessionRow = {
  id: string;
  user_id: string;
  performed_at: string;
  mood: string | null;
  perceived_exertion: number | null;
  notes: string | null;
};

export type WorkoutSessionExerciseRow = {
  id: string;
  session_id: string;
  exercise_id: string | null;
  user_exercise_id: string | null;
  display_order: number;
  notes: string | null;
};

export type WorkoutSetRow = {
  id: string;
  session_exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  rest_seconds: number | null;
};

const normalizeDate = (date: string) => {
  if (date.includes('T')) return date.split('T')[0];
  return date;
};

const parseRepsValue = (value: string): number | null => {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
};

const parseYMDToDate = (value: string): Date => {
  const [year, month, day] = value.split('-').map((part) => parseInt(part, 10) || 0);
  return new Date(year, Math.max(0, month - 1), day || 1);
};

const buildSetPayloads = (exercise: WorkoutSessionExercise): WorkoutSetEntry[] => {
  if (!exercise.setDetails || !exercise.setDetails.length) {
    return [];
  }
  return exercise.setDetails.map((set, index) => ({
    setNumber: set?.setNumber ?? index + 1,
    weight: set?.weight,
    reps: set?.reps,
    rpe: set?.rpe,
    restSeconds: set?.restSeconds,
  }));
};

const buildDefaultSetPayloads = (
  exercise: WorkoutSessionExercise
): WorkoutSetInsert[] => {
  const setCount = Math.max(1, exercise.sets ?? 3);
  const repsValue = parseRepsValue(exercise.reps ?? '');

  return Array.from({ length: setCount }).map((_, idx) => ({
    session_exercise_id: exercise.id as string,
    set_number: idx + 1,
    weight: null,
    reps: repsValue,
    rpe: null,
    rest_seconds: null,
  }));
};

type WorkoutSetInsert = {
  session_exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  rest_seconds: number | null;
};

const buildDateRange = (start: string, end: string): string[] => {
  const results: string[] = [];
  const startDate = parseYMDToDate(start);
  const endDate = parseYMDToDate(end);
  const cursor = new Date(startDate);
  while (cursor.getTime() <= endDate.getTime()) {
    results.push(formatLocalDateYMD(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
};

type LogWorkoutSetInput = {
  sessionExerciseId: string;
  setNumber: number;
  weight?: number;
  reps?: number;
  rpe?: number;
  restSeconds?: number;
};

export const logWorkoutSet = async ({
  sessionExerciseId,
  setNumber,
  weight,
  reps,
  rpe,
  restSeconds,
}: LogWorkoutSetInput): Promise<WorkoutSetRow> => {
  const { data, error } = await supabase
    .from('fitarc_workout_sets')
    .insert({
      session_exercise_id: sessionExerciseId,
      set_number: setNumber,
      weight: weight ?? null,
      reps: reps ?? null,
      rpe: rpe ?? null,
      rest_seconds: restSeconds ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as WorkoutSetRow;
};

export const ensureSetsForExercises = async (
  exercises: WorkoutSessionExercise[]
): Promise<void> => {
  if (!exercises.length) return;

  const payload: WorkoutSetInsert[] = [];

  exercises.forEach((exercise) => {
    if (!exercise?.id) return;
    const existingCount = exercise.setDetails?.length ?? 0;
    if (existingCount > 0) return;
    payload.push(...buildDefaultSetPayloads(exercise));
  });

  if (!payload.length) return;

  const { error } = await supabase.from('fitarc_workout_sets').insert(payload);
  if (error) throw error;
};

export const fetchWorkoutSessionEntries = async (
  userId: string,
  phasePlanId?: string,
  timeZone: string = getAppTimeZone()
): Promise<WorkoutSessionEntry[]> => {
  const query = supabase
    .from('fitarc_workout_sessions')
    .select(`
      id,
      user_id,
      plan_id,
      performed_at,
      notes,
      mood,
      perceived_exertion,
      complete,
      session_exercises:fitarc_workout_session_exercises (
        id,
        display_order,
        notes,
        complete,
        exercise:fitarc_exercises (
          id,
          name,
          movement_pattern,
          muscle_links:fitarc_exercise_muscle_groups (
            role,
            muscle:fitarc_muscle_groups (
              name
            )
          )
        ),
        sets:fitarc_workout_sets (
          set_number,
          reps,
          weight,
          rpe,
          rest_seconds
        )
      )
    `)
    .eq('user_id', userId);

  if (phasePlanId) {
    query.eq('plan_id', phasePlanId);
  }

  const { data, error } = await query.order('performed_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data as any[]) || [];
  const res =  rows.map((session) => mapSessionRow(session, phasePlanId, timeZone));
  return res;
};

type UpsertWorkoutSessionInput = {
  userId: string;
  planId: string;
  date: string;
  exercises: WorkoutSessionExercise[];
};

const deleteExercisesForSession = async (sessionId: string) => {
  const existingExercisesRes = await supabase
    .from('fitarc_workout_session_exercises')
    .select('id')
    .eq('session_id', sessionId);
  if (existingExercisesRes.error) throw existingExercisesRes.error;
  const sessionExerciseIds = existingExercisesRes.data?.map((row) => row.id) ?? [];
  if (sessionExerciseIds.length) {
    const deleteSetsRes = await supabase
      .from('fitarc_workout_sets')
      .delete()
      .in('session_exercise_id', sessionExerciseIds);
    if (deleteSetsRes.error) throw deleteSetsRes.error;
  }
  const deleteExercisesRes = await supabase
    .from('fitarc_workout_session_exercises')
    .delete()
    .eq('session_id', sessionId);
  if (deleteExercisesRes.error) throw deleteExercisesRes.error;
};

export const upsertWorkoutSessionWithExercises = async ({
  userId,
  planId,
  date,
  exercises,
}: UpsertWorkoutSessionInput): Promise<WorkoutSessionEntry> => {
  const performedAt = normalizeDate(date);

  const existingSessionRes = await supabase
    .from('fitarc_workout_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('performed_at', performedAt)
    .maybeSingle();

  let sessionId: string;
  if (existingSessionRes.error) throw existingSessionRes.error;

  if (existingSessionRes.data?.id) {
    sessionId = existingSessionRes.data.id;
    await deleteExercisesForSession(sessionId);
  } else {
    const createRes = await supabase
      .from('fitarc_workout_sessions')
      .insert({
        user_id: userId,
        plan_id: planId,
        performed_at: performedAt,
      })
      .select('id')
      .single();
    if (createRes.error) throw createRes.error;
    sessionId = createRes.data.id;
  }

  for (let index = 0; index < exercises.length; index += 1) {
    const exercise = exercises[index];
    const insertExerciseRes = await supabase
      .from('fitarc_workout_session_exercises')
      .insert({
        session_id: sessionId,
        exercise_id: exercise.exerciseId ?? null,
        user_exercise_id: null,
        display_order: index + 1,
        notes: exercise.reps,
      })
      .select('id')
      .single();
    if (insertExerciseRes.error) throw insertExerciseRes.error;
    const sessionExerciseId = insertExerciseRes.data.id;
    const setRows = buildSetPayloads(exercise);
    if (setRows.length) {
      const payload = setRows.map((set, setIdx) => ({
        session_exercise_id: sessionExerciseId,
        set_number: set.setNumber ?? setIdx + 1,
        weight: set.weight ?? null,
        reps: set.reps ?? null,
        rpe: set.rpe ?? null,
        rest_seconds: set.restSeconds ?? null,
      }));
      const insertSetsRes = await supabase.from('fitarc_workout_sets').insert(payload);
      if (insertSetsRes.error) throw insertSetsRes.error;
    }
  }

  const sessionRes = await supabase
    .from('fitarc_workout_sessions')
    .select(
      `
      id,
      user_id,
      plan_id,
      performed_at,
      notes,
      complete,
      session_exercises:fitarc_workout_session_exercises (
        id,
        display_order,
        complete,
        exercise:fitarc_exercises (
          id,
          name,
          movement_pattern,
          muscle_links:fitarc_exercise_muscle_groups (
            role,
            muscle:fitarc_muscle_groups ( name )
          )
        ),
        sets:fitarc_workout_sets (
          set_number,
          reps,
          weight,
          rpe,
          rest_seconds
        )
      )
    `
    )
    .eq('id', sessionId)
    .single();

  if (sessionRes.error) throw sessionRes.error;

  return mapSessionRow(sessionRes.data, planId, getAppTimeZone());
};

type AddExerciseToSessionInput = {
  sessionId: string;
  exercise: WorkoutSessionExercise;
  displayOrder: number;
};

export const addExerciseToSession = async ({
  sessionId,
  exercise,
  displayOrder,
}: AddExerciseToSessionInput): Promise<string> => {
  if (exercise.exerciseId) {
    const existingRes = await supabase
      .from('fitarc_workout_session_exercises')
      .select('id')
      .eq('session_id', sessionId)
      .eq('exercise_id', exercise.exerciseId)
      .maybeSingle();
    if (existingRes.error) throw existingRes.error;
    if (existingRes.data?.id) {
      throw new Error('duplicate_exercise');
    }
  }

  const insertExerciseRes = await supabase
    .from('fitarc_workout_session_exercises')
    .insert({
      session_id: sessionId,
      exercise_id: exercise.exerciseId ?? null,
      user_exercise_id: null,
      display_order: displayOrder,
      notes: exercise.reps ?? null,
    })
    .select('id')
    .single();
  if (insertExerciseRes.error) throw insertExerciseRes.error;

  const sessionExerciseId = insertExerciseRes.data.id;
  const repsValue = parseRepsValue(exercise.reps ?? '');
  const setCount = Math.max(0, exercise.sets ?? 0);
  if (setCount > 0) {
    const payload = Array.from({ length: setCount }).map((_, setIdx) => ({
      session_exercise_id: sessionExerciseId,
      set_number: setIdx + 1,
      weight: null,
      reps: repsValue,
      rpe: null,
      rest_seconds: null,
    }));
    const insertSetsRes = await supabase.from('fitarc_workout_sets').insert(payload);
    if (insertSetsRes.error) throw insertSetsRes.error;
  }

  return sessionExerciseId;
};

type UpdateSessionExercisesInput = {
  sessionId: string;
  exercises: WorkoutSessionExercise[];
};

export const updateSessionExercises = async ({
  sessionId: _sessionId,
  exercises,
}: UpdateSessionExercisesInput): Promise<void> => {
  const sessionId = _sessionId;
  for (let index = 0; index < exercises.length; index += 1) {
    const exercise = exercises[index];
    if (!exercise.id) continue;
    const displayOrder = exercise.displayOrder ?? index + 1;
    const { error: updateError } = await supabase
      .from('fitarc_workout_session_exercises')
      .update({
        display_order: displayOrder,
        notes: exercise.reps ?? null,
        complete: exercise.completed ?? false,
      })
      .eq('id', exercise.id);
    if (updateError) throw updateError;

    const { error: deleteSetsError } = await supabase
      .from('fitarc_workout_sets')
      .delete()
      .eq('session_exercise_id', exercise.id);
    if (deleteSetsError) throw deleteSetsError;

    const setRows = buildSetPayloads(exercise);
    let payload: WorkoutSetInsert[] = [];
    if (setRows.length) {
      payload = setRows.map((set, setIdx) => ({
        session_exercise_id: exercise.id as string,
        set_number: set.setNumber ?? setIdx + 1,
        weight: set.weight ?? null,
        reps: set.reps ?? null,
        rpe: set.rpe ?? null,
        rest_seconds: set.restSeconds ?? null,
      }));
    } else {
      const repsValue = parseRepsValue(exercise.reps ?? '');
      const setCount = Math.max(0, exercise.sets ?? 0);
      payload = Array.from({ length: setCount }).map((_, setIdx) => ({
        session_exercise_id: exercise.id as string,
        set_number: setIdx + 1,
        weight: null,
        reps: repsValue,
        rpe: null,
        rest_seconds: null,
      }));
    }

    if (payload.length) {
      const { error: insertSetsError } = await supabase
        .from('fitarc_workout_sets')
        .insert(payload);
      if (insertSetsError) throw insertSetsError;
    }
  }

  const isComplete =
    exercises.length > 0 && exercises.every((exercise) => exercise.completed === true);
  const { error: sessionCompleteError } = await supabase
    .from('fitarc_workout_sessions')
    .update({ complete: isComplete })
    .eq('id', sessionId);
  if (sessionCompleteError) throw sessionCompleteError;
};

export const deleteWorkoutSessionExercise = async (
  sessionExerciseId: string
): Promise<void> => {
  const { error: deleteSetsError } = await supabase
    .from('fitarc_workout_sets')
    .delete()
    .eq('session_exercise_id', sessionExerciseId);
  if (deleteSetsError) throw deleteSetsError;

  const { error: deleteExerciseError } = await supabase
    .from('fitarc_workout_session_exercises')
    .delete()
    .eq('id', sessionExerciseId);
  if (deleteExerciseError) throw deleteExerciseError;
};

/**
 * Returns true if any set in this session has logged weight or reps data,
 * indicating the user has already started tracking their workout.
 */
export const sessionHasLoggedProgress = async (sessionId: string): Promise<boolean> => {
  const { data: exerciseRows, error: exError } = await supabase
    .from('fitarc_workout_session_exercises')
    .select('id')
    .eq('session_id', sessionId);
  if (exError) {
    console.warn('sessionHasLoggedProgress exercise query error:', exError);
    return false;
  }
  const exerciseIds = (exerciseRows ?? []).map((r) => r.id as string);
  if (!exerciseIds.length) return false;

  const { data: setRows, error: setError } = await supabase
    .from('fitarc_workout_sets')
    .select('id')
    .in('session_exercise_id', exerciseIds)
    .or('weight.not.is.null,reps.not.is.null')
    .limit(1);
  if (setError) {
    console.warn('sessionHasLoggedProgress set query error:', setError);
    return false;
  }
  return (setRows?.length ?? 0) > 0;
};

type DeleteWorkoutSessionInput = {
  userId: string;
  planId: string;
  date: string;
};

export const deleteWorkoutSessionRemote = async ({
  userId,
  planId,
  date,
}: DeleteWorkoutSessionInput) => {
  const performedAt = normalizeDate(date);
  const existingRes = await supabase
    .from('fitarc_workout_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('performed_at', performedAt)
    .maybeSingle();
  if (existingRes.error) throw existingRes.error;
  if (!existingRes.data?.id) return;
  await deleteExercisesForSession(existingRes.data.id);
  const deleteSessionRes = await supabase
    .from('fitarc_workout_sessions')
    .delete()
    .eq('id', existingRes.data.id);
  if (deleteSessionRes.error) throw deleteSessionRes.error;
};

export const fetchWorkoutCompletionMap = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, boolean>> => {
  const rangeDays = buildDateRange(startDate, endDate);
  if (!rangeDays.length) {
    return {};
  }
  const dayMap: Record<string, boolean> = {};
  rangeDays.forEach((day) => {
    dayMap[day] = false;
  });

  const { data: sessionRows, error: sessionError } = await supabase
    .from('fitarc_workout_sessions')
    .select('id, performed_at, complete')
    .eq('user_id', userId)
    .gte('performed_at', startDate)
    .lte('performed_at', endDate);

  if (sessionError) throw sessionError;
  const sessions = sessionRows || [];
  if (!sessions.length) {
    return dayMap;
  }

  const todayKey = formatLocalDateYMD(new Date());

  sessions.forEach((session) => {
    const sessionDate = session.performed_at
      ? formatLocalDateYMD(new Date(session.performed_at))
      : null;
    if (!sessionDate) return;
    if (!(sessionDate in dayMap)) return;
    if (sessionDate > todayKey) return;
    if (session.complete === true) {
      dayMap[sessionDate] = true;
    }
  });

  return dayMap;
};

export const toggleExerciseCompletion = async (
  sessionExerciseId: string,
  completed: boolean
): Promise<void> => {
  const { error } = await supabase
    .from('fitarc_workout_session_exercises')
    .update({ complete: completed })
    .eq('id', sessionExerciseId);

  if (error) throw error;
};

export const checkAllExercisesComplete = async (
  sessionId: string
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('fitarc_workout_session_exercises')
    .select('complete')
    .eq('session_id', sessionId);

  if (error) throw error;

  return (data || []).length > 0 && data.every((ex) => ex.complete === true);
};

export const updateSessionCompletion = async (
  sessionId: string,
  completed: boolean
): Promise<void> => {
  const { error } = await supabase
    .from('fitarc_workout_sessions')
    .update({ complete: completed })
    .eq('id', sessionId);

  if (error) throw error;
};

export const markAllExercisesComplete = async (sessionId: string): Promise<void> => {
  const { error: exercisesError } = await supabase
    .from('fitarc_workout_session_exercises')
    .update({ complete: true })
    .eq('session_id', sessionId);

  if (exercisesError) throw exercisesError;

  const { error: sessionError } = await supabase
    .from('fitarc_workout_sessions')
    .update({ complete: true })
    .eq('id', sessionId);

  if (sessionError) throw sessionError;
};

export const toggleExerciseAndCheckSession = async (
  sessionId: string,
  sessionExerciseId: string,
  currentlyCompleted: boolean
): Promise<void> => {
  const newCompleted = !currentlyCompleted;

  await toggleExerciseCompletion(sessionExerciseId, newCompleted);

  if (newCompleted) {
    const allComplete = await checkAllExercisesComplete(sessionId);
    if (allComplete) {
      await updateSessionCompletion(sessionId, true);
    }
  } else {
    await updateSessionCompletion(sessionId, false);
  }
};

export const fetchPhaseWorkoutSessions = async (
  userId: string,
  planId: string,
  lookbackDays = 84,
  timeZone: string = getAppTimeZone()
): Promise<WorkoutSessionEntry[]> => {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - lookbackDays);
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .select(
      `
      id,
      user_id,
      plan_id,
      performed_at,
      notes,
      complete,
      session_exercises:fitarc_workout_session_exercises (
        id,
        display_order,
        notes,
        complete,
        exercise:fitarc_exercises (
          id,
          name,
          movement_pattern,
          muscle_links:fitarc_exercise_muscle_groups (
            role,
            muscle:fitarc_muscle_groups ( name )
          )
        ),
        sets:fitarc_workout_sets (
          set_number,
          reps,
          weight,
          rpe,
          rest_seconds
        )
      )
    `
    )
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .gte('performed_at', fromDate.toISOString().split('T')[0])
    .order('performed_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row: any) => mapSessionRow(row, planId, timeZone));
};

type GenerationPreferences = {
  daysPerWeek?: 3 | 4 | 5 | 6;
  equipmentLevel?: 'bodyweight' | 'dumbbells' | 'full_gym';
  primaryGoal?: 'build_muscle' | 'get_stronger' | 'lose_fat' | 'endurance' | 'general_fitness';
};

type GenerationAdaptation = {
  targetExerciseOffset: number;
  scoringMode: AdaptationMode;
  reasons: string[];
};

type NormalizedWorkoutTemplate = Omit<WorkoutTemplateRow, 'goal_tags' | 'exercises'> & {
  goal_tags: string[];
  exercises: Array<WorkoutTemplateExerciseRow & { exercise_id: string }>;
};

const normalizeKey = (value?: string | null): string =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, '_');

const normalizeEquipmentLevel = (value?: string | null): GenerationPreferences['equipmentLevel'] | null => {
  const key = normalizeKey(value);
  if (!key) return null;
  if (key === 'full_gym' || key === 'gym') return 'full_gym';
  if (key === 'dumbbells' || key === 'dumbbell') return 'dumbbells';
  if (key === 'bodyweight' || key === 'body_weight') return 'bodyweight';
  return null;
};

const EQUIPMENT_RANK: Record<NonNullable<GenerationPreferences['equipmentLevel']>, number> = {
  bodyweight: 0,
  dumbbells: 1,
  full_gym: 2,
};

const DIFFICULTY_RANK: Record<User['experienceLevel'], number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

const GOAL_TAG_ALIASES: Record<NonNullable<GenerationPreferences['primaryGoal']>, string[]> = {
  build_muscle: ['hypertrophy', 'build_muscle', 'muscle', 'general'],
  get_stronger: ['strength', 'get_stronger', 'power', 'general'],
  lose_fat: ['fat_loss', 'lose_fat', 'conditioning', 'general_fitness', 'general'],
  endurance: ['endurance', 'conditioning', 'general_fitness'],
  general_fitness: ['general', 'general_fitness', 'conditioning', 'full_body'],
};

const resolveGoalAliases = (goal?: GenerationPreferences['primaryGoal']): string[] =>
  goal ? GOAL_TAG_ALIASES[goal] ?? [goal] : [];

const resolveRotationTags = (split: User['trainingSplit']): string[] => {
  switch (split) {
    case 'push_pull_legs':
      return ['push', 'pull', 'legs'];
    case 'upper_lower':
      return ['upper', 'lower'];
    case 'bro_split':
      return ['chest', 'back', 'shoulders', 'arms', 'legs'];
    case 'full_body':
    default:
      return ['full_body'];
  }
};

const shouldScheduleOnDate = (
  date: Date,
  daysPerWeek?: GenerationPreferences['daysPerWeek']
): boolean => {
  if (!daysPerWeek || daysPerWeek >= 7) return true;
  const day = date.getDay();
  if (daysPerWeek === 6) return day !== 0;
  if (daysPerWeek === 5) return day >= 1 && day <= 5;
  if (daysPerWeek === 4) return day === 1 || day === 2 || day === 4 || day === 6;
  return day === 1 || day === 3 || day === 5;
};

const buildScheduleDates = (
  startDate: Date,
  totalDays: number,
  preferences?: GenerationPreferences
): string[] => {
  const dates: string[] = [];
  for (let dayOffset = 0; dayOffset < totalDays; dayOffset += 1) {
    const workoutDate = new Date(startDate);
    workoutDate.setDate(startDate.getDate() + dayOffset);
    if (!shouldScheduleOnDate(workoutDate, preferences?.daysPerWeek)) continue;
    dates.push(formatLocalDateYMD(workoutDate));
  }
  return dates;
};

const normalizeTemplatesForGeneration = (
  templates: WorkoutTemplateRow[]
): NormalizedWorkoutTemplate[] =>
  templates.map((template) => {
    const orderedExercises = [...(template.exercises ?? [])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
    const validExercises = orderedExercises.filter((exercise): exercise is WorkoutTemplateExerciseRow & { exercise_id: string } => {
      if (exercise.exercise_id) return true;
      console.warn(
        `⚠️ Template "${template.title}" has exercise without exercise_id: ${exercise.exercise_name}`
      );
      return false;
    });

    return {
      ...template,
      goal_tags: (template.goal_tags ?? []).map((tag) => normalizeKey(tag)),
      exercises: validExercises,
    };
  });

const buildTemplatesByTag = (
  templates: NormalizedWorkoutTemplate[],
  rotationTags: string[]
): Map<string, NormalizedWorkoutTemplate[]> => {
  const byTag = new Map<string, NormalizedWorkoutTemplate[]>();
  rotationTags.forEach((tag) => {
    byTag.set(
      tag,
      templates.filter((template) => template.goal_tags.includes(tag))
    );
  });
  return byTag;
};

const matchesGoal = (template: NormalizedWorkoutTemplate, goalAliases: string[]): boolean => {
  if (!goalAliases.length) return true;
  return template.goal_tags.some((tag) => goalAliases.includes(tag));
};

const matchesEquipment = (
  template: NormalizedWorkoutTemplate,
  equipmentLevel?: GenerationPreferences['equipmentLevel']
): boolean => {
  if (!equipmentLevel) return true;
  const templateLevel = normalizeEquipmentLevel(template.equipment_level);
  if (!templateLevel) return true;
  return EQUIPMENT_RANK[templateLevel] <= EQUIPMENT_RANK[equipmentLevel];
};

const matchesDifficulty = (
  template: NormalizedWorkoutTemplate,
  experienceLevel?: User['experienceLevel']
): boolean => {
  if (!experienceLevel) return true;
  const templateDifficulty = normalizeKey(template.difficulty) as User['experienceLevel'];
  if (!(templateDifficulty in DIFFICULTY_RANK)) return true;
  return Math.abs(DIFFICULTY_RANK[templateDifficulty] - DIFFICULTY_RANK[experienceLevel]) <= 1;
};

const selectTemplateCandidatesForTag = (
  tag: string,
  byTag: Map<string, NormalizedWorkoutTemplate[]>,
  allTemplates: NormalizedWorkoutTemplate[],
  profile?: { experienceLevel?: User['experienceLevel'] },
  preferences?: GenerationPreferences
): NormalizedWorkoutTemplate[] => {
  const tagPool = byTag.get(tag) ?? [];
  const basePool = tagPool.length ? tagPool : allTemplates;
  const goalAliases = resolveGoalAliases(preferences?.primaryGoal);

  const tiers: Array<(template: NormalizedWorkoutTemplate) => boolean> = [
    (template) =>
      matchesGoal(template, goalAliases) &&
      matchesEquipment(template, preferences?.equipmentLevel) &&
      matchesDifficulty(template, profile?.experienceLevel),
    (template) =>
      matchesGoal(template, goalAliases) &&
      matchesEquipment(template, preferences?.equipmentLevel),
    (template) => matchesGoal(template, goalAliases),
    (template) =>
      matchesEquipment(template, preferences?.equipmentLevel) &&
      matchesDifficulty(template, profile?.experienceLevel),
    (template) => matchesEquipment(template, preferences?.equipmentLevel),
    (template) => matchesDifficulty(template, profile?.experienceLevel),
  ];

  for (const tier of tiers) {
    const matched = basePool.filter(tier);
    if (matched.length) return matched;
  }

  if (goalAliases.length) {
    const anyGoal = allTemplates.filter((template) => matchesGoal(template, goalAliases));
    if (anyGoal.length) return anyGoal;
  }

  return basePool.length ? basePool : allTemplates;
};

export const generateWeekWorkouts = async (
  userId: string,
  phaseId: string,
  trainingSplit: User['trainingSplit'],
  startDate: Date = new Date(),
  totalDays = 7,
  profile?: {
    eatingMode?: User['eatingMode'];
    experienceLevel?: User['experienceLevel'];
  },
  _adaptation?: GenerationAdaptation,
  preferences?: GenerationPreferences
): Promise<void> => {
  try {
    console.log(`🏋️ Generating workouts from templates for phase ${phaseId}, split: ${trainingSplit}`);

    const templates = await fetchWorkoutTemplates(userId);
    if (!templates.length) {
      console.warn('⚠️ No workout templates available - cannot generate workouts');
      return;
    }

    const scheduleDates = buildScheduleDates(startDate, totalDays, preferences);
    const rotationTags = resolveRotationTags(trainingSplit);
    const normalizedTemplates = normalizeTemplatesForGeneration(templates);
    const byTag = buildTemplatesByTag(normalizedTemplates, rotationTags);

    let successCount = 0;
    for (let index = 0; index < scheduleDates.length; index += 1) {
      const date = scheduleDates[index];
      const tag = rotationTags[index % rotationTags.length];
      const candidates = selectTemplateCandidatesForTag(
        tag,
        byTag,
        normalizedTemplates,
        profile,
        preferences
      );
      const template = candidates.length
        ? candidates[index % candidates.length]
        : null;

      if (!template || !template.exercises.length) continue;

      const planExercises = template.exercises.map((exercise, idx) => ({
        exerciseId: exercise.exercise_id!,
        name: exercise.exercise_name,
        bodyParts: (exercise.body_parts ?? []) as MuscleGroup[],
        movementPattern: exercise.movement_pattern ?? null,
        sets: exercise.sets ?? 4,
        reps: exercise.reps ?? '8-12',
        displayOrder: exercise.display_order ?? idx + 1,
        notes: exercise.notes ?? null,
      }));

      try {
        await replacePlanExercisesForDate(
          userId,
          phaseId,
          date,
          planExercises,
          template.id,
          template.title
        );
        successCount++;
        console.log(`✅ Created ${template.title} for ${date}`);
      } catch (err) {
        console.error(`❌ Failed to create planned workout for ${date}:`, err);
      }
    }

    console.log(`🎉 Successfully generated ${successCount}/${scheduleDates.length} planned workouts`);
  } catch (error) {
    console.error('❌ Failed to generate week workouts:', error);
    throw error;
  }
};

export const hasExistingWorkouts = async (
  userId: string,
  phaseId: string
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('fitarc_plan_days')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', phaseId)
    .limit(1);

  if (error) {
    console.error('Error checking existing workouts:', error);
    return false;
  }

  return (data?.length ?? 0) > 0;
};

export const hasWorkoutsInRange = async (
  userId: string,
  phaseId: string,
  startDate: Date,
  endDate: Date
): Promise<boolean> => {
  const startKey = formatLocalDateYMD(startDate);
  const endKey = formatLocalDateYMD(endDate);

  const { data, error } = await supabase
    .from('fitarc_plan_days')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', phaseId)
    .gte('day_date', startKey)
    .lt('day_date', endKey)
    .limit(1);

  if (error) {
    console.error('Error checking workouts in range:', error);
    return false;
  }

  return (data?.length ?? 0) > 0;
};
