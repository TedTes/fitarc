import type { RuntimeState, TrainingBlock } from './types';
import { compileTrainingBlock } from './runtimeService';
import { editableRoutine } from './routine';
import { localDate } from './planDates';
import { createRuntimeId } from './id';

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

export const routineName = (plan: TrainingBlock): string =>
  plan.preferences?.routine?.name?.trim() || plan.slots.map(slot => slot.label).join(' / ');

/** A name edit is a new snapshot, preserving every previously logged workout. */
export function renameSavedRoutine(state: RuntimeState, planId: string, value: string): RuntimeState {
  const name = value.trim();
  if (!name || name.length > 80) throw Error('Enter a routine name of 1–80 characters.');
  const plans = [...new Map([...(state.blockHistory ?? []), ...(state.block ? [state.block] : [])].map(plan => [plan.id, plan])).values()];
  const plan = plans.find(item => item.id === planId);
  if (!plan?.preferences || plan.kind === 'workout') throw Error('This routine is unavailable.');
  if (name === routineName(plan)) return state;
  const active = state.block?.id === planId;
  if (active && state.activeSession) throw Error('Finish your active workout before renaming this routine.');
  const routine = { ...(plan.preferences.routine ?? editableRoutine(plan)), name };
  const previous = active && state.source ? state.source : plan.preferences;
  const preferences = { ...previous, version: previous.version + 1, routine };
  const renamed = { ...plan, id: createRuntimeId(), version: Math.max(...plans.map(item => item.version)) + 1,
    createdAt: new Date().toISOString(), preferences, sourceVersion: preferences.version };
  return { ...state, blockHistory: [...plans, renamed],
    ...(active ? { block: renamed, source: preferences } : {}) };
}
