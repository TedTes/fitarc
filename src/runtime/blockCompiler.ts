import { localDate } from './planDates';
import { phasesFor, RULE_VERSION, weeklyTargetsFor } from './trainingPolicy';
import { RUNTIME_EXERCISES } from './exerciseCatalog';
import { selectExercisesWithReasons } from './exerciseSelector';
import type { ExerciseDefinition, Muscle, MovementPattern, TrainingBlock, TrainingSlot, TrainingSource, WorkingSetState } from './types';
import { createRuntimeId } from './id';

const SLOT_BLUEPRINTS: Record<3 | 4 | 5, Array<{ label: string; muscles: Muscle[]; patterns: MovementPattern[] }>> = {
  3: [
    { label: 'full.a', muscles: ['quads', 'chest', 'back', 'delts', 'triceps'], patterns: ['squat', 'horizontal_push', 'horizontal_pull'] },
    { label: 'full.b', muscles: ['hamstrings', 'glutes', 'back', 'delts', 'biceps'], patterns: ['hinge', 'vertical_push', 'vertical_pull'] },
    { label: 'full.c', muscles: ['quads', 'chest', 'back', 'calves', 'core'], patterns: ['squat', 'horizontal_push', 'vertical_pull'] },
  ],
  4: [
    { label: 'upper.a', muscles: ['chest', 'back', 'delts', 'triceps'], patterns: ['horizontal_push', 'horizontal_pull', 'vertical_push'] },
    { label: 'lower.a', muscles: ['quads', 'hamstrings', 'glutes', 'calves'], patterns: ['squat', 'hinge'] },
    { label: 'upper.b', muscles: ['back', 'chest', 'delts', 'biceps'], patterns: ['vertical_pull', 'horizontal_push', 'horizontal_pull'] },
    { label: 'lower.b', muscles: ['hamstrings', 'glutes', 'quads', 'core'], patterns: ['hinge', 'squat'] },
  ],
  5: [
    { label: 'push', muscles: ['chest', 'delts', 'triceps'], patterns: ['horizontal_push', 'vertical_push'] },
    { label: 'pull', muscles: ['back', 'biceps', 'delts'], patterns: ['vertical_pull', 'horizontal_pull'] },
    { label: 'legs.a', muscles: ['quads', 'glutes', 'calves'], patterns: ['squat', 'single_leg'] },
    { label: 'upper', muscles: ['chest', 'back', 'delts', 'biceps', 'triceps'], patterns: ['horizontal_push', 'horizontal_pull'] },
    { label: 'legs.b', muscles: ['hamstrings', 'glutes', 'quads', 'core'], patterns: ['hinge', 'squat'] },
  ],
};

export const compileBlock = (
  source: TrainingSource,
  previous?: TrainingBlock | null,
  workingSets: Record<string, WorkingSetState> = {},
  catalog: ExerciseDefinition[] = RUNTIME_EXERCISES
): TrainingBlock => {
  const blueprint = SLOT_BLUEPRINTS[source.daysPerWeek];
  const setsPerSlot = source.sessionMinutes <= 30 ? 10 : source.sessionMinutes <= 45 ? 14 : source.sessionMinutes <= 60 ? 18 : 22;
  const exerciseLimit = source.sessionMinutes <= 30 ? 3 : source.sessionMinutes <= 45 ? 4 : 5;
  const creditSets = (budget: Partial<Record<Muscle, number>>, exercise: ExerciseDefinition, sets: number) => {
    exercise.primaryMuscles.forEach((muscle) => { budget[muscle] = (budget[muscle] ?? 0) + sets; });
    exercise.secondaryMuscles.forEach((muscle) => { budget[muscle] = (budget[muscle] ?? 0) + sets * 0.5; });
  };
  const slots: TrainingSlot[] = blueprint.map((slot, index) => {
    const selected = selectExercisesWithReasons({
      catalog, source, targetMuscles: slot.muscles,
      movementPatterns: slot.patterns, workingSets, limit: exerciseLimit,
    });
    const plannedSets = Math.max(2, Math.min(4, Math.floor(setsPerSlot / Math.max(1, selected.length))));
    const plannedExercises = selected.map(({ exercise, trace }) => ({
      exerciseId: exercise.id, sets: plannedSets, selection: trace,
    }));
    const muscleSetBudget: Partial<Record<Muscle, number>> = {};
    selected.forEach(({ exercise }) => creditSets(muscleSetBudget, exercise, plannedSets));
    return {
      id: previous?.slots.find((entry) => entry.label === slot.label)?.id ?? createRuntimeId(), dayIndex: index,
      label: slot.label, targetMuscles: slot.muscles,
      movementPatterns: slot.patterns, muscleSetBudget, plannedExercises,
    };
  });
  const weeklySetBudget = Object.fromEntries(
    Object.keys(weeklyTargetsFor(source.goal, source.experience)).map((muscle) => [
      muscle,
      slots.reduce((sum, slot) => sum + (slot.muscleSetBudget[muscle as Muscle] ?? 0), 0),
    ])
  ) as Record<Muscle, number>;
  return {
    id: createRuntimeId(), groupId: previous?.groupId ?? previous?.id ?? createRuntimeId(),
    preferences: JSON.parse(JSON.stringify(source)) as TrainingSource, userId: source.userId,
    version: (previous?.version ?? 0) + 1, sourceVersion: source.version,
    sourceId: source.id, catalog: JSON.parse(JSON.stringify(catalog)) as ExerciseDefinition[],
    ruleVersion: RULE_VERSION, goal: source.goal,
    startedOn: previous?.startedOn ?? localDate(), durationWeeks: 6,
    currentWeek: previous?.currentWeek ?? 1,
    phases: phasesFor(source.goal), slots, weeklySetBudget,
    weeklyTargets: weeklyTargetsFor(source.goal, source.experience),
    createdAt: new Date().toISOString(),
  };
};

export const validateBlock = (block: TrainingBlock): string[] => {
  const errors: string[] = [];
  if (block.slots.length < 3 || block.slots.length > 5) errors.push('Your plan needs 3–5 weekly workouts.');
  if (!block.phases.some((phase) => phase.kind === 'deload')) errors.push('Your plan needs a recovery phase.');
  if (block.phases[block.phases.length - 1]?.endWeek !== block.durationWeeks) errors.push('Training phases must cover the full plan.');
  if (block.slots.some((slot) => Object.values(slot.muscleSetBudget).every((sets) => !sets || sets <= 0))) errors.push('Each planned workout needs a muscle training target.');
  if (block.slots.some((slot) => !slot.plannedExercises?.length)) errors.push('No compatible exercises are available for a planned workout. Check your equipment and limitations.');
  return errors;
};
