import { compileBlock } from './blockCompiler';
import { editableRoutine } from './routine';
import { currentStylePlans } from './trainingStyles';
import { restSecondsFor, weeklyTargetsFor } from './trainingPolicy';
import type { RuntimeGoal, RuntimeState, TrainingSource } from './types';

export const GOAL_DEFAULTS = {
  hypertrophy:{minReps:8,maxReps:12,targetRir:2},
  strength:{minReps:5,maxReps:8,targetRir:2},
  fat_loss:{minReps:8,maxReps:12,targetRir:3},
  general:{minReps:10,maxReps:15,targetRir:3},
} satisfies Record<RuntimeGoal,{minReps:number;maxReps:number;targetRir:number}>;

/** Proposal only; existing explicit targets change only with the second opt-in. */
export function proposeGoalChange(state:RuntimeState, fallback:TrainingSource, goal:RuntimeGoal, replaceTargets=false) {
  const source=state.source??fallback, defaults=GOAL_DEFAULTS[goal];
  const plans=currentStylePlans(state.block,state.blockHistory);
  const changes:string[]=[];
  const conditioning=(value:RuntimeGoal)=>value==='fat_loss'||value==='general';
  if(conditioning(source.goal)!==conditioning(goal))changes.push(`Conditioning tracking: ${conditioning(source.goal)?'on':'off'} → ${conditioning(goal)?'on':'off'}`);
  for(const plan of plans) for(const slot of plan.slots) for(const item of slot.plannedExercises){
    const old=item.prescription;
    if(!old)continue;
    const exercise=plan.catalog?.find(e=>e.id===item.exerciseId);
    const label=`${slot.label} · ${exercise?.name??item.exerciseId}`;
    if(replaceTargets&&(old.minReps!==defaults.minReps||old.maxReps!==defaults.maxReps||old.targetRir!==defaults.targetRir))
      changes.push(`${label}: ${old.minReps}–${old.maxReps} reps / ${old.targetRir} RIR → ${defaults.minReps}–${defaults.maxReps} reps / ${defaults.targetRir} RIR`);
    const before=old.restSeconds??restSecondsFor(plan.goal,exercise?.compound??false);
    const after=old.restSeconds??restSecondsFor(goal,exercise?.compound??false);
    if(before!==after)changes.push(`${label}: rest ${before}s → ${after}s`);
  }
  const oldTargets=weeklyTargetsFor(source.goal,source.experience), targets=weeklyTargetsFor(goal,source.experience);
  for(const muscle of Object.keys(targets) as (keyof typeof targets)[]){
    if(JSON.stringify(oldTargets[muscle])!==JSON.stringify(targets[muscle]))changes.push(`${muscle}: weekly sets ${oldTargets[muscle].min}–${oldTargets[muscle].max} → ${targets[muscle].min}–${targets[muscle].max}`);
  }
  return {goal,replaceTargets,changes,signature:JSON.stringify([state.source,plans.map(p=>p.id)])};
}
export function applyGoalChange(state:RuntimeState,fallback:TrainingSource,proposal:ReturnType<typeof proposeGoalChange>):RuntimeState {
  const current=proposeGoalChange(state,fallback,proposal.goal,proposal.replaceTargets);
  if(current.signature!==proposal.signature)throw Error('Your plan changed. Review the updated targets before applying.');
  // Legacy open sessions did not carry rest snapshots. Freeze their existing rest
  // before changing global defaults, while leaving completed records untouched.
  const priorPlans=[...(state.blockHistory??[]),...(state.block?[state.block]:[])];
  const sessions=state.sessions.map(session=>session.status==='committed'?session:{...session,exercises:session.exercises.map(entry=>({...entry,
    restSeconds:entry.restSeconds??restSecondsFor(priorPlans.find(p=>p.id===session.blockId)?.goal??(state.source??fallback).goal,entry.exercise.compound)}))});
  const source={...(state.source??fallback),goal:proposal.goal,version:(state.source??fallback).version+1};
  const defaults=GOAL_DEFAULTS[proposal.goal];
  const revisions=currentStylePlans(state.block,state.blockHistory).map(plan=>{
    const routine=editableRoutine(plan);
    const nextRoutine={...routine,focus:({hypertrophy:'build_muscle',strength:'strength',fat_loss:'lose_fat',general:'maintain'} as const)[proposal.goal],
      setDefaults:{sets:routine.setDefaults?.sets??3,...defaults},
      workouts:routine.workouts.map(w=>({...w,exercises:w.exercises.map(e=>proposal.replaceTargets?{...e,...defaults}:e)}))};
    return compileBlock({...source,routine:nextRoutine},plan,state.workingSets,plan.catalog);
  });
  const activeIndex=currentStylePlans(state.block,state.blockHistory).findIndex(p=>p.id===state.block?.id);
  const block=revisions[activeIndex]??state.block;
  return {...state,sessions,activeSession:state.activeSession?sessions.find(s=>s.id===state.activeSession!.id)??state.activeSession:null,source:{...source,...(block?.preferences?.routine?{routine:block.preferences.routine}:{})},block,
    blockHistory:[...new Map([...(state.blockHistory??[]),...(state.block?[state.block]:[]),...revisions].map(p=>[p.id,p])).values()]};
}
