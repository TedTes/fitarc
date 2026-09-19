import { solveNextSet, updateRirConfidence } from './setSolver';
import type { RuntimeDecision, RuntimeState, SetResult, SessionPrescription, WorkingSetState } from './types';

export const applySetResult = (input: {
  state: RuntimeState;
  session: SessionPrescription;
  result: SetResult;
}): { state: RuntimeState; decision: RuntimeDecision } => {
  const prescribedExercise = input.session.exercises.find((entry) => entry.exercise.id === input.result.exerciseId);
  if (!prescribedExercise) throw new Error('prescribed_exercise_not_found');
  const previous = input.state.workingSets[input.result.exerciseId];
  const decision = solveNextSet({
    result: input.result, phase: input.session.phase,
    incrementKg: prescribedExercise.exercise.incrementKg, previous,
  });
  const workingSet: WorkingSetState = {
    exerciseId: input.result.exerciseId,
    loadKg: decision.nextLoadKg,
    reps: input.result.completedReps,
    rir: input.result.reportedRir,
    rirConfidence: updateRirConfidence(previous?.rirConfidence ?? 0.35, input.result),
    updatedAt: input.result.completedAt,
  };
  return {
    decision,
    state: {
      ...input.state,
      setResults: [...input.state.setResults, input.result],
      workingSets: { ...input.state.workingSets, [workingSet.exerciseId]: workingSet },
      decisions: [...input.state.decisions, decision],
    },
  };
};
