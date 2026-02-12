import { MuscleGroup, PlanDay, PlanWorkoutExercise } from '../types/domain';
import {
  appendPlanExercisesForDate as appendSnapshotExercisesForDate,
  deletePlanExercise as deleteSnapshotPlanExercise,
  ensurePlanWorkoutForDate as ensureSnapshotPlanWorkoutForDate,
  fetchPlanWorkoutForDate as fetchSnapshotPlanWorkoutForDate,
  fetchPlanWorkoutsForRange as fetchSnapshotPlanWorkoutsForRange,
  replacePlanExercisesForDate as replaceSnapshotExercisesForDate,
} from './planSnapshotService';

export type PlanSourceMode = 'snapshot' | 'template_overrides';

export type PlanExerciseInput = {
  exerciseId: string;
  name: string;
  bodyParts?: MuscleGroup[];
  movementPattern?: string | null;
  sets?: number | null;
  reps?: string | null;
  displayOrder?: number | null;
  notes?: string | null;
  sourceTemplateExerciseId?: string | null;
};

const PLAN_SOURCE_MODE = (
  process.env.EXPO_PUBLIC_PLAN_SOURCE_MODE?.trim().toLowerCase() === 'template_overrides'
    ? 'template_overrides'
    : 'snapshot'
) as PlanSourceMode;

export const getPlanSourceMode = (): PlanSourceMode => PLAN_SOURCE_MODE;

const assertModeImplemented = () => {
  if (PLAN_SOURCE_MODE === 'template_overrides') {
    throw new Error(
      'template_overrides_mode_not_implemented: runtime still using snapshot-backed plan data'
    );
  }
};

export const fetchPlanRange = async (
  userId: string,
  planId: string,
  startDate: string,
  endDate: string
): Promise<PlanDay[]> => {
  assertModeImplemented();
  return fetchSnapshotPlanWorkoutsForRange(userId, planId, startDate, endDate);
};

export const fetchResolvedPlanForDate = async (
  userId: string,
  planId: string,
  date: string
): Promise<PlanDay | null> => {
  assertModeImplemented();
  return fetchSnapshotPlanWorkoutForDate(userId, planId, date);
};

export const ensurePlanWorkoutForDate = async (
  userId: string,
  planId: string,
  date: string
) => {
  assertModeImplemented();
  return ensureSnapshotPlanWorkoutForDate(userId, planId, date);
};

export const replacePlanExercisesForDate = async (
  userId: string,
  planId: string,
  date: string,
  exercises: PlanExerciseInput[],
  sourceTemplateId?: string | null,
  title?: string | null
) => {
  assertModeImplemented();
  return replaceSnapshotExercisesForDate(
    userId,
    planId,
    date,
    exercises,
    sourceTemplateId,
    title
  );
};

export const appendPlanExercisesForDate = async (
  userId: string,
  planId: string,
  date: string,
  exercises: PlanExerciseInput[],
  sourceTemplateId?: string | null,
  title?: string | null
) => {
  assertModeImplemented();
  return appendSnapshotExercisesForDate(
    userId,
    planId,
    date,
    exercises,
    sourceTemplateId,
    title
  );
};

export const deletePlanExercise = async (planExerciseId: string) => {
  assertModeImplemented();
  return deleteSnapshotPlanExercise(planExerciseId);
};

export const toPlanExerciseInputs = (
  exercises: PlanWorkoutExercise[]
): PlanExerciseInput[] =>
  exercises.map((exercise) => ({
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    bodyParts: exercise.bodyParts,
    movementPattern: exercise.movementPattern ?? null,
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    displayOrder: exercise.displayOrder ?? null,
    notes: exercise.notes ?? null,
  }));
