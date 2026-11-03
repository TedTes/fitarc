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
  const selected=source.trainingSplit??source.routine?.preferredSplit??source.routine?.split;
  return isPoolPattern(selected)?selected:undefined;
};

export const matchesGroup = (exercise:ExerciseDefinition, group:{name:string;muscles:Muscle[]}) => {
  if(!exercise.primaryMuscles.some(m=>group.muscles.includes(m)))return false;
  // Shoulders appear in both groups; rear-delt pulling belongs to Pull.
  if(group.name==='Push' && (exercise.movementPattern.includes('pull') || exercise.primaryMuscles.includes('back') || exercise.name.toLowerCase().includes('rear')))return false;
  if(group.name==='Pull' && exercise.primaryMuscles.every(m=>m==='delts'))return exercise.movementPattern.includes('pull') || /rear|reverse|face pull/i.test(exercise.name);
  return true;
};

/** Identity follows the saved order, not the plan revision/name or its set targets. */
export const exerciseQueueKey = (slot: TrainingSlot) => JSON.stringify([slot.id, slot.plannedExercises.map(plan => plan.exerciseId)]);

/** A completion carries the continuation point; previews and active sessions never move it. */
export const exerciseQueueCursor = (slot: TrainingSlot, context: SessionContext, sessions: SessionPrescription[]) => {
  const key = exerciseQueueKey(slot);
  const latest = sessions.map((session,index) => ({session,index})).filter(({session}) =>
    session.status === 'committed' && session.slotId === slot.id && session.context.date <= context.date
    && session.exerciseQueue?.key === key && session.exerciseQueue.advances)
    .sort((a,b) => b.session.context.date.localeCompare(a.session.context.date)
      || (b.session.finishedAt ?? b.session.createdAt).localeCompare(a.session.finishedAt ?? a.session.createdAt) || b.index-a.index)[0]?.session;
  return latest?.exerciseQueue?.nextExerciseId;
};

export const exerciseQueueProgress = (slot: TrainingSlot, lastExerciseId: string, advances = true) => {
  const index = slot.plannedExercises.findIndex(plan => plan.exerciseId === lastExerciseId);
  if (index < 0 || !slot.plannedExercises.length) return undefined;
  return { key: exerciseQueueKey(slot), nextExerciseId: slot.plannedExercises[(index+1)%slot.plannedExercises.length].exerciseId, advances };
};

/** Read the next contiguous eligible batch. Never rank, pin a main lift, or mutate the saved order. */
export const selectPoolPlans = (slot:TrainingSlot, source:TrainingSource, catalog:ExerciseDefinition[], context:SessionContext, sessions:SessionPrescription[] = [], cursor?:string) => {
  const group=workoutGroup(slot.label) ?? {name:slot.label,muscles:slot.targetMuscles};
  const definitions=new Map(catalog.map(e=>[e.id,e]));
  const next=cursor ?? exerciseQueueCursor(slot,context,sessions);
  const start=Math.max(0,slot.plannedExercises.findIndex(plan=>plan.exerciseId===next));
  const ordered=[...slot.plannedExercises.slice(start),...slot.plannedExercises.slice(0,start)];
  const seen=new Set<string>();
  const candidates=ordered.filter(plan=>{
    const exercise=definitions.get(plan.exerciseId);
    if (!exercise || seen.has(exercise.id) || !matchesGroup(exercise,group)
      || source.excludedExerciseIds.includes(exercise.id) || context.unavailableExerciseIds.includes(exercise.id)
      || !exercise.equipment.every(e=>source.equipment.includes(e)&&!context.unavailableEquipment.includes(e))
      || exercise.contraindications.some(e=>source.limitations.includes(e))) return false;
    seen.add(exercise.id); return true;
  });
  const limit=context.minutesAvailable<=30?3:context.minutesAvailable<=45?4:context.minutesAvailable<=75?5:6;
  return candidates.slice(0,limit).map(plan=>({...plan,selection:{...plan.selection,reasons:[`${slot.label} · Next exercise in your queue`]}}));
};
