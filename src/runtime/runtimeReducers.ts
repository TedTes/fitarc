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
    incrementKg: input.state.source?.routine?.progression.increments[prescribedExercise.exercise.id] ?? prescribedExercise.exercise.incrementKg, previous,
    settings: input.state.source?.routine?.progression,
  });
  if (input.state.source?.routine && input.session.context.recovery !== 'yes' && decision.action === 'increase') {
    decision.action='hold';decision.nextLoadKg=input.result.actualLoadKg??input.result.prescribedLoadKg;
    decision.reasonCode='recovery_hold';decision.explanation='Keep the weight while recovery is reduced.';
  }
  return { decision, state: input.state };
};
