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
          protein_g,
          carbs_g,
          fat_g
        )
      `
        )
        .eq('user_id', userId)
        .gte('meal_date', fromIso)
        .lte('meal_date', toIso)
        .order('meal_date', { ascending: true });
      if (planId) {
        query = query.or(`plan_id.eq.${planId},plan_id.is.null`);
      }
      return query;
    })(),
    supabase
      .from('fitarc_photo_checkins')
      .select('*')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .order('date', { ascending: false }),
    fetchExerciseDefaults(userId),
  ]);

  if (phaseRes.error) throw phaseRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (mealsRes.error) throw mealsRes.error;
  if (photosRes.error) throw photosRes.error;

  const sessionRows = sessionsRes.data || [];
  const mealRows = mealsRes.data || [];

  const sessionEntries = sessionRows.map((row: any) => mapSessionRow(row, planId, timeZone));
  const defaultWeights = (defaultsRes || []).reduce<Record<string, number>>((acc, item) => {
    if (item.exerciseId && typeof item.defaultWeight === 'number') {
      acc[item.exerciseId] = item.defaultWeight;
    }
    return acc;
  }, {});
  const analytics = buildWorkoutAnalytics(sessionEntries, defaultWeights);

  return {
    phase: phaseRes.data ? mapPhaseRow(phaseRes.data) : null,
    sessions: sessionEntries,
    mealPlans: mealRows.map((row: any) => mapMealPlanRow(row, planId)),
    photos: (photosRes.data as PhotoCheckin[]) || [],
    workoutLogs: analytics.workoutLogs,
    strengthSnapshots: analytics.strengthSnapshots,
  };
};
