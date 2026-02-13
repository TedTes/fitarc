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
  VictoryBar,
  VictoryChart,
  VictoryGroup,
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
  if (!snapshots.length) {
    return [
      { week: 'W1', squat: 185, bench: 155, deadlift: 225, press: 95 },
      { week: 'W2', squat: 195, bench: 160, deadlift: 235, press: 100 },
      { week: 'W3', squat: 205, bench: 165, deadlift: 245, press: 105 },
      { week: 'W4', squat: 215, bench: 170, deadlift: 255, press: 110 },
    ];
  }

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
  if (!workoutLogs.length) {
    return [
      { muscle: 'Legs', sets: 52, color: COLORS.accent },
      { muscle: 'Back', sets: 48, color: COLORS.blue },
      { muscle: 'Chest', sets: 42, color: COLORS.pink },
      { muscle: 'Arms', sets: 38, color: COLORS.orange },
      { muscle: 'Shoulders', sets: 36, color: '#A78BFA' },
    ];
  }
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
  user: _user,
  phase,
  workoutSessions,
  workoutLogs,
  strengthSnapshots,
}) => {
  const [activeView, setActiveView] = useState<typeof VIEW_TABS[number]['id']>('overview');
  const [timeRange, setTimeRange] = useState<typeof TIME_RANGES[number]['id']>('month');

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

  const strengthData = useMemo(() => buildStrengthSeries(strengthSnapshots), [strengthSnapshots]);
  const volumeData = useMemo(() => buildVolumeRows(workoutLogs), [workoutLogs]);

  const bodyMetrics = [
    { date: 'W1', weight: 182, bodyFat: 18.2 },
    { date: 'W2', weight: 181, bodyFat: 17.8 },
    { date: 'W3', weight: 180.5, bodyFat: 17.5 },
    { date: 'W4', weight: 179.8, bodyFat: 17.2 },
  ];

  const nutritionData = [
    { day: 'Mon', calories: 95, protein: 98, carbs: 92, fats: 88 },
    { day: 'Tue', calories: 102, protein: 105, carbs: 98, fats: 95 },
    { day: 'Wed', calories: 88, protein: 92, carbs: 85, fats: 90 },
    { day: 'Thu', calories: 98, protein: 100, carbs: 96, fats: 92 },
    { day: 'Fri', calories: 105, protein: 108, carbs: 102, fats: 98 },
    { day: 'Sat', calories: 92, protein: 95, carbs: 88, fats: 85 },
    { day: 'Sun', calories: 100, protein: 102, carbs: 98, fats: 95 },
  ];

  const totalSets = volumeData.reduce((sum, item) => sum + item.sets, 0);
  const avgWorkoutMinutes = Math.max(30, Math.round((totalSets / Math.max(planProgress.totalWorkouts, 1)) * 3));
  const maxSets = Math.max(...volumeData.map((v) => v.sets), 1);

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
                {volumeData.map((item) => (
                  <View key={item.muscle} style={styles.volumeRow}>
                    <View style={styles.volumeRowTop}>
                      <Text style={styles.volumeLabel}>{item.muscle}</Text>
                      <Text style={[styles.volumeCount, { color: item.color }]}>{item.sets}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${(item.sets / maxSets) * 100}%`, backgroundColor: item.color }]} />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Stats 2×2 */}
            <View style={styles.statsGrid}>
              {[
                { label: 'Avg. Session', value: `${avgWorkoutMinutes}`, unit: 'min', color: COLORS.orange },
                { label: 'Total PRs', value: '12', unit: 'this plan', color: COLORS.pink },
                { label: 'Rest Days', value: '8', unit: 'logged', color: '#A78BFA' },
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
              {[
                { name: 'Squat', color: COLORS.orange, value: '215 lbs', gain: '+30 lbs' },
                { name: 'Bench Press', color: COLORS.accent, value: '170 lbs', gain: '+15 lbs' },
                { name: 'Deadlift', color: COLORS.pink, value: '255 lbs', gain: '+30 lbs' },
                { name: 'OHP', color: COLORS.success, value: '110 lbs', gain: '+15 lbs' },
              ].map((lift) => (
                <View key={lift.name} style={styles.liftRow}>
                  <View style={[styles.liftDot, { backgroundColor: lift.color }]} />
                  <Text style={styles.liftName}>{lift.name}</Text>
                  <Text style={[styles.liftValue, { color: lift.color }]}>{lift.value}</Text>
                  <Text style={styles.liftGain}>{lift.gain}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Body ── */}
        {activeView === 'body' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Body Composition</Text>
            <Text style={styles.cardSub}>Weight trend · lbs</Text>
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
                <VictoryLine data={bodyMetrics} x="date" y="weight" style={{ data: { stroke: COLORS.accent, strokeWidth: 2.5 } }} />
              </VictoryChart>
            </View>
            <View style={styles.bodyGrid}>
              <LinearGradient colors={[`${COLORS.accent}18`, 'transparent']} style={styles.bodyCard}>
                <Text style={styles.bodyCardLabel}>Weight</Text>
                <Text style={[styles.bodyCardValue, { color: COLORS.accent }]}>179.8</Text>
                <Text style={styles.bodyCardUnit}>lbs</Text>
                <View style={styles.bodyCardDelta}>
                  <Text style={styles.bodyCardDeltaText}>↓ 2.2 lbs</Text>
                </View>
              </LinearGradient>
              <LinearGradient colors={[`${COLORS.pink}18`, 'transparent']} style={styles.bodyCard}>
                <Text style={styles.bodyCardLabel}>Body Fat</Text>
                <Text style={[styles.bodyCardValue, { color: COLORS.pink }]}>17.2</Text>
                <Text style={styles.bodyCardUnit}>%</Text>
                <View style={[styles.bodyCardDelta, { backgroundColor: `${COLORS.pink}15` }]}>
                  <Text style={[styles.bodyCardDeltaText, { color: COLORS.pink }]}>↓ 1.0%</Text>
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
                { label: 'Protein', avg: 98, color: COLORS.accent },
                { label: 'Carbs', avg: 93, color: COLORS.orange },
                { label: 'Fats', avg: 91, color: COLORS.pink },
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
