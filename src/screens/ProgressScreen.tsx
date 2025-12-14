import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import {
  PhasePlan,
  User,
  WorkoutSessionEntry,
  DailyMealPlan,
  WorkoutLog,
  StrengthSnapshot,
} from '../types/domain';
import { useProgressData } from '../hooks/useProgressData';
import {
  buildStrengthTrends,
  buildWeeklyVolumeSummary,
  buildMovementBalanceSummary,
  StrengthTrendView,
  VolumeEntryView,
  MovementPatternView,
} from '../utils/performanceSelectors';

type ProgressScreenProps = {
  user: User;
  phase: PhasePlan;
  workoutDataVersion: number;
  workoutSessions: WorkoutSessionEntry[];
  mealPlans: DailyMealPlan[];
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
};

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  user,
  phase,
  workoutDataVersion,
  workoutSessions: sessionFallback,
  mealPlans: mealPlanFallback,
  workoutLogs: workoutLogFallback,
  strengthSnapshots: snapshotFallback,
}) => {
  const { data, isLoading, refresh } = useProgressData(
    user.id,
    phase.id,
    undefined,
    workoutDataVersion
  );
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );
  const resolvedPhase = data?.phase ?? phase;
  const mergedSessions = useMemo(() => {
    const map = new Map(
      sessionFallback.map((session) => [`${session.phasePlanId}:${session.date}`, session])
    );
    (data?.sessions || []).forEach((session) => {
      map.set(`${session.phasePlanId}:${session.date}`, session);
    });
    return Array.from(map.values());
  }, [sessionFallback, data?.sessions]);

  const mergedMeals = useMemo(() => {
    const map = new Map(
      mealPlanFallback.map((plan) => [`${plan.phasePlanId}:${plan.date}`, plan])
    );
    (data?.mealPlans || []).forEach((plan) => {
      map.set(`${plan.phasePlanId}:${plan.date}`, plan);
    });
    return Array.from(map.values());
  }, [mealPlanFallback, data?.mealPlans]);

  const mergedWorkoutLogs = useMemo(() => {
    const map = new Map(
      workoutLogFallback.map((log) => [`${log.phasePlanId}:${log.date}`, log])
    );
    (data?.workoutLogs || []).forEach((log) => {
      map.set(`${log.phasePlanId}:${log.date}`, log);
    });
    return Array.from(map.values());
  }, [workoutLogFallback, data?.workoutLogs]);

  const mergedSnapshots = useMemo(() => {
    const map = new Map(snapshotFallback.map((snap) => [snap.id, snap]));
    (data?.strengthSnapshots || []).forEach((snap) => {
      map.set(snap.id, snap);
    });
    return Array.from(map.values());
  }, [snapshotFallback, data?.strengthSnapshots]);

  const sessions = mergedSessions;
  const mealPlans = mergedMeals;
  const workoutLogs = mergedWorkoutLogs;
  const strengthSnapshots = mergedSnapshots;

  const sessionDates = new Set(sessions.map((session) => session.date));
  const today = new Date();
  const phaseStart = new Date(resolvedPhase.startDate);
  const daysActive = Math.max(
    0,
    Math.floor((today.getTime() - phaseStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  const daysLogged = sessionDates.size;
  const expectedDays = Math.max(resolvedPhase.expectedWeeks * 7 || daysActive || 1, 1);
  const progressPercent = expectedDays
    ? Math.min(100, Math.round((daysLogged / expectedDays) * 100))
    : 0;

  const strengthTrends = buildStrengthTrends(strengthSnapshots);
  const weeklyVolume = buildWeeklyVolumeSummary(workoutLogs);
  const movementBalance = buildMovementBalanceSummary(workoutLogs);
  
  const bestLiftRows = strengthTrends
    .map((trend) => ({
      lift: trend.lift,
      current: trend.weights[trend.weights.length - 1] || 0,
      delta: trend.deltaLbs,
    }))
    .filter((row) => row.current > 0)
    .sort((a, b) => b.current - a.current)
    .slice(0, 3);
  
  const recentSessions = workoutLogs.filter((log) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);
    return new Date(log.date) >= cutoff;
  });
  const completedSessions = recentSessions.length;
  const plannedSessions = Math.max(12, completedSessions || 12);
  const consistencyPercent = plannedSessions
    ? Math.round((completedSessions / plannedSessions) * 100)
    : 0;
  
  const nutritionWindowCutoff = new Date();
  nutritionWindowCutoff.setDate(nutritionWindowCutoff.getDate() - 6);
  const recentMealPlans = mealPlans.filter(
    (plan) => new Date(plan.date) >= nutritionWindowCutoff && plan.phasePlanId === resolvedPhase.id
  );
  const totalMeals = recentMealPlans.reduce((sum, plan) => sum + plan.meals.length, 0);
  const completedMeals = recentMealPlans.reduce(
    (sum, plan) => sum + plan.meals.filter((meal) => meal.completed).length,
    0
  );
  const mealCompliance = totalMeals ? Math.round((completedMeals / totalMeals) * 100) : 0;
  const mealTrackingRows = useMemo(() => {
    return [...recentMealPlans]
      .sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      .map((plan) => {
        const completed = plan.meals.filter((meal) => meal.completed).length;
        const label = new Date(plan.date).toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        return {
          date: plan.date,
          label,
          completed,
          total: plan.meals.length,
        };
      });
  }, [recentMealPlans]);
  const showSyncNotice = isLoading && sessions.length === 0;
  
  const [activeTab, setActiveTab] = useState<'workouts' | 'meals'>('workouts');
  const tabOptions: { key: 'workouts' | 'meals'; label: string }[] = [
    { key: 'workouts', label: 'Workouts' },
    { key: 'meals', label: 'Meals' },
  ];

  // ✨ Render mini sparkline for strength trends
  const renderSparkline = (weights: number[]) => {
    if (weights.length < 2) return '━━━';
    const hasGrowth = weights[weights.length - 1] > weights[0];
    return hasGrowth ? '📈' : '━';
  };

  const renderStatsContent = () => (
    <>
      {/* ✨  Overview Stats Card */}
      <View style={styles.overviewCard}>
        <Text style={styles.overviewTitle}>Phase Overview</Text>
        <View style={styles.overviewGrid}>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewValue}>{progressPercent}%</Text>
            <Text style={styles.overviewLabel}>Complete</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={styles.overviewValue}>{daysActive}</Text>
            <Text style={styles.overviewLabel}>Days Active</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={styles.overviewValue}>{consistencyPercent}%</Text>
            <Text style={styles.overviewLabel}>Consistency</Text>
          </View>
        </View>
      </View>

      {/* ✨ Compact Strength Trends */}
      <View style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Strength Trends</Text>
          <Text style={styles.cardSubtitle}>Last 8 weeks</Text>
        </View>
        
        {strengthTrends.length > 0 ? (
          strengthTrends.slice(0, 3).map((trend: StrengthTrendView) => (
            <View key={trend.lift} style={styles.trendRow}>
              <View style={styles.trendLeft}>
                <Text style={styles.trendIcon}>{renderSparkline(trend.weights)}</Text>
                <View>
                  <Text style={styles.trendLift}>{trend.lift}</Text>
                  <Text style={styles.trendProgress}>
                    {trend.weights[0]} → {trend.weights[trend.weights.length - 1]} lbs
                  </Text>
                </View>
              </View>
              <View style={styles.trendRight}>
                <Text style={styles.trendDelta}>+{trend.deltaLbs}</Text>
                <Text style={styles.trendPercent}>+{trend.deltaPercent}%</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Start logging workouts to track strength gains</Text>
        )}
      </View>

      {/* ✨  Compact Volume Card */}
      <View style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Training Volume</Text>
          <Text style={styles.cardSubtitle}>Last 4 weeks</Text>
        </View>
        
        {weeklyVolume.length > 0 ? (
          weeklyVolume.map((entry: VolumeEntryView) => {
            const maxSets = weeklyVolume[0]?.sets || 1;
            const progress = (entry.sets / maxSets) * 100;
            return (
              <View key={entry.group} style={styles.volumeRow}>
                <Text style={styles.volumeLabel}>{entry.group}</Text>
                <View style={styles.volumeBarContainer}>
                  <View style={styles.volumeBarTrack}>
                    <View 
                      style={[
                        styles.volumeBarFill, 
                        { width: `${Math.min(100, progress)}%` }
                      ]} 
                    />
                  </View>
                  <Text style={styles.volumeValue}>{entry.sets}</Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>Volume data will appear after logging workouts</Text>
        )}
      </View>

      {/* ✨ Movement Balance - More Visual */}
      <View style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Movement Balance</Text>
          <Text style={styles.cardSubtitle}>This month</Text>
        </View>
        
        {movementBalance.length > 0 ? (
          <View style={styles.movementGrid}>
            {movementBalance.map((pattern: MovementPatternView) => {
              const maxSessions = Math.max(...movementBalance.map(p => p.sessions));
              const intensity = pattern.sessions / maxSessions;
              return (
                <View key={pattern.name} style={styles.movementPill}>
                  <View 
                    style={[
                      styles.movementIndicator,
                      { opacity: Math.max(0.3, intensity) }
                    ]}
                  />
                  <Text style={styles.movementName}>{pattern.name}</Text>
                  <Text style={styles.movementCount}>{pattern.sessions}x</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>Movement patterns tracked after workouts</Text>
        )}
      </View>

      {/* ✨Top Lifts Compact View */}
      {bestLiftRows.length > 0 && (
        <View style={styles.compactCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Personal Records</Text>
            <Text style={styles.cardSubtitle}>This phase</Text>
          </View>
          
          {bestLiftRows.map((row, index) => (
            <View key={row.lift} style={styles.prRow}>
              <View style={styles.prRank}>
                <Text style={styles.prRankText}>#{index + 1}</Text>
              </View>
              <View style={styles.prInfo}>
                <Text style={styles.prLift}>{row.lift}</Text>
                <Text style={styles.prWeight}>{row.current} lbs</Text>
              </View>
              {row.delta > 0 && (
                <View style={styles.prBadge}>
                  <Text style={styles.prBadgeText}>+{row.delta} lbs</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </>
  );

  const renderMealsDetailContent = () => (
    <>
      <View style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Meal Tracking</Text>
          <Text style={styles.cardSubtitle}>Last 7 days</Text>
        </View>

        {mealTrackingRows.length > 0 ? (
          <>
            <View style={styles.mealSummaryRow}>
              <View style={styles.mealSummaryStat}>
                <Text style={styles.mealSummaryValue}>{mealCompliance}%</Text>
                <Text style={styles.mealSummaryLabel}>Compliance</Text>
              </View>
              <View style={styles.mealSummaryDivider} />
              <View style={styles.mealSummaryStat}>
                <Text style={styles.mealSummaryValue}>{completedMeals}</Text>
                <Text style={styles.mealSummaryLabel}>Meals complete</Text>
              </View>
              <View style={styles.mealSummaryDivider} />
              <View style={styles.mealSummaryStat}>
                <Text style={styles.mealSummaryValue}>{totalMeals}</Text>
                <Text style={styles.mealSummaryLabel}>Meals logged</Text>
              </View>
            </View>

            {mealTrackingRows.map((row) => {
              const percent = row.total ? Math.round((row.completed / row.total) * 100) : 0;
              return (
                <View key={row.date} style={styles.mealTrackingRow}>
                  <View style={styles.mealTrackingInfo}>
                    <Text style={styles.mealTrackingDay}>{row.label}</Text>
                    <Text style={styles.mealTrackingMeta}>
                      {row.completed}/{row.total} meals
                    </Text>
                  </View>
                  <View style={styles.mealTrackingBar}>
                    <View
                      style={[
                        styles.mealTrackingFill,
                        { width: `${Math.min(100, percent)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.mealTrackingPercent}>{percent}%</Text>
                </View>
              );
            })}
          </>
        ) : (
          <Text style={styles.emptyText}>Log meals to see daily adherence</Text>
        )}
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* ✨  Compact Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Progress</Text>
            <Text style={styles.subtitle}>
              Level {resolvedPhase.currentLevelId} → {resolvedPhase.targetLevelId}
            </Text>
          </View>

          {showSyncNotice && (
            <Text style={[styles.emptyText, styles.syncNotice]}>
              Syncing latest progress data...
            </Text>
          )}

          {/* ✨ IMPROVED: Compact Tab Switcher */}
          <View style={styles.tabSwitcher}>
            {tabOptions.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabButton,
                  activeTab === tab.key && styles.tabButtonActive,
                ]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === tab.key && styles.tabButtonTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'workouts' ? renderStatsContent() : renderMealsDetailContent()}
        </ScrollView>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    gap: 16,
  },
  
  // ✨ IMPROVED: Compact Header
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#A0A3BD',
  },
  
  // ✨ IMPROVED: Compact Tab Switcher
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#151932',
    borderRadius: 12,
    padding: 3,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#6C63FF',
  },
  tabButtonText: {
    color: '#A0A3BD',
    fontWeight: '600',
    fontSize: 14,
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  
  // ✨ NEW: Overview Card
  overviewCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  overviewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  overviewGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overviewItem: {
    flex: 1,
    alignItems: 'center',
  },
  overviewValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00F5A0',
    marginBottom: 4,
  },
  overviewLabel: {
    fontSize: 12,
    color: '#A0A3BD',
  },
  overviewDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#2A2F4F',
  },
  
  // ✨ IMPROVED: Compact Card Style
  compactCard: {
    backgroundColor: '#151932',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#A0A3BD',
  },
  
  // ✨ IMPROVED: Compact Trend Row
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2340',
  },
  trendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  trendIcon: {
    fontSize: 20,
  },
  trendLift: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  trendProgress: {
    fontSize: 12,
    color: '#A0A3BD',
    marginTop: 2,
  },
  trendRight: {
    alignItems: 'flex-end',
  },
  trendDelta: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00F5A0',
  },
  trendPercent: {
    fontSize: 11,
    color: '#A0A3BD',
    marginTop: 2,
  },
  
  // ✨ IMPROVED: Compact Volume Rows
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  volumeLabel: {
    width: 80,
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  volumeBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  volumeBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#1E2340',
    borderRadius: 4,
    overflow: 'hidden',
  },
  volumeBarFill: {
    height: '100%',
    backgroundColor: '#6C63FF',
    borderRadius: 4,
  },
  volumeValue: {
    width: 35,
    textAlign: 'right',
    color: '#A0A3BD',
    fontSize: 13,
    fontWeight: '600',
  },
  
  // ✨ NEW: Movement Grid
  movementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  movementPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2340',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  movementIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00F5A0',
  },
  movementName: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  movementCount: {
    fontSize: 12,
    color: '#A0A3BD',
  },
  
  // ✨ NEW: PR (Personal Records) Rows
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2340',
  },
  prRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6C63FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  prRankText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  prInfo: {
    flex: 1,
  },
  prLift: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  prWeight: {
    fontSize: 12,
    color: '#A0A3BD',
    marginTop: 2,
  },
  prBadge: {
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  prBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#00F5A0',
  },
  
  // ✨ Meal Tracking Rows
  mealTrackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  mealTrackingInfo: {
    width: 110,
    gap: 2,
  },
  mealTrackingDay: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  mealTrackingMeta: {
    fontSize: 12,
    color: '#A0A3BD',
  },
  mealTrackingBar: {
    flex: 1,
    height: 10,
    borderRadius: 6,
    backgroundColor: '#10142A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  mealTrackingFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#6C63FF',
  },
  mealTrackingPercent: {
    width: 50,
    textAlign: 'right',
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  mealSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#10142A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2340',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  mealSummaryStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  mealSummaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mealSummaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A0A3BD',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealSummaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#1E2340',
    marginHorizontal: 10,
  },
  
  // Empty States
  emptyText: {
    fontSize: 13,
    color: '#A0A3BD',
    textAlign: 'center',
    paddingVertical: 12,
    fontStyle: 'italic',
  },
  syncNotice: {
    marginTop: -4,
    marginBottom: 16,
  },
});
