import { createRuntimeId } from '../runtime/id';
import { defaultRoutine, validateRoutineSource } from '../runtime/routine';
import type { ExerciseDefinition, Muscle, RoutineDefinition, RoutineSetDefaults, RuntimeGoal, TrainingSource } from '../runtime/types';

export type DraftValue<T> = { value: T | null; origin: 'reported' | 'saved' | 'suggested' | 'unknown' };
export type DraftExercise = {
  id: string; name: string; exerciseId: string | null;
  sets: DraftValue<number>; minReps: DraftValue<number>; maxReps: DraftValue<number>; targetRir: DraftValue<number>;
  weight: DraftValue<number>; unit: 'kg' | 'lb' | null; basis: 'per_hand' | 'total' | null;
  notes: string[];
};
export type RoutineDraft = {
  version: 1; originalText: string; method: 'text' | 'guided' | 'saved';
  workouts: Array<{ id: string; name: string; targetMuscles?: Muscle[]; exercises: DraftExercise[] }>;
  focus?: RoutineDefinition['focus'];
  setDefaults?: RoutineSetDefaults;
  limitationNote?: string;
  days: DraftValue<number>; minutes: DraftValue<number>; goal: DraftValue<RuntimeGoal>;
  equipment: string[] | null; notes: string[]; customExercises: ExerciseDefinition[];
  preferredSplit?: RoutineDefinition['split'];
};
export const unknownValue = <T>(): DraftValue<T> => ({ value: null, origin: 'unknown' });
export const valueOf = <T>(value: T, origin: DraftValue<T>['origin'] = 'reported'): DraftValue<T> => ({ value, origin });
export const emptyDraftExercise = (name = ''): DraftExercise => ({
  id:createRuntimeId(), name, exerciseId:null, sets:unknownValue(), minReps:unknownValue(), maxReps:unknownValue(),
  targetRir:unknownValue(), weight:unknownValue(), unit:null, basis:null, notes:[],
});
export const DEFAULT_SET_TARGETS: RoutineSetDefaults = { sets:3, minReps:8, maxReps:12, targetRir:2 };
export const exerciseFromDefaults = (exercise: ExerciseDefinition, defaults: RoutineSetDefaults): DraftExercise => ({
  ...emptyDraftExercise(exercise.name), exerciseId:exercise.id,
  sets:valueOf(defaults.sets), minReps:valueOf(defaults.minReps), maxReps:valueOf(defaults.maxReps), targetRir:valueOf(defaults.targetRir),
});
export const emptyDraft = (text = ''): RoutineDraft => ({version:1,originalText:text,method:'text',workouts:[],days:unknownValue(),minutes:unknownValue(),goal:unknownValue(),equipment:null,notes:[],customExercises:[]});
export const draftCatalog = (draft: RoutineDraft, catalog: ExerciseDefinition[]) => [...new Map([...catalog,...draft.customExercises].map(x=>[x.id,x])).values()];

export const draftFromRoutine = (routine: RoutineDefinition, source: TrainingSource, catalog: ExerciseDefinition[], method: RoutineDraft['method']='saved'): RoutineDraft => ({
  ...emptyDraft(), method, days:valueOf(source.daysPerWeek,method==='guided'?'suggested':'saved'), minutes:valueOf(source.sessionMinutes,'saved'),goal:valueOf(source.goal,'saved'),equipment:[...source.equipment],
  customExercises:routine.customExercises??[],
  focus:routine.focus, setDefaults:routine.setDefaults, limitationNote:routine.limitationNote,
  preferredSplit:routine.preferredSplit??routine.split,
  workouts:routine.workouts.map(workout=>({id:workout.id,name:workout.name,targetMuscles:workout.targetMuscles,exercises:workout.exercises.map(item=>({
    ...emptyDraftExercise(catalog.find(x=>x.id===item.exerciseId)?.name??item.exerciseId),exerciseId:item.exerciseId,
    sets:valueOf(item.sets,method==='guided'?'suggested':'saved'),minReps:valueOf(item.minReps,method==='guided'?'suggested':'saved'),maxReps:valueOf(item.maxReps,method==='guided'?'suggested':'saved'),targetRir:valueOf(item.targetRir,method==='guided'?'suggested':'saved'),
    weight:item.startingLoadKg===undefined?unknownValue():valueOf(item.startingLoadKg,'saved'),unit:'kg',basis:catalog.find(x=>x.id===item.exerciseId)?.equipment.includes('dumbbell')?'per_hand':'total',
  }))})),
});

