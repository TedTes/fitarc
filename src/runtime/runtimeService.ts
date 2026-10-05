import { rangeLoad } from './weights';
import { exerciseAlternatives } from './recommendations';
import { suggestWorkoutLoad } from './progression';
import { defaultProgression, editableRoutine, validateRoutineSource } from './routine';
import { nextRoutineSlot } from './sequence';
import { localDate, planWeek } from './planDates';
import { belongsToPlan } from './planDates';
import { projectTrainingState } from './trainingState';
import { compileBlock, validateBlock } from './blockCompiler';
import { computeSessionDiff, computeWeeklyStatus } from './status';
import { solveSession as solveSessionEngine } from './sessionSolver';
import { applySetResult } from './runtimeReducers';
import { RUNTIME_EXERCISES } from './exerciseCatalog';
import { selectExercises } from './exerciseSelector';
import { createRuntimeId } from './id';
import type { ExerciseDefinition, Muscle, RuntimeState, SessionContext, SessionPrescription, SetResult, TrainingBlock, TrainingSource, WeeklyStatus } from './types';

export const compileTrainingBlock = (state: RuntimeState, source: TrainingSource): RuntimeState => {
  if (state.activeSession) throw new Error('finish_active_session_before_recompile');
  const block = compileBlock(source, state.block, state.workingSets, [...new Map([...(state.block?.catalog ?? []), ...(state.catalog ?? RUNTIME_EXERCISES)].map(x => [x.id, x])).values()]);
  const errors = validateBlock(block);
  if (errors.length) throw new Error(errors.join(' '));
  const previous = state.source;
  const diff = !previous ? [] : [
    ...(previous.goal !== source.goal ? [`goal: ${previous.goal} → ${source.goal}`] : []),
    ...(previous.daysPerWeek !== source.daysPerWeek ? [`frequency: ${previous.daysPerWeek} → ${source.daysPerWeek} days`] : []),
    ...(previous.sessionMinutes !== source.sessionMinutes ? [`time cap: ${previous.sessionMinutes} → ${source.sessionMinutes} min`] : []),
    ...(previous.equipment.join('|') !== source.equipment.join('|') ? ['equipment availability changed'] : []),
    ...(previous.limitations.join('|') !== source.limitations.join('|') ? ['pain and limitation rules changed'] : []),
  ];
  return { ...state, source, block, activeSession: null, lastBlockDiff: diff.length ? diff : ['Your plan was refreshed with your current preferences.'] };
};

export const solveTrainingSession = (
  state: RuntimeState,
  context: SessionContext
): RuntimeState => {
  const resolved = resolveTrainingSession(state, context);
  return {
    ...state,
    block: resolved.block,
    activeSession: { ...resolved.prescription, status: 'active' },
    sessions: [...state.sessions, { ...resolved.prescription, status: 'active' }],
  };
};

const today = () => localDate();

/**
 * Calendar boundaries stay stable even when a recovery prescription is recommended.
 */
const resolveWeek = (state: RuntimeState, date: string) => {
  if (!state.source || !state.block) throw new Error('runtime_not_compiled');
  const start = new Date(`${state.block.startedOn}T12:00:00`);
  const calendarWeek = planWeek(state.block, date);
  const block: TrainingBlock = { ...state.block, currentWeek: calendarWeek };
  const weekStatus = computeWeeklyStatus(block, state.sessions, state.setResults);
  const deloadTriggered = weekStatus.deloadRecommended && block.currentWeek < block.durationWeeks;
  return { block, weekStatus, deloadTriggered, start };
};

export type SlotChoiceReason = {
  kind: 'largest_deficit' | 'next_in_order' | 'only_remaining' | 'repeat';
  /** Muscles with the largest shortfall against this week's minimum, most behind first. */
  muscles: Muscle[];
};

