import { solveNextSet } from './setSolver';
import type { RuntimeDecision, RuntimeState, SetResult, SessionPrescription } from './types';

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
  return { decision, state: input.state };
};
