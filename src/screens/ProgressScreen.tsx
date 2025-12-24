import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useFabAction } from '../contexts/FabActionContext';
import {
  PhasePlan,
  User,
  WorkoutSessionEntry,
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
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
  onAddProgress?: () => void;
};

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  user,
  phase,
  workoutDataVersion,
  workoutSessions: sessionFallback,
  workoutLogs: workoutLogFallback,
  strengthSnapshots: snapshotFallback,
  onAddProgress,
}) => {
  const { setFabAction } = useFabAction();
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

  useFocusEffect(
    useCallback(() => {
      if (!onAddProgress) {
        setFabAction('Progress', null);
        return () => setFabAction('Progress', null);
      }

      setFabAction('Progress', {
        label: 'Add Progress',
        icon: '+',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: onAddProgress,
      });

      return () => setFabAction('Progress', null);
    }, [onAddProgress, setFabAction])
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
  const workoutLogs = mergedWorkoutLogs;
  const strengthSnapshots = mergedSnapshots;

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
  const showSyncNotice = isLoading && sessions.length === 0;

  // Helper: Get heat color based on intensity
  const getHeatColor = (intensity: number) => {
    if (intensity >= 0.8) return '#00F5A0';
    if (intensity >= 0.5) return '#6C63FF';
    if (intensity >= 0.3) return '#8B93B0';
    return '#2A2F4F';
  };

  const [showAllVolume, setShowAllVolume] = useState(false);
  const [volumeLayout, setVolumeLayout] = useState({ y: 0, height: 0 });
  const maxVolumeRows = 6;
  const hasExtraVolume = weeklyVolume.length > maxVolumeRows;
  const visibleVolume = showAllVolume ? weeklyVolume : weeklyVolume.slice(0, maxVolumeRows);

  const handleScroll = useCallback(
    (event: any) => {
      if (!showAllVolume) return;
      const scrollY = event.nativeEvent.contentOffset.y;
      const collapsePoint = volumeLayout.y + volumeLayout.height;
      if (collapsePoint > 0 && scrollY > collapsePoint) {
        setShowAllVolume(false);
      }
    },
    [showAllVolume, volumeLayout]
  );

  const renderStatsContent = () => (
    <>
      {/* ✨ Training Volume - Heat Map Style */}
      <View
        style={styles.compactCard}
        onLayout={(event) =>
          setVolumeLayout({
            y: event.nativeEvent.layout.y,
            height: event.nativeEvent.layout.height,
          })
        }
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Training Volume</Text>
          <Text style={styles.cardSubtitle}>Last 4 weeks</Text>
        </View>
        
        {visibleVolume.length > 0 ? (
          <View style={styles.volumeBars}>
            {visibleVolume.map((entry: VolumeEntryView) => {
              const maxSets = weeklyVolume[0]?.sets || 1;
              const percent = Math.max(0, Math.min(100, (entry.sets / maxSets) * 100));
              const intensity = entry.sets / maxSets;
              const barColor = getHeatColor(intensity);
              return (
                <View key={entry.group} style={styles.volumeRow}>
                  <View style={styles.volumeRowHeader}>
                    <Text style={styles.volumeLabel}>{entry.group}</Text>
                    <Text style={styles.volumeValue}>{entry.sets}</Text>
                  </View>
                  <View style={styles.volumeTrack}>
                    <View
                      style={[
                        styles.volumeFill,
                        { width: `${percent}%`, backgroundColor: barColor },
                      ]}
                    />
                  </View>
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
        {hasExtraVolume && !showAllVolume && (
          <TouchableOpacity
            style={styles.volumeToggle}
            onPress={() => setShowAllVolume((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Text style={styles.volumeToggleText}>
              Show more
            </Text>
          </TouchableOpacity>
        )}
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

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} onScroll={handleScroll} scrollEventThrottle={16}>
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

          {renderStatsContent()}
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
  
  // ✨ Volume Bars
  volumeBars: {
    gap: 12,
  },
  volumeRow: {
    gap: 8,
  },
  volumeRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  volumeLabel: {
    fontSize: 12,
    color: '#A0A3BD',
    fontWeight: '600',
  },
  volumeValue: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  volumeTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#10142A',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  volumeFill: {
    height: '100%',
    borderRadius: 999,
  },
  volumeToggle: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
  },
  volumeToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C7CBFF',
    letterSpacing: 0.2,
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
