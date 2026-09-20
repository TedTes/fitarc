import type { BlockPhase, Muscle, RuntimeExperience, RuntimeGoal } from './types';

export const RULE_VERSION = 'runtime-v1.1.1';

export const MUSCLES: Muscle[] = [
  'chest', 'back', 'quads', 'hamstrings', 'glutes',
  'delts', 'biceps', 'triceps', 'calves', 'core',
];

const HYPERTROPHY_TARGETS: Record<Muscle, { min: number; max: number }> = {
  chest: { min: 10, max: 18 }, back: { min: 12, max: 20 },
  quads: { min: 10, max: 18 }, hamstrings: { min: 8, max: 14 },
  glutes: { min: 8, max: 16 }, delts: { min: 10, max: 18 },
  biceps: { min: 6, max: 14 }, triceps: { min: 6, max: 14 },
  calves: { min: 6, max: 14 }, core: { min: 4, max: 10 },
};

const STRENGTH_TARGETS: Record<Muscle, { min: number; max: number }> = {
  chest: { min: 8, max: 14 }, back: { min: 8, max: 16 },
  quads: { min: 8, max: 14 }, hamstrings: { min: 6, max: 12 },
  glutes: { min: 6, max: 12 }, delts: { min: 6, max: 12 },
  biceps: { min: 4, max: 10 }, triceps: { min: 4, max: 10 },
  calves: { min: 4, max: 10 }, core: { min: 4, max: 8 },
};

export const weeklyTargetsFor = (
  goal: RuntimeGoal,
  experience: RuntimeExperience
): Record<Muscle, { min: number; max: number }> => {
  const base = goal === 'strength' ? STRENGTH_TARGETS : HYPERTROPHY_TARGETS;
  const offset = experience === 'advanced' ? 2 : 0;
  return Object.fromEntries(
    MUSCLES.map((muscle) => [muscle, {
      min: base[muscle].min + offset,
      max: base[muscle].max + offset,
    }])
  ) as Record<Muscle, { min: number; max: number }>;
};

export const phasesFor = (goal: RuntimeGoal): BlockPhase[] => goal === 'strength'
  ? [
      { kind: 'accumulate', startWeek: 1, endWeek: 2, volumeMultiplier: 1, targetRir: 3, minReps: 5, maxReps: 8, intensityCap: 0.82 },
      { kind: 'intensify', startWeek: 3, endWeek: 4, volumeMultiplier: 0.85, targetRir: 2, minReps: 3, maxReps: 6, intensityCap: 0.9 },
      { kind: 'peak', startWeek: 5, endWeek: 5, volumeMultiplier: 0.6, targetRir: 1, minReps: 1, maxReps: 4, intensityCap: 0.95 },
      { kind: 'deload', startWeek: 6, endWeek: 6, volumeMultiplier: 0.5, targetRir: 4, minReps: 4, maxReps: 6, intensityCap: 0.7 },
    ]
  : [
      { kind: 'accumulate', startWeek: 1, endWeek: 2, volumeMultiplier: 1, targetRir: 3, minReps: 8, maxReps: 12, intensityCap: 0.78 },
      { kind: 'intensify', startWeek: 3, endWeek: 4, volumeMultiplier: 0.9, targetRir: 2, minReps: 6, maxReps: 10, intensityCap: 0.85 },
      { kind: 'peak', startWeek: 5, endWeek: 5, volumeMultiplier: 0.7, targetRir: 1, minReps: 5, maxReps: 8, intensityCap: 0.9 },
      { kind: 'deload', startWeek: 6, endWeek: 6, volumeMultiplier: 0.5, targetRir: 4, minReps: 8, maxReps: 10, intensityCap: 0.65 },
    ];

export const roundLoad = (loadKg: number, incrementKg: number): number => {
  const increment = Math.max(0.5, incrementKg);
  return Math.max(0, Math.round(loadKg / increment) * increment);
};

export const hardSetCredit = (reportedRir: number, targetRir: number): number =>
  reportedRir <= targetRir ? 1 : 0;

export const secondaryMuscleCredit = 0.5;

/** Rest is part of the prescribed dose, so the runtime owns it rather than asking the user. */
export const restSecondsFor = (goal: RuntimeGoal, compound: boolean): number => {
  if (goal === 'strength') return compound ? 180 : 90;
  return compound ? 120 : 75;
};
