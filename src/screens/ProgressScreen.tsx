import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  VictoryAxis,
  VictoryChart,
  VictoryLine,
} from 'victory-native';
import { PhasePlan, User, WorkoutLog, WorkoutSessionEntry, StrengthSnapshot, TrackingPreferences } from '../types/domain';
import { parseYMDToDate } from '../utils/date';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0E27',
  card: '#0F1326',
  cardElevated: '#131929',
  accent: '#6C63FF',
  accentSoft: 'rgba(108,99,255,0.15)',
  success: '#00F5A0',
  successSoft: 'rgba(0,245,160,0.12)',
  pink: '#FF6B93',
  orange: '#FFB800',
  blue: '#4EA8DE',
  textPrimary: '#FFFFFF',
  textSecondary: '#C7CCE6',
  textMuted: '#5A6178',
  border: 'rgba(255,255,255,0.07)',
  borderAccent: 'rgba(108,99,255,0.2)',
} as const;

const VIEW_TABS = [
  { id: 'muscles', label: 'Muscles' },
  { id: 'exercises', label: 'Exercises' },
] as const;

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

const formatShortDate = (date: Date | null) => {
  if (!date) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
};

const getWeekNumber = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

const buildExerciseSeries = (snapshots: StrengthSnapshot[], selectedExercise: string | null) => {
  if (!selectedExercise) return [];
  const today = new Date();
  const weeks: { key: string; start: Date }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() - i * 7);
    weekStart.setHours(0, 0, 0, 0);
    const key = `W${getWeekNumber(weekStart)}`;
    weeks.push({ key, start: weekStart });
  }

  return weeks.map((week) => {
    const end = new Date(week.start);
    end.setDate(end.getDate() + 7);
    const bucket = snapshots.filter((snap) => {
      const snapDate = new Date(snap.date);
      return snapDate >= week.start && snapDate < end;
    });
    const values = bucket
      .filter((s) => (s.exerciseName ?? s.lift ?? '').toLowerCase() === selectedExercise.toLowerCase())
      .map((s) => s.weight ?? 0);
    return {
      week: week.key,
      weight: values.length ? Math.max(...values) : 0,
    };
  });
};

const buildVolumeRows = (workoutLogs: WorkoutLog[]) => {
  if (!workoutLogs.length) return [];
  const totals = new Map<string, number>();
  workoutLogs.forEach((log) => {
    Object.entries(log.muscleVolume || {}).forEach(([key, value]) => {
      totals.set(key, (totals.get(key) ?? 0) + (value ?? 0));
    });
  });
  const colors = [COLORS.accent, COLORS.blue, COLORS.pink, COLORS.orange, '#A78BFA'];
  return Array.from(totals.entries())
    .map(([muscle, sets], i) => ({
      muscle: muscle.charAt(0).toUpperCase() + muscle.slice(1),
      sets: Math.round(sets),
      color: colors[i % colors.length],
    }))
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 5);
};

