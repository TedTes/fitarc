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
  { id: 'workouts', label: 'Workouts' },
  { id: 'muscles', label: 'Muscles' },
  { id: 'lifts', label: 'Lifts' },
] as const;

const normalizeGoal = (value?: string | null):
  | 'build_muscle'
  | 'get_stronger'
  | 'lose_fat'
  | 'endurance'
  | 'general_fitness' => {
  const key = String(value ?? '').toLowerCase();
  if (key.includes('muscle') || key.includes('hypertrophy')) return 'build_muscle';
  if (key.includes('strong') || key.includes('strength')) return 'get_stronger';
  if (key.includes('fat') || key.includes('cut') || key.includes('lose')) return 'lose_fat';
  if (key.includes('endur')) return 'endurance';
  return 'general_fitness';
};

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

const buildStrengthSeries = (snapshots: StrengthSnapshot[]) => {
  const today = new Date();
  const weeks: { key: string; start: Date }[] = [];
  for (let i = 3; i >= 0; i -= 1) {
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
    const maxFor = (lift: string) => {
      const values = bucket.filter((s) => s.lift === lift).map((s) => s.weight ?? 0);
      return values.length ? Math.max(...values) : 0;
    };
    return {
      week: week.key,
      squat: maxFor('squat'),
      bench: maxFor('bench_press'),
      deadlift: maxFor('deadlift'),
      press: maxFor('overhead_press'),
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

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  user,
  phase,
  workoutSessions,
  workoutLogs,
  strengthSnapshots,
}) => {
  const [activeView, setActiveView] = useState<typeof VIEW_TABS[number]['id']>('workouts');

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

  const strengthData = useMemo(() => buildStrengthSeries(filteredStrengthSnapshots), [filteredStrengthSnapshots]);
  const volumeData = useMemo(() => buildVolumeRows(filteredWorkoutLogs), [filteredWorkoutLogs]);
  const completedWorkoutHistory = useMemo(
    () =>
      [...filteredSessions]
        .filter((session) => session.exercises.some((exercise) => exercise.completed === true))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((session) => {
          const completedExercises = session.exercises.filter((exercise) => exercise.completed === true);
          const completedSets = completedExercises.reduce((sum, exercise) => {
            const loggedSets = exercise.setDetails?.length ?? 0;
            return sum + (loggedSets > 0 ? loggedSets : Math.max(0, exercise.sets ?? 0));
          }, 0);
          return {
            id: session.id,
            date: session.date,
            completedExercises: completedExercises.length,
            totalExercises: session.exercises.length,
            completedSets,
          };
        }),
    [filteredSessions]
  );

  const liftSummaries = useMemo(() => {
    const lifts = [
      { id: 'squat', name: 'Squat', color: COLORS.orange },
      { id: 'bench_press', name: 'Bench Press', color: COLORS.accent },
      { id: 'deadlift', name: 'Deadlift', color: COLORS.pink },
      { id: 'overhead_press', name: 'OHP', color: COLORS.success },
    ];

    return lifts.map((lift) => {
      const samples = filteredStrengthSnapshots
        .filter((snap) => snap.lift === lift.id && (snap.weight ?? 0) > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!samples.length) {
        return {
          ...lift,
          valueText: '—',
          gainText: '—',
          prCount: 0,
        };
      }

      const start = samples[0].weight ?? 0;
      const latest = samples[samples.length - 1].weight ?? 0;
      let maxSoFar = Number.NEGATIVE_INFINITY;
      let prCount = 0;
      samples.forEach((sample) => {
        const weight = sample.weight ?? 0;
        if (weight > maxSoFar) {
          maxSoFar = weight;
          prCount += 1;
        }
      });
      const gain = latest - start;
      const gainPrefix = gain > 0 ? '+' : '';

      return {
        ...lift,
        valueText: `${Math.round(latest)} lbs`,
        gainText: `${gainPrefix}${Math.round(gain)} lbs`,
        prCount,
      };
    });
  }, [filteredStrengthSnapshots]);

  const totalPRs = useMemo(
    () => liftSummaries.reduce((sum, lift) => sum + lift.prCount, 0),
    [liftSummaries]
  );

  const totalSets = volumeData.reduce((sum, item) => sum + item.sets, 0);
  const avgWorkoutMinutes = filteredSessions.length
    ? Math.round((totalSets / filteredSessions.length) * 3)
    : 0;
  const maxSets = Math.max(...volumeData.map((v) => v.sets), 1);
  const restDays = useMemo(() => {
    const today = new Date();
    const planStart = phase.startDate ? parseYMDToDate(phase.startDate) : today;
    planStart.setHours(0, 0, 0, 0);
    const totalDays = Math.max(1, Math.floor((today.getTime() - planStart.getTime()) / 86400000) + 1);
    const workoutDays = new Set(
      filteredSessions
        .filter((session) => session.exercises.some((exercise) => exercise.completed === true))
        .map((session) => session.date)
    ).size;
    return Math.max(0, totalDays - workoutDays);
  }, [filteredSessions, phase.startDate]);
  const activeGoal = useMemo(
    () => normalizeGoal(user.planPreferences?.primaryGoal ?? phase.goalType),
    [phase.goalType, user.planPreferences?.primaryGoal]
  );
  const goalAlignment = useMemo(() => {
    const expectedWorkoutsByNow = Math.max(
      1,
      Math.round((planProgress.currentWeek / Math.max(planProgress.totalWeeks, 1)) * Math.max(planProgress.totalWorkouts, 1))
    );
    const completedWorkouts = planProgress.completedWorkouts;
    const completionVsPlanPct = Math.round((completedWorkouts / expectedWorkoutsByNow) * 100);
    const completionDelta = completionVsPlanPct - 100;

    const strengthSamples = filteredStrengthSnapshots
      .filter((snap) => ['squat', 'bench_press', 'deadlift', 'overhead_press'].includes(String(snap.lift)))
      .sort((a, b) => a.date.localeCompare(b.date));
    const head = strengthSamples.slice(0, 8);
    const tail = strengthSamples.slice(-8);
    const headAvg = head.length ? head.reduce((sum, snap) => sum + (snap.weight ?? 0), 0) / head.length : 0;
    const tailAvg = tail.length ? tail.reduce((sum, snap) => sum + (snap.weight ?? 0), 0) / tail.length : 0;
    const strengthGainPct = headAvg > 0 ? Math.round(((tailAvg - headAvg) / headAvg) * 100) : 0;
    const targetStrengthGainNow = Math.round(
      (planProgress.currentWeek / Math.max(planProgress.totalWeeks, 1)) *
        (user.experienceLevel === 'beginner' ? 14 : user.experienceLevel === 'intermediate' ? 9 : 6)
    );

    const targetSetsPerWorkout = user.experienceLevel === 'beginner' ? 14 : user.experienceLevel === 'intermediate' ? 18 : 22;
    const targetSetsNow = expectedWorkoutsByNow * targetSetsPerWorkout;
    const setProgressPct = targetSetsNow > 0 ? Math.round((totalSets / targetSetsNow) * 100) : 0;
    const setDelta = setProgressPct - 100;

    const targetConsistency = activeGoal === 'lose_fat' ? 85 : 75;
    const consistencyDelta = planProgress.completionRate - targetConsistency;

    if (activeGoal === 'build_muscle') {
      return {
        label: 'Volume vs plan target',
        current: `${totalSets} sets`,
        target: `${targetSetsNow} sets`,
        delta: setDelta,
        accent: COLORS.accent,
      };
    }
    if (activeGoal === 'get_stronger') {
      return {
        label: 'Strength gain vs plan target',
        current: `${strengthGainPct >= 0 ? '+' : ''}${strengthGainPct}%`,
        target: `+${targetStrengthGainNow}%`,
        delta: strengthGainPct - targetStrengthGainNow,
        accent: COLORS.orange,
      };
    }
    if (activeGoal === 'lose_fat') {
      return {
        label: 'Consistency vs plan target',
        current: `${planProgress.completionRate}%`,
        target: `${targetConsistency}%`,
        delta: consistencyDelta,
        accent: COLORS.pink,
      };
    }
    if (activeGoal === 'endurance') {
      return {
        label: 'Workout completion vs plan pace',
        current: `${completedWorkouts}`,
        target: `${expectedWorkoutsByNow}`,
        delta: completionDelta,
        accent: COLORS.blue,
      };
    }
    return {
      label: 'Plan pace alignment',
      current: `${completedWorkouts}`,
      target: `${expectedWorkoutsByNow}`,
      delta: completionDelta,
      accent: COLORS.success,
    };
  }, [
    activeGoal,
    filteredStrengthSnapshots,
    planProgress.completedWorkouts,
    planProgress.completionRate,
    planProgress.currentWeek,
    planProgress.totalWeeks,
    planProgress.totalWorkouts,
    totalSets,
    user.experienceLevel,
  ]);
  const goalProgressSeries = useMemo(() => {
    const totalWeeks = Math.max(planProgress.totalWeeks, 1);
    const goalWorkouts = Math.max(planProgress.totalWorkouts, 1);
    const completedPerWeek = Array.from({ length: totalWeeks }, () => 0);
    const planStart = phase.startDate ? parseYMDToDate(phase.startDate) : null;
    const completedSessions = filteredSessions.filter(
      (session) => session.exercises?.length && session.exercises.every((exercise) => exercise.completed === true)
    );

    completedSessions.forEach((session, idx) => {
      if (planStart) {
        const sessionDate = parseYMDToDate(session.date);
        const weekOffset = Math.floor((sessionDate.getTime() - planStart.getTime()) / 604800000);
        const boundedWeek = Math.max(0, Math.min(totalWeeks - 1, weekOffset));
        completedPerWeek[boundedWeek] += 1;
      } else {
        const boundedWeek = Math.min(
          totalWeeks - 1,
          Math.floor((idx / Math.max(completedSessions.length, 1)) * totalWeeks)
        );
        completedPerWeek[boundedWeek] += 1;
      }
    });

    let cumulativeCompleted = 0;
    return Array.from({ length: totalWeeks }, (_, weekIdx) => {
      cumulativeCompleted += completedPerWeek[weekIdx];
      const expectedCompleted = ((weekIdx + 1) / totalWeeks) * goalWorkouts;
      return {
        week: `W${weekIdx + 1}`,
        actualPct: Math.round(Math.min(100, (cumulativeCompleted / goalWorkouts) * 100)),
        targetPct: Math.round(Math.min(100, (expectedCompleted / goalWorkouts) * 100)),
      };
    });
  }, [filteredSessions, phase.startDate, planProgress.totalWeeks, planProgress.totalWorkouts]);
  const currentTrajectoryDelta = useMemo(() => {
    if (!goalProgressSeries.length) return 0;
    const index = Math.max(0, Math.min(planProgress.currentWeek - 1, goalProgressSeries.length - 1));
    const point = goalProgressSeries[index];
    return point.actualPct - point.targetPct;
  }, [goalProgressSeries, planProgress.currentWeek]);

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

        {/* ── Workouts ── */}
        {activeView === 'workouts' && (
          <>
            <LinearGradient
              colors={[`${goalAlignment.accent}20`, 'rgba(255,255,255,0.02)']}
              style={styles.goalCard}
            >
              <Text style={styles.goalCardLabel}>Goal Alignment</Text>
              <Text style={styles.goalCardTitle}>{goalAlignment.label}</Text>
              <View style={styles.goalRow}>
                <View style={styles.goalMetric}>
                  <Text style={styles.goalMetricCaption}>Current</Text>
                  <Text style={styles.goalMetricValue}>{goalAlignment.current}</Text>
                </View>
                <View style={styles.goalMetric}>
                  <Text style={styles.goalMetricCaption}>Target now</Text>
                  <Text style={styles.goalMetricValue}>{goalAlignment.target}</Text>
                </View>
                <View style={styles.goalMetric}>
                  <Text style={styles.goalMetricCaption}>Delta</Text>
                  <Text
                    style={[
                      styles.goalMetricValue,
                      { color: goalAlignment.delta >= 0 ? COLORS.success : COLORS.orange },
                    ]}
                  >
                    {goalAlignment.delta >= 0 ? '+' : ''}{goalAlignment.delta}%
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View>
                  <Text style={styles.cardTitle}>Plan Trajectory</Text>
                  <Text style={styles.cardSub}>Actual completion vs target pace</Text>
                </View>
                <View style={[styles.totalSetsPill, { backgroundColor: `${COLORS.blue}20`, borderColor: 'rgba(78,168,222,0.35)' }]}>
                  <Text style={[styles.totalSetsText, { color: currentTrajectoryDelta >= 0 ? COLORS.success : COLORS.orange }]}>
                    {currentTrajectoryDelta >= 0 ? '+' : ''}{currentTrajectoryDelta}%
                  </Text>
                </View>
              </View>
              <View style={styles.chartWrap}>
                <VictoryChart
                  width={SCREEN_WIDTH - 64}
                  height={220}
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
                    tickFormat={(v) => `${v}%`}
                    style={{
                      axis: { stroke: 'transparent' },
                      tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
                      grid: { stroke: 'rgba(255,255,255,0.05)' },
                    }}
                  />
                  <VictoryLine
                    data={goalProgressSeries}
                    x="week"
                    y="targetPct"
                    style={{ data: { stroke: 'rgba(139,147,176,0.8)', strokeWidth: 2, strokeDasharray: '6,4' } }}
                  />
                  <VictoryLine
                    data={goalProgressSeries}
                    x="week"
                    y="actualPct"
                    style={{ data: { stroke: COLORS.accent, strokeWidth: 2.8 } }}
                  />
                </VictoryChart>
              </View>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.accent }]} />
                  <Text style={styles.legendText}>Actual</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: 'rgba(139,147,176,0.85)' }]} />
                  <Text style={styles.legendText}>Target</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View>
                  <Text style={styles.cardTitle}>Workout History</Text>
                  <Text style={styles.cardSub}>Completed sessions across your plan</Text>
                </View>
                <View style={styles.totalSetsPill}>
                  <Text style={styles.totalSetsText}>{completedWorkoutHistory.length} workouts</Text>
                </View>
              </View>
              <View style={styles.workoutHistoryList}>
                {completedWorkoutHistory.length ? (
                  completedWorkoutHistory.map((entry) => (
                    <View key={entry.id} style={styles.workoutHistoryRow}>
                      <Text style={styles.workoutHistoryDate}>{entry.date}</Text>
                      <Text style={styles.workoutHistoryMeta}>
                        {entry.completedExercises}/{entry.totalExercises} exercises
                      </Text>
                      <Text style={styles.workoutHistorySets}>{entry.completedSets} sets</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No completed workouts yet.</Text>
                )}
              </View>
            </View>

            <View style={styles.statsGrid}>
                {[
                  { label: 'Avg. Session', value: `${avgWorkoutMinutes}`, unit: 'min', color: COLORS.orange },
                { label: 'Total PRs', value: `${totalPRs}`, unit: 'plan', color: COLORS.pink },
                { label: 'Rest Days', value: `${restDays}`, unit: 'plan', color: '#A78BFA' },
                  { label: 'Consistency', value: `${planProgress.completionRate}`, unit: '%', color: COLORS.success },
                ].map((stat) => (
                <LinearGradient
                  key={stat.label}
                  colors={[`${stat.color}14`, 'transparent']}
                  style={styles.statCard}
                >
                  <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                  <Text style={styles.statUnit}>{stat.unit}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </LinearGradient>
              ))}
            </View>
          </>
        )}

        {/* ── Muscles ── */}
        {activeView === 'muscles' && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View>
                <Text style={styles.cardTitle}>Muscle Progress</Text>
                <Text style={styles.cardSub}>Completed sets per muscle group</Text>
              </View>
              <View style={styles.totalSetsPill}>
                <Text style={styles.totalSetsText}>{totalSets} sets</Text>
              </View>
            </View>
            <View style={styles.volumeList}>
              {volumeData.length ? (
                volumeData.map((item) => (
                  <View key={item.muscle} style={styles.volumeRow}>
                    <View style={styles.volumeRowTop}>
                      <Text style={styles.volumeLabel}>{item.muscle}</Text>
                      <Text style={[styles.volumeCount, { color: item.color }]}>{item.sets}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${(item.sets / maxSets) * 100}%`, backgroundColor: item.color }]} />
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No completed workout sets yet.</Text>
              )}
            </View>
          </View>
        )}

        {/* ── Lifts ── */}
        {activeView === 'lifts' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Lift Progression</Text>
            <Text style={styles.cardSub}>Max weight per lift · lbs</Text>
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
                <VictoryLine data={strengthData} x="week" y="squat" style={{ data: { stroke: COLORS.orange, strokeWidth: 2.5 } }} />
                <VictoryLine data={strengthData} x="week" y="bench" style={{ data: { stroke: COLORS.accent, strokeWidth: 2.5 } }} />
                <VictoryLine data={strengthData} x="week" y="deadlift" style={{ data: { stroke: COLORS.pink, strokeWidth: 2.5 } }} />
              </VictoryChart>
            </View>

            <View style={styles.liftList}>
              {liftSummaries.map((lift) => (
                <View key={lift.name} style={styles.liftRow}>
                  <View style={[styles.liftDot, { backgroundColor: lift.color }]} />
                  <Text style={styles.liftName}>{lift.name}</Text>
                  <Text style={[styles.liftValue, { color: lift.color }]}>{lift.valueText}</Text>
                  <Text style={styles.liftGain}>{lift.gainText}</Text>
                </View>
              ))}
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
  liftDot: { width: 10, height: 10, borderRadius: 5 },
  liftName: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  liftValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  liftGain: { fontSize: 12, fontWeight: '700', color: COLORS.success, minWidth: 54, textAlign: 'right' },
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

});
