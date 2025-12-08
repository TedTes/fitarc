import { PhasePlan, User, WorkoutLog, StrengthSnapshot, MuscleGroup, MovementPattern, LiftId } from '../types/domain';
import { BodyPart } from './trainingSplitHelper';

const BODY_PARTS: MuscleGroup[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];

const BASE_SETS: Record<MuscleGroup, number> = {
  chest: 8,
  back: 10,
  legs: 12,
  shoulders: 6,
  arms: 6,
  core: 4,
};

const BODY_PART_TO_MOVEMENT: Record<BodyPart, MovementPattern[]> = {
  chest: ['horizontal_push'],
  back: ['horizontal_pull', 'vertical_pull'],
  legs: ['squat', 'hinge'],
  shoulders: ['vertical_push'],
  arms: ['horizontal_push'],
  core: ['hinge'],
};

const LIFT_FOCUS: Record<LiftId, BodyPart[]> = {
  bench_press: ['chest', 'shoulders', 'arms'],
  squat: ['legs', 'core'],
  deadlift: ['back', 'legs'],
};

const SEED_STRENGTH: Record<LiftId, number[]> = {
  bench_press: [135, 140, 145, 145, 150, 152, 155],
  squat: [185, 195, 205, 215, 225, 230, 235],
  deadlift: [225, 235, 245, 255, 265, 270, 275],
};

const SEED_VOLUME: Array<{
  muscleVolume: Record<MuscleGroup, number>;
  movementPatterns: Record<MovementPattern, number>;
  lifts: { lift: LiftId; weight: number; reps: number }[];
}> = [
  {
    muscleVolume: { chest: 14, back: 18, legs: 16, shoulders: 12, arms: 10, core: 8 },
    movementPatterns: { squat: 8, hinge: 8, horizontal_push: 8, vertical_push: 7, horizontal_pull: 9, vertical_pull: 8 },
    lifts: [
      { lift: 'bench_press', weight: 150, reps: 6 },
      { lift: 'squat', weight: 225, reps: 6 },
      { lift: 'deadlift', weight: 265, reps: 5 },
    ],
  },
  {
    muscleVolume: { chest: 12, back: 16, legs: 15, shoulders: 10, arms: 9, core: 8 },
    movementPatterns: { squat: 7, hinge: 7, horizontal_push: 8, vertical_push: 6, horizontal_pull: 9, vertical_pull: 7 },
    lifts: [
      { lift: 'bench_press', weight: 145, reps: 7 },
      { lift: 'squat', weight: 215, reps: 6 },
      { lift: 'deadlift', weight: 255, reps: 5 },
    ],
  },
  {
    muscleVolume: { chest: 13, back: 17, legs: 15, shoulders: 11, arms: 9, core: 7 },
    movementPatterns: { squat: 7, hinge: 7, horizontal_push: 8, vertical_push: 6, horizontal_pull: 8, vertical_pull: 7 },
    lifts: [
      { lift: 'bench_press', weight: 145, reps: 8 },
      { lift: 'squat', weight: 205, reps: 8 },
      { lift: 'deadlift', weight: 245, reps: 6 },
    ],
  },
  {
    muscleVolume: { chest: 12, back: 15, legs: 14, shoulders: 10, arms: 8, core: 7 },
    movementPatterns: { squat: 6, hinge: 6, horizontal_push: 7, vertical_push: 6, horizontal_pull: 8, vertical_pull: 6 },
    lifts: [
      { lift: 'bench_press', weight: 140, reps: 8 },
      { lift: 'squat', weight: 195, reps: 8 },
      { lift: 'deadlift', weight: 235, reps: 6 },
    ],
  },
];

const createEmptyVolume = (): Record<MuscleGroup, number> =>
  BODY_PARTS.reduce((acc, part) => ({ ...acc, [part]: 0 }), {} as Record<MuscleGroup, number>);

const createEmptyMovementVolume = (): Record<MovementPattern, number> => ({
  squat: 0,
  hinge: 0,
  horizontal_push: 0,
  vertical_push: 0,
  horizontal_pull: 0,
  vertical_pull: 0,
});

