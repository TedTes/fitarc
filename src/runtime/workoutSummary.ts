import type { SessionPrescription } from './types';

export type WorkoutUnit = 'kg' | 'lb';
export const displayedLoad = (kg: number, unit: WorkoutUnit) => kg * (unit === 'lb' ? 2.2046226218 : 1);
const recorded = (session: SessionPrescription) => session.exercises.flatMap(entry => entry.sets
  .filter(set => set.status === 'completed' && set.result)
  .map(set => ({ entry, set, result: set.result! })));

/** Actual recorded work only. Missing timestamps stay unknown; first sessions aren't PRs. */
export const workoutSummary = (session: SessionPrescription, history: SessionPrescription[]) => {
  const logged = recorded(session);
  const first = session.startedAt ?? logged.map(item => item.result.completedAt).sort()[0];
  const start = Date.parse(first ?? '');
  const end = Date.parse(session.finishedAt ?? '');
  const seconds = Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 1000) : null;
  const volumeKg = logged.reduce((sum, { result }) => sum + (result.actualLoadKg ?? result.prescribedLoadKg) * result.completedReps, 0);
  const reps = logged.reduce((sum, { result }) => sum + result.completedReps, 0);
  const prior = history.filter(item => item.id !== session.id && item.status === 'committed').flatMap(recorded)
    .filter(item => item.result.completedReps > 0 && Date.parse(item.result.completedAt) < start);
  const records = session.exercises.flatMap(entry => {
    const previous = prior.filter(item => item.entry.exercise.id === entry.exercise.id)
      .sort((a,b) => (b.result.actualLoadKg ?? b.result.prescribedLoadKg) - (a.result.actualLoadKg ?? a.result.prescribedLoadKg) || b.result.completedReps - a.result.completedReps)[0];
    if (!previous) return [];
    const previousKg = previous.result.actualLoadKg ?? previous.result.prescribedLoadKg;
    const best = logged.filter(item => item.entry.exercise.id === entry.exercise.id && item.result.completedReps >= previous.result.completedReps
      && (item.result.actualLoadKg ?? item.result.prescribedLoadKg) > previousKg)
      .sort((a,b) => (b.result.actualLoadKg ?? b.result.prescribedLoadKg) - (a.result.actualLoadKg ?? a.result.prescribedLoadKg) || b.result.completedReps - a.result.completedReps)[0];
    return best ? [{ setId: best.set.id, exerciseName: entry.exercise.name, loadKg: best.result.actualLoadKg ?? best.result.prescribedLoadKg,
      reps: best.result.completedReps, previousKg, gainKg: (best.result.actualLoadKg ?? best.result.prescribedLoadKg) - previousKg }] : [];
  });
  // Single banner: largest absolute load improvement, consistently measured in kilograms.
  records.sort((a,b) => b.gainKg - a.gainKg);
  return { seconds, volumeKg, reps, sets: logged.length, records, bestRecord: records[0] ?? null };
};
