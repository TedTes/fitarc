import { createRuntimeId } from '../runtime/id';
import type { ExerciseDefinition } from '../runtime/types';
import { emptyDraft, emptyDraftExercise, valueOf, unknownValue, type RoutineDraft } from './draft';
import { matchExercise } from './exerciseMatching';

export type ExtractedRoutine = {
  days:number|null; minutes:number|null; goal:'hypertrophy'|'strength'|null;
  workouts:Array<{name:string;exercises:Array<{name:string;sets:number|null;minReps:number|null;maxReps:number|null;rir:number|null;weight:number|null;unit:'kg'|'lb'|null;basis:'per_hand'|'total'|null;evidence:string}>}>;
  notes:string[];
};
const bounded=(value:unknown,min:number,max:number,integer=false):value is number|null=>value===null||(typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max&&(!integer||Number.isInteger(value)));
export const validateExtraction=(value:unknown,text:string):ExtractedRoutine=>{
  if(!value||typeof value!=='object')throw Error('The routine response was incomplete. Your description is still here; try again.');
  const r=value as ExtractedRoutine;
  if(!bounded(r.days,1,7,true)||!bounded(r.minutes,10,180,true)||![null,'hypertrophy','strength'].includes(r.goal)
    ||!Array.isArray(r.workouts)||r.workouts.length>14||!Array.isArray(r.notes)||r.notes.length>20||r.notes.some(x=>typeof x!=='string'||x.length>500))throw Error('The routine response has invalid details. Review your description and try again.');
  let count=0;
  for(const workout of r.workouts){
    if(typeof workout.name!=='string'||!workout.name.trim()||workout.name.length>80||!Array.isArray(workout.exercises)||workout.exercises.length>20)throw Error('A workout could not be read. Try a shorter description.');
    for(const e of workout.exercises){
      if(++count>100||typeof e.name!=='string'||!e.name.trim()||e.name.length>120||typeof e.evidence!=='string'||!e.evidence.trim()||!text.includes(e.evidence)
        ||!bounded(e.sets,1,20,true)||!bounded(e.minReps,1,99,true)||!bounded(e.maxReps,1,99,true)||!bounded(e.rir,0,5,true)||!bounded(e.weight,0,2200)
        ||![null,'kg','lb'].includes(e.unit)||![null,'per_hand','total'].includes(e.basis)
        ||(e.minReps!==null&&e.maxReps!==null&&e.maxReps<e.minReps))throw Error('An exercise could not be verified against your description. Try correcting the wording.');
    }
  }
  return r;
};
export const draftFromExtraction=(value:unknown,text:string,catalog:ExerciseDefinition[]):RoutineDraft=>{
  const extraction=validateExtraction(value,text);
  if(!extraction.workouts.some(x=>x.exercises.length))throw Error('I couldn’t identify any exercises. Add a workout name and a few exercises, or choose the guided setup.');
  const field=(value:number|null)=>value===null?unknownValue<number>():valueOf(value);
  return {...emptyDraft(text),days:field(extraction.days),minutes:field(extraction.minutes),goal:extraction.goal?valueOf(extraction.goal):unknownValue(),notes:extraction.notes,
    workouts:extraction.workouts.map(w=>({id:createRuntimeId(),name:w.name,exercises:w.exercises.map(e=>({...emptyDraftExercise(e.name),
      exerciseId:matchExercise(e.name,catalog).exerciseId,sets:field(e.sets),minReps:field(e.minReps),maxReps:field(e.maxReps),targetRir:field(e.rir),weight:field(e.weight),unit:e.unit,basis:e.basis,
    }))})),
  };
};