const buildMuscleTrend = (workoutLogs: WorkoutLog[], muscles: string[]) => {
  const today = new Date();
  const weeks: { key: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() - i * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    weeks.push({ key: `W${getWeekNumber(start)}`, start, end });
  }

  const series = muscles.map((muscle) => {
    const key = muscle.toLowerCase();
    return {
      muscle,
      data: weeks.map((week) => {
        const weeklySets = workoutLogs.reduce((sum, log) => {
          const logDate = parseYMDToDate(log.date);
          if (logDate < week.start || logDate >= week.end) return sum;
          const muscleValue = Object.entries(log.muscleVolume ?? {}).find(
            ([muscleKey]) => muscleKey.toLowerCase() === key
          )?.[1] ?? 0;
          return sum + muscleValue;
        }, 0);
        return { week: week.key, sets: Math.round(weeklySets) };
      }),
    };
  });

  return { weeks, series };
};

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  phase,
  workoutSessions,
  workoutLogs,
  strengthSnapshots,
}) => {
  const [activeView, setActiveView] = useState<typeof VIEW_TABS[number]['id']>('muscles');

  const filteredSessions = useMemo(
    () => workoutSessions.filter((session) => session.phasePlanId === phase.id),
    [phase.id, workoutSessions]
  );
  const filteredWorkoutLogs = useMemo(
    () => workoutLogs.filter((log) => log.phasePlanId === phase.id),
    [phase.id, workoutLogs]
  );
  const filteredStrengthSnapshots = useMemo(
    () => strengthSnapshots.filter((snapshot) => snapshot.phasePlanId === phase.id),
    [phase.id, strengthSnapshots]
  );

  const planProgress = useMemo(() => {
    const sessions = workoutSessions.filter((s) => s.phasePlanId === phase.id);
    const completed = sessions.filter((s) => s.exercises?.length && s.exercises.every((ex) => ex.completed === true)).length;
    const total = sessions.length;
    const startDate = phase.startDate ? parseYMDToDate(phase.startDate) : null;
    const endDate = phase.expectedEndDate ? parseYMDToDate(phase.expectedEndDate) : null;
    const totalWeeks = Math.max(phase.expectedWeeks ?? 8, 1);
    const currentWeek = startDate
      ? Math.min(totalWeeks, Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 604800000) + 1))
      : Math.min(4, totalWeeks);
    return {
      name: phase.name ?? 'Training Plan',
      startDate: formatShortDate(startDate),
      endDate: formatShortDate(endDate),
      currentWeek,
      totalWeeks,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      totalWorkouts: total,
      completedWorkouts: completed,
    };
  }, [phase, workoutSessions]);

  const volumeData = useMemo(() => buildVolumeRows(filteredWorkoutLogs), [filteredWorkoutLogs]);

  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const exerciseOptions = useMemo(() => {
    const groups = new Map<string, StrengthSnapshot[]>();
    filteredStrengthSnapshots.forEach((snap) => {
      const label = (snap.exerciseName ?? snap.lift ?? '').trim();
      if (!label || (snap.weight ?? 0) <= 0) return;
      const key = label.toLowerCase();
      const existing = groups.get(key) ?? [];
      existing.push(snap);
      groups.set(key, existing);
    });
    const colors = [COLORS.orange, COLORS.accent, COLORS.pink, COLORS.success, COLORS.blue];
    return Array.from(groups.entries())
      .map(([key, samples], idx) => {
        const sorted = [...samples].sort((a, b) => a.date.localeCompare(b.date));
        const latest = sorted[sorted.length - 1]?.weight ?? 0;
        const first = sorted[0]?.weight ?? 0;
        const gain = latest - first;
        return {
          id: key,
          name: sorted[sorted.length - 1]?.exerciseName ?? sorted[sorted.length - 1]?.lift ?? key,
          color: colors[idx % colors.length],
          valueText: `${Math.round(latest)} lbs`,
          gainText: `${gain >= 0 ? '+' : ''}${Math.round(gain)} lbs`,
          count: samples.length,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filteredStrengthSnapshots]);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const activeExercise = selectedExercise ?? exerciseOptions[0]?.id ?? null;
  const exerciseData = useMemo(
    () => buildExerciseSeries(filteredStrengthSnapshots, activeExercise),
    [filteredStrengthSnapshots, activeExercise]
  );
  const activeMuscle = selectedMuscle ?? volumeData[0]?.muscle ?? null;

  const muscleWorkoutHistory = useMemo(() => {
    if (!activeMuscle) return [];
    return [...filteredSessions]
      .filter((session) =>
        session.exercises.some((exercise) =>
          exercise.bodyParts.some((part) => part.toLowerCase() === activeMuscle.toLowerCase())
        )
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((session) => {
        const matching = session.exercises.filter((exercise) =>
          exercise.bodyParts.some((part) => part.toLowerCase() === activeMuscle.toLowerCase())
        );
        const setCount = matching.reduce((sum, exercise) => {
          const loggedSets = exercise.setDetails?.length ?? 0;
          return sum + (loggedSets > 0 ? loggedSets : Math.max(0, exercise.sets ?? 0));
        }, 0);
        return {
          id: session.id,
          date: session.date,
          exercises: matching.length,
          sets: setCount,
        };
      });
  }, [activeMuscle, filteredSessions]);

  const exerciseWorkoutHistory = useMemo(() => {
    if (!activeExercise) return [];
    return [...filteredSessions]
      .filter((session) =>
        session.exercises.some((exercise) => {
          const name = exercise.name.toLowerCase();
          return name === activeExercise || name.includes(activeExercise);
        })
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((session) => {
        const matching = session.exercises.filter((exercise) => {
          const name = exercise.name.toLowerCase();
          return name === activeExercise || name.includes(activeExercise);
        });
        return {
          id: session.id,
          date: session.date,
          exercises: matching.map((exercise) => exercise.name).join(', '),
        };
      });
  }, [activeExercise, filteredSessions]);
  const totalSets = volumeData.reduce((sum, item) => sum + item.sets, 0);
  const muscleTrend = useMemo(
    () => buildMuscleTrend(filteredWorkoutLogs, volumeData.map((item) => item.muscle)),
    [filteredWorkoutLogs, volumeData]
  );
  return (
    <LinearGradient colors={['#0A0E27', '#0D1229', '#111633']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Progress</Text>
            <Text style={styles.headerSub}>Week {planProgress.currentWeek} of {planProgress.totalWeeks}</Text>
          </View>
          <View style={styles.adherencePill}>
            <Text style={styles.adherencePillValue}>{planProgress.completionRate}%</Text>
            <Text style={styles.adherencePillLabel}>on track</Text>
          </View>
        </View>

        {/* ── Plan card ── */}
        <LinearGradient
          colors={['rgba(108,99,255,0.2)', 'rgba(108,99,255,0.06)', 'transparent']}
          style={styles.planCard}
        >
          <View style={styles.planCardInner}>
            <View style={styles.planTop}>
              <View style={styles.planTopLeft}>
                <Text style={styles.planLabel}>CURRENT PLAN</Text>
                <Text style={styles.planName} numberOfLines={1}>{planProgress.name}</Text>
                <Text style={styles.planDates}>{planProgress.startDate} → {planProgress.endDate}</Text>
              </View>
              <View style={styles.planStats}>
                <Text style={styles.planStatValue}>{planProgress.completedWorkouts}</Text>
                <Text style={styles.planStatLabel}>done</Text>
                <View style={styles.planStatDiv} />
                <Text style={styles.planStatValue}>{planProgress.totalWorkouts}</Text>
                <Text style={styles.planStatLabel}>total</Text>
              </View>
            </View>

            {/* Week progress */}
            <View style={styles.weekRow}>
              {Array.from({ length: planProgress.totalWeeks }).map((_, i) => {
                const isPast = i < planProgress.currentWeek - 1;
                const isCurrent = i === planProgress.currentWeek - 1;
                return (
                  <View key={i} style={styles.weekSlot}>
                    <View style={[
                      styles.weekBar,
                      isPast && styles.weekBarDone,
                      isCurrent && styles.weekBarCurrent,
                    ]} />
                    {isCurrent && <View style={styles.weekDot} />}
                  </View>
                );
              })}
            </View>
            <View style={styles.weekLabelRow}>
              <Text style={styles.weekLabelText}>Week 1</Text>
              <Text style={styles.weekLabelText}>Week {planProgress.totalWeeks}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Tab row ── */}
        <View style={styles.tabRow}>
          {VIEW_TABS.map((tab) => {
            const isActive = activeView === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setActiveView(tab.id)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Muscles ── */}
        {activeView === 'muscles' && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View>
                <Text style={styles.cardTitle}>Muscle Progress</Text>
                <Text style={styles.cardSub}>Weekly set trends by muscle</Text>
              </View>
              <View style={styles.totalSetsPill}>
                <Text style={styles.totalSetsText}>{totalSets} sets</Text>
              </View>
            </View>
            {volumeData.length ? (
              <>
                <View style={styles.chartWrap}>
                  <VictoryChart
                    width={SCREEN_WIDTH - 64}
                    height={240}
                    padding={{ top: 16, bottom: 36, left: 44, right: 16 }}
                  >
                    <VictoryAxis
                      style={{
                        axis: { stroke: 'rgba(255,255,255,0.08)' },
                        tickLabels: { fill: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
                      }}
                    />
                    <VictoryAxis
                      dependentAxis
                      style={{
                        axis: { stroke: 'transparent' },
                        tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
                        grid: { stroke: 'rgba(255,255,255,0.05)' },
                      }}
                    />
                    {muscleTrend.series.map((entry) => {
                      const item = volumeData.find((volume) => volume.muscle === entry.muscle);
                      const color = item?.color ?? COLORS.accent;
                      const isActive = activeMuscle === entry.muscle;
                      return (
                        <VictoryLine
                          key={entry.muscle}
                          data={entry.data}
                          x="week"
                          y="sets"
                          style={{
                            data: {
                              stroke: color,
                              strokeWidth: isActive ? 3 : 1.5,
                              opacity: isActive ? 1 : 0.3,
                            },
                          }}
                        />
                      );
                    })}
                  </VictoryChart>
                </View>
                <View style={styles.selectorRow}>
                  {volumeData.map((item) => (
                    <TouchableOpacity
                      key={item.muscle}
                      style={[styles.selectorChip, activeMuscle === item.muscle && styles.selectorChipActive]}
                      onPress={() => setSelectedMuscle(item.muscle)}
                    >
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.selectorChipText, activeMuscle === item.muscle && styles.selectorChipTextActive]}>
                        {item.muscle}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>No completed workout sets yet.</Text>
            )}
            {activeMuscle ? (
              <View style={styles.historyBlock}>
                <Text style={styles.cardSub}>{activeMuscle} recent sessions</Text>
                {muscleWorkoutHistory.length ? (
                  muscleWorkoutHistory.slice(0, 5).map((entry) => (
                    <View key={entry.id} style={styles.workoutHistoryRow}>
                      <Text style={styles.workoutHistoryDate}>{entry.date}</Text>
                      <Text style={styles.workoutHistoryMeta}>{entry.exercises} exercises</Text>
                      <Text style={styles.workoutHistorySets}>{entry.sets} sets</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No workouts found for this muscle.</Text>
                )}
              </View>
            ) : null}
          </View>
        )}

        {/* ── Lifts ── */}
        {activeView === 'exercises' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Exercise Progression</Text>
            <Text style={styles.cardSub}>Select an exercise to highlight its trend</Text>
            <View style={styles.chartWrap}>
              <VictoryChart
                width={SCREEN_WIDTH - 64}
                height={240}
                padding={{ top: 16, bottom: 36, left: 44, right: 16 }}
              >
                <VictoryAxis
                  style={{
                    axis: { stroke: 'rgba(255,255,255,0.08)' },
                    tickLabels: { fill: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  style={{
                    axis: { stroke: 'transparent' },
                    tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
                    grid: { stroke: 'rgba(255,255,255,0.05)' },
                    }}
                  />
                <VictoryLine
                  data={exerciseData}
                  x="week"
                  y="weight"
                  style={{ data: { stroke: COLORS.accent, strokeWidth: 3 } }}
                />
              </VictoryChart>
            </View>

            <View style={styles.selectorRow}>
              {exerciseOptions.map((exercise) => (
                <TouchableOpacity
                  key={exercise.id}
                  style={[styles.selectorChip, activeExercise === exercise.id && styles.selectorChipActive]}
                  onPress={() => setSelectedExercise(exercise.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.liftDot, { backgroundColor: exercise.color }]} />
                  <Text style={[styles.selectorChipText, activeExercise === exercise.id && styles.selectorChipTextActive]}>
                    {exercise.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.liftSummaryRow}>
              {exerciseOptions
                .filter((exercise) => exercise.id === activeExercise)
                .map((exercise) => (
                  <View key={exercise.id} style={styles.liftSummaryPill}>
                    <Text style={styles.liftSummaryLabel}>Latest</Text>
                    <Text style={[styles.liftSummaryValue, { color: exercise.color }]}>{exercise.valueText}</Text>
                    <Text style={styles.liftSummaryGain}>{exercise.gainText}</Text>
                  </View>
                ))}
            </View>
            <View style={styles.historyBlock}>
              <Text style={styles.cardSub}>Recent sessions</Text>
              {exerciseWorkoutHistory.length ? (
                exerciseWorkoutHistory.slice(0, 5).map((entry) => (
                  <View key={entry.id} style={styles.workoutHistoryRow}>
                    <Text style={styles.workoutHistoryDate}>{entry.date}</Text>
                    <Text style={styles.workoutHistoryMeta} numberOfLines={1}>{entry.exercises}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No workouts found for this lift.</Text>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 120 },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 },
  headerLeft: {},
  headerTitle: { fontSize: 32, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500', marginTop: 2 },
  adherencePill: {
    alignItems: 'center', backgroundColor: COLORS.successSoft,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(0,245,160,0.2)',
  },
  adherencePillValue: { fontSize: 20, fontWeight: '900', color: COLORS.success, letterSpacing: -0.5 },
  adherencePillLabel: { fontSize: 10, fontWeight: '600', color: COLORS.success, opacity: 0.7, letterSpacing: 0.3 },

  // Plan card
  planCard: { borderRadius: 20, borderWidth: 1, borderColor: COLORS.borderAccent, marginBottom: 20, overflow: 'hidden' },
  planCardInner: { padding: 18 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  planTopLeft: { flex: 1, paddingRight: 12 },
  planLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  planName: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  planDates: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500', marginTop: 4 },
  planStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planStatValue: { fontSize: 22, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: -0.5 },
  planStatLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, marginTop: 2 },
  planStatDiv: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },

  weekRow: { flexDirection: 'row', gap: 4, marginBottom: 6, alignItems: 'flex-end' },
  weekSlot: { flex: 1, position: 'relative', alignItems: 'center' },
  weekBar: { height: 6, width: '100%', borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  weekBarDone: { backgroundColor: `${COLORS.accent}60` },
  weekBarCurrent: { backgroundColor: COLORS.accent },
  weekDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent, position: 'absolute', bottom: -1, shadowColor: COLORS.accent, shadowOpacity: 0.8, shadowRadius: 4 },
  weekLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  weekLabelText: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },

  // Tabs
  tabRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 4, gap: 2, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: COLORS.accent },
  tabText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  tabTextActive: { color: '#fff' },
  goalCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
  },
  goalCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  goalCardTitle: { marginTop: 6, fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  goalRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  goalMetric: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  goalMetricCaption: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },
  goalMetricValue: { marginTop: 4, fontSize: 13, fontWeight: '800', color: COLORS.textPrimary },

  // Card base
  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  cardSub: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500', marginTop: 4 },
  totalSetsPill: { backgroundColor: COLORS.accentSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.borderAccent },
  totalSetsText: { fontSize: 12, fontWeight: '800', color: COLORS.accent },

  // Volume
  volumeList: { gap: 12 },
  emptyText: { fontSize: 13, fontWeight: '500', color: COLORS.textMuted },
  volumeRow: {},
  volumeRowActive: {
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    borderRadius: 10,
    padding: 8,
    backgroundColor: COLORS.accentSoft,
  },
  volumeRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  volumeLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  volumeCount: { fontSize: 13, fontWeight: '800' },
  barTrack: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    width: (SCREEN_WIDTH - 50) / 2,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  statValue: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  statUnit: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginTop: 1, marginBottom: 6 },
  statLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },

  // Chart
  chartWrap: { marginVertical: 8, marginHorizontal: -4 },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  selectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectorChipActive: {
    borderColor: COLORS.borderAccent,
    backgroundColor: COLORS.accentSoft,
  },
  selectorChipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  selectorChipTextActive: {
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },

  // Lift list
  liftList: { gap: 10, marginTop: 16 },
  liftRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  liftRowActive: {
    borderColor: COLORS.borderAccent,
    backgroundColor: COLORS.accentSoft,
  },
  liftDot: { width: 10, height: 10, borderRadius: 5 },
  liftName: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  liftValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  liftGain: { fontSize: 12, fontWeight: '700', color: COLORS.success, minWidth: 54, textAlign: 'right' },
  liftSummaryRow: { marginTop: 12 },
  liftSummaryPill: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  liftSummaryLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  liftSummaryValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  liftSummaryGain: {
    marginLeft: 'auto',
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '700',
  },
  workoutHistoryList: { gap: 8 },
  workoutHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  workoutHistoryDate: { width: 92, fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  workoutHistoryMeta: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  workoutHistorySets: { fontSize: 12, fontWeight: '800', color: COLORS.accent },
  historyBlock: { marginTop: 16, gap: 8 },

});
