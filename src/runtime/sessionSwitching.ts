import type { RuntimeState, SessionPrescription } from './types';
import { restSecondsFor } from './trainingPolicy';
import { trainingStyle } from './trainingStyles';

export function pauseWorkout(state: RuntimeState): RuntimeState {
  if (!state.activeSession) return state;
  const paused: SessionPrescription = {...state.activeSession, status:'paused', pausedAt:new Date().toISOString(),exercises:state.activeSession.exercises.map(e=>({...e,restSeconds:e.restSeconds??restSecondsFor(state.source?.goal??'hypertrophy',e.exercise.compound)}))};
  return {...state,activeSession:null,sessions:state.sessions.map(s=>s.id===paused.id?paused:s)};
}

export function resumeStyleWorkout(state: RuntimeState, slotId?: string): RuntimeState {
  if (!state.block) return state;
  const plans=[...(state.blockHistory??[]),state.block];
  const style=trainingStyle(state.block.preferences);
  const paused=state.sessions.find(s=>s.status==='paused'&&!s.context.extraWorkout&&(!slotId||s.slotId===slotId)
    && trainingStyle(plans.find(p=>p.id===s.blockId)?.preferences)===style);
  if(!paused)return state;
  return resumeWorkout(state,paused.id);
}
export function resumeWorkout(state:RuntimeState,id:string):RuntimeState {
  const paused=state.sessions.find(s=>s.id===id&&s.status==='paused');
  if(!paused)throw Error('This workout is no longer paused.');
  const ready=pauseWorkout(state);
  const resumed:SessionPrescription={...paused,status:'active',pausedAt:undefined,
    pausedMs:(paused.pausedMs??0)+Math.max(0,Date.now()-Date.parse(paused.pausedAt??new Date().toISOString()))};
  return {...ready,activeSession:resumed,sessions:ready.sessions.map(s=>s.id===resumed.id?resumed:s)};
}
