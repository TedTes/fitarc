import {
  LiftId,
  MovementPattern,
  MuscleGroup,
  StrengthSnapshot,
  WorkoutLog,
  WorkoutSessionEntry,
  WorkoutSetEntry,
} from '../types/domain';

const MUSCLE_REMAPPINGS: Record<string, MuscleGroup> = {
  chest: 'chest',
  back: 'back',
  lats: 'back',
  legs: 'legs',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  shoulders: 'shoulders',
  delts: 'shoulders',
  'rear delts': 'shoulders',
  arms: 'arms',
  triceps: 'arms',
  biceps: 'arms',
  forearms: 'arms',
  core: 'core',
  abs: 'core',
  obliques: 'core',
  'hip flexors': 'core',
};

const MOVEMENT_PATTERN_MATCHERS: { pattern: MovementPattern; keywords: RegExp }[] = [
  { pattern: 'squat', keywords: /squat|lunge|leg press/i },
  { pattern: 'hinge', keywords: /deadlift|hip thrust|rdl|good morning/i },
  { pattern: 'horizontal_push', keywords: /bench|push-up|dip|press/i },
  { pattern: 'vertical_push', keywords: /overhead|military|shoulder press/i },
  { pattern: 'horizontal_pull', keywords: /row|pullover/i },
  { pattern: 'vertical_pull', keywords: /pull-up|pulldown|chin-up/i },
];

const LIFT_MATCHERS: { lift: LiftId; keywords: RegExp }[] = [
  { lift: 'bench_press', keywords: /bench|press/i },
  { lift: 'squat', keywords: /squat/i },
  { lift: 'deadlift', keywords: /deadlift|hip thrust|rdl/i },
];

export const mapMuscleNameToGroup = (name?: string | null): MuscleGroup | null => {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  return MUSCLE_REMAPPINGS[normalized] || null;
};

export const inferMovementPatternFromName = (name?: string | null): MovementPattern | null => {
  if (!name) return null;
  const matcher = MOVEMENT_PATTERN_MATCHERS.find((entry) => entry.keywords.test(name));
  return matcher ? matcher.pattern : null;
};

export const inferLiftIdFromName = (name?: string | null): LiftId | null => {
  if (!name) return null;
  const matcher = LIFT_MATCHERS.find((entry) => entry.keywords.test(name));
  return matcher ? matcher.lift : null;
};

export const createEmptyMuscleVolume = (): Record<MuscleGroup, number> => ({
  chest: 0,
  back: 0,
  legs: 0,
  shoulders: 0,
  arms: 0,
  core: 0,
});

export const createEmptyMovementVolume = (): Record<MovementPattern, number> => ({
  squat: 0,
  hinge: 0,
  horizontal_push: 0,
  vertical_push: 0,
  horizontal_pull: 0,
  vertical_pull: 0,
});

const estimateOneRepMax = (weight: number, reps: number): number => {
  if (weight <= 0 || reps <= 0) return 0;
  return Math.round(weight * (1 + reps / 30));
};

const normalizeSetDetails = (set?: WorkoutSetEntry | null): WorkoutSetEntry => ({
  setNumber: typeof set?.setNumber === 'number' ? set?.setNumber : set?.setNumber ?? undefined,
  weight: typeof set?.weight === 'number' ? set.weight : set?.weight ?? undefined,
  reps: typeof set?.reps === 'number' ? set.reps : set?.reps ?? undefined,
  rpe: typeof set?.rpe === 'number' ? set.rpe : set?.rpe ?? undefined,
  restSeconds:
    typeof set?.restSeconds === 'number' ? set.restSeconds : set?.restSeconds ?? undefined,
});

type WorkoutAnalyticsResult = {
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
};

export const buildWorkoutAnalytics = (
  sessions: WorkoutSessionEntry[],
  defaultWeights?: Record<string, number>
): WorkoutAnalyticsResult => {
  const workoutLogs: WorkoutLog[] = [];
  const strengthSnapshots: StrengthSnapshot[] = [];

  sessions.forEach((session) => {
    const muscleVolume = createEmptyMuscleVolume();
    const movementVolume = createEmptyMovementVolume();
    const musclesHit = new Set<MuscleGroup>();
    const movementHit = new Set<MovementPattern>();
    const lifts: WorkoutLog['lifts'] = [];
    let totalSets = 0;
    let totalVolume = 0;

    const bestLiftSets = new Map<LiftId, { weight: number; reps: number }>();

    session.exercises.forEach((exercise) => {
      const setDetails = (exercise.setDetails || []).map(normalizeSetDetails);
      const fallbackWeight =
        exercise.exerciseId && defaultWeights
          ? defaultWeights[exercise.exerciseId]
          : undefined;
      const setCount = setDetails.length || exercise.sets || 0;
      totalSets += setCount;

      exercise.bodyParts.forEach((part) => {
        musclesHit.add(part);
        muscleVolume[part] += setCount;
      });

      const movement =
        (exercise.movementPattern as MovementPattern | undefined | null) ||
        inferMovementPatternFromName(exercise.name);
      if (movement) {
        movementHit.add(movement);
        movementVolume[movement] += setCount;
      }

      setDetails.forEach((set) => {
        const weight = Number(set.weight ?? fallbackWeight ?? 0);
        const reps = Number(set.reps ?? 0);
        if (weight > 0 && reps > 0) {
          totalVolume += weight * reps;
        }
      });

      const liftId = inferLiftIdFromName(exercise.name);
      if (liftId && setDetails.length) {
        const bestSet = setDetails.reduce((best, candidate) => {
          const candidateWeight = Number(candidate.weight ?? fallbackWeight ?? 0);
          const bestWeight = Number(best.weight ?? fallbackWeight ?? 0);
          return candidateWeight > bestWeight ? candidate : best;
        }, setDetails[0]);

        const bestWeight = Number(bestSet.weight ?? fallbackWeight ?? 0);
        const bestReps = Number(bestSet.reps ?? 0);
        const currentBest = bestLiftSets.get(liftId);
        if (!currentBest || bestWeight > currentBest.weight) {
          bestLiftSets.set(liftId, { weight: bestWeight, reps: bestReps });
        }

        const totalExerciseReps = setDetails.reduce(
          (sum, set) => sum + Number(set.reps ?? 0),
          0
        );
        strengthSnapshots.push({
          id: `${session.id}-${exercise.exerciseId ?? exercise.name}-${liftId}-${strengthSnapshots.length}`,
          phasePlanId: session.phasePlanId,
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.name,
          lift: liftId,
          date: session.date,
          weight: bestWeight,
          reps: bestReps,
          totalSets: setCount,
          totalReps: totalExerciseReps,
          estimated1RM: estimateOneRepMax(bestWeight, bestReps),
        });
      }
    });

    bestLiftSets.forEach((payload, lift) => {
      if (payload.weight > 0) {
        lifts.push({
          lift,
          weight: payload.weight,
          reps: payload.reps,
        });
      }
    });

    workoutLogs.push({
      id: session.id,
      date: session.date,
      phasePlanId: session.phasePlanId,
      sessionId: session.id,
      isCompleted: totalSets > 0,
      totalSets,
      totalVolume,
      musclesHit: Array.from(musclesHit),
      movementPatternsHit: Array.from(movementHit),
      muscleVolume,
      movementPatterns: movementVolume,
      lifts,
    });
  });

  return {
    workoutLogs,
    strengthSnapshots,
  };
};
