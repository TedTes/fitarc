import { WorkoutSessionEntry } from '../types/domain';

export const buildConsistencySummary = (sessions: WorkoutSessionEntry[]) => {
  const dates = new Set(sessions.map((s) => s.date));
  const streak = (() => {
    let currentStreak = 0;
    const today = new Date();
    for (let i = 0; i < 14; i += 1) {
      const check = new Date(today);
      check.setDate(today.getDate() - i);
      const key = check.toISOString().split('T')[0];
      if (dates.has(key)) {
        currentStreak += 1;
      } else {
        break;
      }
    }
    return currentStreak;
  })();

  const adherencePercent = sessions.length ? Math.min(100, (dates.size / 14) * 100) : 0;

  return {
    streak,
    adherencePercent,
  };
};
