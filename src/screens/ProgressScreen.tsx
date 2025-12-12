import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PhasePlan, User } from '../types/domain';
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
  onTakePhoto: () => void;
};

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  user,
  phase,
  onTakePhoto,
}) => {
  const { data, isLoading } = useProgressData(user.id, phase.id);
  const resolvedPhase = data?.phase ?? phase;
  const sessions = data?.sessions ?? [];
  const mealPlans = data?.mealPlans ?? [];
  const photos = data?.photos ?? [];
  const workoutLogs = data?.workoutLogs ?? [];
  const strengthSnapshots = data?.strengthSnapshots ?? [];

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
  const sortedPhotos = [...photos].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const phasePhotos = sortedPhotos.filter((p) => p.phasePlanId === resolvedPhase.id);
  const baselinePhoto = sortedPhotos[0];
  const latestPhoto = phasePhotos.length > 0 ? phasePhotos[phasePhotos.length - 1] : baselinePhoto;
  const showSyncNotice = isLoading && sessions.length === 0;
  
  const [activeTab, setActiveTab] = useState<'stats' | 'comparison'>('stats');
  const tabOptions: { key: 'stats' | 'comparison'; label: string }[] = [
    { key: 'stats', label: 'Stats' },
    { key: 'comparison', label: 'Photos' },
  ];

  // ✨ NEW: Render mini sparkline for strength trends
  const renderSparkline = (weights: number[]) => {
    if (weights.length < 2) return '━━━';
    const hasGrowth = weights[weights.length - 1] > weights[0];
    return hasGrowth ? '📈' : '━';
  };

  const renderStatsContent = () => (
    <>
      {/* ✨ IMPROVED: Overview Stats Card */}
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

      {/* ✨ IMPROVED: Compact Strength Trends */}
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

      {/* ✨ IMPROVED: Compact Volume Card */}
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

      {/* ✨ IMPROVED: Movement Balance - More Visual */}
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

      {/* ✨ IMPROVED: Nutrition Compliance - Visual Circle */}
      <View style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Nutrition</Text>
          <Text style={styles.cardSubtitle}>Last 7 days</Text>
        </View>
        
        <View style={styles.nutritionContent}>
          <View style={styles.nutritionCircle}>
            <Text style={styles.nutritionPercent}>{mealCompliance}%</Text>
            <Text style={styles.nutritionLabel}>Compliance</Text>
          </View>
          <View style={styles.nutritionStats}>
            <View style={styles.nutritionStat}>
              <Text style={styles.nutritionStatValue}>{completedMeals}</Text>
              <Text style={styles.nutritionStatLabel}>Logged</Text>
            </View>
            <View style={styles.nutritionStat}>
              <Text style={styles.nutritionStatValue}>{totalMeals}</Text>
              <Text style={styles.nutritionStatLabel}>Total</Text>
            </View>
          </View>
        </View>
        
        {mealCompliance >= 80 && (
          <View style={styles.insightBanner}>
            <Text style={styles.insightEmoji}>🎯</Text>
            <Text style={styles.insightText}>Excellent nutrition adherence!</Text>
          </View>
        )}
      </View>

      {/* ✨ NEW: Top Lifts Compact View */}
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

  const renderComparisonContent = () => (
    <>
      {/* ✨ IMPROVED: Photo Comparison - Side by side */}
      {baselinePhoto && latestPhoto ? (
        <View style={styles.compactCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Transformation</Text>
            <Text style={styles.cardSubtitle}>
              {Math.floor(daysActive / 7)} weeks progress
            </Text>
          </View>
          
          <View style={styles.photoComparison}>
            <View style={styles.photoBox}>
              <Image source={{ uri: baselinePhoto.frontUri }} style={styles.photoLarge} />
              <View style={styles.photoOverlay}>
                <Text style={styles.photoOverlayText}>Start</Text>
              </View>
            </View>
            
            <View style={styles.photoArrow}>
              <Text style={styles.photoArrowText}>→</Text>
            </View>
            
            <View style={styles.photoBox}>
              <Image source={{ uri: latestPhoto.frontUri }} style={styles.photoLarge} />
              <View style={styles.photoOverlay}>
                <Text style={styles.photoOverlayText}>Now</Text>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.emptyPhotoCard}>
          <Text style={styles.emptyPhotoEmoji}>📸</Text>
          <Text style={styles.emptyPhotoTitle}>No Progress Photos Yet</Text>
          <Text style={styles.emptyPhotoText}>
            Take your first photo to start tracking visual progress
          </Text>
        </View>
      )}

      {/* ✨ Photo Action Button */}
      <TouchableOpacity style={styles.photoActionButton} onPress={onTakePhoto}>
        <LinearGradient
          colors={['#6C63FF', '#5449CC']}
          style={styles.photoActionGradient}
        >
          <Text style={styles.photoActionText}>
            {phasePhotos.length > 0 ? '📸 Take New Progress Photo' : '📸 Take First Photo'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* ✨ IMPROVED: Photo Timeline - Horizontal Scroll */}
      {phasePhotos.length > 0 && (
        <View style={styles.compactCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Photo Timeline</Text>
            <Text style={styles.cardSubtitle}>
              {phasePhotos.length + (baselinePhoto ? 1 : 0)} check-ins
            </Text>
          </View>
          
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timelineScroll}
          >
            {baselinePhoto && (
              <View style={styles.timelineCard}>
                <Image source={{ uri: baselinePhoto.frontUri }} style={styles.timelineImage} />
                <Text style={styles.timelineDate}>
                  {new Date(baselinePhoto.date).toLocaleDateString(undefined, { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </Text>
                <View style={styles.timelineBadge}>
                  <Text style={styles.timelineBadgeText}>Start</Text>
                </View>
              </View>
            )}

            {phasePhotos.map((photo, index) => (
              <View key={photo.id} style={styles.timelineCard}>
                <Image source={{ uri: photo.frontUri }} style={styles.timelineImage} />
                <Text style={styles.timelineDate}>
                  {new Date(photo.date).toLocaleDateString(undefined, { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </Text>
                <View style={styles.timelineBadge}>
                  <Text style={styles.timelineBadgeText}>Week {index + 1}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* ✨ IMPROVED: Compact Header */}
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

          {activeTab === 'stats' ? renderStatsContent() : renderComparisonContent()}
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
  
  // ✨ IMPROVED: Nutrition Visual
  nutritionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  nutritionCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1E2340',
    borderWidth: 6,
    borderColor: '#00F5A0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nutritionPercent: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00F5A0',
  },
  nutritionLabel: {
    fontSize: 11,
    color: '#A0A3BD',
    marginTop: 2,
  },
  nutritionStats: {
    flex: 1,
    gap: 12,
  },
  nutritionStat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nutritionStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  nutritionStatLabel: {
    fontSize: 13,
    color: '#A0A3BD',
  },
  
  // ✨ NEW: Insight Banner
  insightBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(0, 245, 160, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 160, 0.2)',
  },
  insightEmoji: {
    fontSize: 20,
  },
  insightText: {
    fontSize: 13,
    color: '#00F5A0',
    fontWeight: '600',
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
  
  // ✨ IMPROVED: Photo Comparison
  photoComparison: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  photoBox: {
    flex: 1,
    position: 'relative',
  },
  photoLarge: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: '#1E2340',
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  photoOverlayText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  photoArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6C63FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoArrowText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  
  // ✨ IMPROVED: Empty Photo State
  emptyPhotoCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 40,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    alignItems: 'center',
  },
  emptyPhotoEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyPhotoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyPhotoText: {
    fontSize: 14,
    color: '#A0A3BD',
    textAlign: 'center',
    lineHeight: 20,
  },
  
  // ✨ Photo Action Button
  photoActionButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoActionGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  photoActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  
  // ✨ IMPROVED: Timeline Scroll
  timelineScroll: {
    paddingVertical: 4,
    gap: 12,
  },
  timelineCard: {
    width: 120,
    alignItems: 'center',
  },
  timelineImage: {
    width: 120,
    height: 160,
    borderRadius: 12,
    backgroundColor: '#1E2340',
    marginBottom: 8,
  },
  timelineDate: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 6,
  },
  timelineBadge: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timelineBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
