import { datePlusDays } from './planDates';
import type { RuntimeState } from './types';

/** Local calendar dates; weekdays use Sunday=0 through Saturday=6. */
export type WorkoutSchedule = { weekdays: number[]; addedDates: string[]; skippedDates: string[] };
export const isWorkoutDate = (schedule: WorkoutSchedule, date: string) =>
  !schedule.skippedDates.includes(date) && (schedule.addedDates.includes(date)
    || schedule.weekdays.includes(new Date(`${date}T12:00:00`).getDay()));
export const nextWorkoutDate = (schedule: WorkoutSchedule | undefined, earliest: string): string | null => {
  if (!schedule) return earliest;
  const added = schedule.addedDates.filter(date => date >= earliest && !schedule.skippedDates.includes(date)).sort()[0];
  if (!schedule.weekdays.length) return added ?? null;
  // Every skipped date can remove at most one occurrence; this also handles long breaks.
  for (let i=0;i<7*(schedule.skippedDates.length+1);i++) {
    const date=datePlusDays(earliest,i);
    if(isWorkoutDate(schedule,date)) return added && added<date ? added : date;
  }
  return added ?? null;
};
export const toggleWorkoutDate = (schedule: WorkoutSchedule, date: string): WorkoutSchedule => {
  const selected=isWorkoutDate(schedule,date);
  return {...schedule,addedDates:[...schedule.addedDates.filter(d=>d!==date),...(!selected?[date]:[])],
    skippedDates:[...schedule.skippedDates.filter(d=>d!==date),...(selected?[date]:[])]};
};
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;
export const saveWorkoutSchedule = (state:RuntimeState,schedule:WorkoutSchedule|undefined):RuntimeState => {
  if(!state.source)throw Error('Set up your routine first.');
  if(schedule && (!schedule.weekdays.every(day=>Number.isInteger(day)&&day>=0&&day<=6)
    || ![...schedule.addedDates,...schedule.skippedDates].every(validDate)))throw Error('Choose valid workout days.');
  const clean=schedule?{weekdays:[...new Set(schedule.weekdays)].sort(),addedDates:[...new Set(schedule.addedDates)].sort(),skippedDates:[...new Set(schedule.skippedDates)].sort()}:undefined;
  const source={...state.source,workoutSchedule:clean};
  // Keep an open autosaved routine editor from restoring an older schedule later.
  if(source.routineEditor)source.routineEditor={...source.routineEditor,settings:{...source.routineEditor.settings,workoutSchedule:clean}};
  // Calendar selection supersedes a prior remaining-week date plan, never recorded sessions.
  return {...state,source,block:state.block?{...state.block,remainingWeek:undefined}:state.block};
};
