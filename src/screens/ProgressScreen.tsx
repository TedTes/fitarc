import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// ─── Props ────────────────────────────────────────────────────────────────────

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

// ─── Palette ──────────────────────────────────────────────────────────────────

const BG = ['#07091C', '#0B0E22', '#0F1228'] as const;

const C = {
  bg:        '#07091C',
  card:      '#0E1225',
  surface:   '#131728',
  accent:    '#6C63FF',
  text:      '#FFFFFF',
  textSub:   '#B8BEDC',
  textMuted: '#6B7194',
  textFaint: '#2A2F4A',
  border:    'rgba(255,255,255,0.06)',
  grid:      'rgba(255,255,255,0.05)',
} as const;

// ─── Muscle colours ───────────────────────────────────────────────────────────

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

function muscleColor(key: string): string {
  return MUSCLE_COLORS[key.toLowerCase().trim()] ?? '#8B93B5';
}

function capitalizeMuscle(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartTab = 'sets' | 'strength';

type MuscleEntry = {
  key: string;
  name: string;
  color: string;
  totalSets: number;
  totalReps: number;
  sessionCount: number;
  lastDate: string; // YYYY-MM-DD
};

// bar height = sets, annotation = total reps
type SetsPoint = {
  label: string;
  sets: number;
  reps: number;
};

// bar height = top weight (or e1rm if no weight), annotation = sets×reps
type StrengthPoint = {
  label: string;
  weight: number;   // actual logged weight (may be 0)
  e1rm: number;     // estimated 1RM (may be 0)
  reps: number;
  totalSets: number;
};

// ─── Data helpers ─────────────────────────────────────────────────────────────

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
  if (/deadlift|rdl/.test(n)) { result.add('back'); result.add('legs'); }
  if (/push.?up|dip/.test(n)) { result.add('chest'); result.add('arms'); }
  if (/row|pull.?up|pulldown/.test(n)) { result.add('back'); result.add('arms'); }
  return Array.from(result);
}

function getExerciseMuscles(ex: WorkoutSessionExercise): string[] {
  return (ex.bodyParts && ex.bodyParts.length > 0) ? ex.bodyParts : inferMusclesFromName(ex.name);
}

function shortDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function lastTrainedLabel(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff <= 6) return `${diff}d ago`;
  return shortDate(dateStr);
}

// ─── Compute data ─────────────────────────────────────────────────────────────

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
        ? completedSets.reduce((s, set) => s + Number(set.reps ?? 0), 0)
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

// bar height = sets, annotation = reps — grouped by date
function computeSetsHistory(sessions: WorkoutSessionEntry[], muscleKey: string): SetsPoint[] {
  const setsByDate: Record<string, number> = {};
  const repsByDate: Record<string, number> = {};

  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const muscles = getExerciseMuscles(exercise).map(m => m.toLowerCase().trim());
      if (!muscles.includes(muscleKey)) continue;
      const setCount = countSets(exercise);
      if (setCount <= 0) continue;
      const completedSets = countCompletedSetDetails(exercise.setDetails);
      const reps = completedSets.length > 0
        ? completedSets.reduce((s, set) => s + Number(set.reps ?? 0), 0)
        : exercise.completed
          ? (exercise.sets ?? 0) * Number(String(exercise.reps ?? '0').match(/\d+/)?.[0] ?? 0)
          : 0;
      setsByDate[session.date] = (setsByDate[session.date] ?? 0) + setCount;
      repsByDate[session.date] = (repsByDate[session.date] ?? 0) + reps;
    }
  }

  return Object.entries(setsByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, sets]) => ({ label: shortDate(date), sets, reps: repsByDate[date] ?? 0 }));
}

// bar height = weight (if available) or e1rm, annotation = totalSets×reps
function computeStrengthHistory(
  sessions: WorkoutSessionEntry[],
  snapshots: StrengthSnapshot[],
  muscleKey: string,
): { points: StrengthPoint[]; exerciseName: string; hasWeightData: boolean } {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const muscles = getExerciseMuscles(ex).map(m => m.toLowerCase().trim());
      if (!muscles.includes(muscleKey)) continue;
      const setCount = countSets(ex);
      if (setCount <= 0) continue;
      counts[ex.name] = (counts[ex.name] ?? 0) + setCount;
    }
  }

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return { points: [], exerciseName: '', hasWeightData: false };

  const topExercise = entries[0][0];
  const points = snapshots
    .filter(s => (s.exerciseName ?? s.lift ?? '') === topExercise)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map(s => ({
      label: shortDate(s.date),
      weight: s.weight ?? 0,
      e1rm: s.estimated1RM ?? 0,
      reps: s.reps ?? 0,
      totalSets: s.totalSets ?? 0,
    }));

  const hasWeightData = points.some(p => p.weight > 0);
  return { points, exerciseName: topExercise, hasWeightData };
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

