import { supabase } from '../lib/supabaseClient';
import { PhasePlan, StrengthSnapshot, WorkoutLog, WorkoutSessionEntry } from '../types/domain';
import { mapPhaseRow } from './phaseService';
import { mapSessionRow } from '../utils/workoutSessionMapper';
import { buildWorkoutAnalytics } from '../utils/workoutAnalytics';
import { getAppTimeZone, startOfDayISO, startOfNextDayISO } from '../utils/time';

export type ProgressData = {
  phase: PhasePlan | null;
  sessions: WorkoutSessionEntry[];
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
};

export type MuscleGroupOption = {
  id: string;
  name: string;
};

export type ExerciseOption = {
  id: string;
  name: string;
  movementPattern?: string | null;
};

export const fetchProgressData = async (
  userId: string,
  planId: string,
  windowDays?: number
): Promise<ProgressData> => {
  const timeZone = getAppTimeZone();
  const today = new Date();
  const fromDate =
    windowDays && windowDays > 0
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - (windowDays - 1))
      : null;

  const phaseRes = await supabase
    .from('fitarc_workout_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('id', planId)
    .maybeSingle();

  if (phaseRes.error) {
    throw phaseRes.error;
  }

  const phase = phaseRes.data ? mapPhaseRow(phaseRes.data) : null;

  const sessionsQuery = supabase
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
    .eq('plan_id', planId);

  if (fromDate) {
    const fromStartIso = startOfDayISO(fromDate, timeZone);
    const tomorrowStartIso = startOfNextDayISO(today, timeZone);
    sessionsQuery.gte('performed_at', fromStartIso).lt('performed_at', tomorrowStartIso);
  }

  const sessionsRes = await sessionsQuery.order('performed_at', { ascending: true });

  if (sessionsRes.error) {
    throw sessionsRes.error;
  }

  const sessions = (sessionsRes.data || []).map((row: any) =>
    mapSessionRow(row, phase?.id ?? planId, timeZone)
  );

  const { workoutLogs, strengthSnapshots } = buildWorkoutAnalytics(sessions);

  return {
    phase,
    sessions,
    workoutLogs,
    strengthSnapshots,
  };
};

export const fetchMuscleGroups = async (): Promise<MuscleGroupOption[]> => {
  const { data, error } = await supabase
    .from('fitarc_muscle_groups')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
  }));
};

export const fetchExercises = async (): Promise<ExerciseOption[]> => {
  const { data, error } = await supabase
    .from('fitarc_exercises')
    .select('id, name, movement_pattern')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    movementPattern: row.movement_pattern,
  }));
};

export const deriveMovementPatterns = (exercises: ExerciseOption[]): string[] => {
  const patterns = new Set<string>();
  exercises.forEach((exercise) => {
    const pattern = exercise.movementPattern?.trim();
    if (pattern) {
      patterns.add(pattern);
    }
  });
  return Array.from(patterns).sort((a, b) => a.localeCompare(b));
};
