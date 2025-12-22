import { supabase } from '../lib/supabaseClient';
import { WorkoutSessionEntry, WorkoutSessionExercise, WorkoutSetEntry } from '../types/domain';
import { mapSessionRow } from './appDataService';
import { getAppTimeZone } from '../utils/time';
import { formatLocalDateYMD } from '../utils/date';

export type SupabaseWorkoutSession = {
  id: string;
  user_id: string;
  performed_at: string;
  mood: string | null;
  perceived_exertion: number | null;
  notes: string | null;
};

export type SupabaseWorkoutSessionExercise = {
  id: string;
  session_id: string;
  exercise_id: string | null;
  user_exercise_id: string | null;
  display_order: number;
  notes: string | null;
};

export type SupabaseWorkoutSet = {
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
): SupabaseWorkoutSetInsert[] => {
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

type SupabaseWorkoutSetInsert = {
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
}: LogWorkoutSetInput): Promise<SupabaseWorkoutSet> => {
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

  return data as SupabaseWorkoutSet;
};

export const ensureSetsForExercises = async (
  exercises: WorkoutSessionExercise[]
): Promise<void> => {
  if (!exercises.length) return;

  const payload: SupabaseWorkoutSetInsert[] = [];

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

/**
 * Shape of a row coming back from the nested select.
 */
/**
 * Main query: fetch sessions + nested exercises/sets from Supabase,
 * then map into WorkoutSessionEntry[] for DashboardScreen + PlansScreen.
 *
 * phasePlanId is purely a tag for the in-memory arc; the DB currently
 * doesn’t store phase_plan_id, so we just attach what caller passes.
 */
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

  return rows.map((session) => mapSessionRow(session, phasePlanId, timeZone));
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
    .select('id, performed_at')
    .eq('user_id', userId)
    .gte('performed_at', startDate)
    .lte('performed_at', endDate);

  if (sessionError) throw sessionError;
  const sessions = sessionRows || [];
  if (!sessions.length) {
    return dayMap;
  }

  const sessionIds = sessions.map((session) => session.id);
  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('fitarc_workout_session_exercises')
    .select('id, session_id')
    .in('session_id', sessionIds);
  if (exerciseError) throw exerciseError;

  const exerciseToSession = new Map<string, string>();
  (exerciseRows || []).forEach((row) => {
    if (row?.id && row.session_id) {
      exerciseToSession.set(row.id, row.session_id);
    }
  });

  const sessionExerciseIds = Array.from(exerciseToSession.keys());
  const sessionSetCounts: Record<string, number> = {};

  if (sessionExerciseIds.length) {
    const { data: setRows, error: setError } = await supabase
      .from('fitarc_workout_sets')
      .select('session_exercise_id')
      .in('session_exercise_id', sessionExerciseIds);
    if (setError) throw setError;

    (setRows || []).forEach((row) => {
      const sessionExerciseId = row?.session_exercise_id;
      if (!sessionExerciseId) return;
      const sessionId = exerciseToSession.get(sessionExerciseId);
      if (sessionId) {
        sessionSetCounts[sessionId] = (sessionSetCounts[sessionId] || 0) + 1;
      }
    });
  }

  const todayKey = formatLocalDateYMD(new Date());

  sessions.forEach((session) => {
    const sessionDate = session.performed_at
      ? formatLocalDateYMD(new Date(session.performed_at))
      : null;
    if (!sessionDate) return;
    if (!(sessionDate in dayMap)) return;
    if (sessionDate > todayKey) return;
    const setCount = sessionSetCounts[session.id] || 0;
    if (setCount > 0) {
      dayMap[sessionDate] = true;
    }
  });

  return dayMap;
};

/**
 * Toggle individual exercise completion
 */
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

/**
 * Check if all exercises in session are complete
 */
export const checkAllExercisesComplete = async (
  sessionId: string
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('fitarc_workout_session_exercises')
    .select('complete')
    .eq('session_id', sessionId);

  if (error) throw error;
  
  return (data || []).length > 0 && data.every(ex => ex.complete === true);
};

/**
 * Update session completion status
 */
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

/**
 * Mark all exercises in a session as complete
 */
export const markAllExercisesComplete = async (
  sessionId: string
): Promise<void> => {
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

/**
 * Toggle exercise and auto-update session if all complete
 */
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
