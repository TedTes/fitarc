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
  
  // Calculate streak
  const calculateStreak = () => {
    const logDates = [...new Set(workoutLogs.map(log => log.date))].sort();
    if (logDates.length === 0) return 0;
    
    let streak = 0;
    const todayStr = today.toISOString().split('T')[0];
    let currentDate = new Date(today);
    
    for (let i = 0; i < 365; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (logDates.includes(dateStr)) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  };
  
  const currentStreak = calculateStreak();
  
  // Generate last 7 days for weekly overview
  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const iso = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString(undefined, { weekday: 'narrow' });
      days.push({ iso, label });
    }
    return days;
  }, []);
  
  const workoutCompletionMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    workoutLogs.forEach(log => {
      map[log.date] = true;
    });
    return map;
  }, [workoutLogs]);
  
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

  // Helper: Get heat color based on intensity
  const getHeatColor = (intensity: number) => {
    if (intensity >= 0.8) return '#00F5A0';
    if (intensity >= 0.5) return '#6C63FF';
    if (intensity >= 0.3) return '#8B93B0';
    return '#2A2F4F';
  };

  const renderStatsContent = () => (
    <>
      {/* ✨ Weekly Activity Calendar */}
      <View style={styles.weekOverview}>
        {last7Days.map(day => {
          const hasActivity = workoutCompletionMap[day.iso];
          return (
            <View key={day.iso} style={styles.dayCell}>
              <Text style={styles.dayLabel}>{day.label}</Text>
              <View style={[
                styles.dayDot,
                hasActivity && styles.dayDotActive
              ]} />
            </View>
          );
        })}
      </View>

      {/* ✨ Overview Stats Card with Streak Banner */}
      <View style={styles.overviewCard}>
        {currentStreak > 0 && (
          <View style={styles.streakBanner}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <View style={styles.streakInfo}>
              <Text style={styles.streakCount}>{currentStreak} day streak</Text>
              <Text style={styles.streakSubtext}>Keep it going!</Text>
            </View>
          </View>
        )}
        
        <Text style={styles.overviewTitle}>Phase Overview</Text>
        <View style={styles.overviewGrid}>
          <View style={styles.overviewItem}>
            <Text style={styles.statEmoji}>📊</Text>
            <Text style={styles.overviewValue}>{progressPercent}%</Text>
            <Text style={styles.overviewLabel}>Complete</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={styles.statEmoji}>📅</Text>
            <Text style={styles.overviewValue}>{daysActive}</Text>
            <Text style={styles.overviewLabel}>Days Active</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={styles.statEmoji}>✅</Text>
            <Text style={styles.overviewValue}>{consistencyPercent}%</Text>
            <Text style={styles.overviewLabel}>Consistency</Text>
          </View>
        </View>
      </View>

      {/* ✨ Strength Trends with Visual Sparklines */}
      <View style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Strength Trends</Text>
          <Text style={styles.cardSubtitle}>Last 8 weeks</Text>
        </View>
        
        {strengthTrends.length > 0 ? (
          strengthTrends.slice(0, 3).map((trend: StrengthTrendView) => {
            const maxWeight = Math.max(...trend.weights);
            return (
              <View key={trend.lift} style={styles.trendRow}>
                <View style={styles.trendLeft}>
                  {/* Visual Sparkline */}
                  <View style={styles.trendSparkline}>
                    {trend.weights.map((weight, idx) => {
                      const height = (weight / maxWeight) * 30;
                      return (
                        <View 
                          key={idx}
                          style={[
                            styles.sparklineBar,
                            { 
                              height,
                              backgroundColor: idx === trend.weights.length - 1 
                                ? '#00F5A0' 
                                : '#6C63FF'
                            }
                          ]}
                        />
                      );
                    })}
                  </View>
                  <View style={styles.trendDetails}>
                    <Text style={styles.trendLift}>{trend.lift}</Text>
                    <View style={styles.trendProgressRow}>
                      <Text style={styles.trendStart}>{trend.weights[0]}</Text>
                      <Text style={styles.trendArrow}>→</Text>
                      <Text style={styles.trendCurrent}>
                        {trend.weights[trend.weights.length - 1]} lbs
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.trendRight}>
                  <View style={styles.trendBadge}>
                    <Text style={styles.trendDelta}>+{trend.deltaLbs}</Text>
                  </View>
                  <Text style={styles.trendPercent}>+{trend.deltaPercent}%</Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyStateEmoji}>💪</Text>
            <Text style={styles.emptyStateTitle}>Your strength journey starts here</Text>
            <Text style={styles.emptyStateText}>
              Complete a few workouts to see your progress trends
            </Text>
            <View style={styles.emptyStateDots}>
              <View style={styles.emptyStateDot} />
              <View style={[styles.emptyStateDot, styles.emptyStateDotActive]} />
              <View style={styles.emptyStateDot} />
            </View>
          </View>
        )}
      </View>

      {/* ✨ Training Volume - Heat Map Style */}
      <View style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Training Volume</Text>
          <Text style={styles.cardSubtitle}>Last 4 weeks</Text>
        </View>
        
        {weeklyVolume.length > 0 ? (
          <View style={styles.volumeHeatMap}>
            {weeklyVolume.map((entry: VolumeEntryView) => {
              const maxSets = weeklyVolume[0]?.sets || 1;
              const intensity = entry.sets / maxSets;
              const heatColor = getHeatColor(intensity);
              
              return (
                <View key={entry.group} style={styles.volumeBlock}>
                  <View style={[styles.volumeBar, { backgroundColor: heatColor }]}>
                    <Text style={styles.volumeSetCount}>{entry.sets}</Text>
                  </View>
                  <Text style={styles.volumeLabel}>{entry.group}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyStateEmoji}>📊</Text>
            <Text style={styles.emptyStateTitle}>Volume tracking starts soon</Text>
            <Text style={styles.emptyStateText}>
              Log workouts to see your training volume breakdown
            </Text>
            <View style={styles.emptyStateDots}>
              <View style={styles.emptyStateDot} />
              <View style={[styles.emptyStateDot, styles.emptyStateDotActive]} />
              <View style={styles.emptyStateDot} />
            </View>
          </View>
        )}
      </View>

      {/* ✨ Movement Balance */}
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
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyStateEmoji}>🎯</Text>
            <Text style={styles.emptyStateTitle}>Balance your training</Text>
            <Text style={styles.emptyStateText}>
              Movement patterns appear after tracking workouts
            </Text>
            <View style={styles.emptyStateDots}>
              <View style={styles.emptyStateDot} />
              <View style={[styles.emptyStateDot, styles.emptyStateDotActive]} />
              <View style={styles.emptyStateDot} />
            </View>
          </View>
        )}
      </View>

      {/* ✨ Personal Records - Trophy Style */}
      {bestLiftRows.length > 0 && (
        <View style={styles.compactCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Personal Records</Text>
            <Text style={styles.cardSubtitle}>This phase</Text>
          </View>
          
          {bestLiftRows.map((row, index) => {
            const rankStyle = 
              index === 0 ? styles.prRank1 :
              index === 1 ? styles.prRank2 :
              index === 2 ? styles.prRank3 : styles.prRank;
            const rankEmoji = 
              index === 0 ? '🥇' :
              index === 1 ? '🥈' :
              index === 2 ? '🥉' : '💪';
            
            return (
              <View key={row.lift} style={styles.prRow}>
                <View style={[styles.prRank, rankStyle]}>
                  <Text style={styles.prRankEmoji}>{rankEmoji}</Text>
                </View>
                <View style={styles.prInfo}>
                  <Text style={styles.prLift}>{row.lift}</Text>
                  <Text style={styles.prWeight}>{row.current} lbs</Text>
                </View>
                {row.delta > 0 && (
                  <View style={styles.prBadgeImproved}>
                    <Text style={styles.prArrow}>↑</Text>
                    <Text style={styles.prBadgeText}>{row.delta} lbs</Text>
                  </View>
                )}
              </View>
            );
          })}
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
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyStateEmoji}>🍽️</Text>
            <Text style={styles.emptyStateTitle}>Track your nutrition</Text>
            <Text style={styles.emptyStateText}>
              Log meals to see your daily adherence
            </Text>
            <View style={styles.emptyStateDots}>
              <View style={styles.emptyStateDot} />
              <View style={[styles.emptyStateDot, styles.emptyStateDotActive]} />
              <View style={styles.emptyStateDot} />
            </View>
          </View>
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
          {/* ✨ Compact Header */}
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

          {/* ✨ Compact Tab Switcher */}
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
  
  // ✨ Header
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
  
  // ✨ Tab Switcher
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
  
  // ✨ Weekly Activity Calendar
  weekOverview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#151932',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  dayCell: {
    alignItems: 'center',
    gap: 6,
  },
  dayLabel: {
    fontSize: 11,
    color: '#A0A3BD',
    fontWeight: '500',
  },
  dayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2A2F4F',
  },
  dayDotActive: {
    backgroundColor: '#00F5A0',
  },
  
  // ✨ Overview Card with Streak Banner
  overviewCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  streakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
  },
  streakEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  streakInfo: {
    flex: 1,
  },
  streakCount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  streakSubtext: {
    fontSize: 12,
    color: '#A0A3BD',
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
  statEmoji: {
    fontSize: 20,
    marginBottom: 8,
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
  
  // ✨ Compact Card Style
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
  
  // ✨ Strength Trends - Visual Sparklines
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
  trendSparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 30,
    width: 50,
  },
  sparklineBar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 4,
  },
  trendDetails: {
    flex: 1,
  },
  trendLift: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  trendProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  trendStart: {
    fontSize: 11,
    color: '#8B93B0',
  },
  trendArrow: {
    fontSize: 10,
    color: '#6C63FF',
  },
  trendCurrent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  trendRight: {
    alignItems: 'flex-end',
  },
  trendBadge: {
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  trendDelta: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#00F5A0',
  },
  trendPercent: {
    fontSize: 11,
    color: '#A0A3BD',
    marginTop: 2,
  },
  
  // ✨ Volume Heat Map
  volumeHeatMap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  volumeBlock: {
    alignItems: 'center',
    width: '30%',
  },
  volumeBar: {
    width: '100%',
    height: 60,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  volumeSetCount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0A0E27',
  },
  volumeLabel: {
    fontSize: 11,
    color: '#A0A3BD',
    textAlign: 'center',
  },
  
  // ✨ Movement Grid
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
  
  // ✨ Personal Records - Trophy Style
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2340',
  },
  prRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#6C63FF',
  },
  prRank1: {
    backgroundColor: '#FFD700',
  },
  prRank2: {
    backgroundColor: '#C0C0C0',
  },
  prRank3: {
    backgroundColor: '#CD7F32',
  },
  prRankEmoji: {
    fontSize: 20,
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
  prBadgeImproved: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  prArrow: {
    fontSize: 14,
    color: '#00F5A0',
  },
  prBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#00F5A0',
  },
  
  // ✨ Meal Tracking
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
  
  // ✨ Empty States
  emptyStateCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyStateEmoji: {
    fontSize: 48,
    marginBottom: 12,
    opacity: 0.7,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: '#8B93B0',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyStateDots: {
    flexDirection: 'row',
    gap: 6,
  },
  emptyStateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2A2F4F',
  },
  emptyStateDotActive: {
    backgroundColor: '#6C63FF',
  },
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