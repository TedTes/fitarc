import { StrengthSnapshot, WorkoutLog, LiftId, MuscleGroup, MovementPattern } from '../types/domain';

export type StrengthTrendView = {
  lift: string;
  weights: number[];
  glyph: string;
  deltaLbs: number;
  deltaPercent: number;
};

export type VolumeEntryView = {
  group: string;
  sets: number;
};

export type MovementPatternView = {
  name: string;
  sessions: number;
};

export type LiftHistoryView = {
  title: string;
  sparkline: string;
  startWeight: number;
  endWeight: number;
  repHistory: { week: number; reps: number[] }[];
  insight: string;
};

const LIFT_LABELS: Record<LiftId, string> = {
  bench_press: 'Bench Press',
  squat: 'Squat',
  deadlift: 'Deadlift',
};

const MOVEMENT_LABELS: Record<MovementPattern, string> = {
  squat: 'Squat',
  hinge: 'Hinge',
  horizontal_push: 'H. Push',
  vertical_push: 'V. Push',
  horizontal_pull: 'H. Pull',
  vertical_pull: 'V. Pull',
};

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
};

const GLYPH_STEPS = ['▂', '▃', '▅', '▆', '█'];

const buildGlyph = (values: number[]): string => {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value) => {
      const normalized = (value - min) / range;
      const index = Math.min(GLYPH_STEPS.length - 1, Math.floor(normalized * GLYPH_STEPS.length));
      return GLYPH_STEPS[index];
    })
    .join('');
};

const createZeroVolume = <T extends string>(keys: T[]): Record<T, number> =>
  keys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as Record<T, number>);

const sortDesc = (a: VolumeEntryView, b: VolumeEntryView) => b.sets - a.sets;

export const buildStrengthTrends = (snapshots: StrengthSnapshot[]): StrengthTrendView[] => {
  const grouped = snapshots.reduce<Record<LiftId, StrengthSnapshot[]>>((acc, snapshot) => {
    if (!snapshot.lift) {
      return acc;
    }
    acc[snapshot.lift] = [...(acc[snapshot.lift] || []), snapshot];
    return acc;
  }, {} as Record<LiftId, StrengthSnapshot[]>);

  return (Object.keys(grouped) as LiftId[]).map((lift) => {
    const history = grouped[lift]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-5);
    const weights = history.map((entry) => entry.weight);
    const deltaLbs = weights.length > 1 ? weights[weights.length - 1] - weights[0] : 0;
    const deltaPercent =
      weights.length > 1 ? Math.round((deltaLbs / Math.max(weights[0], 1)) * 100) : 0;
    return {
      lift: LIFT_LABELS[lift],
      weights,
      glyph: buildGlyph(weights),
      deltaLbs,
      deltaPercent,
    };
  });
};

export const buildWeeklyVolumeSummary = (workoutLogs: WorkoutLog[]): VolumeEntryView[] => {
  if (!workoutLogs.length) {
    return [
      { group: 'Chest', sets: 0 },
      { group: 'Back', sets: 0 },
      { group: 'Legs', sets: 0 },
      { group: 'Shoulders', sets: 0 },
      { group: 'Arms', sets: 0 },
    ];
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 28);
  const totals = createZeroVolume(Object.keys(MUSCLE_LABELS) as MuscleGroup[]);

  workoutLogs
    .filter((log) => new Date(log.date) >= cutoff)
    .forEach((log) => {
      (Object.keys(log.muscleVolume) as MuscleGroup[]).forEach((group) => {
        totals[group] += log.muscleVolume[group] || 0;
      });
    });

  return (Object.keys(totals) as MuscleGroup[])
    .map((group) => ({
      group: MUSCLE_LABELS[group],
      sets: Math.round(totals[group]),
    }))
    .sort(sortDesc);
};

export const buildMovementBalanceSummary = (workoutLogs: WorkoutLog[]): MovementPatternView[] => {
  if (!workoutLogs.length) {
    return (Object.keys(MOVEMENT_LABELS) as MovementPattern[]).map((pattern) => ({
      name: MOVEMENT_LABELS[pattern],
      sessions: 0,
    }));
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const totals = createZeroVolume(Object.keys(MOVEMENT_LABELS) as MovementPattern[]);

  workoutLogs
    .filter((log) => new Date(log.date) >= cutoff)
    .forEach((log) => {
      (Object.keys(log.movementPatterns) as MovementPattern[]).forEach((pattern) => {
        totals[pattern] += log.movementPatterns[pattern] || 0;
      });
    });

  return (Object.keys(totals) as MovementPattern[])
    .map((pattern) => ({
      name: MOVEMENT_LABELS[pattern],
      sessions: Math.round(totals[pattern]),
    }))
    .sort((a, b) => b.sessions - a.sessions);
};

export const buildLiftHistory = (
  snapshots: StrengthSnapshot[],
  lift: LiftId
): LiftHistoryView => {
  const history = snapshots
    .filter((snapshot) => snapshot.lift === lift)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-12);

  const weights = history.map((entry) => entry.weight);
  const startWeight = weights[0] || 0;
  const endWeight = weights[weights.length - 1] || 0;
  const sparkline = buildGlyph(weights);

  const repHistory = history.slice(-4).map((entry, index) => ({
    week: history.length - 4 + index + 1,
    reps: [entry.reps, Math.max(entry.reps - 1, 1), Math.max(entry.reps - 2, 1)],
  }));

  const delta = endWeight - startWeight;
  const insight =
    delta > 0
      ? `You've added ${delta} lbs recently. Consider adding 5 lbs next week.`
      : 'Keep building consistency to unlock more progress.';

  return {
    title: `${LIFT_LABELS[lift]} - 12 Week History`,
    sparkline,
    startWeight,
    endWeight,
    repHistory,
    insight,
  };
};

export const getOverallStrengthDelta = (trends: StrengthTrendView[]): number => {
  if (!trends.length) return 0;
  const total = trends.reduce((sum, trend) => sum + trend.deltaPercent, 0);
  return Math.round(total / trends.length);
};
