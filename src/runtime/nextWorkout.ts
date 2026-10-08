import { lastCompletedSession, nextSessionAdditions } from './nextSessionEdits';
import { GROUP_TEMPLATES, matchesGroup, preferredWorkoutPattern } from './exercisePools';
import { previewTrainingSession } from './runtimeService';
import { RUNTIME_EXERCISES } from './exerciseCatalog';
import { selectExercises } from './exerciseSelector';
import { datePlusDays, planWeek } from './planDates';
import { routineCatalog } from './routine';
import { nextRoutineSlot } from './sequence';
import { MUSCLES } from './trainingPolicy';
import type { ExerciseDefinition, Muscle, RuntimeState } from './types';

export type NextWorkout = {
  kind:'routine'|'suggested'; name:string; date:string; finishedToday:boolean;
  /** Primary and assisting muscles from actually performed sets in today's finished sessions. */
  completedMuscles: Muscle[];
  flexibleDate?: boolean;
  slotId?: string;
  targetMuscles?: Muscle[];
  exercises:Array<{exercise:ExerciseDefinition;sets:number;minReps:number;maxReps:number;targetRir:number}>;
};

/** Read-only next-session preview. Never creates a plan, session or recorded set. */
export const nextWorkoutPreview=(state:RuntimeState,today:string):NextWorkout|null=>{
  if(state.activeSession||!state.source)return null;
  const source=state.source;
  const completed=state.sessions.filter(session=>session.status==='committed'&&session.context.date<=today&&session.exercises.some(entry=>entry.sets.some(set=>set.status==='completed'&&(set.result?.completedReps??0)>0)));
  const latest=lastCompletedSession(state,today);
  if(!latest)return null;
  const finishedToday=latest.context.date===today;
  const completedMuscles=[...new Set(completed.filter(session=>session.context.date===today).flatMap(session=>
    session.exercises.filter(entry=>entry.sets.some(set=>set.status==='completed'&&(set.result?.completedReps??0)>0))
      .flatMap(entry=>[...entry.exercise.primaryMuscles,...entry.exercise.secondaryMuscles])))];
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
    if(source.routine?.selectionMode==='pools'||nextSessionAdditions(state,slot.id,nextDate).length){
      // Use the exact same read-only solver as Today, including time and volume constraints.
      let exercises:NextWorkout['exercises']=[];
      try{
        const proposal=previewTrainingSession(state,{date:nextDate,minutesAvailable:window?.minutesAvailable??source.sessionMinutes,recovery:window?.recovery??'yes',unavailableEquipment:window?.unavailableEquipment??[],unavailableExerciseIds:window?.unavailableExerciseIds??[]});
        exercises=proposal.exercises.map(entry=>({exercise:entry.exercise,sets:entry.sets.length,minReps:entry.sets[0].minReps,maxReps:entry.sets[0].maxReps,targetRir:entry.sets[0].targetRir}));
      }catch{ /* No compatible work: the preview offers editing the routine. */ }
      return {kind:'routine',slotId:slot.id,targetMuscles:slot.targetMuscles,name:slot.label,date:nextDate,flexibleDate:!window,finishedToday,completedMuscles,exercises};
    }
    const phase=block.phases.find(item=>planWeek(block,nextDate)>=item.startWeek&&planWeek(block,nextDate)<=item.endWeek)??block.phases[0];
    const catalog=block.catalog??state.catalog??RUNTIME_EXERCISES;
    const exercises=window?window.workout.exercises.filter(entry=>allowed(entry.exercise)).map(entry=>({exercise:entry.exercise,sets:entry.sets.length,minReps:entry.sets[0]?.minReps??8,maxReps:entry.sets[0]?.maxReps??12,targetRir:entry.sets[0]?.targetRir??2})):
      slot.plannedExercises.flatMap(plan=>{const exercise=catalog.find(item=>item.id===plan.exerciseId);return exercise&&allowed(exercise)?[{exercise,sets:plan.sets,minReps:plan.prescription?.minReps??phase.minReps,maxReps:plan.prescription?.maxReps??phase.maxReps,targetRir:plan.prescription?.targetRir??phase.targetRir}]:[];});
    return {kind:'routine',slotId:slot.id,targetMuscles:slot.targetMuscles,name:slot.label,date:nextDate,finishedToday,completedMuscles,exercises};
  }
  const exposure=Object.fromEntries(MUSCLES.map(muscle=>[muscle,0])) as Record<Muscle,number>;
  completed.filter(session=>session.context.date>=datePlusDays(today,-6)).forEach(session=>session.exercises.forEach(entry=>{
    const sets=entry.sets.filter(set=>(set.result?.completedReps??0)>0).length;
    entry.exercise.primaryMuscles.forEach(muscle=>exposure[muscle]+=sets);
    entry.exercise.secondaryMuscles.forEach(muscle=>exposure[muscle]+=sets*0.5);
  }));
  const pattern=preferredWorkoutPattern(source);
  const groups=pattern?GROUP_TEMPLATES[pattern]:undefined;
  // An ad-hoc session has no routine slot. Use its intended group when present,
  // otherwise its actually logged primary-muscle work, never pending exercises.
  const ranked=groups?.map((group,index)=>({group,index,sets:latest.exercises.reduce((sum,entry)=>sum+
    (matchesGroup(entry.exercise,group)?entry.sets.filter(set=>set.status==='completed'&&(set.result?.completedReps??0)>0).length:0),0)}))
    .sort((a,b)=>b.sets-a.sets||a.index-b.index);
  const namedIndex=groups?.findIndex(group=>group.name.toLowerCase()===latest.name?.trim().toLowerCase())??-1;
  const lastIndex=namedIndex>=0?namedIndex:ranked?.[0]?.sets?ranked[0].index:-1;
  const nextGroup=groups?.[(lastIndex+1)%groups.length];
  const targets=nextGroup?.muscles??[...MUSCLES].sort((a,b)=>exposure[a]-exposure[b]).slice(0,4);
  const catalog=routineCatalog(source,state.catalog??block?.catalog??RUNTIME_EXERCISES);
  const limit=Math.max(1,Math.min(4,Math.floor(source.sessionMinutes/12)));
  const chosen=selectExercises({catalog:nextGroup?catalog.filter(exercise=>matchesGroup(exercise,nextGroup)):catalog,source,targetMuscles:targets,movementPatterns:[],workingSets:state.workingSets,limit});
  const exercises=chosen.map(exercise=>({exercise,sets:3,minReps:8,maxReps:12,targetRir:2}));
  for(const item of nextSessionAdditions(state,undefined,today)){
    const exercise=catalog.find(e=>e.id===item.exerciseId);
    if(exercise&&allowed(exercise)&&(!nextGroup||matchesGroup(exercise,nextGroup))&&!exercises.some(e=>e.exercise.id===exercise.id))
      exercises.push({exercise,sets:item.sets,minReps:item.minReps,maxReps:item.maxReps,targetRir:item.targetRir});
  }
  return {kind:'suggested',targetMuscles:nextGroup?.muscles??targets,name:nextGroup?.name??'Your next workout',flexibleDate:Boolean(nextGroup),date,finishedToday,completedMuscles,exercises};
};

