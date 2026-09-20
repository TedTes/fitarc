import { compileBlock, validateBlock } from './blockCompiler';
import { computeSessionDiff, computeWeeklyStatus } from './status';
import { solveSession as solveSessionEngine } from './sessionSolver';
import { applySetResult } from './runtimeReducers';
import { RUNTIME_EXERCISES } from './exerciseCatalog';
import { selectExercises } from './exerciseSelector';
import { createRuntimeId } from './id';
import type { ExerciseDefinition, Muscle, RuntimeState, SessionContext, SetResult, TrainingBlock, TrainingSource, WeeklyStatus } from './types';

export const compileTrainingBlock = (state: RuntimeState, source: TrainingSource): RuntimeState => {
  if (state.activeSession) throw new Error('finish_active_session_before_recompile');
  const block = compileBlock(source, state.block, state.workingSets);
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
  return { ...state, source, block, activeSession: null, lastBlockDiff: diff.length ? diff : ['No constraint values changed; the block was refreshed.'] };
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

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The block's week is derived from the calendar, and jumps to the deload week when the
 * runtime recommends one. It is never advanced by hand.
 */
const resolveWeek = (state: RuntimeState, date: string) => {
  if (!state.source || !state.block) throw new Error('runtime_not_compiled');
  const start = new Date(`${state.block.startedOn}T12:00:00`);
  const sessionDate = new Date(`${date}T12:00:00`);
  const elapsedDays = Math.max(0, Math.floor((sessionDate.getTime() - start.getTime()) / 86400000));
  const calendarWeek = Math.min(state.block.durationWeeks, Math.floor(elapsedDays / 7) + 1);
  let block: TrainingBlock = { ...state.block, currentWeek: calendarWeek };
  const weekStatus = computeWeeklyStatus(block, state.sessions, state.setResults);
  const deloadTriggered = weekStatus.deloadRecommended && block.currentWeek < block.durationWeeks;
  if (deloadTriggered) block = { ...block, currentWeek: block.durationWeeks };
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
  const { block: resolvedBlock, weekStatus, deloadTriggered, start } = resolveWeek(state, context.date);
  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + (resolvedBlock.currentWeek - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const performedSlots = new Set(state.sessions.filter((session) => {
    const date = new Date(`${session.context.date}T12:00:00`);
    return session.blockId === resolvedBlock.id && session.blockVersion === resolvedBlock.version
      && session.status === 'committed' && date >= weekStart && date < weekEnd;
  }).map((session) => session.slotId));
  const availableSlots = resolvedBlock.slots.filter((slot) => !performedSlots.has(slot.id));
  const candidates = availableSlots.length ? availableSlots : resolvedBlock.slots;
  const deficitOf = (slot: (typeof candidates)[number]) => slot.targetMuscles.map((muscle) => {
    const status = weekStatus.muscles.find((item) => item.muscle === muscle);
    return { muscle, deficit: Math.max(0, (status?.min ?? 0) - (status?.completedSets ?? 0)) };
  });
  const totalDeficit = (slot: (typeof candidates)[number]) => deficitOf(slot).reduce((sum, item) => sum + item.deficit, 0);
  const nextSlot = [...candidates].sort((a, b) => totalDeficit(b) - totalDeficit(a) || a.dayIndex - b.dayIndex)[0];
  const behind = deficitOf(nextSlot).filter((item) => item.deficit > 0).sort((a, b) => b.deficit - a.deficit).map((item) => item.muscle);
  const slotChoice: SlotChoiceReason = {
    kind: !availableSlots.length ? 'repeat' : candidates.length === 1 ? 'only_remaining' : behind.length ? 'largest_deficit' : 'next_in_order',
    muscles: behind,
  };
  const prescription = solveSessionEngine({
    source: state.source, block: resolvedBlock, context,
    workingSets: state.workingSets, weeklyStatus: weekStatus,
    slotIndex: nextSlot?.dayIndex ?? 0,
  });
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
  if (state.setResults.some((item) => item.setId === result.setId)) throw new Error('set_already_recorded');
  const applied = applySetResult({ state, session: state.activeSession, result });
  const updatedSession = {
    ...state.activeSession,
    exercises: state.activeSession.exercises.map((entry) => {
      if (entry.exercise.id !== result.exerciseId) return entry;
      return {
        ...entry,
        sets: entry.sets.map((set, index, allSets) => {
          if (set.id === result.setId) return { ...set, status: 'completed' as const };
          const resultIndex = allSets.findIndex((candidate) => candidate.id === result.setId);
          if (index === resultIndex + 1 && set.status === 'pending') {
            return {
              ...set,
              loadKg: applied.decision.nextLoadKg,
              minReps: applied.decision.nextMinReps,
              maxReps: applied.decision.nextMaxReps,
            };
          }
          return set;
        }),
      };
    }),
  };
  return {
    ...applied.state,
    activeSession: updatedSession,
    sessions: applied.state.sessions.map((session) => session.id === updatedSession.id ? updatedSession : session),
  };
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
  const completed = { ...state.activeSession, status: 'committed' as const };
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
      loadKg: latest.prescribedLoadKg,
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
  const previous = { ...state.block, id: createRuntimeId(), currentWeek: 1 };
  const block = compileBlock(source, previous, state.workingSets);
  return {
    ...state, source, block,
    lastBlockDiff: ['Previous working sets became the new block baseline.', 'Phase pipeline restarted at accumulate.'],
  };
};

export const undoLastRuntimeSet = (state: RuntimeState): RuntimeState => {
  if (!state.activeSession) return state;
  const index = [...state.setResults].map((item) => item.prescriptionId).lastIndexOf(state.activeSession.id);
  if (index < 0) return state;
  const removed = state.setResults[index];
  const remaining = state.setResults.filter((_, resultIndex) => resultIndex !== index);
  const previous = [...remaining].reverse().find((item) => item.exerciseId === removed.exerciseId);
  const nextWorking = { ...state.workingSets };
  if (previous) {
    nextWorking[removed.exerciseId] = {
      exerciseId: removed.exerciseId, loadKg: previous.prescribedLoadKg,
      reps: previous.completedReps, rir: previous.reportedRir,
      rirConfidence: nextWorking[removed.exerciseId]?.rirConfidence ?? 0.35,
      updatedAt: previous.completedAt,
    };
  } else {
    delete nextWorking[removed.exerciseId];
  }
  const session = {
    ...state.activeSession,
    exercises: state.activeSession.exercises.map((entry) => entry.exercise.id !== removed.exerciseId ? entry : ({
      ...entry,
      sets: entry.sets.map((set) => set.id === removed.setId ? ({
        ...set, status: 'pending' as const, loadKg: removed.prescribedLoadKg,
        minReps: removed.prescribedMinReps, maxReps: removed.prescribedMaxReps,
      }) : set),
    })),
  };
  return {
    ...state, activeSession: session, setResults: remaining,
    workingSets: nextWorking, decisions: state.decisions.slice(0, -1),
    sessions: state.sessions.map((item) => item.id === session.id ? session : item),
  };
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
    ? { ...state.source, excludedExerciseIds: [...new Set([...state.source.excludedExerciseIds, exerciseId])] }
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
  return selectExercises({
    catalog: RUNTIME_EXERCISES,
    source: { ...state.source, excludedExerciseIds: swapExclusions(state, exerciseId) },
    targetMuscles: target.exercise.primaryMuscles,
    movementPatterns: [target.exercise.movementPattern],
    workingSets: state.workingSets,
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
  const replacementEntry = {
    id: createRuntimeId(), exercise: replacement, priority: target.priority,
    reason: `substituted for unavailable ${target.exercise.name}`,
    sets: pending.map((set, index) => ({
      ...set, id: createRuntimeId(), setNumber: index + 1,
      loadKg: seed?.loadKg ?? (replacement.compound ? 20 : 10),
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
