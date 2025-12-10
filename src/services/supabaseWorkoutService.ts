import { supabase } from '../lib/supabaseClient';

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

export const fetchWorkoutSessions = async (
  userId: string
): Promise<SupabaseWorkoutSession[]> => {
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('performed_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const fetchSessionExercises = async (
  sessionId: string
): Promise<SupabaseWorkoutSessionExercise[]> => {
  const { data, error } = await supabase
    .from('fitarc_workout_session_exercises')
    .select('*')
    .eq('session_id', sessionId)
    .order('display_order', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const fetchExerciseSets = async (
  sessionExerciseId: string
): Promise<SupabaseWorkoutSet[]> => {
  const { data, error } = await supabase
    .from('fitarc_workout_sets')
    .select('*')
    .eq('session_exercise_id', sessionExerciseId)
    .order('set_number', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
};

type CreateSessionInput = {
  userId: string;
  performedAt: string;
  mood?: string;
  perceivedExertion?: number;
  notes?: string;
};

export const createWorkoutSession = async ({
  userId,
  performedAt,
  mood,
  perceivedExertion,
  notes,
}: CreateSessionInput): Promise<SupabaseWorkoutSession> => {
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .insert({
      user_id: userId,
      performed_at: performedAt,
      mood: mood ?? null,
      perceived_exertion: perceivedExertion ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
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

  return data;
};