const BAR_W = 44;
const BAR_GAP = 8;
const CHART_H = 120;
const Y_AXIS_W = 30;

type BarPoint = {
  label: string;      // X-axis date
  value: number;      // bar height
  annotation?: string; // sublabel below date
};

function BarChart({
  data,
  color,
  formatY,
  yUnit,
  emptyText,
}: {
  data: BarPoint[];
  color: string;
  formatY: (v: number) => string;
  yUnit: string;
  emptyText: string;
}) {
  if (data.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyText}>{emptyText}</Text>
      </View>
    );
  }

  const max = Math.max(...data.map(d => d.value), 1);
  const yMid = max / 2;

  return (
    <View style={styles.chartOuter}>
      {/* Y-axis + grid + bars */}
      <View style={styles.chartInner}>
        {/* Y-axis labels */}
        <View style={styles.yAxis}>
          <Text style={styles.yLabel}>{formatY(max)}</Text>
          <Text style={styles.yLabel}>{formatY(yMid)}</Text>
          <Text style={[styles.yLabel, { color: C.textFaint }]}>0</Text>
          <Text style={styles.yUnit}>{yUnit}</Text>
        </View>

        {/* Bars + grid */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.barsScroll}
        >
          <View style={styles.barsArea}>
            {/* Grid lines */}
            <View style={[styles.gridLine, { top: 0 }]} />
            <View style={[styles.gridLine, { top: CHART_H / 2 }]} />
            <View style={[styles.gridLine, { top: CHART_H }]} />

            {/* Bar columns */}
            {data.map((point, i) => {
              const barH = Math.max(5, (point.value / max) * CHART_H);
              return (
                <View key={i} style={styles.barColInner}>
                  <LinearGradient
                    colors={[color + 'EE', color + '44']}
                    style={[styles.bar, { height: barH }]}
                  />
                </View>
              );
            })}
          </View>

          {/* X-axis labels */}
          <View style={styles.xAxis}>
            {data.map((point, i) => (
              <View key={i} style={styles.xLabel}>
                <Text style={styles.xDate}>{point.label}</Text>
                {point.annotation ? (
                  <Text style={styles.xAnnotation}>{point.annotation}</Text>
                ) : null}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Chart card ───────────────────────────────────────────────────────────────

function ChartCard({
  muscle,
  setsHistory,
  strengthHistory,
  strengthExercise,
  hasWeightData,
  tab,
  onTabChange,
}: {
  muscle: MuscleEntry;
  setsHistory: SetsPoint[];
  strengthHistory: StrengthPoint[];
  strengthExercise: string;
  hasWeightData: boolean;
  tab: ChartTab;
  onTabChange: (t: ChartTab) => void;
}) {
  const totalSets = setsHistory.reduce((s, p) => s + p.sets, 0);
  const totalReps = setsHistory.reduce((s, p) => s + p.reps, 0);
  const maxWeight = Math.max(...strengthHistory.map(p => p.weight), 0);

  // Sets tab: bar = sets, annotation = total reps for day
  const setsData: BarPoint[] = setsHistory.map(p => ({
    label: p.label,
    value: p.sets,
    annotation: p.reps > 0 ? `${p.reps} reps` : undefined,
  }));

  // Strength tab: bar = top weight (or e1rm), annotation = setsxreps
  const strengthData: BarPoint[] = strengthHistory.map(p => {
    const barValue = hasWeightData ? p.weight : p.e1rm;
    let annotation: string | undefined;
    if (p.totalSets > 0 && p.reps > 0) {
      annotation = `${p.totalSets}×${p.reps}`;
    } else if (p.reps > 0) {
      annotation = `${p.reps} reps`;
    }
    return { label: p.label, value: barValue, annotation };
  });

  // Summary line changes per tab
  const summaryLeft = tab === 'sets'
    ? `${totalSets} sets total`
    : maxWeight > 0
      ? `${maxWeight} kg top`
      : strengthHistory.length > 0 ? 'No weight logged' : '—';

  const summaryRight = tab === 'sets'
    ? totalReps > 0 ? `${totalReps} reps` : null
    : strengthExercise || null;

  return (
    <View style={[styles.chartCard, { borderLeftColor: muscle.color }]}>
      {/* Header */}
      <View style={styles.chartHeader}>
        <View style={styles.chartHeaderLeft}>
          <View style={[styles.chartDot, { backgroundColor: muscle.color }]} />
          <View>
            <Text style={styles.chartMuscleName}>{muscle.name}</Text>
            {muscle.lastDate ? (
              <Text style={styles.chartLastTrained}>
                Last trained {lastTrainedLabel(muscle.lastDate)}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.chartSummary}>
          <Text style={[styles.chartSummaryMain, { color: muscle.color }]}>
            {summaryLeft}
          </Text>
          {summaryRight ? (
            <Text style={styles.chartSummarySecondary}>{summaryRight}</Text>
          ) : null}
        </View>
      </View>

      {/* Tab switcher */}
      <View style={styles.chartTabRow}>
        <TouchableOpacity
          style={[styles.chartTab, tab === 'sets' && styles.chartTabActive]}
          onPress={() => onTabChange('sets')}
          activeOpacity={0.7}
        >
          <Text style={[styles.chartTabText, tab === 'sets' && styles.chartTabTextActive]}>
            Reps & Sets
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chartTab, tab === 'strength' && styles.chartTabActive]}
          onPress={() => onTabChange('strength')}
          activeOpacity={0.7}
        >
          <Text style={[styles.chartTabText, tab === 'strength' && styles.chartTabTextActive]}>
            Strength
          </Text>
        </TouchableOpacity>
      </View>

      {/* Chart */}
      <View style={styles.chartBody}>
        {tab === 'sets' ? (
          <BarChart
            data={setsData}
            color={muscle.color}
            formatY={v => String(Math.round(v))}
            yUnit="sets"
            emptyText="No sessions logged for this muscle yet."
          />
        ) : !hasWeightData && strengthData.length === 0 ? (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyText}>
              No strength data yet.{'\n'}Log weights during your workouts to track progression.
            </Text>
          </View>
        ) : !hasWeightData && strengthData.length > 0 ? (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyText}>
              Weight not logged for {strengthExercise || 'this exercise'}.{'\n'}
              Log weights to track strength progression.
            </Text>
          </View>
        ) : (
          <BarChart
            data={strengthData}
            color={muscle.color}
            formatY={v => `${Math.round(v)}`}
            yUnit="kg"
            emptyText="No strength data logged for this muscle yet."
          />
        )}
      </View>
    </View>
  );
}

// ─── Muscle list item ─────────────────────────────────────────────────────────

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
        isSelected && { backgroundColor: entry.color + '12', borderColor: entry.color + '40' },
      ]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.muscleItemBar, { backgroundColor: isSelected ? entry.color : entry.color + '60' }]} />
      <View style={styles.muscleItemBody}>
        <Text style={[styles.muscleItemName, isSelected && { color: C.text }]}>
          {entry.name}
        </Text>
        <Text style={styles.muscleItemMeta}>
          {entry.lastDate ? `${lastTrainedLabel(entry.lastDate)} · ${entry.totalReps} reps` : `${entry.sessionCount} sessions`}
        </Text>
      </View>
      <Text style={[styles.muscleItemSets, isSelected && { color: entry.color }]}>
        {entry.totalSets}
        <Text style={styles.muscleItemSetsSuffix}> sets</Text>
      </Text>
    </TouchableOpacity>
  );
}

