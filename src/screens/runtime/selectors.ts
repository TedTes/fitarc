import type { BlockPhase, RuntimeState, TrainingBlock } from '../../runtime';

export const phaseOfWeek = (block: TrainingBlock, week: number): BlockPhase =>
  block.phases.find((phase) => week >= phase.startWeek && week <= phase.endWeek) ?? block.phases[0];

/** Slots already committed this week, by the same date window the runtime uses. */
export const committedSlotIds = (state: RuntimeState, block: TrainingBlock): Set<string> => {
  const start = new Date(`${block.startedOn}T12:00:00`);
  const from = new Date(start);
  from.setDate(start.getDate() + (block.currentWeek - 1) * 7);
  const to = new Date(from);
  to.setDate(from.getDate() + 7);
  return new Set(state.sessions.filter((session) => {
    const date = new Date(`${session.context.date}T12:00:00`);
    return session.blockId === block.id && session.blockVersion === block.version
      && session.status === 'committed' && date >= from && date < to;
  }).map((session) => session.slotId));
};

export const sessionProgress = (state: RuntimeState) => {
  const session = state.activeSession;
  if (!session) return null;
  const sets = session.exercises.flatMap((entry) => entry.sets);
  const done = sets.filter((set) => set.status !== 'pending').length;
  return { done, total: sets.length, pending: sets.length - done, session };
};

/** The earliest set still waiting, with the exercise it belongs to. */
export const nextPendingSet = (state: RuntimeState) => {
  const session = state.activeSession;
  if (!session) return null;
  for (let index = 0; index < session.exercises.length; index += 1) {
    const entry = session.exercises[index];
    const set = entry.sets.find((item) => item.status === 'pending');
    if (set) return { entry, set, exerciseIndex: index, exerciseCount: session.exercises.length };
  }
  return null;
};

/** The next set for a chosen stack item, used when the lifter jumps between exercises. */
export const pendingSetForExercise = (state: RuntimeState, exerciseId: string) => {
  const session = state.activeSession;
  if (!session) return null;
  const exerciseIndex = session.exercises.findIndex((entry) => entry.exercise.id === exerciseId);
  if (exerciseIndex < 0) return null;
  const entry = session.exercises[exerciseIndex];
  const set = entry.sets.find((item) => item.status === 'pending');
  return set ? { entry, set, exerciseIndex, exerciseCount: session.exercises.length } : null;
};

export const todayISO = () => new Date().toISOString().slice(0, 10);
