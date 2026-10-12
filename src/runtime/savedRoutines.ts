import type { RuntimeState, TrainingBlock } from './types';
import { compileTrainingBlock } from './runtimeService';
import { editableRoutine } from './routine';
import { localDate } from './planDates';

/** Restore choices as a fresh version; old plans and logged sessions remain immutable. */
export function useSavedRoutine(state:RuntimeState,planId:string):RuntimeState{
  if(state.activeSession)throw Error('Finish your active workout before switching routines.');
  const plans=[...new Map([...(state.blockHistory??[]),...(state.block?[state.block]:[])].map(p=>[p.id,p])).values()];
  const plan=plans.find(p=>p.id===planId);
  if(!plan?.preferences||plan.kind==='workout'||!state.source)throw Error('This routine is unavailable.');
  const routine=editableRoutine(plan);
  // Use current equipment, limitations and performance; restore the previous exercise choices.
  const source={...state.source,version:state.source.version+1,routine};
  const updated=compileTrainingBlock(state,source);
  return {...updated,block:{...updated.block!,startedOn:localDate(),currentWeek:1},blockHistory:plans};
}

/** Hide duplicate revisions with the same exercise choices and targets. */
export function savedRoutines(state: RuntimeState): TrainingBlock[] {
  const plans = [...new Map([...(state.blockHistory ?? []), ...(state.block ? [state.block] : [])].map(plan => [plan.id, plan])).values()]
    .filter(plan => plan.kind !== 'workout' && plan.preferences && plan.slots.length)
    .sort((a, b) => Number(b.id === state.block?.id) - Number(a.id === state.block?.id) || b.createdAt.localeCompare(a.createdAt) || b.version - a.version);
  const seen = new Set<string>();
  return plans.filter(plan => {
    const key = JSON.stringify(plan.slots.map(slot => ({label: slot.label, exercises: slot.plannedExercises.map(item => ({
      exerciseId: item.exerciseId, sets: item.sets, minReps: item.prescription?.minReps ?? plan.phases[0]?.minReps,
      maxReps: item.prescription?.maxReps ?? plan.phases[0]?.maxReps,
      targetRir: item.prescription?.targetRir ?? plan.phases[0]?.targetRir,
    }))})));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
