import { supabase } from '../lib/supabaseClient';
import { WorkoutSessionEntry } from '../types/domain';
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
