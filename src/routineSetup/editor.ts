import type { ExerciseDefinition, RuntimeState, TrainingSource } from '../runtime/types';
import { compileTrainingBlock } from '../runtime/runtimeService';
import { currentStylePlans, trainingStyle } from '../runtime/trainingStyles';
import { pauseWorkout, resumeStyleWorkout } from '../runtime/sessionSwitching';
import { editableRoutine } from '../runtime/routine';
import { sourceFromDraft, type RoutineDraft } from './draft';
import type { RoutineInputContext } from './context';

export type RoutineEditorInput = {text:string; interpretedText:string; context?:RoutineInputContext; draft:RoutineDraft; settings:TrainingSource};
export const editorSettings=(source:TrainingSource):TrainingSource=>({...source});
const configuration=(source:TrainingSource)=>{const {version,createdAt,routineText,interpretedRoutineText,...values}=source; if(values.routine)values.routine={...values.routine,preferredSplit:values.routine.preferredSplit??values.routine.split};return JSON.stringify(values,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);};

/** Persist text separately. Valid direct edits version the routine; never persist the editor's full copy. */
export const saveRoutineEditor=(state:RuntimeState,input:RoutineEditorInput,catalog:ExerciseDefinition[]):RuntimeState=>{
  const previous=state.source??input.settings;
  const text={routineText:input.text,interpretedRoutineText:input.interpretedText};
  let next:RuntimeState={...state,source:{...previous,...text,trainingSplit:input.draft.preferredSplit??previous.trainingSplit}};
  if(input.draft.workouts.length){
    let candidate:TrainingSource;
    try{candidate=sourceFromDraft(input.draft,{...input.settings,version:previous.version},catalog);}catch{return next;}
    candidate={...candidate,...text,trainingSplit:candidate.routine?.preferredSplit??candidate.routine?.split??previous.trainingSplit};
    const switching = trainingStyle(candidate) !== trainingStyle(state.block?.preferences ?? previous);
    const saved = switching ? currentStylePlans(state.block,state.blockHistory).find(plan=>trainingStyle(plan.preferences)===trainingStyle(candidate)) : undefined;
    // Selecting an existing style resumes its own saved queues, not a regrouping of another style.
    if(saved) candidate={...candidate,routine:editableRoutine(saved)};
    if(!state.block||configuration(candidate)!==configuration(previous)){
      const compiled=compileTrainingBlock({...(switching?pauseWorkout(state):state),block:saved??state.block,activeSession:null},candidate);
      next={...compiled,source:compiled.source,activeSession:switching?null:state.activeSession,
        blockHistory:[...new Map([...(state.blockHistory??[]),...(state.block?[state.block]:[])].map(plan=>[plan.id,plan])).values()]};
    }
  }
  if(trainingStyle(next.block?.preferences)!==trainingStyle(state.block?.preferences))next=resumeStyleWorkout(next);
  if(!input.draft.workouts.length&&!state.block){
    next={...next,source:{...next.source!,daysPerWeek:(input.draft.days.value??previous.daysPerWeek) as TrainingSource['daysPerWeek'],
      sessionMinutes:input.draft.minutes.value??previous.sessionMinutes,goal:input.draft.goal.value??previous.goal}};
  }
  return next;
};

/** Text and direct edits share one list. Re-reading text must not drop manually added work. */
export const mergeRoutineInput = (current: RoutineDraft, incoming: RoutineDraft): RoutineDraft => {
  const key=(name:string)=>name.trim().toLowerCase();
  const workouts=[...current.workouts];
  for(const workout of incoming.workouts){
    const index=workouts.findIndex(item=>key(item.name)===key(workout.name));
    if(index<0){workouts.push(workout);continue;}
    const previous=workouts[index];
    // Correcting unrecognised text replaces its unresolved entry rather than accumulating typos.
    const exercises=previous.exercises.filter(item=>item.exerciseId||workout.exercises.some(next=>key(next.name)===key(item.name)));
    for(const exercise of workout.exercises){
      const found=exercises.findIndex(item=>exercise.exerciseId?item.exerciseId===exercise.exerciseId:key(item.name)===key(exercise.name));
      if(found<0){exercises.push(exercise);continue;}
      const old=exercises[found];
      exercises[found]={...old,...exercise,id:old.id,
        sets:exercise.sets.value===null?old.sets:exercise.sets,minReps:exercise.minReps.value===null?old.minReps:exercise.minReps,
        maxReps:exercise.maxReps.value===null?old.maxReps:exercise.maxReps,targetRir:exercise.targetRir.value===null?old.targetRir:exercise.targetRir,
        ...(exercise.weight.value===null?{weight:old.weight,unit:old.unit,basis:old.basis}:{}),
      };
    }
    workouts[index]={...previous,exercises};
  }
  return {...current,originalText:incoming.originalText,method:'text',workouts,
    days:incoming.days.value===null?current.days:incoming.days,minutes:incoming.minutes.value===null?current.minutes:incoming.minutes,
    goal:incoming.goal.value===null?current.goal:incoming.goal,equipment:incoming.equipment??current.equipment,
    notes:incoming.notes,customExercises:[...new Map([...current.customExercises,...incoming.customExercises].map(item=>[item.id,item])).values()]};
};
