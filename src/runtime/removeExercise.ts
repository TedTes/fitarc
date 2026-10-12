import type { RuntimeState, SessionPrescription } from './types';
import { projectTrainingState } from './trainingState';

export type RemovedExercise = { sessionId: string; index: number; entry: SessionPrescription['exercises'][number] };
export function removeSessionExercise(state: RuntimeState, entryId: string): RuntimeState {
  const active = state.activeSession;
  if (!active) throw Error('No active workout.');
  if (!active.exercises.some(e => e.id === entryId)) throw Error('Exercise already removed.');
  const session = {...active, exercises: active.exercises.filter(e => e.id !== entryId)};
  return projectTrainingState({...state, activeSession:session, sessions:state.sessions.map(s=>s.id===session.id?session:s)});
}
export function restoreSessionExercise(state: RuntimeState, removed: RemovedExercise): RuntimeState {
  const active = state.activeSession;
  if (!active || active.id !== removed.sessionId) throw Error('This workout has ended.');
  if (active.exercises.some(e=>e.id===removed.entry.id || e.exercise.id===removed.entry.exercise.id)) throw Error('This exercise is already in your workout.');
  const exercises=[...active.exercises];
  exercises.splice(Math.min(removed.index,exercises.length),0,removed.entry);
  const session={...active,exercises};
  return projectTrainingState({...state,activeSession:session,sessions:state.sessions.map(s=>s.id===session.id?session:s)});
}
