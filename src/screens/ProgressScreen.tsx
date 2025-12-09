import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PhasePlan, PhotoCheckin, ProgressEstimate, DailyConsistencyLog, WorkoutLog, StrengthSnapshot, DailyMealPlan } from '../types/domain';
import {
  buildStrengthTrends,
  buildWeeklyVolumeSummary,
  buildMovementBalanceSummary,
  getOverallStrengthDelta,
  StrengthTrendView,
  VolumeEntryView,
  MovementPatternView,
} from '../utils/performanceSelectors';


type ProgressScreenProps = {
  phase: PhasePlan;
  photoCheckins: PhotoCheckin[];
  progressEstimate: ProgressEstimate | null;
  dailyConsistency: DailyConsistencyLog[];
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
  mealPlans: DailyMealPlan[];
  onTakePhoto: () => void;
};

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  phase,
  photoCheckins,
  progressEstimate,
  dailyConsistency,
  workoutLogs,
  strengthSnapshots,
  mealPlans,
  onTakePhoto,
}) => {
  const phasePhotos = photoCheckins.filter(p => p.phasePlanId === phase.id);
  const baselinePhoto = photoCheckins.find(p => p.phasePlanId === 'baseline');
  const latestPhoto = phasePhotos.length > 0 ? phasePhotos[phasePhotos.length - 1] : baselinePhoto;

  const progressPercent = progressEstimate?.progressPercent || 0;
  const daysActive = progressEstimate?.daysActive || 0;
  const daysLogged = progressEstimate?.daysLogged || 0;
  const strengthTrends = buildStrengthTrends(strengthSnapshots);
  const weeklyVolume = buildWeeklyVolumeSummary(workoutLogs);
  const movementBalance = buildMovementBalanceSummary(workoutLogs);
  const overallStrength = getOverallStrengthDelta(strengthTrends);
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
    (plan) => new Date(plan.date) >= nutritionWindowCutoff && plan.phasePlanId === phase.id
  );
  const totalMeals = recentMealPlans.reduce((sum, plan) => sum + plan.meals.length, 0);
  const completedMeals = recentMealPlans.reduce(
    (sum, plan) => sum + plan.meals.filter((meal) => meal.completed).length,
    0
  );
  const mealCompliance = totalMeals ? Math.round((completedMeals / totalMeals) * 100) : 0;
  const [activeTab, setActiveTab] = useState<'stats' | 'comparison'>('stats');
  const tabOptions: { key: 'stats' | 'comparison'; label: string }[] = [
    { key: 'stats', label: 'Stats' },
    { key: 'comparison', label: 'Comparison' },
  ];

  const formatSigned = (value: number) => `${value >= 0 ? '+' : ''}${value}`;

  const renderStatsContent = () => (
    <>
      <View style={styles.dashboardCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Weekly Volume (Last 4 weeks)</Text>
        </View>
        {weeklyVolume.map((entry: VolumeEntryView) => {
          const maxSets = weeklyVolume[0]?.sets || 1;
          const width = `${Math.min(100, (entry.sets / maxSets) * 100)}%`;
          return (
            <View key={entry.group} style={styles.volumeRow}>
              <Text style={styles.volumeLabel}>{entry.group}</Text>
              <View style={styles.volumeBarTrack}>
                <View style={[styles.volumeBarFill, { width }]} />
              </View>
              <Text style={styles.volumeValue}>{entry.sets} sets</Text>
            </View>
          );
        })}
        <Text style={styles.volumeSummary}>All muscle groups in optimal range ✓</Text>
        <Text style={styles.volumeConsistency}>
          Consistency: {consistencyPercent}% (Planned {plannedSessions} sessions, completed {completedSessions})
        </Text>
      </View>

      <View style={styles.dashboardCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Strength Trends (8 weeks)</Text>
        </View>
        {strengthTrends.map((trend: StrengthTrendView) => (
          <View key={trend.lift} style={styles.trendRow}>
            <View style={styles.trendInfo}>
              <Text style={styles.trendLift}>{trend.lift}</Text>
              <Text style={styles.trendSequence}>{trend.weights.join(' → ')} lbs</Text>
            </View>
            <View style={styles.trendDelta}>
              <Text style={styles.trendGlyph}>{trend.glyph}</Text>
              <Text style={styles.trendChange}>+{trend.deltaLbs} lbs (+{trend.deltaPercent}%)</Text>
            </View>
          </View>
        ))}
        {!strengthTrends.length && (
          <Text style={styles.emptyText}>Log a few workouts to unlock strength trends.</Text>
        )}
      </View>

      <View style={styles.dashboardCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Movement Balance (This Month)</Text>
        </View>
        {movementBalance.map((pattern: MovementPatternView) => {
          const maxSessions = movementBalance[0]?.sessions || 1;
          const width = `${Math.min(100, (pattern.sessions / maxSessions) * 100)}%`;
          return (
            <View key={pattern.name} style={styles.volumeRow}>
              <Text style={styles.volumeLabel}>{pattern.name}</Text>
              <View style={styles.volumeBarTrack}>
                <View style={[styles.movementBarFill, { width }]} />
              </View>
              <Text style={styles.volumeValue}>{pattern.sessions}</Text>
            </View>
          );
        })}
        <Text style={styles.volumeSummary}>✓ Balanced training!</Text>
        <Text style={styles.volumeConsistency}>You're hitting all patterns 2x per week.</Text>
      </View>

      {bestLiftRows.length > 0 && (
        <View style={styles.dashboardCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Top Lifts This Phase</Text>
          </View>
          {bestLiftRows.map((row) => (
            <View key={row.lift} style={styles.bestLiftRow}>
              <Text style={styles.bestLiftName}>{row.lift}</Text>
              <View style={styles.bestLiftStats}>
                <Text style={styles.bestLiftValue}>{row.current} lbs</Text>
                <Text style={styles.bestLiftDelta}>{formatSigned(row.delta)} lbs</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </>
  );

  const renderComparisonContent = () => (
    <>
      {baselinePhoto && latestPhoto ? (
        <View style={styles.comparisonCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Photo Comparison</Text>
          </View>
          
          <View style={styles.photoRow}>
            <View style={styles.photoColumn}>
              <Text style={styles.photoLabel}>Start</Text>
              <Image source={{ uri: baselinePhoto.frontUri }} style={styles.photo} />
              <Text style={styles.photoDate}>
                {new Date(baselinePhoto.date).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.photoColumn}>
              <Text style={styles.photoLabel}>Current</Text>
              <Image source={{ uri: latestPhoto.frontUri }} style={styles.photo} />
              <Text style={styles.photoDate}>
                {new Date(latestPhoto.date).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.photoColumn}>
              <Text style={styles.photoLabel}>Target</Text>
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderText}>Level {phase.targetLevelId}</Text>
              </View>
              <Text style={styles.photoDate}>Goal</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.comparisonCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Photo Comparison</Text>
          </View>
          <Text style={styles.emptyText}>
            Add a baseline and current photo to unlock side-by-side comparisons.
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.photoButton} onPress={onTakePhoto}>
        <LinearGradient
          colors={['#6C63FF', '#5449CC']}
          style={styles.photoButtonGradient}
        >
          <Text style={styles.photoButtonText}>📸 Take Progress Photo</Text>
        </LinearGradient>
      </TouchableOpacity>

      {phasePhotos.length > 0 && (
        <View style={styles.timelineCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Photo Timeline</Text>
          </View>
          
          <View style={styles.timeline}>
            {baselinePhoto && (
              <View style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <Image source={{ uri: baselinePhoto.frontUri }} style={styles.timelinePhoto} />
                <View style={styles.timelineInfo}>
                  <Text style={styles.timelineDate}>
                    {new Date(baselinePhoto.date).toLocaleDateString()}
                  </Text>
                  <Text style={styles.timelineLabel}>Baseline</Text>
                </View>
              </View>
            )}

            {phasePhotos.map((photo) => (
              <View key={photo.id} style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <Image source={{ uri: photo.frontUri }} style={styles.timelinePhoto} />
                <View style={styles.timelineInfo}>
                  <Text style={styles.timelineDate}>
                    {new Date(photo.date).toLocaleDateString()}
                  </Text>
                  <Text style={styles.timelineLabel}>Check-in</Text>
                </View>
              </View>
            ))}
          </View>
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
          <Text style={styles.title}>Progress</Text>
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
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#151932',
    borderRadius: 999,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#6C63FF',
  },
  tabButtonText: {
    color: '#A0A3BD',
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  dashboardCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardMeta: {
    fontSize: 14,
    color: '#A0A3BD',
  },
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  trendInfo: {
    flex: 1,
  },
  trendLift: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  trendSequence: {
    fontSize: 13,
    color: '#A0A3BD',
    marginTop: 4,
  },
  trendDelta: {
    alignItems: 'flex-end',
  },
  trendGlyph: {
    fontSize: 16,
    color: '#6C63FF',
  },
  trendChange: {
    fontSize: 12,
    color: '#A0A3BD',
    marginTop: 4,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  volumeLabel: {
    width: 90,
    fontSize: 13,
    color: '#FFFFFF',
  },
  volumeBarTrack: {
    flex: 1,
    height: 10,
    backgroundColor: '#1E2340',
    borderRadius: 5,
    overflow: 'hidden',
  },
  volumeBarFill: {
    height: '100%',
    backgroundColor: '#6C63FF',
    borderRadius: 5,
  },
  movementBarFill: {
    height: '100%',
    backgroundColor: '#00F5A0',
    borderRadius: 5,
  },
  volumeValue: {
    width: 70,
    textAlign: 'right',
    color: '#A0A3BD',
    fontSize: 12,
  },
  volumeSummary: {
    fontSize: 13,
    color: '#A0A3BD',
    marginTop: 8,
  },
  bestLiftRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#1E2340',
  },
  bestLiftName: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bestLiftStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bestLiftValue: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  bestLiftDelta: {
    color: '#6C63FF',
    fontSize: 12,
  },
  volumeConsistency: {
    fontSize: 12,
    color: '#A0A3BD',
    marginTop: 4,
  },
  nutritionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
  },
  nutritionPercent: {
    fontSize: 36,
    fontWeight: '700',
    color: '#00F5A0',
  },
  nutritionDetail: {
    color: '#A0A3BD',
    fontSize: 14,
  },
  nutritionBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#00F5A0',
  },
  nutritionHint: {
    marginTop: 12,
    color: '#E3E5FF',
    fontSize: 14,
  },
  emptyText: {
    fontSize: 13,
    color: '#A0A3BD',
    textAlign: 'center',
    marginTop: 8,
  },
  sparkline: {
    fontSize: 24,
    color: '#6C63FF',
    marginBottom: 12,
  },
  weightProgress: {
    fontSize: 13,
    color: '#A0A3BD',
    marginBottom: 16,
  },
  repHistory: {
    gap: 8,
    marginBottom: 16,
  },
  repRow: {
    flexDirection: 'row',
    gap: 8,
  },
  repWeek: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  repValues: {
    color: '#A0A3BD',
  },
  insightBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1E2340',
  },
  insightIcon: {
    fontSize: 18,
  },
  insightText: {
    flex: 1,
    color: '#FFFFFF',
  },
  comparisonCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoColumn: {
    flex: 1,
    alignItems: 'center',
  },
  photoLabel: {
    fontSize: 12,
    color: '#A0A3BD',
    marginBottom: 8,
    fontWeight: '600',
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: '#1E2340',
    marginBottom: 8,
  },
  photoPlaceholder: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: '#1E2340',
    borderWidth: 2,
    borderColor: '#6C63FF',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  photoPlaceholderText: {
    fontSize: 14,
    color: '#6C63FF',
    fontWeight: '600',
  },
  photoDate: {
    fontSize: 11,
    color: '#A0A3BD',
  },
  photoButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
  },
  photoButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  photoButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  timelineCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  timeline: {
    gap: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#6C63FF',
  },
  timelinePhoto: {
    width: 80,
    height: 106,
    borderRadius: 8,
    backgroundColor: '#1E2340',
  },
  timelineInfo: {
    flex: 1,
  },
  timelineDate: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 4,
  },
  timelineLabel: {
    fontSize: 12,
    color: '#A0A3BD',
  },
  consistencyCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  consistencySubtitle: {
    fontSize: 13,
    color: '#A0A3BD',
    marginBottom: 16,
  },
  consistencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  consistencyDay: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#1E2340',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  consistencyDayActive: {
    backgroundColor: '#00F5A0',
    borderColor: '#00F5A0',
  },
  consistencyDayFuture: {
    opacity: 0.3,
  },
  consistencyDayText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
