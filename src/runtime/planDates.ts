import type { SessionPrescription, TrainingBlock } from './types';
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
export const datePlusDays = (date: string, days: number) => new Date((dayNumber(date)+days)*86400000).toISOString().slice(0,10);
export const planWeek = (plan: TrainingBlock, date = localDate()) => Math.min(plan.durationWeeks, Math.max(1,Math.floor((dayNumber(date)-dayNumber(plan.startedOn))/7)+1));
export const belongsToPlan = (session: SessionPrescription, plan: TrainingBlock) =>
  (session.planGroupId ?? session.blockId) === (plan.groupId ?? plan.id);
