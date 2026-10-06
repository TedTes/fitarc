import { RUNTIME_EXERCISES } from './exerciseCatalog';
import { selectExercises } from './exerciseSelector';
import { datePlusDays, planWeek } from './planDates';
import { routineCatalog } from './routine';
import { nextRoutineSlot } from './sequence';
import { MUSCLES } from './trainingPolicy';
import type { ExerciseDefinition, Muscle, RuntimeState } from './types';

export type NextWorkout = {
  kind:'routine'|'suggested'; name:string; date:string; finishedToday:boolean;
  exercises:Array<{exercise:ExerciseDefinition;sets:number;minReps:number;maxReps:number;targetRir:number}>;
};

/** Read-only next-session preview. Never creates a plan, session or recorded set. */
export const nextWorkoutPreview=(state:RuntimeState,today:string):NextWorkout|null=>{
  if(state.activeSession||!state.source)return null;
  const source=state.source;
  const completed=state.sessions.filter(session=>session.status==='committed'&&session.context.date<=today&&session.exercises.some(entry=>entry.sets.some(set=>set.result)));
  const latest=[...completed].sort((a,b)=>b.context.date.localeCompare(a.context.date)||(b.finishedAt??'').localeCompare(a.finishedAt??''))[0];
  if(!latest)return null;
  const finishedToday=latest.context.date===today;
  const date=finishedToday?datePlusDays(today,1):today;
  const allowed=(exercise:ExerciseDefinition)=>!source.excludedExerciseIds.includes(exercise.id)
    &&exercise.equipment.every(item=>source.equipment.includes(item))
    &&!exercise.contraindications.some(item=>source.limitations.includes(item));
  const block=state.block;
  if(block&&block.kind!=='workout'&&block.slots.length){
    if(!finishedToday)return null; // Tomorrow's normal logger takes over on that day.
    const remaining=block.remainingWeek;
    const window=remaining?.windows.filter(item=>item.date>today).sort((a,b)=>a.date.localeCompare(b.date))[0];
    const nextDate=window?.date??(remaining?.week===planWeek(block,today)?datePlusDays(block.startedOn,remaining.week*7):date);
    const slot=(window?block.slots.find(item=>item.id===window.slotId):undefined)??nextRoutineSlot(block,state.sessions,today);
    const phase=block.phases.find(item=>planWeek(block,nextDate)>=item.startWeek&&planWeek(block,nextDate)<=item.endWeek)??block.phases[0];
    const catalog=block.catalog??state.catalog??RUNTIME_EXERCISES;
    const exercises=window?window.workout.exercises.filter(entry=>allowed(entry.exercise)).map(entry=>({exercise:entry.exercise,sets:entry.sets.length,minReps:entry.sets[0]?.minReps??8,maxReps:entry.sets[0]?.maxReps??12,targetRir:entry.sets[0]?.targetRir??2})):
      slot.plannedExercises.flatMap(plan=>{const exercise=catalog.find(item=>item.id===plan.exerciseId);return exercise&&allowed(exercise)?[{exercise,sets:plan.sets,minReps:plan.prescription?.minReps??phase.minReps,maxReps:plan.prescription?.maxReps??phase.maxReps,targetRir:plan.prescription?.targetRir??phase.targetRir}]:[];});
    return {kind:'routine',name:slot.label,date:nextDate,finishedToday,exercises};
  }
  const exposure=Object.fromEntries(MUSCLES.map(muscle=>[muscle,0])) as Record<Muscle,number>;
  completed.filter(session=>session.context.date>=datePlusDays(today,-6)).forEach(session=>session.exercises.forEach(entry=>{
    const sets=entry.sets.filter(set=>(set.result?.completedReps??0)>0).length;
    entry.exercise.primaryMuscles.forEach(muscle=>exposure[muscle]+=sets);
    entry.exercise.secondaryMuscles.forEach(muscle=>exposure[muscle]+=sets*0.5);
  }));
  const targets=[...MUSCLES].sort((a,b)=>exposure[a]-exposure[b]).slice(0,4);
  const catalog=routineCatalog(source,state.catalog??block?.catalog??RUNTIME_EXERCISES);
  const limit=Math.max(1,Math.min(4,Math.floor(source.sessionMinutes/12)));
  const chosen=selectExercises({catalog,source,targetMuscles:targets,movementPatterns:[],workingSets:state.workingSets,limit});
  return {kind:'suggested',name:'Your next workout',date,finishedToday,exercises:chosen.map(exercise=>({exercise,sets:3,minReps:8,maxReps:12,targetRir:2}))};
};
