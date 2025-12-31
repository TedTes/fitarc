import {
  WorkoutSessionEntry,
  WorkoutLog,
  MovementPattern,
  MuscleGroup,
} from '../types/domain';
import {  BodyPart } from './trainingSplitHelper';

const BODY_PART_TO_MOVEMENT: Record<BodyPart, MovementPattern[]> = {
  chest: ['horizontal_push'],
  back: ['horizontal_pull', 'vertical_pull'],
  legs: ['squat', 'hinge'],
  shoulders: ['vertical_push'],
  arms: ['horizontal_push'],
  core: ['hinge'],
};

const BASE_SETS_PER_EXERCISE = 4;





export const toggleExerciseCompletion = (
  session: WorkoutSessionEntry,
  exerciseName: string
): WorkoutSessionEntry => {
  const nextExercises = session.exercises.map((exercise) =>
    exercise.name === exerciseName
      ? { ...exercise, completed: !exercise.completed }
      : exercise
  );
  const isCompleted = nextExercises.every((exercise) => exercise.completed);
  return {
    ...session,
    exercises: nextExercises,
    completed: isCompleted,
  };
};

const createEmptyVolume = (): Record<MuscleGroup, number> => ({
  chest: 0,
  back: 0,
  legs: 0,
  shoulders: 0,
  arms: 0,
  core: 0,
});

const createEmptyMovement = (): Record<MovementPattern, number> => ({
  squat: 0,
  hinge: 0,
  horizontal_push: 0,
  vertical_push: 0,
  horizontal_pull: 0,
  vertical_pull: 0,
});

export const sessionToWorkoutLog = (session: WorkoutSessionEntry): WorkoutLog => {
  const muscleVolume = createEmptyVolume();
  const movementPatterns = createEmptyMovement();

  session.exercises
    .filter((exercise) => exercise.completed)
    .forEach((exercise) => {
      exercise.bodyParts.forEach((part) => {
        const normalized = part.toLowerCase() as BodyPart;
        if ((muscleVolume as Record<string, number>)[part] === undefined) {
          (muscleVolume as Record<string, number>)[part] = 0;
        }
        (muscleVolume as Record<string, number>)[part] += BASE_SETS_PER_EXERCISE;
        const patterns = BODY_PART_TO_MOVEMENT[normalized];
        if (!patterns) return;
        patterns.forEach((pattern: MovementPattern) => {
          movementPatterns[pattern] += 1;
        });
      });
    });

  return {
    id: `workout_${session.phasePlanId}_${session.date}`,
    date: session.date,
    phasePlanId: session.phasePlanId,
    muscleVolume,
    movementPatterns,
    lifts: [],
  };
};
