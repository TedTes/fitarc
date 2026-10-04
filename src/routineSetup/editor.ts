import type { ExerciseDefinition, RuntimeState, TrainingSource } from '../runtime/types';
import { compileTrainingBlock } from '../runtime/runtimeService';
import { sourceFromDraft, type RoutineDraft } from './draft';
import { defaultRoutine, validateRoutineSource } from '../runtime/routine';
import type { RoutineInputContext } from './context';

export type RoutineEditorSnapshot = {
  version: 1;
  baseVersion: number;
  text: string;
  interpretedText: string;
  context?: RoutineInputContext;
  draft: RoutineDraft;
  settings: Omit<TrainingSource, 'routineEditor'>;
};
export type RoutineEditorInput = Omit<RoutineEditorSnapshot, 'version' | 'baseVersion'>;
export const editorSettings = ({routineEditor: _editor, ...source}: TrainingSource): Omit<TrainingSource,'routineEditor'> => source;
const configuration = (source: TrainingSource) => {
  const {routineEditor:_editor,version:_version,createdAt:_created,...values}=source;
  return JSON.stringify(values);
};

/** Save the editor even when incomplete. Only a valid routine replaces the applied plan. */
export const saveRoutineEditor = (state: RuntimeState, input: RoutineEditorInput, catalog: ExerciseDefinition[]): RuntimeState => {
  const previous=state.source??input.settings;
  let source:TrainingSource=previous,next=state;
  if (!state.activeSession) {
    if(input.draft.workouts.length){
      try {
        const candidate=sourceFromDraft(input.draft,{...input.settings,version:previous.version},catalog);
        if(!state.block||state.block.kind==='workout'||configuration(candidate)!==configuration(previous))next=compileTrainingBlock(state,candidate);
        source=next.source??candidate;
      } catch {
        // Incomplete/unsupported entries stay in the editor without changing the saved plan.
      }
    }else if(input.text===input.interpretedText){
      const draft=input.draft;
      // An intentionally empty list is valid for the dashboard, not a generated plan.
      source={...input.settings,version:previous.version+1,
        daysPerWeek:(draft.days.value??input.settings.daysPerWeek) as TrainingSource['daysPerWeek'],
        sessionMinutes:draft.minutes.value??input.settings.sessionMinutes,goal:draft.goal.value??input.settings.goal,
        equipment:draft.equipment??input.settings.equipment,
        routine:{...(input.settings.routine??defaultRoutine()),split:'auto',preferredSplit:draft.preferredSplit,
          focus:draft.focus,setDefaults:draft.setDefaults,limitationNote:draft.limitationNote,customExercises:draft.customExercises,workouts:[]}};
      validateRoutineSource(source,catalog);
      if(!Number.isInteger(source.sessionMinutes)||source.sessionMinutes<10||source.sessionMinutes>180)throw Error('Choose 10–180 minutes per workout.');
      if(configuration(source)===configuration(previous))source=previous;
      next={...state,source,block:state.block?.kind==='workout'?state.block:null,blockHistory:[...new Map([...(state.blockHistory??[]),...(state.block?[state.block]:[])].map(block=>[block.id,block])).values()]};
    }
  }
  const snapshot:RoutineEditorSnapshot={...input,version:1,baseVersion:source.version,settings:editorSettings(input.settings)};
  return {...next,source:{...source,routineEditor:snapshot}};
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