// ─── Empty scaffold ───────────────────────────────────────────────────────────

const PHANTOM_MUSCLES = [
  { name: 'Chest', color: '#6C63FF' },
  { name: 'Back', color: '#00F5A0' },
  { name: 'Legs', color: '#FF8C42' },
  { name: 'Shoulders', color: '#FFC442' },
] as const;

function EmptyStatsScaffold() {
  return (
    <>
      <View style={[styles.chartCard, { borderLeftColor: C.textFaint }]}>
        <View style={styles.chartHeader}>
          <View style={styles.chartHeaderLeft}>
            <View style={[styles.chartDot, { backgroundColor: C.textFaint }]} />
            <Text style={[styles.chartMuscleName, { color: C.textMuted }]}>—</Text>
          </View>
          <Text style={[styles.chartSummaryMain, { color: C.textFaint }]}>0 sets total</Text>
        </View>
        <View style={styles.chartTabRow}>
          <View style={[styles.chartTab, styles.chartTabActive]}>
            <Text style={[styles.chartTabText, { color: C.textMuted }]}>Reps & Sets</Text>
          </View>
          <View style={styles.chartTab}>
            <Text style={styles.chartTabText}>Strength</Text>
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
              <View style={[styles.muscleItemBar, { backgroundColor: m.color + '28' }]} />
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  phase,
  workoutSessions,
  strengthSnapshots,
}) => {
  const insets = useSafeAreaInsets();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [chartTab, setChartTab] = useState<ChartTab>('sets');

  const phaseSessions = useMemo(
    () => workoutSessions.filter(s => s.phasePlanId === phase.id),
    [phase.id, workoutSessions],
  );

  const muscles = useMemo(() => computeAllMuscles(phaseSessions), [phaseSessions]);

  const selectedMuscle = muscles.find(m => m.key === selectedKey) ?? muscles[0] ?? null;

  const setsHistory = useMemo(
    () => selectedMuscle ? computeSetsHistory(phaseSessions, selectedMuscle.key) : [],
    [phaseSessions, selectedMuscle],
  );

  const { points: strengthHistory, exerciseName: strengthExercise, hasWeightData } = useMemo(
    () => selectedMuscle
      ? computeStrengthHistory(phaseSessions, strengthSnapshots, selectedMuscle.key)
      : { points: [], exerciseName: '', hasWeightData: false },
    [phaseSessions, strengthSnapshots, selectedMuscle],
  );

  return (
    <LinearGradient colors={BG} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.screenTitle}>Progress</Text>
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
              setsHistory={setsHistory}
              strengthHistory={strengthHistory}
              strengthExercise={strengthExercise}
              hasWeightData={hasWeightData}
              tab={chartTab}
              onTabChange={setChartTab}
            />
            <Text style={styles.sectionLabel}>MUSCLES</Text>
            <View style={styles.muscleList}>
              {muscles.map((m, i) => (
                <React.Fragment key={m.key}>
                  <MuscleListItem
                    entry={m}
                    isSelected={m.key === selectedKey}
                    onPress={() => { setSelectedKey(m.key); setChartTab('sets'); }}
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
    </LinearGradient>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
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

  // ── Chart card ──────────────────────────────────────────────────────────────

  chartCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    marginBottom: 28,
    overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 12,
  },
  chartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  chartDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  chartMuscleName: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    lineHeight: 22,
  },
  chartLastTrained: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 1,
  },
  chartSummary: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  chartSummaryMain: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textSub,
  },
  chartSummarySecondary: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 2,
  },

  // Tab switcher
  chartTabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 3,
    marginBottom: 20,
    gap: 2,
  },
  chartTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  chartTabActive: {
    backgroundColor: C.accent + '28',
    borderWidth: 1,
    borderColor: C.accent + '50',
  },
  chartTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.textMuted,
  },
  chartTabTextActive: {
    color: C.text,
    fontWeight: '600',
  },

  chartBody: {
    paddingBottom: 20,
  },

  // ── Bar chart ───────────────────────────────────────────────────────────────

  chartOuter: {
    paddingHorizontal: 16,
  },
  chartInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  // Y-axis
  yAxis: {
    width: Y_AXIS_W,
    height: CHART_H + 2,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 6,
    paddingBottom: 0,
  },
  yLabel: {
    fontSize: 9,
    color: C.textMuted,
    fontWeight: '500',
    lineHeight: 12,
  },
  yUnit: {
    fontSize: 8,
    color: C.textFaint,
    fontWeight: '400',
    position: 'absolute',
    bottom: -16,
    right: 6,
  },

  // Bars
  barsScroll: {
    paddingRight: 8,
  },
  barsArea: {
    height: CHART_H,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: BAR_GAP,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: C.grid,
  },
  barColInner: {
    width: BAR_W,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: BAR_W - 10,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },

  // X-axis
  xAxis: {
    flexDirection: 'row',
    gap: BAR_GAP,
    paddingTop: 8,
  },
  xLabel: {
    width: BAR_W,
    alignItems: 'center',
    gap: 2,
  },
  xDate: {
    fontSize: 9,
    color: C.textMuted,
    textAlign: 'center',
  },
  xAnnotation: {
    fontSize: 8,
    color: C.textFaint,
    textAlign: 'center',
  },

  chartEmpty: {
    height: CHART_H + 60,
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

  // ── Section label ────────────────────────────────────────────────────────────

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: C.textMuted,
    marginBottom: 10,
  },

  // ── Muscle list ──────────────────────────────────────────────────────────────

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
