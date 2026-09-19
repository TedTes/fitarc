import { arbitratePrescription } from './arbitration';
import { compileBlock, validateBlock } from './blockCompiler';
import { solveSession } from './sessionSolver';
import { commitRuntimeSession, getSwapCandidates, previewTrainingSessionDetailed, recordRuntimeSet, skipRemainingRuntimeSets, skipRuntimeExercise, solveTrainingSession, substituteRuntimeExercise } from './runtimeService';
import { solveNextSet } from './setSolver';
import { computeWeeklyStatus } from './status';
import type { Muscle, RuntimeState, SetResult, TrainingSource } from './types';

const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`Runtime contract failed: ${message}`);
};

const result = (overrides: Partial<SetResult>): SetResult => ({
  prescriptionId: '00000000-0000-4000-8000-000000000001',
  setId: '00000000-0000-4000-8000-000000000002', exerciseId: 'bench_press',
  prescribedLoadKg: 100, prescribedMinReps: 6, prescribedMaxReps: 8,
  targetRir: 2, completedReps: 8, reportedRir: 2,
  completedAt: '2026-09-17T12:00:00.000Z', ...overrides,
});

export const runRuntimeContractChecks = () => {
  const missed = solveNextSet({ result: result({ completedReps: 3 }), phase: 'intensify', incrementKg: 2.5 });
  expect(missed.action === 'decrease' && missed.nextLoadKg < 100, 'material rep miss must reduce load');
  const progressed = solveNextSet({ result: result({}), phase: 'intensify', incrementKg: 2.5 });
  expect(progressed.action === 'increase' && progressed.nextLoadKg === 102.5, 'rep ceiling at target effort must increase one increment');
  const optimistic = solveNextSet({ result: result({ reportedRir: 4 }), phase: 'intensify', incrementKg: 2.5 });
  expect(optimistic.nextLoadKg === 102.5, 'one optimistic RIR must never create a multi-increment jump');
  const failure = solveNextSet({ result: result({ reportedRir: 0 }), phase: 'intensify', incrementKg: 2.5 });
  expect(failure.action === 'decrease' && failure.nextLoadKg < 100, 'RIR zero must back off after reps are hit');
  const repsPrimary = solveNextSet({ result: result({ completedReps: 5, reportedRir: 4 }), phase: 'intensify', incrementKg: 2.5 });
  expect(repsPrimary.action === 'decrease', 'missed reps must override an optimistic RIR');
  const deload = arbitratePrescription({ phase: 'deload', recovery: 'yes', plannedSets: 4, weeklySetsAfterSession: 10, weeklyMaximum: 20, hasPain: false, exerciseAvailable: true });
  expect(deload.allowedSets === 2 && !deload.allowLoadProgression, 'deload must cap volume and progression');

  const source: TrainingSource = {
    id: '00000000-0000-4000-8000-000000000003', userId: '00000000-0000-4000-8000-000000000004',
    version: 1, goal: 'hypertrophy', experience: 'intermediate', daysPerWeek: 4,
    sessionMinutes: 45, equipment: ['barbell', 'rack', 'machine', 'cable', 'dumbbell', 'bench', 'pullup_bar'],
    excludedExerciseIds: [], limitations: [], seedWorkingSets: [], createdAt: '2026-09-17T12:00:00.000Z',
  };
  const block = compileBlock(source);
  expect(validateBlock(block).length === 0, 'compiled block must be valid');
  const session = solveSession({
    source, block, context: { date: '2026-09-17', minutesAvailable: 45, recovery: 'yes', unavailableExerciseIds: [], unavailableEquipment: [] },
    workingSets: {}, slotIndex: 0,
  });
  expect(session.exercises.length > 0, 'session must contain exercises');
  expect(session.estimatedMinutes <= 45, 'session must fit the declared time cap');
  expect(session.exercises.every((entry) => !source.excludedExerciseIds.includes(entry.exercise.id)), 'session must honor exercise exclusions');
  const fresh = computeWeeklyStatus(block, [], []);
  expect(fresh.weekState === 'in_progress' && fresh.fatiguePercent === 0, 'a fresh week must be open with zero fatigue');
  expect(fresh.muscles.every((muscle) => muscle.state !== 'under' && muscle.state !== 'over'), 'an open week must suppress verdicts');
  fresh.muscles.forEach((muscle) => {
    expect(muscle.projectedSets === block.weeklySetBudget[muscle.muscle], `projection must equal compiled ${muscle.muscle} budget on a fresh week`);
  });
  (Object.keys(block.weeklySetBudget) as Muscle[]).forEach((muscle) => {
    const slotTotal = block.slots.reduce((sum, slot) => sum + (slot.muscleSetBudget[muscle] ?? 0), 0);
    expect(slotTotal === block.weeklySetBudget[muscle], `${muscle} slot credits must reconcile with the weekly budget`);
  });

  const limitedSource: TrainingSource = { ...source, limitations: ['lower back', 'shoulder', 'neck'] };
  const limitedBlock = compileBlock(limitedSource);
  const selections = limitedBlock.slots.flatMap((slot) => slot.plannedExercises.map((plan) => plan.selection));
  expect(selections.some((selection) => selection.substituted), 'limitations must create traceable block-level substitutions');
  expect(selections.filter((selection) => selection.substituted).every((selection) => selection.reasons.length > 1), 'every substitution must store its selection evidence');
  const selectedIds = new Set(limitedBlock.slots.flatMap((slot) => slot.plannedExercises.map((plan) => plan.exerciseId)));
  const limitedSession = solveSession({
    source: limitedSource, block: limitedBlock,
    context: { date: '2026-09-17', minutesAvailable: 45, recovery: 'yes', unavailableExerciseIds: [], unavailableEquipment: [] },
    workingSets: {}, slotIndex: 0,
  });
  expect(limitedSession.exercises.every((entry) => selectedIds.has(entry.exercise.id)), 'sessions must use constraint-resolved block exercises');
  ['lower back', 'shoulder', 'neck', 'elbow', 'knee'].forEach((limitation) => {
    const constrained = compileBlock({ ...source, limitations: [limitation] });
    const swaps = constrained.slots.flatMap((slot) => slot.plannedExercises).filter((plan) => plan.selection.substituted);
    expect(swaps.length > 0, `${limitation} must resolve to at least one block-level substitution`);
    expect(swaps.every((plan) => plan.selection.reasons.some((reason) => reason.includes('avoids') || reason.includes('equipment') || reason.includes('excluded'))), `${limitation} substitutions must explain the avoided constraint`);
  });

  // Exclusions (pain reports, today-only skips) travel in the session context and must remove the lift.
  const excludedSession = solveSession({
    source, block,
    context: { date: '2026-09-17', minutesAvailable: 75, recovery: 'yes', unavailableExerciseIds: ['machine_chest_press'], unavailableEquipment: [] },
    workingSets: {}, slotIndex: 0,
  });
  expect(block.slots[0].plannedExercises.some((plan) => plan.exerciseId === 'machine_chest_press'), 'fixture: slot 0 plans machine chest press');
  expect(excludedSession.exercises.every((entry) => entry.exercise.id !== 'machine_chest_press'), 'an excluded lift must not be prescribed');
  expect(excludedSession.exercises.length > 0, 'excluding one lift must not empty the session');

  // Session lifecycle: preview → start → swap with choice → skip remaining → commit.
  const today = new Date().toISOString().slice(0, 10);
  const context = { date: today, minutesAvailable: 60 as const, recovery: 'yes' as const, unavailableExerciseIds: [], unavailableEquipment: [] };
  const fresh0 = {
    updatedAt: '', source, block: compileBlock(source), activeSession: null, sessions: [], setResults: [],
    workingSets: {}, decisions: [], committedSessionIds: [], lastBlockDiff: [],
  } as RuntimeState;
  const detailed = previewTrainingSessionDetailed(fresh0, context);
  expect(detailed.slot !== null && detailed.weekNumber === 1, 'a preview must expose its slot and calendar week');
  const started = solveTrainingSession(fresh0, context);
  const first = started.activeSession!.exercises[0];
  const candidates = getSwapCandidates(started, first.exercise.id, 3);
  expect(candidates.length > 0 && candidates.every((item) => item.id !== first.exercise.id), 'swap candidates must exclude the current lift');
  const chosen = candidates[candidates.length - 1];
  const swapped = substituteRuntimeExercise(started, first.exercise.id, chosen.id);
  expect(swapped.activeSession!.exercises[0].exercise.id === chosen.id, 'a chosen replacement must be the one applied');
  let threw = false;
  try { substituteRuntimeExercise(started, first.exercise.id, first.exercise.id); } catch { threw = true; }
  expect(threw, 'an incompatible replacement must be rejected');
  const logged = swapped.activeSession!.exercises[1];
  const withSet = recordRuntimeSet(swapped, {
    prescriptionId: swapped.activeSession!.id, setId: logged.sets[0].id, exerciseId: logged.exercise.id,
    prescribedLoadKg: logged.sets[0].loadKg, prescribedMinReps: logged.sets[0].minReps, prescribedMaxReps: logged.sets[0].maxReps,
    targetRir: logged.sets[0].targetRir, completedReps: logged.sets[0].maxReps, reportedRir: 2, completedAt: new Date().toISOString(),
  });
  const finished = skipRemainingRuntimeSets(withSet);
  expect(finished.activeSession!.exercises.every((entry) => entry.sets.every((set) => set.status !== 'pending')), 'finishing early must leave no pending sets');
  expect(finished.activeSession!.exercises.some((entry) => entry.sets.some((set) => set.status === 'completed')), 'finishing early must keep logged sets');
  expect(skipRuntimeExercise(finished, logged.exercise.id, true).source!.excludedExerciseIds.includes(logged.exercise.id), 'pain must persist in the source');
  expect(commitRuntimeSession(finished).activeSession === null, 'commit must clear the active session');
  return true;
};
