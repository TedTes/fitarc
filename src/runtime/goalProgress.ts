import { workoutSummary } from './workoutSummary';
import { localDate } from './planDates';
import { createRuntimeId } from './id';
import type { RuntimeState, SessionPrescription } from './types';

export function goalProgress(state:RuntimeState,start:string,end:string){
  const sessions=state.sessions.filter(s=>s.context.date>=start&&s.context.date<end&&s.status==='committed');
  return {sessions:sessions.filter(s=>s.exercises.some(e=>e.sets.some(set=>set.status==='completed'&&(set.result?.completedReps??0)>0))).length,
    records:sessions.reduce((sum,s)=>sum+workoutSummary(s,state.sessions).records.length,0),
    conditioningMinutes:sessions.reduce((sum,s)=>sum+(s.conditioningMinutes??0),0)};
}
export function logConditioning(state:RuntimeState,minutes:number):RuntimeState {
  if(!Number.isInteger(minutes)||minutes<1||minutes>300)throw Error('Enter 1–300 minutes.');
  const now=new Date().toISOString();
  const session:SessionPrescription={id:createRuntimeId(),blockId:null,blockVersion:0,slotId:createRuntimeId(),name:'Conditioning',conditioningMinutes:minutes,
    context:{date:localDate(),minutesAvailable:minutes,recovery:'yes',unavailableEquipment:[],unavailableExerciseIds:[],extraWorkout:true},
    phase:'accumulate',estimatedMinutes:minutes,exercises:[],status:'committed',explanation:'Conditioning logged by you',createdAt:now,finishedAt:now};
  return {...state,sessions:[...state.sessions,session],committedSessionIds:[...state.committedSessionIds,session.id]};
}
