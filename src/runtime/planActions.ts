import { GROUP_TEMPLATES, matchesGroup, type PoolPattern } from './exercisePools';
import { defaultProgression } from './routine';
import { GOAL_DEFAULTS } from './goalChanges';
import { currentStylePlans, trainingStyle } from './trainingStyles';
import { pauseWorkout, resumeStyleWorkout } from './sessionSwitching';
import { useSavedRoutine } from './savedRoutines';
import { compileTrainingBlock, solveTrainingSession } from './runtimeService';
import { createRuntimeId } from './id';
import { localDate } from './planDates';
import { RUNTIME_EXERCISES } from './exerciseCatalog';
import type { RuntimeState, TrainingSource } from './types';

export function selectTrainingStyle(state:RuntimeState,fallback:TrainingSource,style:PoolPattern|'custom'):RuntimeState {
  const saved=currentStylePlans(state.block,state.blockHistory).find(p=>trainingStyle(p.preferences)===style);
  if(saved)return useSavedRoutine(state,saved.id);
  const source=state.source??fallback, catalog=state.catalog??state.block?.catalog??RUNTIME_EXERCISES;
  const groups=style==='custom'?[{name:'My group',muscles:[] as import('./types').Muscle[]}]:GROUP_TEMPLATES[style];
  const routine={split:'custom' as const,preferredSplit:style,selectionMode:'pools' as const,progression:defaultProgression(),
    setDefaults:{sets:3,...GOAL_DEFAULTS[source.goal]},workouts:groups.map(group=>({id:createRuntimeId(),name:group.name,targetMuscles:[...group.muscles],
      exercises:catalog.filter(e=>(!group.muscles.length||matchesGroup(e,group))&&!source.excludedExerciseIds.includes(e.id)&&e.equipment.every(item=>source.equipment.includes(item))&&!e.contraindications.some(item=>source.limitations.includes(item)))
        .map(e=>({exerciseId:e.id,sets:3,...GOAL_DEFAULTS[source.goal]}))}))};
  const next=compileTrainingBlock({...pauseWorkout(state),block:null},{...source,routine,version:source.version+1});
  return {...next,blockHistory:[...(state.blockHistory??[]),...(state.block?[state.block]:[])]};
}
export function jumpTrainingGroup(state:RuntimeState,slotId:string):RuntimeState {
  if(!state.block?.slots.some(slot=>slot.id===slotId)||!state.source)throw Error('Choose a group from the active style.');
  if(state.activeSession?.slotId===slotId)return state;
  const ready=resumeStyleWorkout(pauseWorkout(state),slotId);
  if(ready.activeSession)return ready;
  const next=solveTrainingSession(ready,{date:localDate(),minutesAvailable:state.source.sessionMinutes,recovery:'yes',unavailableEquipment:[],unavailableExerciseIds:state.source.excludedExerciseIds,workoutId:slotId,extraWorkout:true});
  const session={...next.activeSession!,context:{...next.activeSession!.context,extraWorkout:false},exerciseQueue:next.activeSession!.exerciseQueue?{...next.activeSession!.exerciseQueue,advances:true}:undefined};
  return {...next,activeSession:session,sessions:next.sessions.map(s=>s.id===session.id?session:s)};
}
