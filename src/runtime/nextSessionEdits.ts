import type { RuntimeState } from './types';

/** Tie one-session additions to the last completed workout, so they cannot repeat forever. */
export const lastCompletedSession = (state:RuntimeState, date?:string) => state.sessions
  .map((session,index)=>({session,index}))
  .filter(({session})=>session.status==='committed'&&(!date||session.context.date<=date)
    &&session.exercises.some(entry=>entry.sets.some(set=>set.status==='completed'&&(set.result?.completedReps??0)>0)))
  .sort((a,b)=>b.session.context.date.localeCompare(a.session.context.date)
    ||(b.session.finishedAt??'').localeCompare(a.session.finishedAt??'')||b.index-a.index)[0]?.session;

export const nextSessionAdditions = (state:RuntimeState, slotId?:string, date?:string) => {
  const saved=state.source?.nextSessionAdditions;
  if(!saved||saved.blockId!==(state.block?.id??null)||saved.slotId!==slotId
    ||saved.afterSessionId!==lastCompletedSession(state,date)?.id)return [];
  return saved.exercises;
};
