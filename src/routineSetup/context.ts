import type { RoutineDefinition, TrainingSource } from '../runtime/types';
import { valueOf, type RoutineDraft } from './draft';

export type RoutineInputContext = {
  split?: RoutineDefinition['split'];
  days?: TrainingSource['daysPerWeek'];
  minutes?: number;
};
export const SPLIT_LABELS:Record<RoutineDefinition['split'],string>={
  auto:'Any split',full_body:'Full body',upper_lower:'Upper / lower',push_pull_legs:'Push / pull / legs',custom:'Custom',
};

/** Deliberate chip selections override parsed metadata; unspecified context leaves it intact. */
export const applyInputContext=(draft:RoutineDraft,context:RoutineInputContext):RoutineDraft=>{
  if(context.days!==undefined&&(!Number.isInteger(context.days)||context.days<1||context.days>7))throw Error('Choose 1–7 training days.');
  if(context.minutes!==undefined&&(!Number.isInteger(context.minutes)||context.minutes<10||context.minutes>180))throw Error('Choose 10–180 minutes.');
  if(context.split!==undefined&&!Object.hasOwn(SPLIT_LABELS,context.split))throw Error('Choose a workout structure.');
  return {...draft,preferredSplit:context.split??draft.preferredSplit,
    days:context.days===undefined?draft.days:valueOf(context.days),minutes:context.minutes===undefined?draft.minutes:valueOf(context.minutes)};
};
