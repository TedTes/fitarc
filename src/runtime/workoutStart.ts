import { localDate, planWeek } from './planDates';
import { nextRoutineSlot } from './sequence';
import { repeatWorkoutExercises } from './freeWorkout';
import type { RuntimeState } from './types';

export type WorkoutStartSource = 'routine' | 'previous' | 'empty';

/** Dated plans take precedence; an undated routine continues in its saved order. */
export const workoutStartChoices = (state: RuntimeState, date = localDate()) => {
  const routine = state.block?.kind !== 'workout' ? state.block : null;
  const windowPlan = routine && routine.remainingWeek?.week === planWeek(routine,date) ? routine.remainingWeek : undefined;
  const scheduled = windowPlan
    ? routine?.slots.find(slot => slot.id === windowPlan.windows.find(window => window.date === date)?.slotId)
    : routine?.slots.length ? nextRoutineSlot(routine,state.sessions,date) : undefined;
  const previous = state.sessions.filter(session => session.status === 'committed' && repeatWorkoutExercises(session).length > 0)
    .sort((a,b) => (b.finishedAt ?? b.context.date).localeCompare(a.finishedAt ?? a.context.date));
  return { routine, scheduled, previous, source: (scheduled ? 'routine' : previous.length ? 'previous' : 'empty') as WorkoutStartSource };
};
