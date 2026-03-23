import { supabase } from '../lib/supabaseClient';
import { PhotoCheckin, PhasePlan, WorkoutSessionEntry } from '../types/domain';
import { mapPhaseRow } from './phaseService';
import {
  formatDateInTimeZone,
  getAppTimeZone,
  startOfDayISO,
  startOfNextDayISO,
} from '../utils/time';
import { buildConsistencySummary } from '../utils/homeDataUtils';
import { fetchWorkoutSessionEntries } from './workoutService';

const WORKOUT_LOOKBACK_DAYS = 14;

export type HomeScreenData = {
  phase: PhasePlan | null;
  recentSessions: WorkoutSessionEntry[];
  todaySession: WorkoutSessionEntry | null;
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

  const allSessions = await fetchWorkoutSessionEntries(userId, planId, timeZone);
  const recentSessions = allSessions.filter(
    (session) => session.date >= fromStartIso.slice(0, 10) && session.date < tomorrowStartIso.slice(0, 10)
  );

  const todaySession = recentSessions.find((session) => session.date === todayKey) || null;
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
    lastPhotoCheckin,
    consistencySummary: buildConsistencySummary(recentSessions, phase?.startDate ?? null),
  };
};