const buildSnapshotId = (lift: LiftId, date: string) => `snapshot_${lift}_${date}`;

const getLatestSnapshot = (lift: LiftId, snapshots: StrengthSnapshot[]): StrengthSnapshot | undefined => {
  return snapshots
    .filter((s) => s.lift === lift)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
};

type AutoLogParams = {
  date: string;
  phasePlanId: string;
  focusAreas: BodyPart[];
  existingSnapshots: StrengthSnapshot[];
};

export const buildWorkoutLogFromFocus = ({
  date,
  phasePlanId,
  focusAreas,
  existingSnapshots,
}: AutoLogParams): { log: WorkoutLog; snapshots: StrengthSnapshot[] } | null => {
  if (!focusAreas.length) return null;

  const muscleVolume = createEmptyVolume();
  const movementPatterns = createEmptyMovementVolume();
  const lifts: WorkoutLog['lifts'] = [];
  const newSnapshots: StrengthSnapshot[] = [];

  focusAreas.forEach((part) => {
    muscleVolume[part] += BASE_SETS[part] + Math.floor(Math.random() * 3);
    BODY_PART_TO_MOVEMENT[part]?.forEach((pattern) => {
      movementPatterns[pattern] += 1;
    });

    Object.entries(LIFT_FOCUS).forEach(([lift, relatedParts]) => {
      if (relatedParts.includes(part) && !lifts.find((l) => l.lift === lift)) {
        const lastSnapshot = getLatestSnapshot(lift as LiftId, existingSnapshots);
        const base = lastSnapshot?.weight ?? (SEED_STRENGTH[lift as LiftId]?.[0] || 100);
        const nextWeight = base + (Math.random() > 0.7 ? 5 : 0);
        const reps = lastSnapshot?.reps ?? 8;
        lifts.push({
          lift: lift as LiftId,
          weight: Math.round(nextWeight),
          reps,
        });
        newSnapshots.push({
          id: buildSnapshotId(lift as LiftId, date),
          phasePlanId,
          lift: lift as LiftId,
          date,
          weight: Math.round(nextWeight),
          reps,
        });
      }
    });
  });

  const log: WorkoutLog = {
    id: `workout_${phasePlanId}_${date}`,
    date,
    phasePlanId,
    muscleVolume,
    movementPatterns,
    lifts,
  };

  return { log, snapshots: newSnapshots };
};

export const generateSeedPerformanceData = (
  phase: PhasePlan,
  user: User
): { workoutLogs: WorkoutLog[]; strengthSnapshots: StrengthSnapshot[] } => {
  const workoutLogs: WorkoutLog[] = [];
  const strengthSnapshots: StrengthSnapshot[] = [];
  const today = new Date();

  // Seed snapshot history using preset arrays
  (Object.keys(SEED_STRENGTH) as LiftId[]).forEach((lift) => {
    const weights = SEED_STRENGTH[lift];
    weights.forEach((weight, index) => {
      const snapshotDate = new Date(today);
      snapshotDate.setDate(today.getDate() - (weights.length - index) * 7);
      strengthSnapshots.push({
        id: buildSnapshotId(lift, snapshotDate.toISOString()),
        phasePlanId: phase.id,
        lift,
        date: snapshotDate.toISOString(),
        weight,
        reps: 6 + ((index + 1) % 3),
      });
    });
  });

  SEED_VOLUME.forEach((entry, idx) => {
    const logDate = new Date(today);
    logDate.setDate(today.getDate() - idx * 7);
    workoutLogs.push({
      id: `seed_workout_${idx}`,
      date: logDate.toISOString(),
      phasePlanId: phase.id,
      muscleVolume: { ...createEmptyVolume(), ...entry.muscleVolume },
      movementPatterns: { ...createEmptyMovementVolume(), ...entry.movementPatterns },
      lifts: entry.lifts,
    });
  });

  return { workoutLogs, strengthSnapshots };
};