/** The next-session picker shares the preview's group and the user's current constraints. */
export const nextWorkoutCandidates = (state:RuntimeState, workout:NextWorkout):ExerciseDefinition[] => {
  if(!state.source)return [];
  const source=state.source;
  const group=Object.values(GROUP_TEMPLATES).flat().find(group=>group.name===workout.name);
  const muscles=workout.targetMuscles??[...new Set(workout.exercises.flatMap(e=>e.exercise.primaryMuscles))];
  const pool=source.routine?.workouts.find(w=>w.id===workout.slotId)?.exercises??[];
  const window=state.block?.remainingWeek?.windows.find(w=>w.date===workout.date&&w.slotId===workout.slotId);
  return routineCatalog(source,state.block?.catalog??state.catalog??RUNTIME_EXERCISES).filter(exercise=>
    (group?matchesGroup(exercise,group):exercise.primaryMuscles.some(m=>muscles.includes(m)))
    &&!source.excludedExerciseIds.includes(exercise.id)&&!window?.unavailableExerciseIds.includes(exercise.id)
    &&exercise.equipment.every(e=>source.equipment.includes(e)&&!window?.unavailableEquipment.includes(e))
    &&!exercise.contraindications.some(e=>source.limitations.includes(e)))
    .sort((a,b)=>Number(pool.some(p=>p.exerciseId===b.id))-Number(pool.some(p=>p.exerciseId===a.id)));
};

export const addNextWorkoutExercise = (state:RuntimeState, exerciseId:string, today:string):RuntimeState => {
  const workout=nextWorkoutPreview(state,today),last=lastCompletedSession(state,today);
  if(!state.source||!workout||!last)throw Error('Your next session changed. Reopen Today.');
  if(workout.exercises.some(e=>e.exercise.id===exerciseId))return state;
  if(!nextWorkoutCandidates(state,workout).some(e=>e.id===exerciseId))throw Error('This exercise does not fit the next session.');
  const item=state.source.routine?.workouts.find(w=>w.id===workout.slotId)?.exercises.find(e=>e.exerciseId===exerciseId)
    ??{exerciseId,...(state.source.routine?.setDefaults??{sets:3,minReps:8,maxReps:12,targetRir:2})};
  const exercises=[...nextSessionAdditions(state,workout.slotId,today),item];
  return {...state,source:{...state.source,nextSessionAdditions:{afterSessionId:last.id,blockId:state.block?.id??null,slotId:workout.slotId,exercises}}};
};
