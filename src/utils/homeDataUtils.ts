import { WorkoutSessionEntry } from '../types/domain';
import { formatLocalDateYMD, parseYMDToDate } from './date';

export const buildConsistencySummary = (
  sessions: WorkoutSessionEntry[],
  phaseStartDate?: string | null
) => {
  const completedSessions = sessions.filter((session) => session.completed);
  const dates = new Set(completedSessions.map((s) => s.date));
  const today = new Date();
  const streak = (() => {
    let currentStreak = 0;
    const startDate = phaseStartDate ? parseYMDToDate(phaseStartDate) : null;
    const maxDays =
      startDate && !Number.isNaN(startDate.getTime())
        ? Math.max(
            1,
            Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1
          )
        : 14;
    for (let i = 0; i < maxDays; i += 1) {
      const check = new Date(today);
      check.setDate(today.getDate() - i);
      const key = formatLocalDateYMD(check);
      if (dates.has(key)) {
        currentStreak += 1;
      } else {
        break;
      }
    }
    return currentStreak;
  })();

  const adherencePercent = (() => {
    if (!completedSessions.length) return 0;
    if (!phaseStartDate) {
      return Math.min(100, (dates.size / 14) * 100);
    }
    const startDate = parseYMDToDate(phaseStartDate);
    if (Number.isNaN(startDate.getTime())) {
      return Math.min(100, (dates.size / 14) * 100);
    }
    const daysSinceStart = Math.max(
      1,
      Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1
    );
    return Math.min(100, (dates.size / daysSinceStart) * 100);
  })();

  return {
    streak,
    adherencePercent,
  };
};
