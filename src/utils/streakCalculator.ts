import { DailyConsistencyLog } from '../types/domain';

/**
 * Get the current streak of consecutive consistent days
 */
export const getCurrentStreak = (
  dailyConsistency: DailyConsistencyLog[],
  today: string // YYYY-MM-DD format
): number => {
  if (dailyConsistency.length === 0) return 0;

  // Sort by date descending
  const sortedLogs = [...dailyConsistency].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  let streak = 0;
  let currentDate = new Date(today);

  for (let i = 0; i < sortedLogs.length; i++) {
    const logDate = sortedLogs[i].date;
    const expectedDate = currentDate.toISOString().split('T')[0];

    if (logDate === expectedDate && sortedLogs[i].isConsistent) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (logDate === expectedDate && !sortedLogs[i].isConsistent) {
      // Found a non-consistent day, streak breaks
      break;
    } else if (new Date(logDate) < currentDate) {
      // Missed day(s), streak breaks
      break;
    }
  }

  return streak;
};

/**
 * Get adherence percentage for a given phase
 */
export const getAdherencePercentage = (
  dailyConsistency: DailyConsistencyLog[],
  phaseStartDate: string,
  phasePlanId: string,
  today: string
): number => {
  const startDate = new Date(phaseStartDate);
  const currentDate = new Date(today);
  
  const daysElapsed = Math.floor(
    (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysElapsed <= 0) return 0;

  const phaseLogs = dailyConsistency.filter(
    log => log.phasePlanId === phasePlanId && log.isConsistent
  );

  const adherence = Math.min(100, Math.round((phaseLogs.length / daysElapsed) * 100));
  return adherence;
};

/**
 * Get the longest streak ever achieved
 */
export const getLongestStreak = (dailyConsistency: DailyConsistencyLog[]): number => {
  if (dailyConsistency.length === 0) return 0;

  const sortedLogs = [...dailyConsistency].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let longestStreak = 0;
  let currentStreak = 0;
  let lastDate: Date | null = null;

  for (const log of sortedLogs) {
    if (!log.isConsistent) {
      currentStreak = 0;
      lastDate = null;
      continue;
    }

    const logDate = new Date(log.date);

    if (!lastDate) {
      currentStreak = 1;
    } else {
      const daysDiff = Math.floor(
        (logDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff === 1) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }
    }

    longestStreak = Math.max(longestStreak, currentStreak);
    lastDate = logDate;
  }

  return longestStreak;
};