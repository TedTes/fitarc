import { supabase } from '../lib/supabaseClient';
import {
  DailyMealPlan,
  PhotoCheckin,
  PhasePlan,
  WorkoutSessionEntry,
  WorkoutLog,
  StrengthSnapshot,
} from '../types/domain';
import { buildWorkoutAnalytics } from '../utils/workoutAnalytics';
import { getAppTimeZone } from '../utils/time';
import { mapMealPlanRow } from '../utils/mealPlanMapper';
import { fetchExerciseDefaults } from './workoutService';
import { mapPhaseRow } from './phaseService';
import { mapSessionRow } from '../utils/workoutSessionMapper';

const PROGRESS_DEFAULT_WINDOW_DAYS = 90;

export type ProgressData = {
  phase: PhasePlan | null;
  sessions: WorkoutSessionEntry[];
  mealPlans: DailyMealPlan[];
  photos: PhotoCheckin[];
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
};

export type MuscleGroupOption = {
  name: string;
};

export type ExerciseOption = {
  id: string;
  name: string;
  movement_pattern: string | null;
};

export const fetchMuscleGroups = async (): Promise<MuscleGroupOption[]> => {
  const { data, error } = await supabase
    .from('fitarc_muscle_groups')
    .select('name')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as MuscleGroupOption[];
};

export const fetchExercises = async (): Promise<ExerciseOption[]> => {
  const { data, error } = await supabase
    .from('fitarc_exercises')
    .select('id, name, movement_pattern')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as ExerciseOption[];
};

export const deriveMovementPatterns = (exercises: ExerciseOption[]): string[] => {
  const patterns = new Set<string>();
  exercises.forEach((exercise) => {
    if (exercise.movement_pattern) {
      patterns.add(exercise.movement_pattern);
    }
  });
  return Array.from(patterns).sort();
};

export const fetchProgressData = async (
  userId: string,
  planId: string,
  windowDays = PROGRESS_DEFAULT_WINDOW_DAYS
): Promise<ProgressData> => {
  const timeZone = getAppTimeZone();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - windowDays);
  const fromIso = fromDate.toISOString().split('T')[0];
  const toIso = new Date().toISOString().split('T')[0];

  const [phaseRes, sessionsRes, mealsRes, photosRes, defaultsRes] = await Promise.all([
    supabase
      .from('fitarc_workout_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('id', planId)
      .single(),
    supabase
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
      .gte('performed_at', fromIso)
      .order('performed_at', { ascending: false }),
    (() => {
      let query = supabase
        .from('fitarc_daily_meals')
        .select(
          `
        id,
        user_id,
        plan_id,
        meal_plan_id,
        meal_date,
        completed,
        notes,
        meal_entries:fitarc_meal_entries (
          id,
          meal_type,
          food_name,
          calories,
          protein,
          carbs,
          fat
        )
      `
        )
        .eq('user_id', userId)
        .gte('meal_date', fromIso)
        .lte('meal_date', toIso)
        .order('meal_date', { ascending: false });
      return query;
    })(),
    supabase
      .from('fitarc_photo_checkins')
      .select('*')
      .eq('user_id', userId)
      .gte('check_in_date', fromIso)
      .order('check_in_date', { ascending: false }),
    fetchExerciseDefaults(userId),
  ]);

  if (phaseRes.error) throw phaseRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (mealsRes.error) throw mealsRes.error;
  if (photosRes.error) throw photosRes.error;

  const phase = phaseRes.data ? mapPhaseRow(phaseRes.data) : null;
  const sessions = (sessionsRes.data || []).map((row: any) =>
    mapSessionRow(row, planId, timeZone)
  );
  const mealPlans = (mealsRes.data || []).map(mapMealPlanRow);
  const photos = (photosRes.data || []).map(
    (row: any) =>
      ({
        id: row.id,
        userId: row.user_id,
        phasePlanId: row.plan_id,
        checkInDate: row.check_in_date,
        frontPhotoUrl: row.front_photo_url,
        sidePhotoUrl: row.side_photo_url,
        backPhotoUrl: row.back_photo_url,
        weightLbs: row.weight_lbs,
        notes: row.notes,
      } as PhotoCheckin)
  );

  const defaultWeights = defaultsRes.reduce<Record<string, number>>((acc, def) => {
    if (def.exerciseId && def.defaultWeight) {
      acc[def.exerciseId] = def.defaultWeight;
    }
    return acc;
  }, {});

  const { workoutLogs, strengthSnapshots } = buildWorkoutAnalytics(sessions, defaultWeights);

  return {
    phase,
    sessions,
    mealPlans,
    photos,
    workoutLogs,
    strengthSnapshots,
  };
};