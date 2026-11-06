import { balanceRequirements } from './workoutBalance';
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
export const exerciseQueueState = (slot: TrainingSlot, context: SessionContext, sessions: SessionPrescription[]) => {
  const key = exerciseQueueKey(slot);
  const latest = sessions.map((session,index) => ({session,index})).filter(({session}) =>
    session.status === 'committed' && session.slotId === slot.id && session.context.date <= context.date
    && session.exerciseQueue?.key === key && session.exerciseQueue.advances)
    .sort((a,b) => b.session.context.date.localeCompare(a.session.context.date)
      || (b.session.finishedAt ?? b.session.createdAt).localeCompare(a.session.finishedAt ?? a.session.createdAt) || b.index-a.index)[0]?.session;
  return latest?.exerciseQueue;
};

export const exerciseQueueCursor = (slot:TrainingSlot, context:SessionContext, sessions:SessionPrescription[]) => exerciseQueueState(slot,context,sessions)?.nextExerciseId;
export const exerciseQueueOrder = (slot:TrainingSlot, context:SessionContext, sessions:SessionPrescription[], cursor?:string|string[]) => {
  const saved=exerciseQueueState(slot,context,sessions);
  const ids=[...new Set(slot.plannedExercises.map(p=>p.exerciseId))];
  const pending=Array.isArray(cursor)?cursor:cursor?undefined:saved?.pendingOrder;
  if(pending)return [...pending.filter(id=>ids.includes(id)),...ids.filter(id=>!pending.includes(id))];
  const start=Math.max(0,ids.indexOf(typeof cursor==='string'?cursor:saved?.nextExerciseId??''));
  return [...ids.slice(start),...ids.slice(0,start)];
};
export const exerciseQueueProgress = (slot:TrainingSlot, selected:string|string[], advances=true, order=slot.plannedExercises.map(p=>p.exerciseId)) => {
  if(typeof selected==='string') {
    const index=slot.plannedExercises.findIndex(p=>p.exerciseId===selected);
    if(index<0)return undefined;
    return {key:exerciseQueueKey(slot),nextExerciseId:slot.plannedExercises[(index+1)%slot.plannedExercises.length].exerciseId,advances,pendingOrder:undefined as string[]|undefined};
  }
  if(!selected.length)return undefined;
  const used=new Set(selected);
  const pendingOrder=[...order.filter(id=>!used.has(id)),...order.filter(id=>used.has(id))];
  return {key:exerciseQueueKey(slot),nextExerciseId:pendingOrder[0],pendingOrder,advances};
};

/** Fill movement coverage in queue order; defer unselected entries until completion. */
export const selectPoolPlans = (slot:TrainingSlot, source:TrainingSource, catalog:ExerciseDefinition[], context:SessionContext, sessions:SessionPrescription[] = [], cursor?:string|string[]) => {
  const group=workoutGroup(slot.label) ?? {name:slot.label,muscles:slot.targetMuscles};
  const definitions=new Map(catalog.map(e=>[e.id,e]));
  const order=exerciseQueueOrder(slot,context,sessions,cursor);
  const ordered=order.map(id=>slot.plannedExercises.find(p=>p.exerciseId===id)!);
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
  const selected:typeof candidates=[];
  const requirements=balanceRequirements(slot);
  const minimumMinutes=(id:string)=>{const e=definitions.get(id)!;return e.setupMinutes+(e.compound?3.5:2.5);};
  for(const requirement of requirements){
    if(selected.some(p=>requirement.matches(definitions.get(p.exerciseId)!)))continue;
    const options=candidates.filter(p=>!selected.includes(p)&&requirement.matches(definitions.get(p.exerciseId)!));
    // Prefer queue order, but do not choose an expensive setup when it crowds out required coverage.
    const next=options.find(option=>{
      const proposed=[...selected,option];
      const missing=requirements.filter(r=>!proposed.some(p=>r.matches(definitions.get(p.exerciseId)!)));
      const reserve=missing.reduce((sum,r)=>{const alternatives=candidates.filter(p=>!proposed.includes(p)&&r.matches(definitions.get(p.exerciseId)!));return sum+(alternatives.length?Math.min(...alternatives.map(p=>minimumMinutes(p.exerciseId))):0);},0);
      return proposed.reduce((sum,p)=>sum+minimumMinutes(p.exerciseId),0)+reserve<=context.minutesAvailable;
    })??[...options].sort((a,b)=>minimumMinutes(a.exerciseId)-minimumMinutes(b.exerciseId))[0];
    if(next&&selected.length<limit)selected.push(next);
  }
  const hasCoverage=selected.length>0;
  while(selected.length<limit){
    const remaining=candidates.filter(p=>!selected.includes(p));
    const distinct=remaining.filter(p=>!selected.some(s=>definitions.get(s.exerciseId)!.substitutionGroup===definitions.get(p.exerciseId)!.substitutionGroup));
    const next=hasCoverage?(distinct.find(p=>!selected.some(s=>definitions.get(s.exerciseId)!.primaryMuscles[0]===definitions.get(p.exerciseId)!.primaryMuscles[0]))??distinct[0]??remaining[0]):remaining[0];
    if(!next)break;
    selected.push(next);
  }
  return selected.map(plan=>({...plan,selection:{...plan.selection,reasons:[`${slot.label} · Selected from your queue for movement coverage`]}}));
};
