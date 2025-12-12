import {
  User,
  WorkoutSessionEntry,
  WorkoutSessionExercise,
  WorkoutLog,
  MovementPattern,
  MuscleGroup,
} from '../types/domain';
import { getTodayFocusAreas, BodyPart } from './trainingSplitHelper';

const BODY_PART_TO_MOVEMENT: Record<BodyPart, MovementPattern[]> = {
  chest: ['horizontal_push'],
  back: ['horizontal_pull', 'vertical_pull'],
  legs: ['squat', 'hinge'],
  shoulders: ['vertical_push'],
  arms: ['horizontal_push'],
  core: ['hinge'],
};

const BASE_SETS_PER_EXERCISE = 4;
const PLACEHOLDER_SET_COUNT = 4;
const PLACEHOLDER_REP_RANGE = '8-12';
const DEFAULT_FOCUS: BodyPart[] = ['chest', 'back', 'shoulders', 'arms'];

const buildPlaceholderExercises = (
  focusAreas: BodyPart[]
): WorkoutSessionExercise[] =>
  focusAreas.map((part, index) => ({
    name: `${part.charAt(0).toUpperCase() + part.slice(1)} Focus ${index + 1}`,
    bodyParts: [part as MuscleGroup],
    completed: false,
    sets: PLACEHOLDER_SET_COUNT,
    reps: PLACEHOLDER_REP_RANGE,
  }));

export const createSessionForDate = (
  user: User,
  phasePlanId: string,
  date: string
): WorkoutSessionEntry => {
  const focusAreas =
    getTodayFocusAreas(user.trainingSplit, new Date(date).getDay()) || [];
  const plannedFocus = focusAreas.length ? focusAreas : DEFAULT_FOCUS;
  const placeholderExercises = buildPlaceholderExercises(plannedFocus);

  return {
    id: `session_${phasePlanId}_${date}`,
    date,
    phasePlanId,
    exercises: placeholderExercises,
  };
};

export const toggleExerciseCompletion = (
  session: WorkoutSessionEntry,
  exerciseName: string
): WorkoutSessionEntry => {
  return {
    ...session,
    exercises: session.exercises.map((exercise) =>
      exercise.name === exerciseName
        ? { ...exercise, completed: !exercise.completed }
        : exercise
    ),
    completedAt: session.exercises.every((exercise) =>
      exercise.name === exerciseName ? !exercise.completed : exercise.completed
    )
      ? new Date().toISOString()
      : session.completedAt,
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
        muscleVolume[part] += BASE_SETS_PER_EXERCISE;
        BODY_PART_TO_MOVEMENT[part]?.forEach((pattern) => {
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