/** Drafts contain no sessions/results and never write to the training store. */
export const draftIssues = (draft: RoutineDraft, catalog: ExerciseDefinition[]): string[] => {
  const all=draftCatalog(draft,catalog), issues:string[]=[];
  if(!draft.workouts.length)issues.push('Add at least one workout.');
  for(const workout of draft.workouts){
    if(!workout.name.trim())issues.push('Give each workout a name.');
    if(!workout.exercises.length)issues.push(`Add an exercise to ${workout.name}.`);
    const seen=new Set<string>();
    for(const item of workout.exercises){
      const exercise=all.find(x=>x.id===item.exerciseId);
      if(!exercise)issues.push(`Choose an exercise for “${item.name || 'unnamed exercise'}”.`);
      if(item.exerciseId && seen.has(item.exerciseId))issues.push(`${item.name} appears twice in ${workout.name}. Combine its sets or remove one entry.`);
      if(item.exerciseId)seen.add(item.exerciseId);
      if(item.weight.value!==null && !item.unit)issues.push(`Choose kg or lb for ${item.name}.`);
      if(item.weight.value!==null && item.weight.value>0 && exercise?.equipment.includes('dumbbell') && !item.basis)issues.push(`Is ${item.name}’s weight per dumbbell or both combined?`);
    }
  }
  return issues;
};
export const weightInKg = (item: DraftExercise, exercise: ExerciseDefinition): number | undefined => {
  if(item.weight.value===null)return undefined;
  if(!item.unit)throw Error('Choose a weight unit before saving.');
  let value=item.weight.value*(item.unit==='lb'?0.45359237:1);
  if(exercise.equipment.includes('dumbbell') && item.basis==='total')value/=2;
  return Number(value.toFixed(2));
};
export const sourceFromDraft = (draft: RoutineDraft, initial: TrainingSource, catalog: ExerciseDefinition[]): TrainingSource => {
  const issues=draftIssues(draft,catalog);if(issues.length)throw Error(issues[0]);
  const all=draftCatalog(draft,catalog);
  const source:TrainingSource={...initial,version:initial.version+1,createdAt:new Date().toISOString(),
    daysPerWeek:(draft.days.value??initial.daysPerWeek) as TrainingSource['daysPerWeek'],sessionMinutes:draft.minutes.value??initial.sessionMinutes,goal:draft.goal.value??initial.goal,
    equipment:draft.equipment??initial.equipment,
    routine:{...(initial.routine??defaultRoutine()),split:'custom',preferredSplit:draft.preferredSplit??initial.routine?.preferredSplit,customExercises:draft.customExercises,
      focus:draft.focus, setDefaults:draft.setDefaults, limitationNote:draft.limitationNote,
      workouts:draft.workouts.map(workout=>({id:workout.id,name:workout.name.trim(),targetMuscles:workout.targetMuscles,exercises:workout.exercises.map(item=>({
        exerciseId:item.exerciseId!,sets:item.sets.value??3,minReps:item.minReps.value??item.maxReps.value??8,maxReps:item.maxReps.value??item.minReps.value??12,targetRir:item.targetRir.value??2,
        ...(item.weight.value===null?{}:{startingLoadKg:weightInKg(item,all.find(x=>x.id===item.exerciseId)!)}),
      }))})),
    }};
  if(!Number.isInteger(source.sessionMinutes)||source.sessionMinutes<10||source.sessionMinutes>180)throw Error('Choose 10–180 minutes per workout.');
  validateRoutineSource(source,all);
  return source;
};
