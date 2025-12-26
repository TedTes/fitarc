import { StrengthSnapshot, WorkoutLog, LiftId, MuscleGroup, MovementPattern } from '../types/domain';

export type StrengthTrendView = {
  key: LiftId;
  lift: string;
  weights: number[];
  glyph: string;
  deltaLbs: number;
  deltaPercent: number;
};

export type VolumeEntryView = {
  key: MuscleGroup;
  group: string;
  sets: number;
};

export type MovementPatternView = {
  key: MovementPattern;
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

export type TrackingLabelMaps = {
  lifts?: Record<string, string>;
  movements?: Record<string, string>;
  muscles?: Record<string, string>;
};

const GLYPH_STEPS = ['▂', '▃', '▅', '▆', '█'];

const getLabel = (labels: Record<string, string> | undefined, key: string) =>
  labels?.[key] ?? key;

const getAllowedKeys = (
  labels: Record<string, string> | undefined,
  observed: string[]
) => {
  const preferred = labels && Object.keys(labels).length ? Object.keys(labels) : null;
  const base = preferred ?? observed;
  return Array.from(new Set(base));
};

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

export const buildStrengthTrends = (
  snapshots: StrengthSnapshot[],
  labelMaps?: TrackingLabelMaps
): StrengthTrendView[] => {
  const grouped = snapshots.reduce<Record<LiftId, StrengthSnapshot[]>>((acc, snapshot) => {
    if (!snapshot.lift) {
      return acc;
    }
    acc[snapshot.lift] = [...(acc[snapshot.lift] || []), snapshot];
    return acc;
  }, {} as Record<LiftId, StrengthSnapshot[]>);

  const observedLifts = Object.keys(grouped);
  const allowedLifts = getAllowedKeys(labelMaps?.lifts, observedLifts);

  return (allowedLifts as LiftId[])
    .filter((lift) => grouped[lift])
    .map((lift) => {
      const history = grouped[lift]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-5);
      const weights = history.map((entry) => entry.weight);
      const deltaLbs = weights.length > 1 ? weights[weights.length - 1] - weights[0] : 0;
      const deltaPercent =
        weights.length > 1 ? Math.round((deltaLbs / Math.max(weights[0], 1)) * 100) : 0;
      return {
        key: lift,
        lift: getLabel(labelMaps?.lifts, lift),
        weights,
        glyph: buildGlyph(weights),
        deltaLbs,
        deltaPercent,
      };
    });
};

export const buildWeeklyVolumeSummary = (
  workoutLogs: WorkoutLog[],
  labelMaps?: TrackingLabelMaps
): VolumeEntryView[] => {
  const observedMuscles = workoutLogs.flatMap((log) => Object.keys(log.muscleVolume));
  const allowedMuscles = getAllowedKeys(labelMaps?.muscles, observedMuscles);

  if (!workoutLogs.length) {
    return allowedMuscles.map((group) => ({
      key: group as MuscleGroup,
      group: getLabel(labelMaps?.muscles, group),
      sets: 0,
    }));
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 28);
  const totals = createZeroVolume(allowedMuscles as MuscleGroup[]);

  workoutLogs
    .filter((log) => new Date(log.date) >= cutoff)
    .forEach((log) => {
      (Object.keys(log.muscleVolume) as MuscleGroup[]).forEach((group) => {
        if (totals[group] !== undefined) {
          totals[group] += log.muscleVolume[group] || 0;
        }
      });
    });

  return (Object.keys(totals) as MuscleGroup[])
    .map((group) => ({
      key: group,
      group: getLabel(labelMaps?.muscles, group),
      sets: Math.round(totals[group]),
    }))
    .sort(sortDesc);
};

export const buildMovementBalanceSummary = (
  workoutLogs: WorkoutLog[],
  labelMaps?: TrackingLabelMaps
): MovementPatternView[] => {
  const observedMovements = workoutLogs.flatMap((log) => Object.keys(log.movementPatterns));
  const allowedMovements = getAllowedKeys(labelMaps?.movements, observedMovements);

  if (!workoutLogs.length) {
    return allowedMovements.map((pattern) => ({
      key: pattern as MovementPattern,
      name: getLabel(labelMaps?.movements, pattern),
      sessions: 0,
    }));
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const totals = createZeroVolume(allowedMovements as MovementPattern[]);

  workoutLogs
    .filter((log) => new Date(log.date) >= cutoff)
    .forEach((log) => {
      (Object.keys(log.movementPatterns) as MovementPattern[]).forEach((pattern) => {
        if (totals[pattern] !== undefined) {
          totals[pattern] += log.movementPatterns[pattern] || 0;
        }
      });
    });

  return (Object.keys(totals) as MovementPattern[])
    .map((pattern) => ({
      key: pattern,
      name: getLabel(labelMaps?.movements, pattern),
      sessions: Math.round(totals[pattern]),
    }))
    .sort((a, b) => b.sessions - a.sessions);
};

export const buildLiftHistory = (
  snapshots: StrengthSnapshot[],
  lift: LiftId,
  labelMaps?: TrackingLabelMaps
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
    title: `${getLabel(labelMaps?.lifts, lift)} - 12 Week History`,
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