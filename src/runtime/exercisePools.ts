import { datePlusDays } from './planDates';
import type { ExerciseDefinition, Muscle, RoutineDefinition, SessionContext, SessionPrescription, TrainingSlot, TrainingSource } from './types';

export type PoolPattern = 'upper_lower' | 'push_pull_legs' | 'full_body';
export const GROUP_TEMPLATES: Record<PoolPattern, Array<{name:string;muscles:Muscle[]}>> = {
  upper_lower:[{name:'Upper',muscles:['chest','back','delts','biceps','triceps']},{name:'Lower',muscles:['quads','hamstrings','glutes','calves','core']}],
  push_pull_legs:[{name:'Push',muscles:['chest','delts','triceps']},{name:'Pull',muscles:['back','biceps','delts']},{name:'Legs',muscles:['quads','hamstrings','glutes','calves','core']}],
  full_body:[{name:'Full body',muscles:['chest','back','delts','biceps','triceps','quads','hamstrings','glutes','calves','core']}],
};
/** Standard group names, including legacy slot labels such as upper.a and legs.b. */
export const workoutGroup = (name: string) => {
  const key = name.trim().toLowerCase().replace(/\.[a-z]$/, '');
  return Object.values(GROUP_TEMPLATES).flat().find(group =>
    group.name.toLowerCase() === key || (key === 'full' && group.name === 'Full body'));
};

export const isPoolPattern = (value:RoutineDefinition['split']|undefined):value is PoolPattern => Boolean(value && value in GROUP_TEMPLATES);
/** A saved structure preference applies to suggestions even before every pool is filled. */
export const preferredWorkoutPattern = (source:TrainingSource):PoolPattern|undefined => {
  const editor=source.routineEditor;
  const selected=editor?.baseVersion===source.version
    ?editor.draft.preferredSplit??editor.context?.split??source.routine?.preferredSplit??source.routine?.split
    :source.routine?.preferredSplit??source.routine?.split;
  return isPoolPattern(selected)?selected:undefined;
};

export const matchesGroup = (exercise:ExerciseDefinition, group:{name:string;muscles:Muscle[]}) => {
  if(!exercise.primaryMuscles.some(m=>group.muscles.includes(m)))return false;
  // Shoulders appear in both groups; rear-delt pulling belongs to Pull.
  if(group.name==='Push' && (exercise.movementPattern.includes('pull') || exercise.primaryMuscles.includes('back') || exercise.name.toLowerCase().includes('rear')))return false;
  if(group.name==='Pull' && exercise.primaryMuscles.every(m=>m==='delts'))return exercise.movementPattern.includes('pull') || /rear|reverse|face pull/i.test(exercise.name);
  return true;
};

/** Deterministic, read-only selection. Pool order defines the main lift; the rest fills coverage gaps. */
export const selectPoolPlans = (slot:TrainingSlot, source:TrainingSource, catalog:ExerciseDefinition[], context:SessionContext, sessions:SessionPrescription[] = []) => {
  const group=workoutGroup(slot.label);
  const definitions=new Map(catalog.map(e=>[e.id,e]));
  const candidates=slot.plannedExercises.filter(plan=>{
    const exercise=definitions.get(plan.exerciseId);
    return exercise && (!group || matchesGroup(exercise,group)) && !source.excludedExerciseIds.includes(exercise.id) && !context.unavailableExerciseIds.includes(exercise.id)
      && exercise.equipment.every(e=>source.equipment.includes(e)&&!context.unavailableEquipment.includes(e))
      && !exercise.contraindications.some(e=>source.limitations.includes(e));
  });
  const order=new Map(candidates.map((p,index)=>[p.exerciseId,index]));
  const completed=sessions.filter(s=>s.status==='committed'&&s.context.date<=context.date)
    .sort((a,b)=>a.context.date.localeCompare(b.context.date)||(a.finishedAt??a.createdAt).localeCompare(b.finishedAt??b.createdAt));
  const exposure:Partial<Record<Muscle,number>>={},lastUsed=new Map<string,number>();
  completed.forEach((session,index)=>session.exercises.forEach(entry=>{
    const count=entry.sets.filter(set=>set.status==='completed'&&(set.result?.completedReps??0)>0).length;
    if(!count)return;
    lastUsed.set(entry.exercise.id,index);
    if(session.context.date<datePlusDays(context.date,-6))return;
    entry.exercise.primaryMuscles.forEach(m=>exposure[m]=(exposure[m]??0)+count);
    entry.exercise.secondaryMuscles.forEach(m=>exposure[m]=(exposure[m]??0)+count*0.5);
  }));
  const limit=context.minutesAvailable<=30?3:context.minutesAvailable<=45?4:context.minutesAvailable<=75?5:6;
  const selected:TrainingSlot['plannedExercises']=[],covered=new Set<Muscle>(),patterns=new Set<string>();
  const add=(plan:TrainingSlot['plannedExercises'][number],reason:string)=>{
    const e=definitions.get(plan.exerciseId)!;
    selected.push({...plan,selection:{...plan.selection,reasons:[reason]}});
    e.primaryMuscles.forEach(m=>covered.add(m));patterns.add(e.movementPattern);
  };
  const anchor=candidates.find(p=>definitions.get(p.exerciseId)?.compound)??candidates[0];
  if(anchor)add(anchor,`${slot.label} pool · Main lift retained to compare progress`);
  while(selected.length<Math.min(limit,candidates.length)){
    const score=(plan:TrainingSlot['plannedExercises'][number])=>{
      const e=definitions.get(plan.exerciseId)!;
      const muscles=e.primaryMuscles.filter(m=>slot.targetMuscles.includes(m));
      return muscles.reduce((sum,m)=>sum+(covered.has(m)?0:100)+20/(1+(exposure[m]??0)),0)
        +(!patterns.has(e.movementPattern)&&e.movementPattern!=='isolation'?40:0)
        +(lastUsed.has(e.id)?Math.min(12,completed.length-lastUsed.get(e.id)!):14);
    };
    const next=candidates.filter(p=>!selected.some(s=>s.exerciseId===p.exerciseId)).sort((a,b)=>score(b)-score(a)||order.get(a.exerciseId)!-order.get(b.exerciseId)!)[0];
    if(!next)break;
    add(next,`${slot.label} pool · Selected for muscle coverage and recent training`);
  }
  return selected;
};
