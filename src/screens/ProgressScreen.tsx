import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Line,
  Path,
} from 'react-native-svg';
import type {
  PhasePlan,
  StrengthSnapshot,
  TrackingPreferences,
  User,
  WorkoutLog,
  WorkoutSessionEntry,
  WorkoutSessionExercise,
  WorkoutSetEntry,
} from '../types/domain';

type ProgressScreenProps = {
  user: User;
  phase: PhasePlan;
  workoutDataVersion: number;
  workoutSessions: WorkoutSessionEntry[];
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
  onAddProgress?: () => void;
  onUpdateTrackingPreferences?: (preferences: TrackingPreferences) => Promise<void> | void;
};

type ChartRange = '1W' | '1M' | '3M';

type MuscleEntry = {
  key: string;
  name: string;
  color: string;
  totalSets: number;
  totalReps: number;
  sessionCount: number;
  lastDate: string;
};

type DailyMusclePoint = {
  id: string;
  date: string;
  label: string;
  sets: number;
  reps: number;
  weight: number | null;
  hasWeight: boolean;
};

type ChartBucket = {
  id: string;
  label: string;
  date: string;
  sets: number;
  reps: number;
  weight: number | null;
  isRest: boolean;
  hasWeight: boolean;
};

const BG = ['#07091C', '#0B0E22', '#0F1228'] as const;

const C = {
  bg: '#07091C',
  card: '#0E1225',
  text: '#FFFFFF',
  textSub: '#B8BEDC',
  textMuted: '#6B7194',
  textFaint: '#2A2F4A',
  border: 'rgba(255,255,255,0.06)',
  grid: 'rgba(255,255,255,0.05)',
  guide: 'rgba(255,255,255,0.08)',
} as const;

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#6C63FF', pectorals: '#6C63FF',
  back: '#00F5A0', lats: '#00F5A0', 'upper back': '#00F5A0', 'lower back': '#00CE86',
  traps: '#00CE86', rhomboids: '#00CE86',
  shoulders: '#FFC442', delts: '#FFC442',
  'front delt': '#FFC442', 'side delt': '#FFC442', 'rear delt': '#FFC442',
  'front delts': '#FFC442', 'lateral delts': '#FFC442', 'rear delts': '#FFC442',
  biceps: '#FF6B6B', triceps: '#FF8E6E', forearms: '#FFAA8E',
  quads: '#FF8C42', quadriceps: '#FF8C42',
  hamstrings: '#E07A35', glutes: '#D46A30',
  calves: '#C05A20', legs: '#FF8C42',
  core: '#42C5F5', abs: '#42C5F5', obliques: '#35A8D8',
  arms: '#FF6B6B',
};

const CHART_TOP_PAD = 26;
const CHART_BOTTOM_PAD = 30;
const CHART_X_LABEL_PAD = 30;
const CHART_H = 188;
const CHART_TOTAL_H = CHART_TOP_PAD + CHART_H + CHART_BOTTOM_PAD + CHART_X_LABEL_PAD;
const Y_AXIS_W = 52;
const CHART_SIDE_PAD = 12;

function muscleColor(key: string): string {
  return MUSCLE_COLORS[key.toLowerCase().trim()] ?? '#8B93B5';
}

