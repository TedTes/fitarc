import { scheduledOccurrences } from './sequence';
import { belongsToPlan } from './planDates';
import { hardSetCredit, MUSCLES, secondaryMuscleCredit } from './trainingPolicy';
import { RUNTIME_EXERCISES } from './exerciseCatalog';
import type { ExerciseDiff, SessionDiff, SessionPrescription, SetResult, TrainingBlock, WeeklyStatus, WorkingSetState } from './types';

export const computeSessionDiff = (
  session: SessionPrescription,
  results: SetResult[],
  previous: Record<string, WorkingSetState>
): SessionDiff => {
  const exercises: ExerciseDiff[] = session.exercises.flatMap((prescribed) => {
    const completed = results.filter((result) => result.exerciseId === prescribed.exercise.id);
    if (!completed.length) return [];
    const best = completed.reduce((current, candidate) => {
      const currentScore = (current.actualLoadKg ?? current.prescribedLoadKg) * current.completedReps;
      const candidateScore = (candidate.actualLoadKg ?? candidate.prescribedLoadKg) * candidate.completedReps;
      return candidateScore > currentScore ? candidate : current;
    });
    const prior = previous[prescribed.exercise.id];
    let outcome: ExerciseDiff['outcome'] = 'held';
    let change = 'Same dose at comparable effort';
    if (prior) {
      const loadProgress = (best.actualLoadKg ?? best.prescribedLoadKg) > prior.loadKg && best.completedReps >= prior.reps - 1;
      const repProgress = (best.actualLoadKg ?? best.prescribedLoadKg) === prior.loadKg && best.completedReps > prior.reps;
      const effortProgress = (best.actualLoadKg ?? best.prescribedLoadKg) === prior.loadKg && best.completedReps === prior.reps && best.reportedRir > prior.rir;
      const stalled = best.completedReps < best.prescribedMinReps;
      if (loadProgress || repProgress || effortProgress) {
        outcome = 'progressed';
        change = loadProgress ? `+${(best.actualLoadKg ?? best.prescribedLoadKg) - prior.loadKg} kg` : repProgress ? `+${best.completedReps - prior.reps} reps` : 'More reps in reserve';
      } else if (stalled) {
        outcome = 'stalled';
        change = `${best.prescribedMinReps - best.completedReps} reps below target`;
      }
    } else {
      outcome = best.completedReps >= best.prescribedMinReps ? 'progressed' : 'stalled';
      change = outcome === 'progressed' ? 'Baseline established' : 'Target missed';
    }
    return [{
      exerciseId: prescribed.exercise.id, exerciseName: prescribed.exercise.name,
      previous: prior ? { loadKg: prior.loadKg, reps: prior.reps, rir: prior.rir } : undefined,
      current: { loadKg: (best.actualLoadKg ?? best.prescribedLoadKg), reps: best.completedReps, rir: best.reportedRir },
      outcome, change,
    }];
  });
  const progressed = exercises.filter((item) => item.outcome === 'progressed').length;
  const stalled = exercises.filter((item) => item.outcome === 'stalled').length;
  return {
    sessionId: session.id,
    outcome: stalled > progressed ? 'stalled' : progressed > 0 ? 'progressed' : 'held',
    exercises,
  };
};