const resolveTrainingSession = (
  state: RuntimeState,
  context: SessionContext
) => {
  if (!state.source || !state.block) throw new Error('runtime_not_compiled');
  if (state.activeSession) throw new Error('finish_active_session_first');
  if (!Number.isInteger(context.minutesAvailable) || context.minutesAvailable < 10 || context.minutesAvailable > 180) throw new Error('Choose 10–180 minutes for your workout.');
  const { block: resolvedBlock, weekStatus, deloadTriggered, start } = resolveWeek(state, context.date);
  const remaining = resolvedBlock.remainingWeek?.week === resolvedBlock.currentWeek ? resolvedBlock.remainingWeek : undefined;
  const window = remaining?.windows.find((item) => item.date === context.date);
  if (remaining && !window && !context.extraWorkout) throw new Error('No workout planned for today. Change your remaining week in Progress.');
  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + (resolvedBlock.currentWeek - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const performedSlots = new Set(state.sessions.filter((session) => {
    const date = new Date(`${session.context.date}T12:00:00`);
    return belongsToPlan(session, resolvedBlock)
      && session.status === 'committed' && date >= weekStart && date < weekEnd;
  }).map((session) => session.slotId));
  const availableSlots = resolvedBlock.slots.filter((slot) => !performedSlots.has(slot.id));
  const candidates = availableSlots.length ? availableSlots : resolvedBlock.slots;
  const deficitOf = (slot: (typeof candidates)[number]) => slot.targetMuscles.map((muscle) => {
    const status = weekStatus.muscles.find((item) => item.muscle === muscle);
    return { muscle, deficit: Math.max(0, (status?.min ?? 0) - (status?.completedSets ?? 0)) };
  });
  const totalDeficit = (slot: (typeof candidates)[number]) => deficitOf(slot).reduce((sum, item) => sum + item.deficit, 0);
  const selectedSlot = context.workoutId ? resolvedBlock.slots.find(slot => slot.id === context.workoutId) : undefined;
  if (context.workoutId && !selectedSlot) throw Error('That workout is no longer in your routine.');
  const nextSlot = selectedSlot ?? (resolvedBlock.scheduling === 'sequence' ? nextRoutineSlot(resolvedBlock,state.sessions,context.date) : undefined) ?? (window ? candidates.find((item) => item.id === window.slotId) : undefined) ?? [...candidates].sort((a, b) => totalDeficit(b) - totalDeficit(a) || a.dayIndex - b.dayIndex)[0];
  if (window && (resolvedBlock.scheduling === 'sequence' ? state.sessions.some(s => belongsToPlan(s,resolvedBlock) && s.status === 'committed' && s.context.date === context.date) && !context.extraWorkout : performedSlots.has(window.slotId))) throw new Error('Today’s planned workout is already finished.');
  const behind = deficitOf(nextSlot).filter((item) => item.deficit > 0).sort((a, b) => b.deficit - a.deficit).map((item) => item.muscle);
  const slotChoice: SlotChoiceReason = {
    kind: resolvedBlock.scheduling === 'sequence' ? 'next_in_order' : !availableSlots.length ? 'repeat' : candidates.length === 1 ? 'only_remaining' : behind.length ? 'largest_deficit' : 'next_in_order',
    muscles: behind,
  };
  const prescription = solveSessionEngine({
    source: state.source, block: resolvedBlock, context,
    workingSets: state.workingSets, sessions: state.sessions, weeklyStatus: weekStatus,
    slotIndex: resolvedBlock.slots.indexOf(nextSlot),
    phaseOverride: deloadTriggered ? resolvedBlock.phases.find((phase) => phase.kind === 'deload') : undefined,
    setCeilings: window && !Object.keys(context.exerciseReplacements ?? {}).length && !context.workoutId && !context.extraWorkout && window.slotId === nextSlot.id ? Object.fromEntries((resolvedBlock.catalog ?? RUNTIME_EXERCISES).map((item) => [item.id, window.workout.exercises.find((entry) => entry.exercise.id === item.id)?.sets.length ?? 0])) : undefined,
  });
  if (!prescription.exercises.length) throw new Error('No work fits the current equipment, time and weekly limits. Change your remaining week in Progress.');
  return { block: resolvedBlock, prescription, slotChoice, deloadTriggered };
};

export const previewTrainingSession = (
  state: RuntimeState,
  context: SessionContext
) => resolveTrainingSession(state, context).prescription;

/** Same proposal as previewTrainingSession, plus the facts needed to explain it. */
export const previewTrainingSessionDetailed = (state: RuntimeState, context: SessionContext) => {
  const resolved = resolveTrainingSession(state, context);
  return {
    prescription: resolved.prescription, weekNumber: resolved.block.currentWeek,
    slot: resolved.block.slots.find((slot) => slot.id === resolved.prescription.slotId) ?? null,
    slotChoice: resolved.slotChoice, deloadTriggered: resolved.deloadTriggered,
  };
};

/** Week number, phase-aware status and today's date as the solver will see them. */
export const getRuntimeWeekView = (state: RuntimeState, date: string = today()): { block: TrainingBlock; status: WeeklyStatus } | null => {
  if (!state.source || !state.block) return null;
  const { block } = resolveWeek(state, date);
  return { block, status: computeWeeklyStatus(block, state.sessions, state.setResults) };
};

export const recordRuntimeSet = (
  state: RuntimeState,
  result: SetResult
): RuntimeState => {
  if (!state.activeSession) throw new Error('active_session_required');
  const prescribed = state.activeSession.exercises.find((entry) => entry.exercise.id === result.exerciseId)?.sets.find((set) => set.id === result.setId);
  if (result.prescriptionId !== state.activeSession.id || !prescribed || prescribed.status === 'skipped') throw new Error('Invalid set reference.');
  if (!Number.isInteger(result.completedReps) || result.completedReps < 0 || result.reportedRir < 0 || result.reportedRir > 5
    || !Number.isFinite(result.reportedRir) || !Number.isFinite(result.actualLoadKg ?? result.prescribedLoadKg) || (result.actualLoadKg ?? result.prescribedLoadKg) < 0) throw new Error('Check weight, repetitions and effort.');
  result = { ...result, recordedOrder: Math.max(0, ...state.setResults.map((item) => item.recordedOrder ?? 0)) + 1, prescribedLoadKg: prescribed.loadKg, prescribedMinReps: prescribed.minReps, prescribedMaxReps: prescribed.maxReps, targetRir: prescribed.targetRir };
  if (state.setResults.some((item) => item.setId === result.setId)) throw new Error('set_already_recorded');
  const applied = applySetResult({ state, session: state.activeSession, result });
  const recordedEntry = state.activeSession.exercises.find((entry) => entry.exercise.id === result.exerciseId)!;
  const following = recordedEntry.sets[recordedEntry.sets.findIndex((set) => set.id === result.setId) + 1];
  if (following?.status === 'pending') applied.decision.previousNextSet = { id: following.id, loadKg: following.loadKg, minReps: following.minReps, maxReps: following.maxReps };
  const updatedSession = {
    ...state.activeSession,
    startedAt: state.activeSession.startedAt ?? state.setResults.find(item => item.prescriptionId === state.activeSession!.id)?.completedAt ?? result.completedAt,
    exercises: state.activeSession.exercises.map((entry) => {
      if (entry.exercise.id !== result.exerciseId) return entry;
      return {
        ...entry,
        sets: entry.sets.map((set, index, allSets) => {
          if (set.id === result.setId) return { ...set, status: 'completed' as const, result: { ...result, actualLoadKg: result.actualLoadKg ?? result.prescribedLoadKg }, decision: applied.decision };
          const resultIndex = allSets.findIndex((candidate) => candidate.id === result.setId);
          if (index === resultIndex + 1 && set.status === 'pending') {
            return {
              ...set,
              loadKg: state.source?.weightRanges?.[entry.exercise.id]?set.loadKg:applied.decision.nextLoadKg,
              minReps: applied.decision.nextMinReps,
              maxReps: applied.decision.nextMaxReps,
            };
          }
          return set;
        }),
      };
    }),
  };
  return projectTrainingState({
    ...applied.state,
    activeSession: updatedSession,
    sessions: applied.state.sessions.map((session) => session.id === updatedSession.id ? updatedSession : session),
  });
};

/** Correct an existing result without adding a set or changing its clock/order. */
export const correctRuntimeSet = (state: RuntimeState, setId: string, values: {
  actualLoadKg: number; completedReps: number; reportedRir: number;
}): RuntimeState => {
  const session=state.activeSession;
  if(!session)throw new Error('active_session_required');
  const target=session.exercises.flatMap(entry=>entry.sets).find(set=>set.id===setId);
  if(target?.status!=='completed'||!target.result)throw new Error('Recorded set required.');
  if(!Number.isFinite(values.actualLoadKg)||values.actualLoadKg<0||!Number.isInteger(values.completedReps)||values.completedReps<0
    ||!Number.isFinite(values.reportedRir)||values.reportedRir<0||values.reportedRir>5)throw new Error('Check weight, repetitions and effort.');
  const records=state.setResults.filter(result=>result.prescriptionId===session.id).map(result=>result.setId===setId?{...result,...values}:result);
  const originalSets=new Map(session.exercises.flatMap(entry=>entry.sets).map(set=>[set.id,set]));
  let rebuilt:SessionPrescription={...session,exercises:session.exercises.map(entry=>({...entry,sets:entry.sets.map(set=>set.result?{...set,status:'pending' as const,result:undefined,decision:undefined}:set)}))};
  let next=projectTrainingState({...state,sessions:state.sessions.map(item=>item.id===session.id?rebuilt:item)});
  // Recompute derived effort/load history in recorded order, retaining all prescriptions.
  for(const result of records){
    const {decision}=applySetResult({state:next,session:rebuilt,result});
    const previousNextSet=originalSets.get(result.setId)?.decision?.previousNextSet;
    rebuilt={...rebuilt,exercises:rebuilt.exercises.map(entry=>({...entry,sets:entry.sets.map(set=>set.id===result.setId?{
      ...set,status:'completed' as const,result,decision:{...decision,...(previousNextSet?{previousNextSet}:{})},
    }:set)}))};
    next=projectTrainingState({...next,sessions:next.sessions.map(item=>item.id===session.id?rebuilt:item)});
  }
  return next;
};

/** Reorders the active session without changing its prescribed work. */
export const reorderRuntimeExercises = (
  state: RuntimeState,
  orderedExerciseIds: string[]
): RuntimeState => {
  if (!state.activeSession) throw new Error('active_session_required');
  const current = state.activeSession.exercises;
  if (orderedExerciseIds.length !== current.length || new Set(orderedExerciseIds).size !== current.length) {
    throw new Error('invalid_exercise_order');
  }
  const byId = new Map(current.map((entry) => [entry.exercise.id, entry]));
  const exercises = orderedExerciseIds.map((exerciseId) => {
    const entry = byId.get(exerciseId);
    if (!entry) throw new Error('invalid_exercise_order');
    return entry;
  });
  const session = { ...state.activeSession, exercises };
  return {
    ...state,
    activeSession: session,
    sessions: state.sessions.map((item) => item.id === session.id ? session : item),
  };
};

export const commitRuntimeSession = (state: RuntimeState): RuntimeState => {
  if (!state.activeSession) throw new Error('active_session_required');
  const completed = { ...state.activeSession, status: 'committed' as const, finishedAt: new Date().toISOString() };
  return {
    ...state,
    activeSession: null,
    sessions: state.sessions.map((session) => session.id === completed.id ? completed : session),
    committedSessionIds: [...new Set([...state.committedSessionIds, completed.id])],
  };
};

export const discardRuntimeSession = (state: RuntimeState): RuntimeState => {
  if (!state.activeSession) return state;
  const sessionId = state.activeSession.id;
  let reverted = state;
  while (reverted.setResults.some((result) => result.prescriptionId === sessionId)) {
    reverted = undoLastRuntimeSet(reverted);
  }
  return {
    ...reverted,
    activeSession: null,
    sessions: reverted.sessions.filter((session) => session.id !== sessionId),
  };
};

export const getRuntimeSessionDiff = (state: RuntimeState) => {
  if (!state.activeSession) return null;
  const currentResults = state.setResults.filter((result) => result.prescriptionId === state.activeSession?.id);
  const previousResults = state.setResults.filter((result) => result.prescriptionId !== state.activeSession?.id);
  const prior = Object.fromEntries(state.activeSession.exercises.flatMap((entry) => {
    const latest = [...previousResults].reverse().find((result) => result.exerciseId === entry.exercise.id);
    if (!latest) return [];
    return [[entry.exercise.id, {
      exerciseId: entry.exercise.id,
      loadKg: latest.actualLoadKg ?? latest.prescribedLoadKg,
      reps: latest.completedReps,
      rir: latest.reportedRir,
      rirConfidence: state.workingSets[entry.exercise.id]?.rirConfidence ?? 0.35,
      updatedAt: latest.completedAt,
    }]];
  }));
  return computeSessionDiff(state.activeSession, currentResults, prior);
};

export const getRuntimeWeeklyStatus = (state: RuntimeState) =>
  state.block ? computeWeeklyStatus(state.block, state.sessions, state.setResults) : null;

export const compileNextRuntimeBlock = (state: RuntimeState): RuntimeState => {
  if (!state.source || !state.block) throw new Error('runtime_not_compiled');
  if (state.activeSession) throw new Error('finish_active_session_before_recompile');
  const source: TrainingSource = {
    ...state.source,
    version: state.source.version + 1,
    seedWorkingSets: Object.values(state.workingSets).map((working) => ({
      exerciseId: working.exerciseId, loadKg: working.loadKg,
      reps: working.reps, rir: working.rir,
    })),
    createdAt: new Date().toISOString(),
  };
  const previous = { ...state.block, id: createRuntimeId(), groupId: createRuntimeId(), currentWeek: 1, startedOn: today() };
  const block = compileBlock(source, previous, state.workingSets, state.catalog);
  const errors = validateBlock(block);
  if (errors.length) throw new Error(errors.join(' '));
  return {
    ...state, source, block,
    lastBlockDiff: ['Your latest working weights are the starting point for this plan.', 'A new six-week training cycle has started.'],
  };
};

export const undoLastRuntimeSet = (state: RuntimeState): RuntimeState => {
  if (!state.activeSession) return state;
  const index = [...state.setResults].map((item) => item.prescriptionId).lastIndexOf(state.activeSession.id);
  if (index < 0) return state;
  const removed = state.setResults[index];
  const previousNext = state.activeSession.exercises.flatMap((entry) => entry.sets).find((set) => set.id === removed.setId)?.decision?.previousNextSet;
  const session = {
    ...state.activeSession,
    exercises: state.activeSession.exercises.map((entry) => entry.exercise.id !== removed.exerciseId ? entry : ({
      ...entry,
      sets: entry.sets.map((set) => set.id === removed.setId ? ({
        ...set, result: undefined, decision: undefined, status: 'pending' as const, loadKg: removed.prescribedLoadKg,
        minReps: removed.prescribedMinReps, maxReps: removed.prescribedMaxReps,
      }) : previousNext?.id === set.id && set.status === 'pending' ? { ...set, ...previousNext } : set),
    })),
  };
  return projectTrainingState({
    ...state, activeSession: session,
    sessions: state.sessions.map((item) => item.id === session.id ? session : item),
  });
};

export const skipRuntimeExercise = (
  state: RuntimeState,
  exerciseId: string,
  painful: boolean
): RuntimeState => {
  if (!state.activeSession) return state;
  const session = {
    ...state.activeSession,
    exercises: state.activeSession.exercises.map((entry) => entry.exercise.id !== exerciseId ? entry : ({
      ...entry,
      sets: entry.sets.map((set) => set.status === 'pending' ? ({ ...set, status: 'skipped' as const }) : set),
    })),
  };
  const source = painful && state.source
    ? { ...state.source, version: state.source.version + 1, excludedExerciseIds: [...new Set([...state.source.excludedExerciseIds, exerciseId])] }
    : state.source;
  return {
    ...state, source, activeSession: session,
    sessions: state.sessions.map((item) => item.id === session.id ? session : item),
  };
};

const swapExclusions = (state: RuntimeState, exerciseId: string) => [
  ...(state.source?.excludedExerciseIds ?? []),
  ...(state.activeSession?.exercises.map((entry) => entry.exercise.id) ?? []),
  exerciseId,
];

/** Compatible replacements for an exercise in the active session, best match first. */
export const getSwapCandidates = (state: RuntimeState, exerciseId: string, limit = 3): ExerciseDefinition[] => {
  const target = state.activeSession?.exercises.find((entry) => entry.exercise.id === exerciseId);
  if (!state.source || !target) return [];
  if (state.source.routine) return exerciseAlternatives(target.exercise,state.block?.catalog ?? state.catalog ?? RUNTIME_EXERCISES,
    state.source,state.sessions,state.activeSession!.context,swapExclusions(state,exerciseId)).slice(0,limit).map(x=>x.exercise);
  return selectExercises({
    catalog: state.block?.catalog ?? state.catalog ?? RUNTIME_EXERCISES,
    source: { ...state.source, excludedExerciseIds: swapExclusions(state, exerciseId) },
    targetMuscles: target.exercise.primaryMuscles,
    movementPatterns: [target.exercise.movementPattern],
    workingSets: state.workingSets,
    unavailableEquipment: state.activeSession?.context.unavailableEquipment,
    unavailableExerciseIds: state.activeSession?.context.unavailableExerciseIds,
    limit,
  });
};

/** Skips every pending set in the active session, so the session can be reviewed early. */
export const skipRemainingRuntimeSets = (state: RuntimeState): RuntimeState =>
  (state.activeSession?.exercises ?? []).reduce(
    (current, entry) => skipRuntimeExercise(current, entry.exercise.id, false), state
  );

export const substituteRuntimeExercise = (
  state: RuntimeState,
  exerciseId: string,
  replacementId?: string
): RuntimeState => {
  if (!state.activeSession || !state.source) return state;
  const target = state.activeSession.exercises.find((entry) => entry.exercise.id === exerciseId);
  if (!target) return state;
  const candidates = getSwapCandidates(state, exerciseId, 8);
  const replacement = replacementId ? candidates.find((item) => item.id === replacementId) : candidates[0];
  if (replacementId && !replacement) throw new Error('replacement_not_compatible');
  if (!replacement) return skipRuntimeExercise(state, exerciseId, false);
  const pending = target.sets.filter((set) => set.status === 'pending');
  const seed = state.workingSets[replacement.id]
    ?? state.source.seedWorkingSets.find((item) => item.exerciseId === replacement.id);
  const first = pending[0];
  if (!first) throw Error('No pending sets to replace.');
  const suggestion = state.source.routine ? suggestWorkoutLoad(replacement,{exerciseId:replacement.id,sets:pending.length,minReps:first.minReps,maxReps:first.maxReps,targetRir:first.targetRir},state.source,state.sessions,state.activeSession.context.date) : undefined;
  const replacementRange=state.source.weightRanges?.[replacement.id];
  const replacementEntry = {
    id: createRuntimeId(), exercise: replacement, priority: target.priority,
    ...(replacementRange?{needsBaseline:false}:suggestion ? {needsBaseline: !suggestion.baselineKnown} : {}),
    reason: `Your replacement for ${target.exercise.name}, today only. ${suggestion?.explanation ?? ""}`,
    sets: pending.map((set, index) => ({
      ...set, id: createRuntimeId(), setNumber: index + 1,
      loadKg: replacementRange?rangeLoad(replacementRange,index,pending.length):suggestion?.loadKg ?? seed?.loadKg ?? (replacement.compound ? 20 : 10),
    })),
  };
  const exercises = state.activeSession.exercises.flatMap((entry) => {
    if (entry.exercise.id !== exerciseId) return [entry];
    const retained = { ...entry, sets: entry.sets.map((set) => set.status === 'pending' ? ({ ...set, status: 'skipped' as const }) : set) };
    return retained.sets.some((set) => set.status === 'completed') ? [retained, replacementEntry] : [replacementEntry];
  });
  const session = { ...state.activeSession, exercises };
  return {
    ...state, activeSession: session,
    sessions: state.sessions.map((item) => item.id === session.id ? session : item),
  };
};

/** Explicit one-session addition; it does not edit the routine or create completed evidence. */
export const addRuntimeExercise = (state: RuntimeState, item: import('./types').RoutineExercise): RuntimeState => {
  if (!state.activeSession || !state.source || !state.block) throw Error('Start a workout before adding an exercise.');
  const catalog = state.block.catalog ?? state.catalog ?? RUNTIME_EXERCISES;
  validateRoutineSource({ ...state.source, routine: { split: 'custom', workouts: [{ id: 'validation', name: 'Today', exercises: [item] }], progression: state.source.routine?.progression ?? defaultProgression() } },catalog);
  const exercise = catalog.find(x=>x.id===item.exerciseId)!;
  if (state.activeSession.exercises.some(x=>x.exercise.id===item.exerciseId)) throw Error('This exercise is already in today’s workout.');
  if (state.source.excludedExerciseIds.includes(exercise.id) || exercise.contraindications.some(x=>state.source!.limitations.includes(x))
    || state.activeSession.context.unavailableExerciseIds.includes(exercise.id)
    || exercise.equipment.some(x=>!state.source!.equipment.includes(x) || state.activeSession!.context.unavailableEquipment.includes(x))) throw Error('This exercise does not fit today’s equipment or limitations.');
  const suggestion = state.source.routine ? suggestWorkoutLoad(exercise,item,state.source,state.sessions,state.activeSession.context.date) : undefined;
  const range=state.source.weightRanges?.[item.exerciseId];
  const load = item.startingLoadKg ?? suggestion?.loadKg ?? state.workingSets[item.exerciseId]?.loadKg ?? 0;
  const entry = { id: createRuntimeId(), exercise, priority: state.activeSession.exercises.length+1,
    needsBaseline: !range && item.startingLoadKg === undefined && !(suggestion?.baselineKnown ?? state.workingSets[item.exerciseId]),
    reason: `Added by you for today only. ${suggestion?.explanation ?? 'Enter your actual weight.'}`,
    sets: Array.from({length:item.sets},(_,i)=>({id:createRuntimeId(),setNumber:i+1,loadKg:range?rangeLoad(range,i,item.sets):load,minReps:item.minReps,maxReps:item.maxReps,targetRir:item.targetRir,status:'pending' as const})) };
  const session = { ...state.activeSession, exercises: [...state.activeSession.exercises,entry], estimatedMinutes: Math.ceil(state.activeSession.estimatedMinutes+exercise.setupMinutes+item.sets*(exercise.compound?3.5:2.5)) };
  return {...state,activeSession:session,sessions:state.sessions.map(x=>x.id===session.id?session:x)};
};

/** Explicit acceptance of today's exercise order and retained sets as the future routine. */
export const finishAndUpdateRoutine = (state: RuntimeState): RuntimeState => {
  if (!state.activeSession || !state.source || !state.block) throw Error('No workout to save.');
  const session = state.activeSession;
  const routine = editableRoutine(state.block);
  const exercises = session.exercises.flatMap(entry => {
    const sets = entry.sets.filter(set=>set.status!=='skipped');
    if (!sets.length) return [];
    return [{exerciseId:entry.exercise.id,sets:sets.length,minReps:sets[0].minReps,maxReps:sets[0].maxReps,targetRir:sets[0].targetRir}];
  });
  if (!exercises.length) throw Error('Keep at least one exercise before updating your routine.');
  routine.workouts = routine.workouts.map(workout=>workout.id===session.slotId?{...workout,exercises}:workout);
  const finished = commitRuntimeSession(state);
  const updated = compileTrainingBlock(finished,{...state.source,version:state.source.version+1,routine});
  return {...updated,blockHistory:[...(state.blockHistory??[]).filter(x=>x.id!==state.block!.id),state.block]};
};
