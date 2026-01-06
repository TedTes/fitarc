import { supabase } from '../lib/supabaseClient';
import { DailyMealPlan, PhotoCheckin, PhasePlan, WorkoutSessionEntry } from '../types/domain';
import { mapPhaseRow } from './phaseService';
import { mapSessionRow } from '../utils/workoutSessionMapper';
import {
  formatDateInTimeZone,
  getAppTimeZone,
  startOfDayISO,
  startOfNextDayISO,
} from '../utils/time';
import { buildConsistencySummary } from '../utils/homeDataUtils';

const WORKOUT_LOOKBACK_DAYS = 14;

export type HomeScreenData = {
  phase: PhasePlan | null;
  recentSessions: WorkoutSessionEntry[];
  todaySession: WorkoutSessionEntry | null;
  todayMealPlan: DailyMealPlan | null;
  lastPhotoCheckin: PhotoCheckin | null;
  consistencySummary: {
    streak: number;
    adherencePercent: number;
  };
};

export const fetchHomeData = async (
  userId: string,
  options?: { timeZone?: string }
): Promise<HomeScreenData> => {
  const timeZone = options?.timeZone ?? getAppTimeZone();
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - (WORKOUT_LOOKBACK_DAYS - 1));
  const todayKey = formatDateInTimeZone(today, timeZone);
  const fromStartIso = startOfDayISO(fromDate, timeZone);
  const tomorrowStartIso = startOfNextDayISO(today, timeZone);

  const phaseRes = await supabase
    .from('fitarc_workout_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (phaseRes.error) throw phaseRes.error;
  const phase = phaseRes.data ? mapPhaseRow(phaseRes.data) : null;
  const planId = phase?.id;

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
    .gte('performed_at', fromStartIso)
    .lt('performed_at', tomorrowStartIso);

  if (planId) {
    sessionsQuery.eq('plan_id', planId);
  }

  const [sessionsRes] = await Promise.all([
    sessionsQuery.order('performed_at', { ascending: false }),
  ]);
  if (sessionsRes.error) throw sessionsRes.error;

  const recentSessions = (sessionsRes.data || []).map((row: any) =>
    mapSessionRow(row, phase?.id, timeZone)
  );

  const todaySession = recentSessions.find((session) => session.date === todayKey) || null;
  const todayMealPlan = null;
  const lastPhotoCheckin = null;

  if (__DEV__) {
    console.log('[fetchHomeData]', {
      timeZone,
      todayKey,
      fromStartIso,
      tomorrowStartIso,
      sessionCount: recentSessions.length,
    });
  }

  return {
    phase,
    recentSessions,
    todaySession,
    todayMealPlan,
    lastPhotoCheckin,
    consistencySummary: buildConsistencySummary(recentSessions, phase?.startDate ?? null),
  };
};
