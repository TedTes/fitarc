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

const SCREEN_GRADIENT = ['#0A0E27', '#151932', '#1E2340'] as const;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  bgPrimary: '#0A0E27',
  bgSecondary: '#151932',
  bgTertiary: '#1E2340',
  surface: '#10142A',
  card: 'rgba(21, 25, 50, 0.92)',
  textPrimary: '#FFFFFF',
  textSecondary: '#C7CCE6',
  textMuted: 'rgba(199, 204, 230, 0.6)',
  accent: '#6C63FF',
  accentSoft: 'rgba(108, 99, 255, 0.18)',
  success: '#00F5A0',
  pink: '#EC4899',
  orange: '#FFA726',
  border: 'rgba(108, 99, 255, 0.25)',
  borderSoft: 'rgba(199, 204, 230, 0.08)',
} as const;

const VIEW_TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'strength', label: 'Strength', icon: '💪' },
  { id: 'body', label: 'Body', icon: '📏' },
  { id: 'nutrition', label: 'Nutrition', icon: '🍽️' },
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

  const series = weeks.map((week) => {
    const end = new Date(week.start);
    end.setDate(end.getDate() + 7);
    const bucket = snapshots.filter((snap) => {
      const snapDate = new Date(snap.date);
      return snapDate >= week.start && snapDate < end;
    });

    const maxFor = (lift: string) => {
      const values = bucket
        .filter((snap) => snap.lift === lift)
        .map((snap) => snap.weight ?? 0);
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

  return series;
};

const buildVolumeRows = (workoutLogs: WorkoutLog[]) => {
  if (!workoutLogs.length) {
    return [
      { muscle: 'Chest', sets: 42, color: COLORS.accent },
      { muscle: 'Back', sets: 48, color: COLORS.success },
      { muscle: 'Legs', sets: 52, color: COLORS.orange },
      { muscle: 'Shoulders', sets: 36, color: COLORS.pink },
      { muscle: 'Arms', sets: 38, color: '#8B7FFF' },
    ];
  }

  const totals = new Map<string, number>();
  workoutLogs.forEach((log) => {
    Object.entries(log.muscleVolume || {}).forEach(([key, value]) => {
      totals.set(key, (totals.get(key) ?? 0) + (value ?? 0));
    });
  });

  const colors = [COLORS.accent, COLORS.success, COLORS.orange, COLORS.pink, '#8B7FFF'];
  return Array.from(totals.entries())
    .map(([muscle, sets], index) => ({
      muscle: muscle.charAt(0).toUpperCase() + muscle.slice(1),
      sets: Math.round(sets),
      color: colors[index % colors.length],
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
    const completed = sessions.filter((session) => {
      if (!session.exercises?.length) return false;
      return session.exercises.every((ex) => ex.completed === true);
    }).length;
    const total = sessions.length;

    const startDate = phase.startDate ? parseYMDToDate(phase.startDate) : null;
    const endDate = phase.expectedEndDate ? parseYMDToDate(phase.expectedEndDate) : null;
    const totalWeeks = Math.max(phase.expectedWeeks ?? 8, 1);
    const currentWeek = startDate
      ? Math.min(
          totalWeeks,
          Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 604800000) + 1)
        )
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

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>ANALYTICS</Text>
          <Text style={styles.headerTitle}>Progress</Text>
        </View>

        <View style={styles.planCard}>
          <View style={styles.planGlow} />
          <View style={styles.planHeader}>
            <View>
              <Text style={styles.planLabel}>CURRENT PLAN</Text>
              <Text style={styles.planName}>{planProgress.name}</Text>
              <Text style={styles.planDates}>{planProgress.startDate} → {planProgress.endDate}</Text>
            </View>
            <View style={styles.planAdherence}>
              <Text style={styles.planAdherenceValue}>{planProgress.completionRate}%</Text>
              <Text style={styles.planAdherenceLabel}>ADHERENCE</Text>
            </View>
          </View>

          <View style={styles.weekProgressRow}>
            {Array.from({ length: planProgress.totalWeeks }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.weekProgressBar,
                  index < planProgress.currentWeek && styles.weekProgressBarActive,
                ]}
              />
            ))}
          </View>

          <View style={styles.planFooter}>
            <Text style={styles.planFooterText}>Week {planProgress.currentWeek} of {planProgress.totalWeeks}</Text>
            <Text style={styles.planFooterText}>{planProgress.completedWorkouts}/{planProgress.totalWorkouts} workouts</Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          {VIEW_TABS.map((tab) => {
            const isActive = activeView === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
                onPress={() => setActiveView(tab.id)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.icon} {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.rangeRow}>
          {TIME_RANGES.map((range) => {
            const isActive = timeRange === range.id;
            return (
              <TouchableOpacity
                key={range.id}
                style={[styles.rangeButton, isActive && styles.rangeButtonActive]}
                onPress={() => setTimeRange(range.id)}
              >
                <Text style={[styles.rangeText, isActive && styles.rangeTextActive]}>{range.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeView === 'overview' && (
          <>
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardTitle}>Training Volume</Text>
                  <Text style={styles.cardSubtitle}>Total sets • Last 4 weeks</Text>
                </View>
                <View style={styles.cardChip}>
                  <Text style={styles.cardChipText}>{totalSets} sets</Text>
                </View>
              </View>

              <View style={styles.volumeList}>
                {volumeData.map((item) => (
                  <View key={item.muscle} style={styles.volumeRow}>
                    <View style={styles.volumeRowHeader}>
                      <Text style={styles.volumeLabel}>{item.muscle}</Text>
                      <Text style={[styles.volumeValue, { color: item.color }]}>{item.sets}</Text>
                    </View>
                    <View style={styles.volumeBarTrack}>
                      <View
                        style={[
                          styles.volumeBarFill,
                          {
                            width: `${Math.min((item.sets / 60) * 100, 100)}%`,
                            backgroundColor: item.color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.statsGrid}>
              {[
                { label: 'Avg. Workout', value: `${avgWorkoutMinutes}min`, icon: '⏱️', color: COLORS.orange },
                { label: 'Total PRs', value: '12', icon: '🔥', color: COLORS.pink },
                { label: 'Rest Days', value: '8', icon: '😴', color: '#8B7FFF' },
                { label: 'Consistency', value: `${planProgress.completionRate}%`, icon: '✓', color: COLORS.success },
              ].map((stat) => (
                <View key={stat.label} style={styles.statCard}>
                  <View style={styles.statGlow} />
                  <Text style={styles.statIcon}>{stat.icon}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                  <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {activeView === 'strength' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Strength Progression</Text>
            <View style={styles.chartContainer}>
              <VictoryChart
                width={SCREEN_WIDTH - 64}
                height={260}
                padding={{ top: 20, bottom: 40, left: 40, right: 20 }}
              >
                <VictoryAxis
                  tickFormat={(t) => t}
                  style={{
                    axis: { stroke: 'rgba(199,204,230,0.3)' },
                    tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  style={{
                    axis: { stroke: 'rgba(199,204,230,0.3)' },
                    tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
                    grid: { stroke: 'rgba(199,204,230,0.08)' },
                  }}
                />
                <VictoryLine data={strengthData} x="week" y="squat" style={{ data: { stroke: COLORS.orange, strokeWidth: 3 } }} />
                <VictoryLine data={strengthData} x="week" y="bench" style={{ data: { stroke: COLORS.accent, strokeWidth: 3 } }} />
                <VictoryLine data={strengthData} x="week" y="deadlift" style={{ data: { stroke: COLORS.pink, strokeWidth: 3 } }} />
              </VictoryChart>
            </View>

            <View style={styles.liftRow}>
              {[
                { name: 'Squat', color: COLORS.orange, value: '215 lbs', gain: '+30' },
                { name: 'Bench', color: COLORS.accent, value: '170 lbs', gain: '+15' },
                { name: 'Deadlift', color: COLORS.pink, value: '255 lbs', gain: '+30' },
                { name: 'Press', color: COLORS.success, value: '110 lbs', gain: '+15' },
              ].map((item) => (
                <View key={item.name} style={styles.liftCard}>
                  <View style={[styles.liftDot, { backgroundColor: item.color }]} />
                  <Text style={styles.liftLabel}>{item.name}</Text>
                  <Text style={[styles.liftValue, { color: item.color }]}>{item.value}</Text>
                  <Text style={styles.liftGain}>{item.gain} lbs</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {activeView === 'body' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Body Composition</Text>
            <View style={styles.chartContainer}>
              <VictoryChart
                width={SCREEN_WIDTH - 64}
                height={240}
                padding={{ top: 20, bottom: 40, left: 40, right: 20 }}
              >
                <VictoryAxis
                  tickFormat={(t) => t}
                  style={{
                    axis: { stroke: 'rgba(199,204,230,0.3)' },
                    tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  style={{
                    axis: { stroke: 'rgba(199,204,230,0.3)' },
                    tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
                    grid: { stroke: 'rgba(199,204,230,0.08)' },
                  }}
                />
                <VictoryLine data={bodyMetrics} x="date" y="weight" style={{ data: { stroke: COLORS.accent, strokeWidth: 3 } }} />
              </VictoryChart>
            </View>

            <View style={styles.bodyGrid}>
              <View style={styles.bodyCard}>
                <Text style={styles.bodyLabel}>Weight</Text>
                <Text style={styles.bodyValue}>179.8</Text>
                <Text style={styles.bodyDelta}>-2.2 lbs</Text>
              </View>
              <View style={[styles.bodyCard, styles.bodyCardPink]}>
                <Text style={styles.bodyLabel}>Body Fat</Text>
                <Text style={[styles.bodyValue, styles.bodyValuePink]}>17.2%</Text>
                <Text style={styles.bodyDelta}>-1.0%</Text>
              </View>
            </View>
          </View>
        )}

        {activeView === 'nutrition' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Nutrition Adherence</Text>
            <View style={styles.chartContainer}>
              <VictoryChart
                width={SCREEN_WIDTH - 64}
                height={220}
                domainPadding={{ x: 18 }}
                padding={{ top: 20, bottom: 40, left: 40, right: 20 }}
              >
                <VictoryAxis
                  tickFormat={(t) => t}
                  style={{
                    axis: { stroke: 'rgba(199,204,230,0.3)' },
                    tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  style={{
                    axis: { stroke: 'rgba(199,204,230,0.3)' },
                    tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
                    grid: { stroke: 'rgba(199,204,230,0.08)' },
                  }}
                />
                <VictoryGroup data={nutritionData} x="day">
                  <VictoryBar y="protein" style={{ data: { fill: COLORS.accent } }} />
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
                  <Text style={styles.macroLabel}>{macro.label}</Text>
                  <Text style={[styles.macroValue, { color: macro.color }]}>{macro.avg}%</Text>
                  <Text style={styles.macroSub}>Avg. Adherence</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  content: {
    padding: 24,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 24,
  },
  headerEyebrow: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  planCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
    overflow: 'hidden',
  },
  planGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,245,160,0.12)',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  planLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
  },
  planName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 6,
  },
  planDates: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  planAdherence: {
    alignItems: 'flex-end',
  },
  planAdherenceValue: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.success,
  },
  planAdherenceLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  weekProgressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  weekProgressBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(199,204,230,0.1)',
  },
  weekProgressBarActive: {
    backgroundColor: COLORS.accent,
  },
  planFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  planFooterText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(30,36,61,0.4)',
    padding: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: COLORS.accent,
  },
  tabText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  tabTextActive: {
    color: COLORS.textPrimary,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  rangeButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(30,36,61,0.4)',
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  rangeButtonActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },
  rangeText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  rangeTextActive: {
    color: COLORS.textPrimary,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 6,
  },
  cardChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardChipText: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '800',
  },
  volumeList: {
    gap: 14,
  },
  volumeRow: {
    gap: 6,
  },
  volumeRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  volumeLabel: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  volumeValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  volumeBarTrack: {
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(10,14,39,0.6)',
    overflow: 'hidden',
  },
  volumeBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: (SCREEN_WIDTH - 60) / 2,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    position: 'relative',
    overflow: 'hidden',
  },
  statGlow: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    backgroundColor: 'rgba(108,99,255,0.12)',
    borderRadius: 40,
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 10,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 6,
  },
  chartContainer: {
    marginTop: 12,
  },
  liftRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  liftCard: {
    backgroundColor: 'rgba(10,14,39,0.4)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    minWidth: 90,
    alignItems: 'center',
  },
  liftDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 8,
  },
  liftLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  liftValue: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 6,
  },
  liftGain: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '700',
  },
  bodyGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  bodyCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  bodyCardPink: {
    backgroundColor: 'rgba(236,72,153,0.1)',
    borderColor: 'rgba(236,72,153,0.2)',
  },
  bodyLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  bodyValue: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.accent,
    marginTop: 8,
  },
  bodyValuePink: {
    color: COLORS.pink,
  },
  bodyDelta: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '700',
    marginTop: 4,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  macroCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(10,14,39,0.4)',
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  macroValue: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },
  macroSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 6,
  },
});

export default ProgressScreen;
