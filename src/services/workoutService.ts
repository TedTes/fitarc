import { supabase } from '../lib/supabaseClient';
import { User, WorkoutSessionEntry, WorkoutSessionExercise, WorkoutSetEntry } from '../types/domain';
import { mapSessionRow } from '../utils/workoutSessionMapper';
import { getAppTimeZone } from '../utils/time';
import { formatLocalDateYMD } from '../utils/date';

export type ExerciseRow = {
  id: string;
  name: string;
  movement_pattern: string | null;
  equipment: string | null;
  description: string | null;
  exercise_muscle_groups: {
    role: string | null;
    muscle_groups: {
      name: string | null;
    } | null;
  }[];
};

export type ExerciseCatalogEntry = {
  id: string;
  name: string;
  movementPattern?: string | null;
  equipment?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
};

export const fetchExerciseCatalog = async (): Promise<ExerciseCatalogEntry[]> => {
  const relation = `fitarc_exercise_muscle_groups(
    role,
    muscle_groups:fitarc_muscle_groups(name)
  )`;

  const { data, error } = await supabase
    .from('fitarc_exercises')
    .select(
      `
      id,
      name,
      movement_pattern,
      equipment,
      description,
      exercise_muscle_groups:${relation}
    `
    )
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data as ExerciseRow[]) || [];

  return rows.map((exercise) => {
    const primary: string[] = [];
    const secondary: string[] = [];

    exercise.exercise_muscle_groups?.forEach((entry) => {
      const muscleName = entry.muscle_groups?.name;
      if (!muscleName) return;

      if ((entry.role || '').toLowerCase() === 'secondary') {
        secondary.push(muscleName);
      } else {
        primary.push(muscleName);
      }
    });

    return {
      id: exercise.id,
      name: exercise.name,
      movementPattern: exercise.movement_pattern,
      equipment: exercise.equipment,
      primaryMuscles: Array.from(new Set(primary)),
      secondaryMuscles: Array.from(new Set(secondary)),
    };
  });
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
    id,
    user_id: userId,
    exercise_id: exerciseId,
    user_exercise_id: userExerciseId,
    default_weight: defaultWeight,
    default_reps: defaultReps,
    default_sets: defaultSets,
    default_rest_seconds: defaultRestSeconds,
    notes,
  };

  const { data, error } = await supabase
    .from('fitarc_user_exercise_defaults')
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
  sessionId,
  exercises,
}: UpdateSessionExercisesInput): Promise<void> => {
  for (let index = 0; index < exercises.length; index += 1) {
    const exercise = exercises[index];
    if (!exercise.id) continue;
    const displayOrder = exercise.displayOrder ?? index + 1;
    const { error: updateError } = await supabase
      .from('fitarc_workout_session_exercises')
      .update({
        display_order: displayOrder,
        notes: exercise.reps ?? null,
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

type DayBlueprint = {
  key: string;
  title: string;
  primaryMuscles: string[];
  accessoryMuscles?: string[];
  secondaryFocus?: string[];
  targetExercises?: number;
  splitDayId?: string | null;
};

type SplitDayRow = {
  id: string;
  day_index: number;
  day_key: string;
  title: string;
  target_exercises: number | null;
  muscles: {
    role: string | null;
    sort_order: number | null;
    muscle: { name: string | null } | null;
  }[];
};

const fetchSplitBlueprints = async (
  splitKey: User['trainingSplit']
): Promise<DayBlueprint[]> => {
  const { data, error } = await supabase
    .from('fitarc_training_splits')
    .select(
      `
      id,
      split_days:fitarc_split_days (
        id,
        day_index,
        day_key,
        title,
        target_exercises,
        muscles:fitarc_split_day_muscles (
          role,
          sort_order,
          muscle:fitarc_muscle_groups ( name )
        )
      )
    `
    )
    .eq('split_key', splitKey)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to load split blueprint:', error);
    return [];
  }

  const days = ((data?.split_days as SplitDayRow[]) || []).sort(
    (a, b) => (a.day_index ?? 0) - (b.day_index ?? 0)
  );

  return days.map((day) => {
    const primary: string[] = [];
    const accessory: string[] = [];

    (day.muscles || [])
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .forEach((link) => {
        const name = link.muscle?.name;
        if (!name) return;
        if ((link.role || '').toLowerCase() === 'primary') {
          primary.push(name);
        } else {
          accessory.push(name);
        }
      });

    return {
      key: day.day_key,
      title: day.title,
      primaryMuscles: primary,
      accessoryMuscles: accessory,
      targetExercises: day.target_exercises ?? undefined,
      splitDayId: day.id,
    };
  });
};

const normalizeMuscle = (name?: string | null) =>
  (name || '').toLowerCase().trim();

type MuscleIndex = Record<string, ExerciseCatalogEntry[]>;

const buildMuscleIndex = (catalog: ExerciseCatalogEntry[]): MuscleIndex => {
  const index: MuscleIndex = {};
  catalog.forEach((exercise) => {
    exercise.primaryMuscles.forEach((muscle) => {
      const key = normalizeMuscle(muscle);
      if (!key) return;
      if (!index[key]) {
        index[key] = [];
      }
      index[key].push(exercise);
    });
  });
  Object.keys(index).forEach((key) => {
    index[key].sort((a, b) => a.name.localeCompare(b.name));
  });
  return index;
};

const selectFromBucket = (
  bucket: ExerciseCatalogEntry[],
  usedIds: Set<string>,
  seed: number
): ExerciseCatalogEntry | null => {
  if (!bucket.length) return null;
  for (let i = 0; i < bucket.length; i++) {
    const candidate = bucket[(i + seed) % bucket.length];
    if (!usedIds.has(candidate.id)) {
      usedIds.add(candidate.id);
      return candidate;
    }
  }
  return null;
};

const pickExercisesForBlueprint = (
  blueprint: DayBlueprint,
  muscleIndex: MuscleIndex,
  catalog: ExerciseCatalogEntry[],
  daySeed: number
): ExerciseCatalogEntry[] => {
  const target = blueprint.targetExercises ?? 5;
  const selection: ExerciseCatalogEntry[] = [];
  const usedIds = new Set<string>();
  const catalogSorted = [...catalog].sort((a, b) => a.name.localeCompare(b.name));

  const pickMuscles = (muscles?: string[]) => {
    if (!muscles) return;
    muscles.forEach((muscle) => {
      if (selection.length >= target) return;
      const bucket = muscleIndex[normalizeMuscle(muscle)] || [];
      const pick = selectFromBucket(bucket, usedIds, daySeed + selection.length);
      if (pick) {
        selection.push(pick);
      }
    });
  };

  pickMuscles(blueprint.primaryMuscles);
  if (selection.length < target) {
    pickMuscles(blueprint.accessoryMuscles);
  }
  if (selection.length < target) {
    pickMuscles(blueprint.secondaryFocus);
  }

  if (selection.length < target) {
    for (let i = 0; i < catalogSorted.length && selection.length < target; i++) {
      const candidate = catalogSorted[(i + daySeed) % catalogSorted.length];
      if (!usedIds.has(candidate.id)) {
        usedIds.add(candidate.id);
        selection.push(candidate);
      }
    }
  }

  return selection;
};

const buildGenericBlueprints = (catalog: ExerciseCatalogEntry[]): DayBlueprint[] => {
  const muscleSet = new Set<string>();
  catalog.forEach((exercise) => {
    exercise.primaryMuscles.forEach((muscle) => {
      const key = normalizeMuscle(muscle);
      if (key) {
        muscleSet.add(key);
      }
    });
  });

  const muscles = Array.from(muscleSet);
  if (!muscles.length) {
    return [];
  }

  const chunkSize = Math.max(3, Math.floor(muscles.length / 3));
  const chunks: string[][] = [];
  for (let i = 0; i < muscles.length; i += chunkSize) {
    chunks.push(muscles.slice(i, i + chunkSize));
  }

  return chunks.slice(0, 4).map((group, idx) => ({
    key: `auto_${idx + 1}`,
    title: `Session ${idx + 1}`,
    primaryMuscles: group,
    targetExercises: 5,
  }));
};

const createWorkoutSessionInDB = async (
  userId: string,
  phaseId: string,
  date: string,
  exercises: ExerciseCatalogEntry[],
  splitDayId?: string
): Promise<void> => {
  const { data: session, error: sessionError } = await supabase
    .from('fitarc_workout_sessions')
    .insert({
      user_id: userId,
      plan_id: phaseId,
      performed_at: date,
      split_day_id: splitDayId ?? null,
    })
    .select('id')
    .single();

  if (sessionError) {
    console.error('Session creation error:', sessionError);
    throw sessionError;
  }

  if (!session) {
    throw new Error('Failed to create session - no data returned');
  }

  const sessionExercises = exercises.map((exercise, index) => ({
    session_id: session.id,
    exercise_id: exercise.id,
    display_order: index + 1,
  }));

  const { error: exercisesError } = await supabase
    .from('fitarc_workout_session_exercises')
    .insert(sessionExercises);

  if (exercisesError) {
    console.error('Session exercises creation error:', exercisesError);
    throw exercisesError;
  }
};

export const generateWeekWorkouts = async (
  userId: string,
  phaseId: string,
  trainingSplit: User['trainingSplit'],
  startDate: Date = new Date()
): Promise<void> => {
  try {
    console.log(`🏋️ Generating workouts for phase ${phaseId}, split: ${trainingSplit}`);

    const exerciseCatalog = await fetchExerciseCatalog();

    if (exerciseCatalog.length === 0) {
      console.warn('⚠️ Exercise catalog is empty - cannot generate workouts');
      return;
    }

    let blueprints = await fetchSplitBlueprints(trainingSplit);
    if (!blueprints.length) {
      console.warn(`⚠️ No DB blueprint for ${trainingSplit}, using fallback.`);
      blueprints = buildGenericBlueprints(exerciseCatalog);
    }
    if (!blueprints.length) {
      console.warn('⚠️ No blueprint available - cannot create workouts');
      return;
    }
    const muscleIndex = buildMuscleIndex(exerciseCatalog);

    const sessionsToCreate: Array<{
      date: string;
      exercises: ExerciseCatalogEntry[];
      title: string;
      splitDayId?: string | null;
    }> = [];

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const workoutDate = new Date(startDate);
      workoutDate.setDate(startDate.getDate() + dayOffset);
      const dateStr = formatLocalDateYMD(workoutDate);

      const blueprint = blueprints[dayOffset % blueprints.length];
      const exercises = pickExercisesForBlueprint(
        blueprint,
        muscleIndex,
        exerciseCatalog,
        dayOffset
      );

      if (!exercises.length) {
        console.warn(`⚠️ No exercises found for blueprint ${blueprint.title}`);
        continue;
      }

      sessionsToCreate.push({
        date: dateStr,
        exercises,
        title: blueprint.title,
        splitDayId: blueprint.splitDayId ?? null,
      });
    }

    if (sessionsToCreate.length === 0) {
      console.warn('⚠️ No sessions to create');
      return;
    }

    let successCount = 0;
    for (const session of sessionsToCreate) {
      try {
        await createWorkoutSessionInDB(
          userId,
          phaseId,
          session.date,
          session.exercises,
          session.splitDayId ?? undefined
        );
        successCount++;
        console.log(`✅ Created ${session.title} for ${session.date}`);
      } catch (err) {
        console.error(`❌ Failed to create session for ${session.date}:`, err);
      }
    }

    console.log(`🎉 Successfully generated ${successCount}/${sessionsToCreate.length} workout sessions`);
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
    .from('fitarc_workout_sessions')
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
