import React, { useEffect, useMemo, useState } from 'react';
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
  success:   '#00F5A0',
  text:      '#FFFFFF',
  textSub:   '#B8BEDC',
  textMuted: '#6B7194',
  textFaint: '#2A2F4A',
  border:    'rgba(255,255,255,0.06)',
  borderMid: 'rgba(255,255,255,0.09)',
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
  sessionCount: number;
};

type SetsPoint = {
  label: string;
  sets: number;
  reps: number;
};

type StrengthPoint = {
  label: string;
  e1rm: number;
  weight: number;
  reps: number;
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
  const completedSetDetails = countCompletedSetDetails(ex.setDetails);
  if (completedSetDetails.length > 0) return completedSetDetails.length;
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
  if (ex.bodyParts && ex.bodyParts.length > 0) {
    return ex.bodyParts;
  }
  return inferMusclesFromName(ex.name);
}

function shortDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// All muscles ranked by total volume — only muscles that have actual sets
function computeAllMuscles(sessions: WorkoutSessionEntry[]): MuscleEntry[] {
  const totals: Record<string, number> = {};
  const logIds: Record<string, Set<string>> = {};

  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const setCount = countSets(exercise);
      if (setCount <= 0) continue;
      for (const muscle of getExerciseMuscles(exercise)) {
        const key = muscle.toLowerCase().trim();
        totals[key] = (totals[key] ?? 0) + setCount;
        if (!logIds[key]) logIds[key] = new Set();
        logIds[key].add(session.id);
      }
    }
  }

  return Object.entries(totals)
    .map(([key, totalSets]) => ({
      key,
      name: capitalizeMuscle(key),
      color: muscleColor(key),
      totalSets,
      sessionCount: logIds[key]?.size ?? 0,
    }))
    .sort((a, b) => b.totalSets - a.totalSets);
}

// Per-date volume history for a muscle — grouped by date to avoid duplicate bars
function computeSetsHistory(sessions: WorkoutSessionEntry[], muscleKey: string): SetsPoint[] {
  const byDate: Record<string, number> = {};
  const repsByDate: Record<string, number> = {};

  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const muscles = getExerciseMuscles(exercise).map((m) => m.toLowerCase().trim());
      if (!muscles.includes(muscleKey)) continue;

      const setCount = countSets(exercise);
      if (setCount <= 0) continue;
      const completedSetDetails = countCompletedSetDetails(exercise.setDetails);
      const reps =
        completedSetDetails.length > 0
          ? completedSetDetails.reduce((sum, set) => sum + Number(set.reps ?? 0), 0)
          : exercise.completed
            ? (exercise.sets ?? 0) * Number(String(exercise.reps ?? '0').match(/\d+/)?.[0] ?? 0)
            : 0;

      byDate[session.date] = (byDate[session.date] ?? 0) + setCount;
      repsByDate[session.date] = (repsByDate[session.date] ?? 0) + reps;
    }
  }

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, sets]) => ({ label: shortDate(date), sets, reps: repsByDate[date] ?? 0 }));
}

// Strength progression — find exercises from sessions matching logs for this muscle
function computeStrengthHistory(
  sessions: WorkoutSessionEntry[],
  snapshots: StrengthSnapshot[],
  muscleKey: string,
): { points: StrengthPoint[]; exerciseName: string } {
  // Find the most-used exercise in those sessions
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const muscles = getExerciseMuscles(ex).map((m) => m.toLowerCase().trim());
      if (!muscles.includes(muscleKey)) continue;
      const setCount = countSets(ex);
      if (setCount <= 0) continue;
      counts[ex.name] = (counts[ex.name] ?? 0) + countSets(ex);
    }
  }

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return { points: [], exerciseName: '' };

  const topExercise = entries[0][0];
  const points = snapshots
    .filter(s => (s.exerciseName ?? s.lift ?? '') === topExercise)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map(s => ({
      label: shortDate(s.date),
      e1rm: s.estimated1RM ?? s.weight,
      weight: s.weight,
      reps: s.reps,
    }));

  return { points, exerciseName: topExercise };
}

// ─── Bar chart (horizontal scroll) ───────────────────────────────────────────

const BAR_W = 38;
const CHART_H = 100;

