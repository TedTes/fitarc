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

export type SwapReasonSignal = {
  key: string;
  label: string;
  count: number;
  source: 'workout';
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
        exercise_id,
        display_order,
        notes,
        complete,
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

const startOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const formatDateYmd = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseSwapReasonKeys = (notes?: string | null): string[] => {
  if (!notes) return [];
  const normalized = notes.toLowerCase();
  const direct = normalized.match(/swap_reason:[a-z0-9_]+/g) ?? [];
  if (direct.length) return Array.from(new Set(direct));

  const reasonIdx = normalized.indexOf('swap reason:');
  if (reasonIdx < 0) return [];
  const trailing = normalized.slice(reasonIdx + 'swap reason:'.length).trim();
  const token = trailing.match(/^([a-z0-9_:-]+)/)?.[1];
  if (!token) return [];
  return [token.startsWith('swap_reason:') ? token : `swap_reason:${token}`];
};

const reasonLabel = (key: string): string => {
  const normalized = key.replace(/^swap_reason:/, '');
  if (normalized === 'undo_last_swap') return 'Undo swap';
  return normalized.replace(/_/g, ' ');
};

export const fetchSwapReasonSignals = async (
  userId: string,
  planId: string,
  windowDays = 7
): Promise<SwapReasonSignal[]> => {
  const today = startOfLocalDay(new Date());
  const from = new Date(today);
  from.setDate(today.getDate() - Math.max(0, windowDays - 1));
  const fromDate = formatDateYmd(from);
  const toDate = formatDateYmd(today);

  const workoutRes = await supabase
    .from('fitarc_plan_overrides')
    .select('notes')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('is_active', true)
    .gte('day_date', fromDate)
    .lte('day_date', toDate);

  if (workoutRes.error) throw workoutRes.error;

  const counts = new Map<string, SwapReasonSignal>();
  const consume = (notes: string | null) => {
    parseSwapReasonKeys(notes).forEach((key) => {
      const scopedKey = `workout:${key}`;
      const existing = counts.get(scopedKey);
      if (existing) {
        existing.count += 1;
        return;
      }
      counts.set(scopedKey, {
        key,
        label: reasonLabel(key),
        count: 1,
        source: 'workout',
      });
    });
  };

  (workoutRes.data ?? []).forEach((row: any) => consume(row.notes ?? null));

  return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 6);
};
