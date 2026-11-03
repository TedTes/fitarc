import type { RuntimeState, TrainingBlock } from './types';
import { compileTrainingBlock } from './runtimeService';
import { editableRoutine } from './routine';
import { localDate } from './planDates';
import { createRuntimeId } from './id';
import { pauseWorkout, resumeStyleWorkout } from './sessionSwitching';
import { currentStylePlans, trainingStyle } from './trainingStyles';

/** Restore choices as a fresh version; old plans and logged sessions remain immutable. */
export function useSavedRoutine(state:RuntimeState,planId:string):RuntimeState{
  const plans=[...new Map([...(state.blockHistory??[]),...(state.block?[state.block]:[])].map(p=>[p.id,p])).values()];
  const requested=plans.find(p=>p.id===planId);
  const plan=requested && savedRoutines(state).find(p=>trainingStyle(p.preferences)===trainingStyle(requested.preferences));
  if(!plan?.preferences||plan.kind==='workout'||!state.source)throw Error('This routine is unavailable.');
  if (plan.id === state.block?.id) return state.activeSession&&!state.activeSession.context.extraWorkout ? state : resumeStyleWorkout(pauseWorkout(state));
  const routine=editableRoutine(plan);
  // Use current equipment, limitations and performance; restore the previous exercise choices.
  const source={...state.source,version:state.source.version+1,routine};
  const updated=compileTrainingBlock({...pauseWorkout(state),block:plan},source);
  return resumeStyleWorkout({...updated,block:{...updated.block!,startedOn:localDate(),currentWeek:1},blockHistory:plans});
}

/** One current routine per training style; older snapshots remain available to history. */
export function savedRoutines(state: RuntimeState): TrainingBlock[] {
  return currentStylePlans(state.block, state.blockHistory);
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
