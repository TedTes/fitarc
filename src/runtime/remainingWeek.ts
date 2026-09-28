import { createRuntimeId } from './id';
import { belongsToPlan, datePlusDays, dayNumber, localDate, planWeek } from './planDates';
import { solveSession } from './sessionSolver';
import { computeWeeklyStatus } from './status';
import { secondaryMuscleCredit } from './trainingPolicy';
import type { RuntimeState, SessionContext, TrainingBlock } from './types';

export type WeekProposal = { fromPlanId: string; evidence: string; plan: TrainingBlock; explanation: string[] };
const evidence = (state: RuntimeState) => JSON.stringify({ source: state.source, sessions: state.sessions, plan: state.block });
export const remainingDates = (plan: TrainingBlock, today = localDate()) => {
  const end = datePlusDays(plan.startedOn, planWeek(plan, today) * 7);
  return Array.from({ length: Math.max(0, Math.min(7, dayNumber(end) - dayNumber(today))) }, (_, i) => datePlusDays(today, i));
};

/** Produces a forecast only. No sessions or results are written until the user starts a workout. */
export const previewRemainingWeek = (state: RuntimeState, availability: SessionContext[], today = localDate()): WeekProposal => {
  if (!state.source || !state.block) throw new Error('Create a plan before changing your week.');
  if (state.activeSession) throw new Error('Finish or discard your active workout before changing the week.');
  const week = planWeek(state.block, today);
  const dates = remainingDates(state.block, today);
  if (new Set(availability.map((item) => item.date)).size !== availability.length) throw new Error('Choose each date once.');
  availability.forEach((item) => {
    if (!dates.includes(item.date) || !Number.isInteger(item.minutesAvailable) || item.minutesAvailable < 10 || item.minutesAvailable > 180
      || !['yes', 'meh', 'no'].includes(item.recovery)) throw new Error('Choose a remaining date and 10–180 minutes per workout.');
  });
  const plan: TrainingBlock = { ...state.block, id: createRuntimeId(), groupId: state.block.groupId ?? state.block.id,
    version: state.block.version + 1, currentWeek: week, preferences: JSON.parse(JSON.stringify(state.source)),
    sourceVersion: state.source.version, createdAt: new Date().toISOString(), remainingWeek: undefined };
  const status = computeWeeklyStatus(plan, state.sessions, state.setResults, week);
  const start = datePlusDays(plan.startedOn, (week - 1) * 7);
  const end = datePlusDays(start, 7);
  const finished = state.sessions.filter((item) => belongsToPlan(item, plan) && item.status === 'committed' && item.context.date >= start && item.context.date < end);
  const used = new Set(finished.map((item) => item.slotId));
  const slots = plan.slots.filter((item) => !used.has(item.id));
  if (availability.length > slots.length) throw new Error(`Choose at most ${slots.length} remaining workout days.`);
  const forecast = { ...status, muscles: status.muscles.map((item) => ({ ...item })) };
  const windows = [...availability].sort((a,b) => a.date.localeCompare(b.date)).map((context) => {
    if (finished.some((item) => item.context.date === context.date)) throw new Error('A workout is already finished on that date. Choose another day.');
    const deficit = (slot: typeof slots[number]) => slot.targetMuscles.reduce((sum, muscle) => {
      const value = forecast.muscles.find((item) => item.muscle === muscle)!;
      return sum + Math.max(0, value.min - value.completedSets);
    }, 0);
    const slot = slots.filter((item) => !used.has(item.id)).sort((a,b) => deficit(b)-deficit(a) || a.dayIndex-b.dayIndex)[0];
    const workout = solveSession({ source: state.source!, block: plan, context, workingSets: state.workingSets,
      weeklyStatus: forecast, phaseOverride: status.deloadRecommended ? plan.phases.find((phase) => phase.kind === 'deload') : undefined, slotIndex: plan.slots.indexOf(slot) });
    if (!workout.exercises.length) throw new Error(`No suitable workout fits ${context.date}. Change its equipment or time, or remove that day.`);
    used.add(slot.id);
    workout.exercises.forEach((entry) => forecast.muscles.forEach((item) => {
      const credit = entry.exercise.primaryMuscles.includes(item.muscle) ? 1 : entry.exercise.secondaryMuscles.includes(item.muscle) ? secondaryMuscleCredit : 0;
      item.completedSets += entry.sets.length * credit;
    }));
    return { ...context, slotId: slot.id, workout };
  });
  const short = forecast.muscles.filter((item) => item.completedSets < item.min).map((item) => item.muscle);
  const explanation = [
    `${finished.length} completed workout${finished.length === 1 ? '' : 's'} kept. ${windows.length} remaining workout${windows.length === 1 ? '' : 's'} planned.`,
    'Prioritizes muscle groups below their weekly targets while keeping compatible exercises. Missed work is not doubled.',
    ...(availability.some((item) => item.recovery !== 'yes') ? ['Set counts are reduced for the recovery you reported.'] : []),
    ...(availability.some((item) => item.unavailableEquipment.length) ? ['Workouts use only the equipment available on each selected day.'] : []),
    short.length ? `With this availability, these muscle groups are projected below their weekly targets: ${short.join(', ')}.` : 'The remaining workouts are projected to cover your weekly minimums.',
    'Forecast assumes planned sets are completed at the target effort. Next week keeps your usual schedule.',
  ];
  plan.remainingWeek = { week, windows, explanation };
  return { fromPlanId: state.block.id, evidence: evidence(state), plan, explanation };
};

export const applyRemainingWeek = (state: RuntimeState, proposal: WeekProposal): RuntimeState => {
  if (state.activeSession || state.block?.id !== proposal.fromPlanId || evidence(state) !== proposal.evidence) throw new Error('Your training changed. Preview the remaining week again.');
  return { ...state, block: proposal.plan, blockHistory: [...(state.blockHistory ?? []).filter((item) => item.id !== state.block!.id), state.block!], lastBlockDiff: proposal.explanation };
};
