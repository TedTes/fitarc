import { MUSCLES, secondaryMuscleCredit } from './trainingPolicy';
import { arbitratePrescription } from './arbitration';
import { RUNTIME_EXERCISES } from './exerciseCatalog';
import { selectExercises } from './exerciseSelector';
import { createRuntimeId } from './id';
import type { BlockPhase, SessionContext, SessionPrescription, TrainingBlock, TrainingSource, WeeklyStatus, WorkingSetState } from './types';

const currentPhase = (block: TrainingBlock): BlockPhase =>
  block.phases.find((phase) => block.currentWeek >= phase.startWeek && block.currentWeek <= phase.endWeek)
  ?? block.phases[0];

export const solveSession = (input: {
  source: TrainingSource;
  block: TrainingBlock;
  context: SessionContext;
  workingSets: Record<string, WorkingSetState>;
  weeklyStatus?: WeeklyStatus;
  slotIndex?: number;
  setCeilings?: Record<string, number>;
  phaseOverride?: BlockPhase;
}): SessionPrescription => {
  const catalog = input.block.catalog ?? RUNTIME_EXERCISES;
  const slot = input.block.slots[(input.slotIndex ?? 0) % input.block.slots.length];
  const phase = input.phaseOverride ?? currentPhase(input.block);
  const exerciseLimit = input.context.minutesAvailable <= 30 ? 3 : input.context.minutesAvailable <= 45 ? 4 : 5;
  const unavailableExercises = new Set(input.context.unavailableExerciseIds);
  const unavailableEquipment = new Set(input.context.unavailableEquipment);
  const planned = (slot.plannedExercises ?? []).flatMap((plan) => {
    const exercise = catalog.find((candidate) => candidate.id === plan.exerciseId);
    if (!exercise || input.source.excludedExerciseIds.includes(exercise.id) || exercise.contraindications.some((item) => input.source.limitations.includes(item)) || exercise.equipment.some((item) => !input.source.equipment.includes(item)) || unavailableExercises.has(exercise.id) || exercise.equipment.some((item) => unavailableEquipment.has(item))) return [];
    return [{ exercise, plannedSets: plan.sets, reason: plan.selection.reasons.join(' · ') }];
  }).slice(0, exerciseLimit);
  const fallback = selectExercises({
    catalog, source: input.source,
    targetMuscles: slot.targetMuscles, movementPatterns: slot.movementPatterns,
    workingSets: input.workingSets,
    unavailableExerciseIds: input.context.unavailableExerciseIds,
    unavailableEquipment: input.context.unavailableEquipment,
    limit: exerciseLimit,
  }).map((exercise) => ({
    exercise,
    plannedSets: Math.max(2, Math.min(4, Math.floor((slot.plannedExercises?.reduce((sum, plan) => sum + plan.sets, 0) ?? exerciseLimit * 3) / Math.max(1, exerciseLimit)))),
    reason: `${slot.label}: selected within current constraints`,
  }));
  const selected = [...planned, ...fallback.filter((item) => !planned.some((plan) => plan.exercise.id === item.exercise.id))].slice(0, Math.min(exerciseLimit, slot.plannedExercises?.length || exerciseLimit));
  const reserved = Object.fromEntries(MUSCLES.map((muscle) => [muscle, input.weeklyStatus?.muscles.find((item) => item.muscle === muscle)?.completedSets ?? 0])) as Record<(typeof MUSCLES)[number], number>;
  let exercises = selected.map(({ exercise, plannedSets, reason }, index) => {
    const primary = exercise.primaryMuscles[0];
    const muscleStatus = input.weeklyStatus?.muscles.find((status) => status.muscle === primary);
    const arbitration = arbitratePrescription({
      phase: phase.kind, recovery: input.context.recovery, plannedSets,
      weeklySetsAfterSession: (muscleStatus?.completedSets ?? 0) + plannedSets,
      weeklyMaximum: muscleStatus?.max ?? input.block.weeklyTargets[primary].max,
      hasPain: exercise.contraindications.some((item) => input.source.limitations.includes(item)),
      exerciseAvailable: !input.context.unavailableExerciseIds.includes(exercise.id),
    });
    // Account for every affected muscle, including overlap within this workout.
    const credits = MUSCLES.map((muscle) => ({ muscle, credit: exercise.primaryMuscles.includes(muscle) ? 1 : exercise.secondaryMuscles.includes(muscle) ? secondaryMuscleCredit : 0 })).filter((item) => item.credit > 0);
    const allowedSets = Math.max(0, Math.floor(Math.min(arbitration.allowedSets, input.setCeilings?.[exercise.id] ?? Infinity,
      ...credits.map(({muscle,credit}) => (input.block.weeklyTargets[muscle].max - reserved[muscle]) / credit))));
    credits.forEach(({muscle,credit}) => { reserved[muscle] += allowedSets * credit; });
    const seed = input.workingSets[exercise.id]
      ?? input.source.seedWorkingSets.find((item) => item.exerciseId === exercise.id);
    const loadKg = seed?.loadKg ?? (exercise.compound ? 20 : 10);
    return {
      id: createRuntimeId(), exercise, priority: index + 1,
      reason: `${reason} · ${arbitration.reasonCode}`,
      sets: Array.from({ length: allowedSets }, (_, setIndex) => ({
        id: createRuntimeId(), setNumber: setIndex + 1, loadKg,
        minReps: phase.minReps, maxReps: phase.maxReps,
        targetRir: phase.targetRir, status: 'pending' as const,
      })),
    };
  }).filter((entry) => entry.sets.length > 0);
  const estimate = () => exercises.reduce(
    (sum, entry) => sum + entry.exercise.setupMinutes + entry.sets.length * (entry.exercise.compound ? 3.5 : 2.5), 0
  );
  while (estimate() > input.context.minutesAvailable) {
    const removableIndex = [...exercises].reverse().findIndex((entry, reverseIndex) => {
      const originalIndex = exercises.length - 1 - reverseIndex;
      return entry.sets.length > (originalIndex === 0 ? 2 : 1);
    });
    if (removableIndex < 0) { exercises = exercises.slice(0, -1); if (!exercises.length) break; continue; }
    const index = exercises.length - 1 - removableIndex;
    exercises = exercises.map((entry, entryIndex) => entryIndex === index
      ? { ...entry, sets: entry.sets.slice(0, -1) }
      : entry);
  }
  const estimatedMinutes = Math.ceil(estimate());
  return {
    id: createRuntimeId(), blockId: input.block.id, planGroupId: input.block.groupId ?? input.block.id, blockVersion: input.block.version,
    slotId: slot.id, context: input.context, phase: phase.kind,
    estimatedMinutes, exercises,
    status: 'proposed',
    explanation: input.context.recovery === 'yes'
      ? `Workout fits a ${input.context.minutesAvailable}-minute budget.`
      : `Fewer sets planned for your recovery today.`,
    createdAt: new Date().toISOString(),
  };
};
