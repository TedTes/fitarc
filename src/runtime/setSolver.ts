import { RULE_VERSION, roundLoad } from './trainingPolicy';
import type { BlockPhaseKind, RuntimeDecision, SetResult, WorkingSetState } from './types';

export type SetSolverInput = {
  result: SetResult;
  phase: BlockPhaseKind;
  incrementKg: number;
  previous?: WorkingSetState;
};

export const updateRirConfidence = (
  previousConfidence: number,
  result: SetResult
): number => {
  const missed = result.completedReps < result.prescribedMinReps;
  const contradictory = missed && result.reportedRir >= 3;
  const next = contradictory ? previousConfidence - 0.15 : previousConfidence + 0.04;
  return Math.min(1, Math.max(0.1, next));
};

export const solveNextSet = ({ result, phase, incrementKg, previous }: SetSolverInput): RuntimeDecision => {
  const load = result.prescribedLoadKg;
  void previous;
  const missedBy = result.prescribedMinReps - result.completedReps;
  const deload = phase === 'deload';

  if (deload) {
    return {
      action: 'hold', nextLoadKg: load,
      nextMinReps: result.prescribedMinReps, nextMaxReps: result.prescribedMaxReps,
      reasonCode: 'phase_deload_cap',
      explanation: 'The deload phase caps progression, so the load stays fixed while fatigue falls.',
      ruleVersion: RULE_VERSION,
    };
  }
  if (missedBy >= 3) {
    const nextLoad = roundLoad(load * 0.9, incrementKg);
    return {
      action: 'decrease', nextLoadKg: nextLoad,
      nextMinReps: result.prescribedMinReps, nextMaxReps: result.prescribedMaxReps,
      reasonCode: 'reps_missed_materially',
      explanation: `You missed the minimum by ${missedBy} reps, so the next set drops to ${nextLoad} kg.`,
      ruleVersion: RULE_VERSION,
    };
  }
  if (missedBy > 0) {
    const nextLoad = roundLoad(load * 0.95, incrementKg);
    return {
      action: 'decrease', nextLoadKg: nextLoad,
      nextMinReps: result.prescribedMinReps, nextMaxReps: result.prescribedMaxReps,
      reasonCode: 'reps_missed',
      explanation: `You finished below the rep floor, so the next set drops to ${nextLoad} kg.`,
      ruleVersion: RULE_VERSION,
    };
  }
  if (result.reportedRir === 0) {
    const nextLoad = roundLoad(load * 0.95, incrementKg);
    return {
      action: 'decrease', nextLoadKg: nextLoad,
      nextMinReps: result.prescribedMinReps, nextMaxReps: result.prescribedMaxReps,
      reasonCode: 'reps_hit_zero_rir',
      explanation: `You hit the reps at failure, so the next set backs off to ${nextLoad} kg.`,
      ruleVersion: RULE_VERSION,
    };
  }
  if (result.completedReps >= result.prescribedMaxReps && result.reportedRir >= 2) {
    const nextLoad = roundLoad(load + incrementKg, incrementKg);
    return {
      action: 'increase', nextLoadKg: nextLoad,
      nextMinReps: result.prescribedMinReps, nextMaxReps: result.prescribedMaxReps,
      reasonCode: result.reportedRir >= 3 ? 'reps_hit_easy_dampened_add' : 'reps_hit_target_effort_small_add',
      explanation: result.reportedRir >= 3
        ? `You hit every rep with ${result.reportedRir} left. RIR is dampened to one increment, so the next set is ${nextLoad} kg.`
        : `You hit every rep at RIR 2, so the next set adds one small increment to ${nextLoad} kg.`,
      ruleVersion: RULE_VERSION,
    };
  }
  return {
    action: 'hold', nextLoadKg: load,
    nextMinReps: result.prescribedMinReps, nextMaxReps: result.prescribedMaxReps,
    reasonCode: result.reportedRir === 1 ? 'reps_hit_one_rir_hold' : 'reps_in_range',
    explanation: result.reportedRir === 1
      ? 'You hit the reps with one left, so the next set holds the load.'
      : 'Reps are the primary signal: you landed inside the range, so the next set holds.',
    ruleVersion: RULE_VERSION,
  };
};
