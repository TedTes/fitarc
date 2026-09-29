import { belongsToPlan, datePlusDays } from './planDates';
import type { SessionPrescription, TrainingBlock } from './types';

/** Only finished occurrences advance a routine. Previews and missed dates do not. */
export const nextRoutineSlot = (block: TrainingBlock, sessions: SessionPrescription[], date?: string) => {
  const finished = sessions.filter(s => belongsToPlan(s, block) && s.status === 'committed' && (!date || s.context.date <= date));
  const latest = finished.map((s,index)=>({s,index})).sort((a,b)=>b.s.context.date.localeCompare(a.s.context.date)||b.index-a.index)
    .find(({s})=>block.slots.some(slot=>slot.id===s.slotId));
  const lastIndex = latest ? block.slots.findIndex(slot=>slot.id===latest.s.slotId) : -1;
  return block.slots[(lastIndex+1)%block.slots.length];
};
/** Forecast workout occurrences; repeated types retain separate positions. */
export const upcomingRoutineSlots = (block: TrainingBlock, sessions: SessionPrescription[], count: number, date?: string) => {
  const first = nextRoutineSlot(block,sessions,date);
  const start = block.slots.findIndex(slot=>slot.id===first.id);
  return Array.from({length:Math.max(0,count)},(_,i)=>block.slots[(start+i)%block.slots.length]);
};

export const scheduledOccurrences = (block: TrainingBlock, sessions: SessionPrescription[], week: number) => {
  const start = datePlusDays(block.startedOn,(week-1)*7), end = datePlusDays(start,7);
  const inWeek = sessions.filter(s=>belongsToPlan(s,block) && s.context.date>=start && s.context.date<end);
  const finished = inWeek.filter(s=>s.status==='committed');
  const open = inWeek.filter(s=>s.status!=='committed');
  const remaining = block.remainingWeek?.week===week ? block.remainingWeek : undefined;
  if (remaining) {
    const planned = remaining.windows.filter(w=>!finished.some(s=>s.context.date===w.date) && !open.some(s=>s.context.date===w.date))
      .flatMap(w=>{const slot=block.slots.find(s=>s.id===w.slotId);return slot?[{slot,workout:w.workout}]:[];});
    return [...open.flatMap(workout=>{const slot=block.slots.find(s=>s.id===workout.slotId);return slot?[{slot,workout}]:[];}),...planned];
  }
  const count = Math.max(0,(block.preferences?.daysPerWeek ?? block.slots.length)-finished.length);
  const forecastSessions = [...sessions.filter(s=>s.context.date<end),...open.map(s=>({...s,status:'committed' as const}))];
  const slots = upcomingRoutineSlots(block,forecastSessions,Math.max(0,count-open.length),datePlusDays(end,-1));
  return [...open.flatMap(workout=>{const slot=block.slots.find(s=>s.id===workout.slotId);return slot?[{slot,workout}]:[];}),...slots.map(slot=>({slot,workout:undefined}))];
};
