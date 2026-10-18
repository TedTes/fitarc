import { dayNumber, localDate } from './planDates';

/** Monday–Sunday calendar weeks, matching Progress and the workout calendar. */
export function weeklyStreak(dates: string[], today = localDate()): number {
  // 1970-01-01 was Thursday; offset by three days to place Monday at the boundary.
  const weekOf = (date: string) => Math.floor((dayNumber(date) + 3) / 7);
  const weeks = new Set(dates.filter(date => date <= today).map(weekOf));
  let week = weekOf(today);
  if (!weeks.has(week)) week -= 1;
  let streak = 0;
  while (weeks.has(week)) { streak += 1; week -= 1; }
  return streak;
}