function BarChart({
  data,
  color,
  valueLabel,
  emptyText,
}: {
  data: Array<{ label: string; value: number; subLabel?: string }>;
  color: string;
  valueLabel: (v: number) => string;
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

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chartScroll}
    >
      {data.map((point, i) => {
        const barH = Math.max(5, (point.value / max) * CHART_H);
        return (
          <View key={i} style={styles.barCol}>
            <Text style={styles.barValue}>{valueLabel(point.value)}</Text>
            <View style={styles.barTrack}>
              <LinearGradient
                colors={[color + 'CC', color + '55']}
                style={[styles.bar, { height: barH }]}
              />
            </View>
            <Text style={styles.barLabel}>{point.label}</Text>
            {point.subLabel ? (
              <Text style={styles.barSubLabel}>{point.subLabel}</Text>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Chart card ───────────────────────────────────────────────────────────────

function ChartCard({
  muscle,
  setsHistory,
  strengthHistory,
  strengthExercise,
  tab,
  onTabChange,
}: {
  muscle: MuscleEntry;
  setsHistory: SetsPoint[];
  strengthHistory: StrengthPoint[];
  strengthExercise: string;
  tab: ChartTab;
  onTabChange: (t: ChartTab) => void;
}) {
  const setsData = setsHistory.map(p => ({
    label: p.label,
    value: p.sets,
    subLabel: p.reps > 0 ? `${p.reps} reps` : undefined,
  }));

  const strengthData = strengthHistory.map(p => ({
    label: p.label,
    value: p.e1rm,
    subLabel: p.weight > 0 ? `${p.weight} kg × ${p.reps}` : undefined,
  }));

  const totalSets = setsHistory.reduce((s, p) => s + p.sets, 0);
  const totalReps = setsHistory.reduce((s, p) => s + p.reps, 0);

  return (
    <View style={[styles.chartCard, { borderLeftColor: muscle.color }]}>
      {/* Muscle header */}
      <View style={styles.chartHeader}>
        <View style={styles.chartHeaderLeft}>
          <View style={[styles.chartDot, { backgroundColor: muscle.color }]} />
          <Text style={styles.chartMuscleName}>{muscle.name}</Text>
        </View>
        <View style={styles.chartStats}>
          <Text style={[styles.chartStatValue, { color: muscle.color }]}>{totalSets}</Text>
          <Text style={styles.chartStatLabel}> sets</Text>
          {totalReps > 0 && (
            <>
              <Text style={styles.chartStatSep}>·</Text>
              <Text style={styles.chartStatValue}>{totalReps}</Text>
              <Text style={styles.chartStatLabel}> reps</Text>
            </>
          )}
        </View>
      </View>

      {/* Tab switcher */}
      <View style={styles.chartTabRow}>
        <TouchableOpacity
          style={[styles.chartTab, tab === 'sets' && styles.chartTabActive]}
          onPress={() => onTabChange('sets')}
          activeOpacity={0.7}
        >
          <Text style={[styles.chartTabText, tab === 'sets' && { color: C.text }]}>
            Reps & Sets
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chartTab, tab === 'strength' && styles.chartTabActive]}
          onPress={() => onTabChange('strength')}
          activeOpacity={0.7}
        >
          <Text style={[styles.chartTabText, tab === 'strength' && { color: C.text }]}>
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
            valueLabel={v => String(v)}
            emptyText="No sessions logged for this muscle yet."
          />
        ) : (
          <>
            {strengthExercise ? (
              <Text style={styles.chartExerciseLabel}>{strengthExercise}</Text>
            ) : null}
            <BarChart
              data={strengthData}
              color={muscle.color}
              valueLabel={v => `${Math.round(v)}`}
              emptyText="No strength data logged for this muscle yet."
            />
          </>
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
        isSelected && { backgroundColor: C.surface, borderColor: entry.color + '50' },
      ]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.muscleItemBar, { backgroundColor: entry.color }]} />
      <View style={styles.muscleItemBody}>
        <Text style={[styles.muscleItemName, isSelected && { color: C.text }]}>
          {entry.name}
        </Text>
        <Text style={styles.muscleItemMeta}>
          {entry.sessionCount} session{entry.sessionCount !== 1 ? 's' : ''}
        </Text>
      </View>
      <Text style={[styles.muscleItemSets, isSelected && { color: entry.color }]}>
        {entry.totalSets}
        <Text style={styles.muscleItemSetsSuffix}> sets</Text>
      </Text>
    </TouchableOpacity>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

const PHANTOM_MUSCLES = [
  { name: 'Chest',     color: '#6C63FF' },
  { name: 'Back',      color: '#00F5A0' },
  { name: 'Legs',      color: '#FF8C42' },
  { name: 'Shoulders', color: '#FFC442' },
] as const;

function EmptyStatsScaffold() {
  return (
    <>
      {/* Mirrors ChartCard layout with zero state */}
      <View style={[styles.chartCard, { borderLeftColor: C.textFaint }]}>
        <View style={styles.chartHeader}>
          <View style={styles.chartHeaderLeft}>
            <View style={[styles.chartDot, { backgroundColor: C.textFaint }]} />
            <Text style={[styles.chartMuscleName, { color: C.textMuted }]}>—</Text>
          </View>
          <View style={styles.chartStats}>
            <Text style={[styles.chartStatValue, { color: C.textFaint }]}>0</Text>
            <Text style={styles.chartStatLabel}> sets</Text>
          </View>
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
          <Text style={styles.chartEmptyText}>
            Complete a workout to see your progress charts.
          </Text>
        </View>
      </View>

      {/* Mirrors muscle list with phantom rows */}
      <Text style={styles.sectionLabel}>MUSCLES</Text>
      <View style={styles.muscleList}>
        {PHANTOM_MUSCLES.map((m, i) => (
          <React.Fragment key={m.name}>
            <View style={styles.muscleItem}>
              <View style={[styles.muscleItemBar, { backgroundColor: m.color + '28' }]} />
              <View style={styles.muscleItemBody}>
                <Text style={[styles.muscleItemName, { color: C.textFaint }]}>{m.name}</Text>
                <Text style={styles.muscleItemMeta}>0 sessions</Text>
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
    () => workoutSessions.filter((session) => session.phasePlanId === phase.id),
    [phase.id, workoutSessions],
  );

  const muscles = useMemo(
    () => computeAllMuscles(phaseSessions),
    [phaseSessions],
  );

  // Auto-select the most-trained muscle on first load
  useEffect(() => {
    if (muscles.length > 0 && !selectedKey) {
      setSelectedKey(muscles[0].key);
    }
  }, [muscles, selectedKey]);

  const selectedMuscle = muscles.find(m => m.key === selectedKey) ?? muscles[0] ?? null;

  const setsHistory = useMemo(
    () => selectedMuscle ? computeSetsHistory(phaseSessions, selectedMuscle.key) : [],
    [phaseSessions, selectedMuscle],
  );

  const { points: strengthHistory, exerciseName: strengthExercise } = useMemo(
    () =>
      selectedMuscle
        ? computeStrengthHistory(phaseSessions, strengthSnapshots, selectedMuscle.key)
        : { points: [], exerciseName: '' },
    [phaseSessions, strengthSnapshots, selectedMuscle],
  );

  return (
    <LinearGradient colors={BG} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.screenTitle}>Progress</Text>
        <Text style={styles.screenSub}>
          {muscles.length > 0
            ? `${muscles.length} muscles tracked · ${phaseSessions.length} sessions`
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
                    onPress={() => {
                      setSelectedKey(m.key);
                      setChartTab('sets');
                    }}
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

  // ── Chart card ─────────────────────────────────────────────────────────────

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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  chartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chartDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chartMuscleName: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
  },
  chartStats: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  chartStatValue: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textSub,
  },
  chartStatLabel: {
    fontSize: 12,
    color: C.textMuted,
  },
  chartStatSep: {
    fontSize: 12,
    color: C.textFaint,
    marginHorizontal: 6,
  },

  // Tab row
  chartTabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  chartTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  chartTabActive: {
    backgroundColor: C.card,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  chartTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.textMuted,
  },

  // Chart body
  chartBody: {
    paddingBottom: 18,
  },
  chartExerciseLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: C.textMuted,
    paddingHorizontal: 18,
    marginBottom: 10,
  },

  // Bar chart
  chartScroll: {
    paddingHorizontal: 16,
    gap: 6,
    alignItems: 'flex-end',
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
  barCol: {
    width: BAR_W,
    alignItems: 'center',
    gap: 4,
  },
  barValue: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textSub,
  },
  barTrack: {
    height: CHART_H,
    justifyContent: 'flex-end',
    width: BAR_W - 8,
  },
  bar: {
    width: BAR_W - 8,
    borderRadius: 6,
  },
  barLabel: {
    fontSize: 9,
    color: C.textMuted,
    textAlign: 'center',
    width: BAR_W,
    letterSpacing: 0.2,
  },
  barSubLabel: {
    fontSize: 8,
    color: C.textFaint,
    textAlign: 'center',
    width: BAR_W,
  },

  // ── Section label ──────────────────────────────────────────────────────────

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: C.textMuted,
    marginBottom: 10,
  },

  // ── Muscle list ────────────────────────────────────────────────────────────

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
    borderRadius: 0,
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
