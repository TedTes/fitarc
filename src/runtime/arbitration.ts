import type { BlockPhaseKind, RecoveryState } from './types';

export type ArbitrationInput = {
  phase: BlockPhaseKind;
  recovery: RecoveryState;
  plannedSets: number;
  weeklySetsAfterSession: number;
  weeklyMaximum: number;
  hasPain: boolean;
  exerciseAvailable: boolean;
};

export type ArbitrationResult = {
  allowedSets: number;
  allowLoadProgression: boolean;
  mustSubstitute: boolean;
  reasonCode: string;
};

export const arbitratePrescription = (input: ArbitrationInput): ArbitrationResult => {
  if (input.hasPain || !input.exerciseAvailable) {
    return { allowedSets: 0, allowLoadProgression: false, mustSubstitute: true, reasonCode: input.hasPain ? 'pain_constraint' : 'exercise_unavailable' };
  }
  if (input.phase === 'deload') {
    return { allowedSets: Math.max(1, Math.ceil(input.plannedSets * 0.5)), allowLoadProgression: false, mustSubstitute: false, reasonCode: 'deload_override' };
  }
  if (input.recovery === 'no') {
    return { allowedSets: Math.min(2, input.plannedSets), allowLoadProgression: false, mustSubstitute: false, reasonCode: 'recovery_no' };
  }
  const recoverySets = input.recovery === 'meh'
    ? Math.max(1, Math.ceil(input.plannedSets * 0.7))
    : input.plannedSets;
  const remainingBudget = Math.max(0, input.weeklyMaximum - (input.weeklySetsAfterSession - input.plannedSets));
  const allowedSets = Math.min(recoverySets, remainingBudget);
  return {
    allowedSets,
    allowLoadProgression: input.recovery === 'yes' && allowedSets > 0,
    mustSubstitute: false,
    reasonCode: allowedSets < recoverySets ? 'weekly_volume_cap' : input.recovery === 'meh' ? 'recovery_meh' : 'within_constraints',
  };
};