function capitalizeMuscle(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function countCompletedSetDetails(setDetails?: WorkoutSetEntry[]): WorkoutSetEntry[] {
  return (setDetails ?? []).filter((set) => {
    const reps = Number(set.reps ?? 0);
    const weight = Number(set.weight ?? 0);
    const rpe = Number(set.rpe ?? 0);
    return reps > 0 || weight > 0 || rpe > 0;
  });
}

function countSets(ex: WorkoutSessionExercise): number {
  const completed = countCompletedSetDetails(ex.setDetails);
  if (completed.length > 0) return completed.length;
  return ex.completed ? ex.sets ?? 0 : 0;
}

function inferMusclesFromName(name: string): string[] {
  const result = new Set<string>();
  const n = name.toLowerCase();
  if (/bench|chest|fly|pec|push.?up|dip/.test(n)) result.add('chest');
  if (/row|pulldown|pull.?up|lat|back/.test(n)) result.add('back');
  if (/squat|lunge|leg press|quad|hamstring|glute|hip thrust|calf|step.?up|leg curl|leg extension/.test(n)) result.add('legs');
  if (/shoulder|delt|overhead|military|lateral raise|front raise|upright/.test(n)) result.add('shoulders');
  if (/curl|tricep|bicep|extension|pushdown|skull|close.?grip/.test(n)) result.add('arms');
  if (/\babs?\b|crunch|plank|oblique|core|sit.?up|russian twist/.test(n)) result.add('core');
  if (/deadlift|rdl/.test(n)) {
    result.add('back');
    result.add('legs');
  }
  if (/push.?up|dip/.test(n)) {
    result.add('chest');
    result.add('arms');
  }
  if (/row|pull.?up|pulldown/.test(n)) {
    result.add('back');
    result.add('arms');
  }
  return Array.from(result);
}

function getExerciseMuscles(ex: WorkoutSessionExercise): string[] {
  return ex.bodyParts && ex.bodyParts.length > 0 ? ex.bodyParts : inferMusclesFromName(ex.name);
}

function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeekMonday(date: Date): Date {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(12, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function shortDate(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatWeekLabel(date: Date): string {
  return `W ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}`;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short' });
}

function lastTrainedLabel(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  const today = new Date();
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff <= 6) return `${diff}d ago`;
  return shortDate(dateStr);
}

function formatWeightLabel(value: number): string {
  const rounded = Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded}kg`;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const safe = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const value = parseInt(safe, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function computeAllMuscles(sessions: WorkoutSessionEntry[]): MuscleEntry[] {
  const totals: Record<string, number> = {};
  const repsTotals: Record<string, number> = {};
  const sessIds: Record<string, Set<string>> = {};
  const lastDates: Record<string, string> = {};

  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const setCount = countSets(exercise);
      if (setCount <= 0) continue;

      const completedSets = countCompletedSetDetails(exercise.setDetails);
      const reps = completedSets.length > 0
        ? completedSets.reduce((sum, set) => sum + Number(set.reps ?? 0), 0)
        : exercise.completed
          ? (exercise.sets ?? 0) * Number(String(exercise.reps ?? '0').match(/\d+/)?.[0] ?? 0)
          : 0;

      for (const muscle of getExerciseMuscles(exercise)) {
        const key = muscle.toLowerCase().trim();
        totals[key] = (totals[key] ?? 0) + setCount;
        repsTotals[key] = (repsTotals[key] ?? 0) + reps;
        if (!sessIds[key]) sessIds[key] = new Set();
        sessIds[key].add(session.id);
        if (!lastDates[key] || session.date > lastDates[key]) {
          lastDates[key] = session.date;
        }
      }
    }
  }

  return Object.entries(totals)
    .map(([key, totalSets]) => ({
      key,
      name: capitalizeMuscle(key),
      color: muscleColor(key),
      totalSets,
      totalReps: repsTotals[key] ?? 0,
      sessionCount: sessIds[key]?.size ?? 0,
      lastDate: lastDates[key] ?? '',
    }))
    .sort((a, b) => b.totalSets - a.totalSets);
}

function computeDailyMuscleHistory(
  sessions: WorkoutSessionEntry[],
  muscleKey: string,
): DailyMusclePoint[] {
  const byDate = new Map<string, DailyMusclePoint>();

  for (const session of sessions) {
    let bestWeighted: DailyMusclePoint | null = null;
    let bestUnweighted: DailyMusclePoint | null = null;

    for (const exercise of session.exercises) {
      const muscles = getExerciseMuscles(exercise).map((m) => m.toLowerCase().trim());
      if (!muscles.includes(muscleKey)) continue;

      const setCount = countSets(exercise);
      if (setCount <= 0) continue;

      const completedSets = countCompletedSetDetails(exercise.setDetails);
      const totalReps = completedSets.length > 0
        ? completedSets.reduce((sum, set) => sum + Number(set.reps ?? 0), 0)
        : exercise.completed
          ? (exercise.sets ?? 0) * Number(String(exercise.reps ?? '0').match(/\d+/)?.[0] ?? 0)
          : 0;

      if (completedSets.length > 0) {
        const bestSet = completedSets.reduce((best, candidate) => {
          const bestWeight = Number(best.weight ?? 0);
          const candidateWeight = Number(candidate.weight ?? 0);
          if (candidateWeight !== bestWeight) {
            return candidateWeight > bestWeight ? candidate : best;
          }
          return Number(candidate.reps ?? 0) > Number(best.reps ?? 0) ? candidate : best;
        }, completedSets[0]);

        const bestWeight = Number(bestSet.weight ?? 0);
        const bestReps = Number(bestSet.reps ?? 0);
        const candidate: DailyMusclePoint = {
          id: `${session.id}:${exercise.exerciseId ?? exercise.name}`,
          date: session.date,
          label: shortDate(session.date),
          sets: setCount,
          reps: totalReps > 0 ? totalReps : bestReps,
          weight: bestWeight > 0 ? bestWeight : null,
          hasWeight: bestWeight > 0,
        };

        if (bestWeight > 0) {
          if (
            !bestWeighted ||
            bestWeight > (bestWeighted.weight ?? 0) ||
            (bestWeight === (bestWeighted.weight ?? 0) && candidate.reps > bestWeighted.reps)
          ) {
            bestWeighted = candidate;
          }
        } else if (
          !bestUnweighted ||
          setCount > bestUnweighted.sets ||
          (setCount === bestUnweighted.sets && candidate.reps > bestUnweighted.reps)
        ) {
          bestUnweighted = candidate;
        }
      } else {
        const candidate: DailyMusclePoint = {
          id: `${session.id}:${exercise.exerciseId ?? exercise.name}`,
          date: session.date,
          label: shortDate(session.date),
          sets: setCount,
          reps: totalReps,
          weight: null,
          hasWeight: false,
        };
        if (
          !bestUnweighted ||
          setCount > bestUnweighted.sets ||
          (setCount === bestUnweighted.sets && candidate.reps > bestUnweighted.reps)
        ) {
          bestUnweighted = candidate;
        }
      }
    }

    const chosen = bestWeighted ?? bestUnweighted;
    if (!chosen) continue;

    const existing = byDate.get(session.date);
    if (existing) {
      const existingWeight = existing.weight ?? 0;
      const chosenWeight = chosen.weight ?? 0;
      if (
        (chosen.hasWeight && !existing.hasWeight) ||
        chosenWeight > existingWeight ||
        (chosenWeight === existingWeight && chosen.reps > existing.reps)
      ) {
        byDate.set(session.date, chosen);
      }
    } else {
      byDate.set(session.date, chosen);
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function pickRepresentativeBucketPoint(points: DailyMusclePoint[]): DailyMusclePoint | null {
  if (points.length === 0) return null;
  return [...points].sort((a, b) => {
    const aWeight = a.weight ?? 0;
    const bWeight = b.weight ?? 0;
    if (b.hasWeight !== a.hasWeight) return Number(b.hasWeight) - Number(a.hasWeight);
    if (bWeight !== aWeight) return bWeight - aWeight;
    if (b.sets !== a.sets) return b.sets - a.sets;
    if (b.reps !== a.reps) return b.reps - a.reps;
    return b.date.localeCompare(a.date);
  })[0];
}

function buildChartBuckets(points: DailyMusclePoint[], range: ChartRange): ChartBucket[] {
  const anchorDate = points.length > 0 ? parseDate(points[points.length - 1].date) : new Date();

  if (range === '1W') {
    const weekStart = startOfWeekMonday(anchorDate);

    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const dateKey = formatDateKey(date);
      const match = points.find((point) => point.date === dateKey) ?? null;
      return {
        id: dateKey,
        label: date.toLocaleDateString('en-US', { weekday: 'short' }),
        date: dateKey,
        sets: match?.sets ?? 0,
        reps: match?.reps ?? 0,
        weight: match?.weight ?? null,
        isRest: !match,
        hasWeight: match?.hasWeight ?? false,
      };
    });
  }

  if (range === '1M') {
    const weekStart = startOfWeekMonday(anchorDate);

    return Array.from({ length: 4 }, (_, index) => {
      const bucketStart = addDays(weekStart, (index - 3) * 7);
      const bucketEnd = addDays(bucketStart, 7);
      const bucketPoints = points.filter(
        (point) => point.date >= formatDateKey(bucketStart) && point.date < formatDateKey(bucketEnd),
      );
      const representative = pickRepresentativeBucketPoint(bucketPoints);
      const dateKey = formatDateKey(bucketStart);
      return {
        id: dateKey,
        label: formatWeekLabel(bucketStart),
        date: dateKey,
        sets: representative?.sets ?? 0,
        reps: representative?.reps ?? 0,
        weight: representative?.weight ?? null,
        isRest: !representative,
        hasWeight: representative?.hasWeight ?? false,
      };
    });
  }

  const monthStart = startOfMonth(anchorDate);

  return Array.from({ length: 3 }, (_, index) => {
    const bucketStart = addMonths(monthStart, index - 2);
    const bucketEnd = addMonths(bucketStart, 1);
    const bucketPoints = points.filter(
      (point) => point.date >= formatDateKey(bucketStart) && point.date < formatDateKey(bucketEnd),
    );
    const representative = pickRepresentativeBucketPoint(bucketPoints);
    const dateKey = `${bucketStart.getFullYear()}-${String(bucketStart.getMonth() + 1).padStart(2, '0')}`;
    return {
      id: dateKey,
      label: formatMonthLabel(bucketStart),
      date: formatDateKey(bucketStart),
      sets: representative?.sets ?? 0,
      reps: representative?.reps ?? 0,
      weight: representative?.weight ?? null,
      isRest: !representative,
      hasWeight: representative?.hasWeight ?? false,
    };
  });
}

function buildLinePath(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function formatYAxisValue(value: number): string {
  return formatWeightLabel(value);
}

function getRangeSubtitle(range: ChartRange): string {
  if (range === '1W') return 'Recent performance';
  if (range === '1M') return 'Weekly strength trend';
  return 'Monthly progress trend';
}

function ProgressChart({
  data,
  color,
  range,
}: {
  data: ChartBucket[];
  color: string;
  range: ChartRange;
}) {
  const [chartWidth, setChartWidth] = useState(0);

  if (data.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyText}>No sessions logged for this muscle yet.</Text>
      </View>
    );
  }

  const actualWeights = data
    .filter((point) => !point.isRest && point.hasWeight && typeof point.weight === 'number' && point.weight > 0)
    .map((point) => point.weight as number);

  const minActual = actualWeights.length > 0 ? Math.min(...actualWeights) : 0;
  const maxActual = actualWeights.length > 0 ? Math.max(...actualWeights) : 0;
  const spread = Math.max(6, maxActual - minActual);
  const pad = Math.max(3, Math.ceil(spread * 0.18));
  const minDomain = actualWeights.length > 0 ? Math.max(0, Math.floor((minActual - pad) / 5) * 5) : 0;
  const maxDomain = actualWeights.length > 0 ? Math.ceil((maxActual + pad) / 5) * 5 : 100;
  const midDomain = minDomain + (maxDomain - minDomain) / 2;
  const domainSpan = Math.max(maxDomain - minDomain, 1);
  const baselineY = CHART_TOP_PAD + CHART_H;
  const midY = CHART_TOP_PAD + CHART_H / 2;
  const lastActualIndex = data.map((point) => !point.isRest && point.hasWeight).lastIndexOf(true);

  const geometry = useMemo(() => {
    if (chartWidth <= 0) return [];
    const innerWidth = Math.max(chartWidth - CHART_SIDE_PAD * 2, 1);
    const slotWidth = data.length > 1 ? innerWidth / (data.length - 1) : 0;
    let lastKnownWeightedY = midY;

    const initialKnownPoint = data.find((point) => point.hasWeight && point.weight != null);
    if (initialKnownPoint?.weight != null) {
      lastKnownWeightedY = CHART_TOP_PAD + ((maxDomain - initialKnownPoint.weight) / domainSpan) * CHART_H;
    }

    return data.map((point, index) => {
      const x = CHART_SIDE_PAD + (data.length === 1 ? innerWidth / 2 : slotWidth * index);
      let y = midY;

      if (!point.isRest && point.hasWeight && point.weight != null) {
        y = CHART_TOP_PAD + ((maxDomain - point.weight) / domainSpan) * CHART_H;
        lastKnownWeightedY = y;
      } else if (!point.isRest || range !== '1W') {
        y = lastKnownWeightedY;
      }

      return {
        ...point,
        index,
        x,
        y,
        isHighlight: index === lastActualIndex && !point.isRest && point.hasWeight,
      };
    });
  }, [chartWidth, data, domainSpan, lastActualIndex, maxDomain, midY, range]);

  const lineSegments = useMemo(() => {
    if (geometry.length === 0) return [];
    if (range !== '1W') {
      return [
        geometry.map(({ x, y }) => ({ x, y })),
      ].filter((segment) => segment.length > 1);
    }
    return [
      geometry
        .filter((point) => !point.isRest)
        .map(({ x, y }) => ({ x, y })),
    ].filter((segment) => segment.length > 1);
  }, [geometry, range]);

  return (
    <View style={styles.chartOuter}>
      <View style={styles.chartInner}>
        <View style={styles.yAxis}>
          {[maxDomain, midDomain, minDomain].map((tick, index) => (
            <Text
              key={`${tick}-${index}`}
              style={[styles.yLabel, index === 2 && { color: C.textFaint }]}
            >
              {formatYAxisValue(tick)}
            </Text>
          ))}
        </View>

        <View style={styles.chartCanvasWrap} onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}>
          {chartWidth > 0 ? (
            <>
              <Svg width={chartWidth} height={CHART_TOTAL_H}>
                <Line x1={0} y1={CHART_TOP_PAD} x2={chartWidth} y2={CHART_TOP_PAD} stroke={C.grid} strokeWidth={1} />
                <Line x1={0} y1={midY} x2={chartWidth} y2={midY} stroke={C.grid} strokeWidth={1} />
                <Line x1={0} y1={baselineY} x2={chartWidth} y2={baselineY} stroke={C.grid} strokeWidth={1} />

                {range === '1W'
                  ? geometry.map((point) => (
                    <Line
                      key={`guide-${point.id}`}
                      x1={point.x}
                      y1={CHART_TOP_PAD}
                      x2={point.x}
                      y2={baselineY}
                      stroke={C.guide}
                      strokeWidth={1}
                    />
                  ))
                  : null}

                {lineSegments.map((segment, index) => (
                  <React.Fragment key={`segment-${index}`}>
                    <Path
                      d={buildLinePath(segment)}
                      stroke={hexToRgba(color, 0.9)}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </React.Fragment>
                ))}

                {geometry.map((point) => {
                  if (point.isRest) {
                    return (
                      <Circle
                        key={point.id}
                        cx={point.x}
                        cy={point.y}
                        r={4}
                        fill={C.card}
                        stroke={hexToRgba(C.textMuted, 0.7)}
                        strokeWidth={1.5}
                      />
                    );
                  }

                  if (!point.hasWeight) {
                    return (
                      <Circle
                        key={point.id}
                        cx={point.x}
                        cy={point.y}
                        r={4.5}
                        fill={point.isHighlight ? color : hexToRgba(color, 0.9)}
                        stroke={point.isHighlight ? color : hexToRgba(color, 0.65)}
                        strokeWidth={1.75}
                      />
                    );
                  }

                  const radius = point.isHighlight ? 6 : 4.5;
                  return (
                    <Circle
                      key={point.id}
                      cx={point.x}
                      cy={point.y}
                      r={radius}
                      fill={point.isHighlight ? color : hexToRgba(color, 0.9)}
                      stroke={point.isHighlight ? color : hexToRgba(color, 0.65)}
                      strokeWidth={point.isHighlight ? 2.5 : 2}
                    />
                  );
                })}
              </Svg>

              <View pointerEvents="none" style={styles.chartOverlay}>
                {geometry.map((point) => {
                  if (point.isRest) return null;
                  const labelColor = point.isHighlight ? color : C.textMuted;
                  return (
                    <React.Fragment key={`labels-${point.id}`}>
                      <Text
                        style={[
                          styles.pointLabelTop,
                          { left: point.x - 26, top: Math.max(0, point.y - 24), color: labelColor },
                        ]}
                      >
                        {`${point.sets}×${point.reps}`}
                      </Text>
                      <Text
                        style={[
                          styles.pointLabelBottom,
                          { left: point.x - 26, top: Math.min(baselineY + 6, point.y + 10), color: labelColor },
                        ]}
                      >
                        {point.hasWeight && point.weight != null ? formatWeightLabel(point.weight) : 'No wt'}
                      </Text>
                    </React.Fragment>
                  );
                })}

                {geometry.map((point) => (
                  <Text
                    key={`x-${point.id}`}
                    style={[styles.xLabel, { left: point.x - 28, top: baselineY + CHART_BOTTOM_PAD }]}
                  >
                    {point.label}
                  </Text>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ChartCard({
  muscle,
  dailyHistory,
  range,
  onChangeRange,
}: {
  muscle: MuscleEntry;
  dailyHistory: DailyMusclePoint[];
  range: ChartRange;
  onChangeRange: (range: ChartRange) => void;
}) {
  const chartData = useMemo(() => buildChartBuckets(dailyHistory, range), [dailyHistory, range]);
  const ranges: ChartRange[] = ['1W', '1M', '3M'];

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.chartTitle}>{muscle.name}</Text>
          <Text style={styles.chartSubtitle}>{getRangeSubtitle(range)}</Text>
        </View>
        <View style={styles.rangeTabs}>
          {ranges.map((item) => {
            const active = item === range;
            return (
              <TouchableOpacity
                key={item}
                style={[
                  styles.rangeTab,
                  active && { backgroundColor: hexToRgba(muscle.color, 0.16), borderColor: hexToRgba(muscle.color, 0.45) },
                ]}
                onPress={() => onChangeRange(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.rangeTabText, active && { color: muscle.color }]}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.chartBody}>
        <ProgressChart data={chartData} color={muscle.color} range={range} />
      </View>
    </View>
  );
}

function MuscleListItem({
  entry,
  isSelected,
  onPress,
}: {
  entry: MuscleEntry;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.muscleItem,
        isSelected && { backgroundColor: hexToRgba(entry.color, 0.07), borderColor: hexToRgba(entry.color, 0.25) },
      ]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View
        style={[
          styles.muscleItemBar,
          { backgroundColor: isSelected ? entry.color : hexToRgba(entry.color, 0.4) },
        ]}
      />
      <View style={styles.muscleItemBody}>
        <Text style={[styles.muscleItemName, isSelected && { color: C.text }]}>
          {entry.name}
        </Text>
        <Text style={styles.muscleItemMeta}>
          {entry.lastDate
            ? `${lastTrainedLabel(entry.lastDate)} · ${entry.totalReps} reps`
            : `${entry.sessionCount} sessions`}
        </Text>
      </View>
      <Text style={[styles.muscleItemSets, isSelected && { color: entry.color }]}>
        {entry.totalSets}
        <Text style={styles.muscleItemSetsSuffix}> sets</Text>
      </Text>
    </TouchableOpacity>
  );
}

const PHANTOM_MUSCLES = [
  { name: 'Chest', color: '#6C63FF' },
  { name: 'Back', color: '#00F5A0' },
  { name: 'Legs', color: '#FF8C42' },
  { name: 'Shoulders', color: '#FFC442' },
] as const;

function EmptyStatsScaffold() {
  return (
    <>
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartTitle}>Progress</Text>
            <Text style={styles.chartSubtitle}>{getRangeSubtitle('1W')}</Text>
          </View>
          <View style={styles.rangeTabs}>
            {(['1W', '1M', '3M'] as ChartRange[]).map((item) => (
              <View key={item} style={styles.rangeTab}>
                <Text style={styles.rangeTabText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.chartBody, styles.chartEmpty]}>
          <Text style={styles.chartEmptyText}>Complete a workout to see your progress charts.</Text>
        </View>
      </View>
      <Text style={styles.sectionLabel}>MUSCLES</Text>
      <View style={styles.muscleList}>
        {PHANTOM_MUSCLES.map((m, i) => (
          <React.Fragment key={m.name}>
            <View style={styles.muscleItem}>
              <View style={[styles.muscleItemBar, { backgroundColor: hexToRgba(m.color, 0.18) }]} />
              <View style={styles.muscleItemBody}>
                <Text style={[styles.muscleItemName, { color: C.textFaint }]}>{m.name}</Text>
                <Text style={styles.muscleItemMeta}>—</Text>
              </View>
              <Text style={[styles.muscleItemSets, { color: C.textFaint }]}>
                0<Text style={styles.muscleItemSetsSuffix}> sets</Text>
              </Text>
            </View>
            {i < PHANTOM_MUSCLES.length - 1 && <View style={styles.listDivider} />}
          </React.Fragment>
        ))}
      </View>
    </>
  );
}

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  phase,
  workoutSessions,
}) => {
  const insets = useSafeAreaInsets();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>('1W');

  const phaseSessions = useMemo(
    () => workoutSessions.filter((s) => s.phasePlanId === phase.id),
    [phase.id, workoutSessions],
  );

  const muscles = useMemo(() => computeAllMuscles(phaseSessions), [phaseSessions]);
  const selectedMuscle = muscles.find((m) => m.key === selectedKey) ?? muscles[0] ?? null;

  const dailyHistory = useMemo(
    () => (selectedMuscle ? computeDailyMuscleHistory(phaseSessions, selectedMuscle.key) : []),
    [phaseSessions, selectedMuscle],
  );

  return (
    <ExpoLinearGradient colors={BG} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTopRow}>
          <Text style={styles.screenTitle}>Progress</Text>
        </View>
        <Text style={styles.screenSub}>
          {muscles.length > 0
            ? `${muscles.length} muscles · ${phaseSessions.length} sessions`
            : 'Log workouts to start tracking'}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {selectedMuscle ? (
          <>
            <ChartCard
              muscle={selectedMuscle}
              dailyHistory={dailyHistory}
              range={range}
              onChangeRange={setRange}
            />
            <Text style={styles.sectionLabel}>MUSCLES</Text>
            <View style={styles.muscleList}>
              {muscles.map((m, i) => (
                <React.Fragment key={m.key}>
                  <MuscleListItem
                    entry={m}
                    isSelected={m.key === (selectedKey ?? muscles[0]?.key)}
                    onPress={() => setSelectedKey(m.key)}
                  />
                  {i < muscles.length - 1 && <View style={styles.listDivider} />}
                </React.Fragment>
              ))}
            </View>
          </>
        ) : (
          <EmptyStatsScaffold />
        )}
      </ScrollView>
    </ExpoLinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  screenSub: {
    fontSize: 13,
    color: C.textMuted,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },
  chartCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 28,
    overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 12,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
  },
  chartSubtitle: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
  },
  rangeTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rangeTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  rangeTabText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: C.textMuted,
  },
  chartBody: {
    paddingTop: 10,
    paddingBottom: 16,
  },
  chartOuter: {
    paddingHorizontal: 12,
  },
  chartInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  yAxis: {
    width: Y_AXIS_W,
    height: CHART_TOTAL_H,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 8,
    paddingTop: CHART_TOP_PAD - 6,
    paddingBottom: CHART_X_LABEL_PAD + CHART_BOTTOM_PAD - 2,
  },
  yLabel: {
    fontSize: 10,
    color: C.textMuted,
    fontWeight: '600',
    lineHeight: 12,
  },
  chartCanvasWrap: {
    flex: 1,
    height: CHART_TOTAL_H,
    position: 'relative',
  },
  chartOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  pointLabelTop: {
    position: 'absolute',
    width: 52,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
  },
  pointLabelBottom: {
    position: 'absolute',
    width: 52,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
  },
  xLabel: {
    position: 'absolute',
    width: 56,
    textAlign: 'center',
    fontSize: 10,
    color: C.textSub,
    fontWeight: '600',
  },
  chartEmpty: {
    height: CHART_H + 72,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  chartEmptyText: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: C.textMuted,
    marginBottom: 10,
  },
  muscleList: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  muscleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  muscleItemBar: {
    width: 3,
    height: 36,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  muscleItemBody: {
    flex: 1,
    gap: 2,
  },
  muscleItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textSub,
  },
  muscleItemMeta: {
    fontSize: 12,
    color: C.textMuted,
  },
  muscleItemSets: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textSub,
  },
  muscleItemSetsSuffix: {
    fontSize: 12,
    fontWeight: '400',
    color: C.textMuted,
  },
  listDivider: {
    height: 1,
    backgroundColor: C.border,
    marginLeft: 17,
  },
});