export const computeWeeklyStatus = (
  block: TrainingBlock,
  sessions: SessionPrescription[],
  results: SetResult[],
  weekNumber: number = block.currentWeek
): WeeklyStatus => {
  const blockStart = new Date(`${block.startedOn}T12:00:00`);
  const weekStart = new Date(blockStart);
  weekStart.setDate(blockStart.getDate() + (weekNumber - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const weekSessions = sessions.filter((session) => {
    const date = new Date(`${session.context.date}T12:00:00`);
    return belongsToPlan(session, block)
      && date >= weekStart && date < weekEnd;
  });
  const weekSessionIds = new Set(weekSessions.map((session) => session.id));
  const weekResults = results.filter((result) => weekSessionIds.has(result.prescriptionId));
  const committedSessions = weekSessions.filter((session) => session.status === 'committed');
  const committedSlotIds = new Set(committedSessions.map((session) => session.slotId));
  const sessionsLogged = block.scheduling ? committedSessions.length : committedSlotIds.size;
  const occurrences = block.scheduling ? scheduledOccurrences(block,sessions,weekNumber) : [];
  const remaining = block.remainingWeek?.week === weekNumber ? block.remainingWeek : undefined;
  const totalSessions = block.scheduling ? sessionsLogged+occurrences.length : remaining ? new Set([...committedSlotIds, ...remaining.windows.map((item) => item.slotId)]).size : block.slots.length;
  const today = new Date();
  const weekState: WeeklyStatus['weekState'] = (!block.scheduling && sessionsLogged >= totalSessions) || today >= weekEnd ? 'complete' : 'in_progress';
  const completed = Object.fromEntries(MUSCLES.map((muscle) => [muscle, 0])) as Record<(typeof MUSCLES)[number], number>;
  let fatiguePoints = 0;
  let misses = 0;
  weekResults.forEach((result) => {
    const exercise = weekSessions.find(session=>session.id===result.prescriptionId)?.exercises.find(entry=>entry.exercise.id===result.exerciseId)?.exercise;
    if (!exercise) return;
    const credit = block.scheduling ? (result.completedReps > 0 ? 1 : 0) : hardSetCredit(result.reportedRir, result.targetRir);
    exercise.primaryMuscles.forEach((muscle) => { completed[muscle] += credit; });
    exercise.secondaryMuscles.forEach((muscle) => { completed[muscle] += credit * secondaryMuscleCredit; });
    fatiguePoints += credit * (6 - Math.min(5, result.reportedRir)) * exercise.fatigueCost;
    if (result.completedReps < result.prescribedMinReps) misses += 1;
  });
  const scheduled = Object.fromEntries(MUSCLES.map((muscle) => [muscle, 0])) as Record<(typeof MUSCLES)[number], number>;
  const scheduledEntries = block.scheduling ? occurrences : block.slots.filter((slot) => !committedSlotIds.has(slot.id) && (!remaining || remaining.windows.some((item) => item.slotId === slot.id))).map(slot=>({slot,workout:undefined as SessionPrescription | undefined}));
  scheduledEntries.forEach(({slot,workout}) => {
    const prescribed = workout ?? (!block.scheduling ? [...weekSessions].reverse().find((session) => session.slotId === slot.id && session.status !== 'committed') ?? remaining?.windows.find((item) => item.slotId === slot.id)?.workout : undefined);
    if (prescribed) {
      prescribed.exercises.forEach((entry) => {
        const remainingSets = entry.sets.filter((set) => set.status === 'pending').length;
        entry.exercise.primaryMuscles.forEach((muscle) => { scheduled[muscle] += remainingSets; });
        entry.exercise.secondaryMuscles.forEach((muscle) => { scheduled[muscle] += remainingSets * secondaryMuscleCredit; });
      });
      return;
    }
    MUSCLES.forEach((muscle) => { scheduled[muscle] += slot.muscleSetBudget[muscle] ?? 0; });
  });
  const muscles = MUSCLES.map((muscle) => {
    const target = block.weeklyTargets[muscle];
    const value = completed[muscle];
    const projectedSets = weekState === 'complete' ? value : value + scheduled[muscle];
    let state: WeeklyStatus['muscles'][number]['state'];
    if (weekState === 'complete') state = value < target.min ? 'under' : value > target.max ? 'over' : 'in_range';
    else state = projectedSets >= target.min && projectedSets <= target.max ? 'on_track' : projectedSets === 0 ? 'scheduled' : 'projected_miss';
    return {
      muscle, completedSets: value, scheduledSets: scheduled[muscle], projectedSets,
      min: target.min, max: target.max, state,
    };
  });
  const phase = block.phases.find((item) => weekNumber >= item.startWeek && weekNumber <= item.endWeek) ?? block.phases[0];
  const weeklyFatigueCapacity = Math.max(1, block.slots.reduce((slotSum, slot) => slotSum + slot.plannedExercises.reduce((sum, plan) => {
    const exercise = (block.catalog ?? RUNTIME_EXERCISES).find((candidate) => candidate.id === plan.exerciseId);
    return sum + plan.sets * (exercise?.fatigueCost ?? 1) * (6 - phase.targetRir);
  }, 0), 0));
  const fatiguePercent = Math.min(100, Math.round((fatiguePoints / weeklyFatigueCapacity) * 100));
  const repeatedMisses = misses >= 3;
  const deloadRecommended = (!block.scheduling && weekNumber >= block.durationWeeks) || (weekState === 'complete' && fatiguePercent >= 80 && repeatedMisses);
  const reasons = [
    ...(fatiguePercent >= 80 ? ['Systemic fatigue budget is above 80%.'] : []),
    ...(repeatedMisses ? ['At least three prescribed rep targets were missed.'] : []),
    ...(!block.scheduling && weekNumber >= block.durationWeeks ? ['The scheduled recovery week has arrived.'] : []),
  ];
  return {
    weekState, sessionsLogged, totalSessions, muscles, fatiguePercent,
    headroomSessions: Math.max(0, totalSessions - sessionsLogged), deloadRecommended, reasons,
  };
};
