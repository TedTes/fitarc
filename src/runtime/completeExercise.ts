import { commitRuntimeSession, correctRuntimeSet, recordRuntimeSet } from './runtimeService';
import type { RuntimeState } from './types';

export type CompletedSetValues = { setId: string; actualLoadKg: number; completedReps: number; reportedRir: number };

/** Confirm the displayed exercise in one state transaction, never partially save its rows. */
export function completeRuntimeExercise(state: RuntimeState, sessionId: string, entryId: string, values: CompletedSetValues[]): RuntimeState {
  const session = state.activeSession;
  const entry = session?.exercises.find(item => item.id === entryId);
  if (!session || session.id !== sessionId || !entry) throw Error('This workout changed. Reopen the exercise.');
  if (!entry.sets.some(set => set.status === 'pending')) throw Error('This exercise is already completed.');
  const sets = entry.sets.filter(set => set.status !== 'skipped');
  if (!sets.length || values.length !== sets.length || new Set(values.map(value => value.setId)).size !== sets.length) throw Error('Check the exercise sets before marking Done.');
  for (const value of values) {
    if (!sets.some(set => set.id === value.setId) || !Number.isFinite(value.actualLoadKg) || value.actualLoadKg < 0
      || !Number.isInteger(value.completedReps) || value.completedReps < 0 || value.completedReps > 99
      || !Number.isInteger(value.reportedRir) || value.reportedRir < 0 || value.reportedRir > 5) throw Error('Check weight, repetitions and effort.');
  }
  let next = state;
  const completedAt = new Date().toISOString();
  for (const set of sets) {
    const value = values.find(value => value.setId === set.id)!;
    if (set.result) {
      if ((set.result.actualLoadKg ?? set.result.prescribedLoadKg) !== value.actualLoadKg
        || set.result.completedReps !== value.completedReps || set.result.reportedRir !== value.reportedRir) {
        next = correctRuntimeSet(next, set.id, value);
      }
    } else {
      next = recordRuntimeSet(next, { ...value, prescriptionId: session.id, exerciseId: entry.exercise.id,
        prescribedLoadKg: set.loadKg, prescribedMinReps: set.minReps, prescribedMaxReps: set.maxReps, targetRir: set.targetRir, completedAt });
    }
  }
  // Completing an exercise never marks the other exercises as done.
  return next.activeSession!.exercises.some(item => item.sets.some(set => set.status === 'pending')) ? next : commitRuntimeSession(next);
}
