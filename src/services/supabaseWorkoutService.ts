import { supabase } from '../lib/supabaseClient';
import { WorkoutSessionEntry, WorkoutSessionExercise, WorkoutSetEntry } from '../types/domain';
import { mapSessionRow } from './appDataService';

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

const buildSetPayloads = (exercise: WorkoutSessionExercise): WorkoutSetEntry[] => {
  if (exercise.setDetails && exercise.setDetails.length) {
    return exercise.setDetails;
  }
  const count = typeof exercise.sets === 'number' && exercise.sets > 0 ? exercise.sets : 0;
  if (!count) return [];
  const repsValue = parseRepsValue(exercise.reps);
  return Array.from({ length: count }).map((_, index) => ({
    setNumber: index + 1,
    reps: repsValue ?? undefined,
    weight: undefined,
    rpe: undefined,
    restSeconds: undefined,
  }));
};

/**
 * Basic insert helpers
 */

type CreateSessionInput = {
  userId: string;
  performedAt: string; // ISO string
  phaseId?: string | null;
  mood?: string;
  perceivedExertion?: number;
  notes?: string;
};

export const createWorkoutSession = async ({
  userId,
  performedAt,
  phaseId,
  mood,
  perceivedExertion,
  notes,
}: CreateSessionInput): Promise<SupabaseWorkoutSession> => {
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .insert({
      user_id: userId,
      performed_at: performedAt,
      phase_id: phaseId ?? null,
      mood: mood ?? null,
      perceived_exertion: perceivedExertion ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as SupabaseWorkoutSession;
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
  phasePlanId?: string
): Promise<WorkoutSessionEntry[]> => {
  const query = supabase
    .from('fitarc_workout_sessions')
    .select(`
      id,
      user_id,
      phase_id,
      performed_at,
      notes,
      mood,
      perceived_exertion,
      session_exercises:fitarc_workout_session_exercises (
        id,
        display_order,
        notes,
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
    query.eq('phase_id', phasePlanId);
  }

  const { data, error } = await query.order('performed_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data as any[]) || [];

  return rows.map((session) => mapSessionRow(session, phasePlanId));
};

type UpsertWorkoutSessionInput = {
  userId: string;
  phaseId: string;
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
  phaseId,
  date,
  exercises,
}: UpsertWorkoutSessionInput): Promise<WorkoutSessionEntry> => {
  const performedAt = normalizeDate(date);

  const existingSessionRes = await supabase
    .from('fitarc_workout_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('phase_id', phaseId)
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
        phase_id: phaseId,
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
      phase_id,
      performed_at,
      notes,
      session_exercises:fitarc_workout_session_exercises (
        id,
        display_order,
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

  return mapSessionRow(sessionRes.data, phaseId);
};

type DeleteWorkoutSessionInput = {
  userId: string;
  phaseId: string;
  date: string;
};

export const deleteWorkoutSessionRemote = async ({
  userId,
  phaseId,
  date,
}: DeleteWorkoutSessionInput) => {
  const performedAt = normalizeDate(date);
  const existingRes = await supabase
    .from('fitarc_workout_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('phase_id', phaseId)
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
