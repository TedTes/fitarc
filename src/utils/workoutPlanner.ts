import { User, WorkoutSessionEntry, WorkoutSessionExercise, MuscleGroup, WorkoutLog, MovementPattern } from '../types/domain';
import { getTodayFocusAreas, BodyPart } from './trainingSplitHelper';
import { getExercisesForBodyParts, exercises } from '../data/exercises';

const DEFAULT_EXERCISE_COUNT = 7;
const DEFAULT_FOCUS: BodyPart[] = ['chest', 'back', 'shoulders', 'arms'];
const DEFAULT_SET_PATTERN = [5, 4, 4, 3, 3, 4, 3];
const DEFAULT_REP_PATTERN = ['6-8', '8-10', '10-12'];

const BODY_PART_TO_MOVEMENT: Record<BodyPart, MovementPattern[]> = {
  chest: ['horizontal_push'],
  back: ['horizontal_pull', 'vertical_pull'],
  legs: ['squat', 'hinge'],
  shoulders: ['vertical_push'],
  arms: ['horizontal_push'],
  core: ['hinge'],
};

const BASE_SETS_PER_EXERCISE = 4;

const buildExerciseLookup = (): Record<string, MuscleGroup[]> => {
  return exercises.reduce<Record<string, MuscleGroup[]>>((acc, exercise) => {
    acc[exercise.name] = exercise.bodyParts as MuscleGroup[];
    return acc;
  }, {});
};

const EXERCISE_LOOKUP = buildExerciseLookup();

export const createSessionForDate = (
  user: User,
  phasePlanId: string,
  date: string
): WorkoutSessionEntry => {
  const focusAreas =
    getTodayFocusAreas(user.trainingSplit, new Date(date).getDay()) || [];
  const desiredFocus = focusAreas.length ? focusAreas : DEFAULT_FOCUS;
  const plannedExercises = getExercisesForBodyParts(
    desiredFocus,
    DEFAULT_EXERCISE_COUNT,
    `${phasePlanId}_${date}`
  );

  const sessionExercises: WorkoutSessionExercise[] = plannedExercises.map((name, index) => ({
    name,
    bodyParts: EXERCISE_LOOKUP[name] || desiredFocus,
    completed: false,
    sets: DEFAULT_SET_PATTERN[index % DEFAULT_SET_PATTERN.length],
    reps: DEFAULT_REP_PATTERN[index % DEFAULT_REP_PATTERN.length],
  }));

  return {
    id: `session_${phasePlanId}_${date}`,
    date,
    phasePlanId,
    exercises: sessionExercises,
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
