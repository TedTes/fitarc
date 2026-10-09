import { selectPoolPlans, workoutGroup, matchesGroup } from './exercisePools';
import { rangeLoad } from './weights';
import { exerciseAlternatives } from './recommendations';
import { suggestWorkoutLoad } from './progression';
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
  sessions?: SessionPrescription[];
  weeklyStatus?: WeeklyStatus;
  slotIndex?: number;
  setCeilings?: Record<string, number>;
  phaseOverride?: BlockPhase;
}): SessionPrescription => {
  const catalog = input.block.catalog ?? RUNTIME_EXERCISES;
  const slot = input.block.slots[(input.slotIndex ?? 0) % input.block.slots.length];
  const phase = input.phaseOverride ?? currentPhase(input.block);
  const pools = input.source.routine?.selectionMode === 'pools';
  const plans = pools ? selectPoolPlans(slot,input.source,catalog,input.context,input.sessions) : slot.plannedExercises;
  const custom = input.source.routine?.split === 'custom';
  const group = workoutGroup(slot.label);
  const groupCatalog = group ? catalog.filter(exercise => matchesGroup(exercise, group)) : catalog;
  const exerciseLimit = custom ? plans.length : input.context.minutesAvailable <= 30 ? 3 : input.context.minutesAvailable <= 45 ? 4 : 5;
  const unavailableExercises = new Set(input.context.unavailableExerciseIds);
  const unavailableEquipment = new Set(input.context.unavailableEquipment);
  const planned = (plans ?? []).flatMap((plan) => {
    const original = catalog.find(candidate=>candidate.id===plan.exerciseId);
    const replacementId = input.context.exerciseReplacements?.[plan.exerciseId];
    if (replacementId && (!original || !exerciseAlternatives(original,catalog,input.source,input.sessions ?? [],input.context).some(x=>x.exercise.id===replacementId))) throw Error('A selected replacement no longer fits today’s constraints.');
    const exercise = catalog.find((candidate) => candidate.id === (replacementId ?? plan.exerciseId));
    if (!exercise || (group && !matchesGroup(exercise, group)) || input.source.excludedExerciseIds.includes(exercise.id) || exercise.contraindications.some((item) => input.source.limitations.includes(item)) || exercise.equipment.some((item) => !input.source.equipment.includes(item)) || unavailableExercises.has(exercise.id) || exercise.equipment.some((item) => unavailableEquipment.has(item))) return [];
    return [{ exercise, prescription: plan.prescription ? {...plan.prescription,exerciseId:exercise.id,startingLoadKg:replacementId?undefined:plan.prescription.startingLoadKg} : undefined, plannedSets: plan.sets, reason: replacementId ? `Your chosen replacement for ${original!.name}, today only` : plan.selection.reasons.join(' · ') }];
  }).slice(0, exerciseLimit);
  const fallback = selectExercises({
    catalog: groupCatalog, source: input.source,
    targetMuscles: slot.targetMuscles, movementPatterns: slot.movementPatterns,
    workingSets: input.workingSets,
    unavailableExerciseIds: input.context.unavailableExerciseIds,
    unavailableEquipment: input.context.unavailableEquipment,
    limit: exerciseLimit,
  }).map((exercise) => ({
    exercise, prescription: undefined,
    plannedSets: Math.max(2, Math.min(4, Math.floor((slot.plannedExercises?.reduce((sum, plan) => sum + plan.sets, 0) ?? exerciseLimit * 3) / Math.max(1, exerciseLimit)))),
    reason: `${slot.label}: selected within current constraints`,
  }));
  const selected = [...planned, ...(input.source.routine ? [] : fallback).filter((item) => !planned.some((plan) => plan.exercise.id === item.exercise.id))].slice(0, Math.min(exerciseLimit, slot.plannedExercises?.length || exerciseLimit));
  if (new Set(selected.map(x=>x.exercise.id)).size !== selected.length) throw Error('Choose different exercises for each position in today’s workout.');
  const reserved = Object.fromEntries(MUSCLES.map((muscle) => [muscle, input.weeklyStatus?.muscles.find((item) => item.muscle === muscle)?.completedSets ?? 0])) as Record<(typeof MUSCLES)[number], number>;
  let exercises = selected.map(({ exercise, prescription, plannedSets, reason }, index) => {
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
    const suggestion = input.source.routine ? suggestWorkoutLoad(exercise, prescription ?? {
      exerciseId:exercise.id,sets:plannedSets,minReps:phase.minReps,maxReps:phase.maxReps,targetRir:phase.targetRir,
    },input.source,input.sessions ?? [],input.context.date) : undefined;
    const range=input.source.weightRanges?.[exercise.id];
    const loadKg = suggestion?.loadKg ?? seed?.loadKg ?? prescription?.startingLoadKg ?? (exercise.compound ? 20 : 10);
    return {
      id: createRuntimeId(), exercise, priority: index + 1,
      ...(range?{needsBaseline:false}:suggestion ? {needsBaseline: !suggestion.baselineKnown} : {}),
      reason: `${reason} · ${{within_constraints:'Fits your current preferences',recovery_meh:'Fewer sets for today’s recovery',recovery_no:'Reduced work for today’s recovery',deload_override:'Reduced work for recovery',weekly_volume_cap:'Adjusted for this week’s completed work'}[arbitration.reasonCode] ?? 'Adjusted for today'}${suggestion ? ` · ${suggestion.explanation}` : ''}`,
      sets: Array.from({ length: allowedSets }, (_, setIndex) => ({
        id: createRuntimeId(), setNumber: setIndex + 1, loadKg:range?rangeLoad(range,setIndex,allowedSets):loadKg,
        minReps: prescription?.minReps ?? phase.minReps, maxReps: prescription?.maxReps ?? phase.maxReps,
        targetRir: prescription?.targetRir ?? phase.targetRir, status: 'pending' as const,
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
