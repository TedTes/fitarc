import { User } from '../types/domain';

export type SlotPlan = {
  compound: number;
  accessory: number;
};

export const TARGET_EXERCISES_BOUNDS = {
  min: 3,
  max: 8,
} as const;

export const EATING_MODE_OFFSETS: Record<User['eatingMode'], number> = {
  mild_deficit: -1,
  recomp: 0,
  lean_bulk: 1,
  maintenance: 0,
};

export const EXPERIENCE_OFFSETS: Record<User['experienceLevel'], number> = {
  beginner: -1,
  intermediate: 0,
  advanced: 1,
};

export const SCORING_WEIGHTS = {
  primaryMuscleMatch: 35,
  accessoryMuscleMatch: 18,
  noMovementDuplication: 8,
  movementDuplicationPenalty: -4,
  weekNoveltyBonus: 10,
  weekRepeatPenalty: -14,
  previousDayPenalty: -12,
  deterministicTiebreakScale: 0.001,
} as const;

export type ScoringWeights = {
  primaryMuscleMatch: number;
  accessoryMuscleMatch: number;
  noMovementDuplication: number;
  movementDuplicationPenalty: number;
  weekNoveltyBonus: number;
  weekRepeatPenalty: number;
  previousDayPenalty: number;
  deterministicTiebreakScale: number;
};
export type AdaptationMode = 'balanced' | 'progressive' | 'recovery';

export const resolveScoringWeights = (mode: AdaptationMode): ScoringWeights => {
  if (mode === 'progressive') {
    return {
      ...SCORING_WEIGHTS,
      noMovementDuplication: 10,
      weekNoveltyBonus: 14,
      weekRepeatPenalty: -18,
    };
  }
  if (mode === 'recovery') {
    return {
      ...SCORING_WEIGHTS,
      noMovementDuplication: 6,
      weekNoveltyBonus: 5,
      weekRepeatPenalty: -6,
      previousDayPenalty: -16,
    };
  }
  return SCORING_WEIGHTS;
};

const COMPOUND_PATTERNS = new Set([
  'squat',
  'hinge',
  'lunge',
  'vertical_push',
  'horizontal_push',
  'vertical_pull',
  'horizontal_pull',
]);

export const isCompoundPattern = (pattern?: string | null): boolean =>
  !!pattern && COMPOUND_PATTERNS.has(pattern.toLowerCase());

export const resolveSlotPlan = (targetExercises: number): SlotPlan => {
  if (targetExercises <= 3) return { compound: 1, accessory: 2 };
  if (targetExercises <= 5) return { compound: 2, accessory: targetExercises - 2 };
  if (targetExercises <= 7) return { compound: 3, accessory: targetExercises - 3 };
  return { compound: 3, accessory: targetExercises - 3 };
};
