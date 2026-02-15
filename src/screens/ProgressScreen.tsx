import React, { useEffect, useMemo, useState } from 'react';
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
  VictoryScatter,
  VictoryBar,
  VictoryChart,
  VictoryGroup,
  VictoryLine,
} from 'victory-native';
import { PhasePlan, User, WorkoutLog, WorkoutSessionEntry, StrengthSnapshot, TrackingPreferences } from '../types/domain';
import { fetchNutritionTotalsForDates, RuntimeDailyNutritionTotals } from '../services/mealRuntimeService';
import { estimateDailyCalories } from '../utils/calorieGoal';
import { formatLocalDateYMD, parseYMDToDate } from '../utils/date';
import { PHYSIQUE_LEVELS } from '../data/physiqueLevels';

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
  { id: 'overview', label: 'Overview' },
  { id: 'strength', label: 'Strength' },
  { id: 'body', label: 'Body' },
  { id: 'nutrition', label: 'Nutrition' },
] as const;

const TIME_RANGES = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'plan', label: 'Plan' },
] as const;

const MACRO_SPLIT = { protein: 0.3, carbs: 0.4, fats: 0.3 } as const;

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
  const [activeView, setActiveView] = useState<typeof VIEW_TABS[number]['id']>('overview');
  const [timeRange, setTimeRange] = useState<typeof TIME_RANGES[number]['id']>('month');

  const rangeStartDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (timeRange === 'week') {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return start;
    }
    if (timeRange === 'month') {
      const start = new Date(today);
      start.setDate(today.getDate() - 29);
      return start;
    }
    return phase.startDate ? parseYMDToDate(phase.startDate) : today;
  }, [phase.startDate, timeRange]);

  const filteredSessions = useMemo(
    () =>
      workoutSessions.filter((session) => {
        if (session.phasePlanId !== phase.id) return false;
        const sessionDate = parseYMDToDate(session.date);
        return sessionDate >= rangeStartDate;
      }),
    [phase.id, rangeStartDate, workoutSessions]
  );
  const filteredWorkoutLogs = useMemo(
    () =>
      workoutLogs.filter((log) => {
        if (log.phasePlanId !== phase.id) return false;
        const logDate = parseYMDToDate(log.date);
        return logDate >= rangeStartDate;
      }),
    [phase.id, rangeStartDate, workoutLogs]
  );
  const filteredStrengthSnapshots = useMemo(
    () =>
      strengthSnapshots.filter((snapshot) => {
        if (snapshot.phasePlanId !== phase.id) return false;
        const snapshotDate = parseYMDToDate(snapshot.date);
        return snapshotDate >= rangeStartDate;
      }),
    [phase.id, rangeStartDate, strengthSnapshots]
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
  const [nutritionTotals, setNutritionTotals] = useState<RuntimeDailyNutritionTotals[]>([]);

  const calorieGoal = useMemo(() => estimateDailyCalories(user).goalCalories, [user]);
  const macroTargets = useMemo(() => ({
    protein: Math.round((calorieGoal * MACRO_SPLIT.protein) / 4),
    carbs: Math.round((calorieGoal * MACRO_SPLIT.carbs) / 4),
    fats: Math.round((calorieGoal * MACRO_SPLIT.fats) / 9),
  }), [calorieGoal]);

  const nutritionDates = useMemo(() => {
    const today = new Date();
    const planStart = phase.startDate ? parseYMDToDate(phase.startDate) : today;
    const planDays = Math.max(1, Math.floor((today.getTime() - planStart.getTime()) / 86400000) + 1);
    const rangeDays = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : planDays;
    const days = Math.max(1, Math.min(rangeDays, 90));
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      date.setHours(0, 0, 0, 0);
      dates.push(formatLocalDateYMD(date));
    }
    return dates;
  }, [phase.startDate, timeRange]);

  useEffect(() => {
    let isCancelled = false;
    const loadNutrition = async () => {
      try {
        const totals = await fetchNutritionTotalsForDates(
          user.id,
          phase.id,
          nutritionDates,
          user.eatingMode
        );
        if (!isCancelled) {
          setNutritionTotals(totals);
        }
      } catch (error) {
        console.error('Failed to load nutrition progress:', error);
        if (!isCancelled) {
          setNutritionTotals([]);
        }
      }
    };
    void loadNutrition();
    return () => {
      isCancelled = true;
    };
  }, [nutritionDates, phase.id, user.eatingMode, user.id]);

  const bodyFatRange = useMemo(
    () =>
      PHYSIQUE_LEVELS.find((level) => level.id === user.currentPhysiqueLevel)?.bodyFatRange ?? null,
    [user.currentPhysiqueLevel]
  );
  const currentWeightLbs = useMemo(() => {
    if (!user.weightKg || user.weightKg <= 0) return null;
    return Math.round(user.weightKg * 2.20462 * 10) / 10;
  }, [user.weightKg]);
  const bodyWeightPoint = useMemo(() => {
    if (!currentWeightLbs) return [];
    return [{ date: 'Now', weight: currentWeightLbs }];
  }, [currentWeightLbs]);

  const nutritionData = useMemo(() => {
    const capPercent = (value: number) => Math.max(0, Math.min(150, Math.round(value)));
    return nutritionTotals.map((day) => {
      const date = parseYMDToDate(day.date);
      const dayLabel =
        timeRange === 'week'
          ? date.toLocaleDateString(undefined, { weekday: 'short' })
          : `${date.getMonth() + 1}/${date.getDate()}`;
      return {
        day: dayLabel,
        calories: capPercent((day.calories / Math.max(calorieGoal, 1)) * 100),
        protein: capPercent((day.protein / Math.max(macroTargets.protein, 1)) * 100),
        carbs: capPercent((day.carbs / Math.max(macroTargets.carbs, 1)) * 100),
        fats: capPercent((day.fats / Math.max(macroTargets.fats, 1)) * 100),
      };
    });
  }, [calorieGoal, macroTargets.carbs, macroTargets.fats, macroTargets.protein, nutritionTotals, timeRange]);

  const nutritionAverages = useMemo(() => {
    if (!nutritionData.length) {
      return { protein: 0, carbs: 0, fats: 0 };
    }
    const totals = nutritionData.reduce(
      (sum, item) => ({
        protein: sum.protein + item.protein,
        carbs: sum.carbs + item.carbs,
        fats: sum.fats + item.fats,
      }),
      { protein: 0, carbs: 0, fats: 0 }
    );
    return {
      protein: Math.round(totals.protein / nutritionData.length),
      carbs: Math.round(totals.carbs / nutritionData.length),
      fats: Math.round(totals.fats / nutritionData.length),
    };
  }, [nutritionData]);

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
    const totalDays = Math.max(1, Math.floor((today.getTime() - rangeStartDate.getTime()) / 86400000) + 1);
    const workoutDays = new Set(
      filteredSessions
        .filter((session) => session.exercises.some((exercise) => exercise.completed === true))
        .map((session) => session.date)
    ).size;
    return Math.max(0, totalDays - workoutDays);
  }, [filteredSessions, rangeStartDate]);

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

        {/* ── Time range ── */}
        <View style={styles.rangeRow}>
          {TIME_RANGES.map((range) => {
            const isActive = timeRange === range.id;
            return (
              <TouchableOpacity
                key={range.id}
                style={[styles.rangeBtn, isActive && styles.rangeBtnActive]}
                onPress={() => setTimeRange(range.id)}
              >
                <Text style={[styles.rangeText, isActive && styles.rangeTextActive]}>{range.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Overview ── */}
        {activeView === 'overview' && (
          <>
            {/* Volume card */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View>
                  <Text style={styles.cardTitle}>Training Volume</Text>
                  <Text style={styles.cardSub}>Sets per muscle group</Text>
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

            {/* Stats 2×2 */}
            <View style={styles.statsGrid}>
                {[
                  { label: 'Avg. Session', value: `${avgWorkoutMinutes}`, unit: 'min', color: COLORS.orange },
                { label: 'Total PRs', value: `${totalPRs}`, unit: timeRange, color: COLORS.pink },
                { label: 'Rest Days', value: `${restDays}`, unit: timeRange, color: '#A78BFA' },
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

        {/* ── Strength ── */}
        {activeView === 'strength' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Strength Progression</Text>
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

        {/* ── Body ── */}
        {activeView === 'body' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Body Composition</Text>
            <Text style={styles.cardSub}>Profile-linked body metrics</Text>
            {bodyWeightPoint.length ? (
              <View style={styles.chartWrap}>
                <VictoryChart
                  width={SCREEN_WIDTH - 64}
                  height={220}
                  padding={{ top: 16, bottom: 36, left: 44, right: 16 }}
                >
                  <VictoryAxis
                    style={{
                      axis: { stroke: 'rgba(255,255,255,0.08)' },
                      tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
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
                  <VictoryScatter
                    data={bodyWeightPoint}
                    x="date"
                    y="weight"
                    size={5}
                    style={{ data: { fill: COLORS.accent } }}
                  />
                </VictoryChart>
              </View>
            ) : (
              <Text style={styles.emptyText}>No weight value found in your profile yet.</Text>
            )}
            <View style={styles.bodyGrid}>
              <LinearGradient colors={[`${COLORS.accent}18`, 'transparent']} style={styles.bodyCard}>
                <Text style={styles.bodyCardLabel}>Weight</Text>
                <Text style={[styles.bodyCardValue, { color: COLORS.accent }]}>
                  {currentWeightLbs !== null ? currentWeightLbs.toFixed(1) : '—'}
                </Text>
                <Text style={styles.bodyCardUnit}>lbs</Text>
                <View style={styles.bodyCardDelta}>
                  <Text style={styles.bodyCardDeltaText}>from profile</Text>
                </View>
              </LinearGradient>
              <LinearGradient colors={[`${COLORS.pink}18`, 'transparent']} style={styles.bodyCard}>
                <Text style={styles.bodyCardLabel}>Body Fat</Text>
                <Text style={[styles.bodyCardValue, { color: COLORS.pink }]}>
                  {bodyFatRange ?? '—'}
                </Text>
                <Text style={styles.bodyCardUnit}>est. range</Text>
                <View style={[styles.bodyCardDelta, { backgroundColor: `${COLORS.pink}15` }]}>
                  <Text style={[styles.bodyCardDeltaText, { color: COLORS.pink }]}>
                    level {user.currentPhysiqueLevel}
                  </Text>
                </View>
              </LinearGradient>
            </View>
          </View>
        )}

        {/* ── Nutrition ── */}
        {activeView === 'nutrition' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Nutrition Adherence</Text>
            <Text style={styles.cardSub}>% of daily target met</Text>
            <View style={styles.chartWrap}>
              <VictoryChart
                width={SCREEN_WIDTH - 64}
                height={200}
                domainPadding={{ x: 20 }}
                padding={{ top: 16, bottom: 36, left: 44, right: 16 }}
              >
                <VictoryAxis
                  style={{
                    axis: { stroke: 'rgba(255,255,255,0.08)' },
                    tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
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
                <VictoryGroup data={nutritionData} x="day">
                  <VictoryBar y="protein" style={{ data: { fill: COLORS.accent, borderRadius: 4 } }} />
                </VictoryGroup>
              </VictoryChart>
            </View>
            <View style={styles.macroRow}>
              {[
                { label: 'Protein', avg: nutritionAverages.protein, color: COLORS.accent },
                { label: 'Carbs', avg: nutritionAverages.carbs, color: COLORS.orange },
                { label: 'Fats', avg: nutritionAverages.fats, color: COLORS.pink },
              ].map((macro) => (
                <View key={macro.label} style={styles.macroCard}>
                  <View style={[styles.macroDot, { backgroundColor: macro.color }]} />
                  <Text style={[styles.macroValue, { color: macro.color }]}>{macro.avg}%</Text>
                  <Text style={styles.macroLabel}>{macro.label}</Text>
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

  // Range
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  rangeBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'rgba(255,255,255,0.03)' },
  rangeBtnActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  rangeText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  rangeTextActive: { color: COLORS.textPrimary },

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

  // Body
  bodyGrid: { flexDirection: 'row', gap: 10, marginTop: 12 },
  bodyCard: { flex: 1, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: 'center' },
  bodyCardLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  bodyCardValue: { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  bodyCardUnit: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginTop: 2 },
  bodyCardDelta: { marginTop: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: `${COLORS.accent}15` },
  bodyCardDeltaText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },

  // Macros
  macroRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  macroCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  macroDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 8 },
  macroValue: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  macroLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginTop: 4 },
});
