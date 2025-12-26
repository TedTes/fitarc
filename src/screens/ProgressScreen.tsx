import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useFabAction } from '../contexts/FabActionContext';
import {
  PhasePlan,
  User,
  TrackingPreferences,
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
import {
  fetchMuscleGroups,
  fetchExercises,
  deriveMovementPatterns,
  MuscleGroupOption,
  ExerciseOption,
} from '../services/progressService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

const COLORS = {
  bgPrimary: '#0A0E27',
  bgSecondary: '#151932',
  bgTertiary: '#1E2340',
  surface: '#10142A',
  card: '#151932',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A3BD',
  textTertiary: '#8B93B0',
  textMuted: '#6E7191',
  accent: '#6C63FF',
  accentDim: 'rgba(108,99,255,0.15)',
  accentGlow: 'rgba(108,99,255,0.3)',
  success: '#00F5A0',
  successDim: 'rgba(0,245,160,0.15)',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
};

const SCREEN_GRADIENT = ['#0A0E27', '#151932', '#1E2340'] as const;

type MetricType = 'volume' | 'strength' | 'movement' | 'records';

interface MetricConfig {
  id: MetricType;
  label: string;
  icon: string;
  timeframe: string;
}

const AVAILABLE_METRICS: MetricConfig[] = [
  { id: 'volume', label: 'Volume', icon: '📊', timeframe: 'Last 4 weeks' },
  { id: 'strength', label: 'Strength', icon: '💪', timeframe: 'Last 8 weeks' },
  { id: 'movement', label: 'Balance', icon: '🎯', timeframe: 'This month' },
  { id: 'records', label: 'Records', icon: '🏆', timeframe: 'This phase' },
];

const TRACKING_CATEGORIES = [
  { id: 'muscles', label: 'Training Volume' },
  { id: 'lifts', label: 'Strength Trends' },
  { id: 'movements', label: 'Movement Balance' },
] as const;

type TrackingCategory = (typeof TRACKING_CATEGORIES)[number]['id'];

const createTrackingDraft = (prefs?: TrackingPreferences): TrackingPreferences => ({
  lifts: { ...(prefs?.lifts ?? {}) },
  movements: { ...(prefs?.movements ?? {}) },
  muscles: { ...(prefs?.muscles ?? {}) },
});

const toTrackingKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  user,
  phase,
  workoutDataVersion,
  workoutSessions: sessionFallback,
  workoutLogs: workoutLogFallback,
  strengthSnapshots: snapshotFallback,
  onUpdateTrackingPreferences,
}) => {
  const { setFabAction } = useFabAction();
  const { data, isLoading, refresh } = useProgressData(
    user.id,
    phase.id,
    undefined,
    workoutDataVersion
  );

  // Animation refs
  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlideAnim = useRef(new Animated.Value(-20)).current;
  const cardSlideAnim = useRef(new Animated.Value(30)).current;
  const cardFadeAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  const [activeMetrics, setActiveMetrics] = useState<MetricType[]>(['volume', 'strength', 'movement']);
  const [showAllVolume, setShowAllVolume] = useState(false);
  const [trackingModalVisible, setTrackingModalVisible] = useState(false);
  const [trackingDraft, setTrackingDraft] = useState<TrackingPreferences>(() =>
    createTrackingDraft(user.trackingPreferences)
  );
  const [trackingCategory, setTrackingCategory] = useState<TrackingCategory>('muscles');
  const [trackingTab, setTrackingTab] = useState<'selected' | 'available'>('selected');
  
  // DB-backed options state
  const [muscleOptions, setMuscleOptions] = useState<MuscleGroupOption[]>([]);
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [movementOptions, setMovementOptions] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Header entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headerSlideAnim, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Card entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardFadeAnim, {
        toValue: 1,
        duration: 500,
        delay: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(cardSlideAnim, {
        toValue: 0,
        duration: 500,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const loadTrackingOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [muscles, exercises] = await Promise.all([
        fetchMuscleGroups(),
        fetchExercises(),
      ]);
      setMuscleOptions(muscles);
      setExerciseOptions(exercises);
      setMovementOptions(deriveMovementPatterns(exercises));
    } catch (error) {
      console.error('Failed to load tracking options:', error);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const handleOpenTrackingModal = useCallback(async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTrackingDraft(createTrackingDraft(user.trackingPreferences));
    setTrackingCategory('muscles');
    setTrackingTab('selected');
    setTrackingModalVisible(true);
    await loadTrackingOptions();
  }, [user.trackingPreferences, loadTrackingOptions]);

  const handleCloseTrackingModal = useCallback(() => {
    setTrackingModalVisible(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFabAction('Progress', {
        label: 'Metrics',
        icon: '+',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: handleOpenTrackingModal,
      });

      return () => setFabAction('Progress', null);
    }, [handleOpenTrackingModal, setFabAction])
  );

  const handleAddTrackingItem = useCallback((label: string) => {
    const key = toTrackingKey(label);
    if (!key) return;
    
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTrackingDraft((prev) => {
      const next = createTrackingDraft(prev);
      const bucket = next[trackingCategory] ?? {};
      if (bucket[key]) return prev;
      next[trackingCategory] = { ...bucket, [key]: label };
      return next;
    });
  }, [trackingCategory]);

  const handleRemoveTrackingItem = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTrackingDraft((prev) => {
      const next = createTrackingDraft(prev);
      const bucket = { ...(next[trackingCategory] ?? {}) };
      if (!bucket[key]) return prev;
      delete bucket[key];
      next[trackingCategory] = bucket;
      return next;
    });
  }, [trackingCategory]);

  const handleSaveTracking = useCallback(async () => {
    if (!onUpdateTrackingPreferences) {
      handleCloseTrackingModal();
      return;
    }
    try {
      await onUpdateTrackingPreferences(trackingDraft);
      handleCloseTrackingModal();
    } catch (error) {
      console.error('Failed to save tracking preferences', error);
    }
  }, [handleCloseTrackingModal, onUpdateTrackingPreferences, trackingDraft]);

  const handleRemoveTracking = useCallback(
    async (category: TrackingCategory, key: string) => {
      if (!onUpdateTrackingPreferences || !key) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const next = createTrackingDraft(user.trackingPreferences);
      const bucket = { ...(next[category] ?? {}) };
      if (!bucket[key]) return;
      delete bucket[key];
      next[category] = bucket;
      try {
        await onUpdateTrackingPreferences(next);
      } catch (error) {
        console.error('Failed to update tracking preferences', error);
      }
    },
    [onUpdateTrackingPreferences, user.trackingPreferences]
  );

  const labelMaps = useMemo(
    () => ({
      lifts: user.trackingPreferences?.lifts,
      movements: user.trackingPreferences?.movements,
      muscles: user.trackingPreferences?.muscles,
    }),
    [user.trackingPreferences]
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

  const strengthTrends = buildStrengthTrends(strengthSnapshots, labelMaps);
  const weeklyVolume = buildWeeklyVolumeSummary(workoutLogs, labelMaps);
  const movementBalance = buildMovementBalanceSummary(workoutLogs, labelMaps);

  const bestLiftRows = strengthTrends
    .map((trend) => ({
      lift: trend.lift,
      current: trend.weights[trend.weights.length - 1] || 0,
      delta: trend.deltaLbs,
    }))
    .filter((row) => row.current > 0)
    .sort((a, b) => b.current - a.current)
    .slice(0, 3);

  const showSyncNotice = isLoading && sessions.length === 0;

  const getHeatColor = (intensity: number) => {
    if (intensity >= 0.8) return COLORS.success;
    if (intensity >= 0.5) return COLORS.accent;
    if (intensity >= 0.3) return COLORS.textTertiary;
    return '#2A2F4F';
  };

  const maxVolumeRows = 6;
  const hasExtraVolume = weeklyVolume.length > maxVolumeRows;
  const visibleVolume = showAllVolume ? weeklyVolume : weeklyVolume.slice(0, maxVolumeRows);

  const toggleMetric = (metricId: MetricType) => {
    LayoutAnimation.configureNext({
      duration: 300,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });

    setActiveMetrics((prev) => {
      if (prev.includes(metricId)) {
        return prev.filter((id) => id !== metricId);
      } else {
        return [...prev, metricId];
      }
    });
  };

  const toggleVolumeExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAllVolume((prev) => !prev);
  };

  const hasData = (metricId: MetricType): boolean => {
    switch (metricId) {
      case 'volume':
        return weeklyVolume.length > 0;
      case 'strength':
        return strengthTrends.length > 0;
      case 'movement':
        return movementBalance.length > 0;
      case 'records':
        return bestLiftRows.length > 0;
      default:
        return false;
    }
  };

  // Get available options based on category
  const getAvailableOptions = useCallback((): string[] => {
    const selectedKeys = new Set(Object.keys(trackingDraft[trackingCategory] ?? {}));
    
    switch (trackingCategory) {
      case 'muscles':
        return muscleOptions
          .map((m) => m.name)
          .filter((name) => !selectedKeys.has(toTrackingKey(name)));
      case 'lifts':
        return exerciseOptions
          .map((e) => e.name)
          .filter((name) => !selectedKeys.has(toTrackingKey(name)));
      case 'movements':
        return movementOptions
          .filter((pattern) => !selectedKeys.has(toTrackingKey(pattern)));
      default:
        return [];
    }
  }, [trackingCategory, trackingDraft, muscleOptions, exerciseOptions, movementOptions]);

  const renderMetricSelector = () => (
    <View style={styles.metricSelector}>
      <View style={styles.selectorHeader}>
        <Text style={styles.selectorLabel}>Active Metrics</Text>
        <TouchableOpacity
          style={styles.selectorAction}
          onPress={handleOpenTrackingModal}
          activeOpacity={0.8}
        >
          <Text style={styles.selectorActionText}>Manage Tracking</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.metricChips}
      >
        {AVAILABLE_METRICS.map((metric) => {
          const isActive = activeMetrics.includes(metric.id);
          const hasContent = hasData(metric.id);
          
          return (
            <TouchableOpacity
              key={metric.id}
              style={[
                styles.metricChip,
                isActive && styles.metricChipActive,
                !hasContent && styles.metricChipEmpty,
              ]}
              onPress={() => toggleMetric(metric.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.metricIcon}>{metric.icon}</Text>
              <View style={styles.metricInfo}>
                <Text
                  style={[
                    styles.metricLabel,
                    isActive && styles.metricLabelActive,
                  ]}
                >
                  {metric.label}
                </Text>
                <Text
                  style={[
                    styles.metricTime,
                    isActive && styles.metricTimeActive,
                  ]}
                >
                  {metric.timeframe}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderVolumeCard = () => {
    if (!activeMetrics.includes('volume')) return null;
    if (weeklyVolume.length === 0) {
      return (
        <View style={[styles.card, styles.emptyStateCard]}>
          <Text style={styles.emptyStateEmoji}>💪</Text>
          <Text style={styles.emptyStateTitle}>No volume data yet</Text>
          <Text style={styles.emptyStateText}>
            Complete workouts to track muscle volume over time
          </Text>
        </View>
      );
    }

    const topSets = Math.max(...visibleVolume.map((v) => v.sets), 1);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>💪 Training Volume</Text>
          <Text style={styles.cardSubtitle}>Last 4 weeks • Total sets</Text>
        </View>
        <View style={styles.volumeGrid}>
          {visibleVolume.map((volume) => {
            const intensity = volume.sets / topSets;
            const barColor = getHeatColor(intensity);
            return (
              <View key={volume.key} style={styles.volumeRow}>
                <Text style={styles.volumeLabel}>{volume.group}</Text>
                <View style={styles.volumeBarContainer}>
                  <View
                    style={[
                      styles.volumeBar,
                      { width: `${intensity * 100}%`, backgroundColor: barColor },
                    ]}
                  />
                </View>
                <Text style={styles.volumeValue}>{volume.sets}</Text>
              </View>
            );
          })}
        </View>
        {hasExtraVolume && (
          <TouchableOpacity style={styles.volumeToggle} onPress={toggleVolumeExpand}>
            <Text style={styles.volumeToggleText}>
              {showAllVolume ? 'Show Less' : `Show ${weeklyVolume.length - maxVolumeRows} More`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderStrengthCard = () => {
    if (!activeMetrics.includes('strength')) return null;
    if (strengthTrends.length === 0) {
      return (
        <View style={[styles.card, styles.emptyStateCard]}>
          <Text style={styles.emptyStateEmoji}>📈</Text>
          <Text style={styles.emptyStateTitle}>No strength data yet</Text>
          <Text style={styles.emptyStateText}>
            Log weights to track strength progression
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>💪 Strength Trends</Text>
          <Text style={styles.cardSubtitle}>Last 8 weeks</Text>
        </View>
        <View style={styles.strengthList}>
          {strengthTrends.map((trend) => (
            <View key={trend.key} style={styles.strengthRow}>
              <View style={styles.strengthInfo}>
                <Text style={styles.strengthLift}>{trend.lift}</Text>
                <Text style={styles.strengthGlyph}>{trend.glyph}</Text>
              </View>
              <View style={styles.strengthStats}>
                <Text style={styles.strengthWeight}>
                  {trend.weights[trend.weights.length - 1]} lbs
                </Text>
                {trend.deltaLbs !== 0 && (
                  <Text
                    style={[
                      styles.strengthDelta,
                      trend.deltaLbs > 0 && styles.strengthDeltaPositive,
                    ]}
                  >
                    {trend.deltaLbs > 0 ? '+' : ''}
                    {trend.deltaLbs} lbs
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderMovementCard = () => {
    if (!activeMetrics.includes('movement')) return null;
    if (movementBalance.length === 0) {
      return (
        <View style={[styles.card, styles.emptyStateCard]}>
          <Text style={styles.emptyStateEmoji}>🎯</Text>
          <Text style={styles.emptyStateTitle}>No movement data yet</Text>
          <Text style={styles.emptyStateText}>
            Complete workouts to track movement patterns
          </Text>
        </View>
      );
    }

    const maxSessions = Math.max(...movementBalance.map((m) => m.sessions), 1);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>🎯 Movement Balance</Text>
          <Text style={styles.cardSubtitle}>This month</Text>
        </View>
        <View style={styles.movementGrid}>
          {movementBalance.map((movement) => {
            const intensity = movement.sessions / maxSessions;
            const pillColor = getHeatColor(intensity);
            return (
              <View key={movement.key} style={styles.movementPill}>
                <View
                  style={[styles.movementIndicator, { backgroundColor: pillColor }]}
                />
                <Text style={styles.movementName}>{movement.name}</Text>
                <Text style={styles.movementCount}>×{movement.sessions}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderRecordsCard = () => {
    if (!activeMetrics.includes('records')) return null;
    if (bestLiftRows.length === 0) {
      return (
        <View style={[styles.card, styles.emptyStateCard]}>
          <Text style={styles.emptyStateEmoji}>🏆</Text>
          <Text style={styles.emptyStateTitle}>No records yet</Text>
          <Text style={styles.emptyStateText}>
            Keep lifting to set personal records
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>🏆 Personal Records</Text>
          <Text style={styles.cardSubtitle}>Top 3 lifts</Text>
        </View>
        <View style={styles.prList}>
          {bestLiftRows.map((row, idx) => {
            const rankEmojis = ['🥇', '🥈', '🥉'];
            return (
              <View key={row.lift} style={styles.prRow}>
                <View
                  style={[
                    styles.prRank,
                    idx === 0 && styles.prRank1,
                    idx === 1 && styles.prRank2,
                    idx === 2 && styles.prRank3,
                  ]}
                >
                  <Text style={styles.prRankEmoji}>{rankEmojis[idx]}</Text>
                </View>
                <View style={styles.prInfo}>
                  <Text style={styles.prLift}>{row.lift}</Text>
                  <Text style={styles.prWeight}>{row.current} lbs</Text>
                </View>
                {row.delta > 0 && (
                  <View style={styles.prBadgeImproved}>
                    <Text style={styles.prArrow}>↑</Text>
                    <Text style={styles.prBadgeText}>+{row.delta}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const availableOptions = getAvailableOptions();
  const selectedItems = Object.entries(trackingDraft[trackingCategory] ?? {});

  return (
    <>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
        >
          <Animated.View
            style={{
              opacity: headerFadeAnim,
              transform: [{ translateY: headerSlideAnim }],
            }}
          >
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Progress</Text>
                <Text style={styles.headerSubtitle}>Track your transformation</Text>
              </View>
            </View>
          </Animated.View>

          {showSyncNotice && (
            <Text style={styles.syncNotice}>⏳ Syncing latest progress data...</Text>
          )}

          {renderMetricSelector()}

          <Animated.View
            style={{
              opacity: cardFadeAnim,
              transform: [{ translateY: cardSlideAnim }],
              gap: 16,
            }}
          >
            {renderVolumeCard()}
            {renderStrengthCard()}
            {renderMovementCard()}
            {renderRecordsCard()}
          </Animated.View>

          {activeMetrics.length === 0 && (
            <View style={styles.noMetricsCard}>
              <Text style={styles.noMetricsEmoji}>📈</Text>
              <Text style={styles.noMetricsTitle}>Select metrics to track</Text>
              <Text style={styles.noMetricsText}>
                Choose from the options above to customize your progress view
              </Text>
            </View>
          )}
        </Animated.ScrollView>
      </LinearGradient>

      <Modal
        transparent
        animationType="fade"
        visible={trackingModalVisible}
        onRequestClose={handleCloseTrackingModal}
      >
        <View style={styles.trackingOverlay}>
          <Pressable style={styles.trackingBackdrop} onPress={handleCloseTrackingModal} />
          <View style={styles.trackingSheet}>
            <View style={styles.trackingHeader}>
              <Text style={styles.trackingTitle}>Manage Tracking</Text>
              <TouchableOpacity
                style={styles.trackingCloseButton}
                onPress={handleCloseTrackingModal}
              >
                <Text style={styles.trackingCloseText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.trackingCategoryRow}>
              {TRACKING_CATEGORIES.map((category) => {
                const isActive = trackingCategory === category.id;
                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.trackingCategoryChip,
                      isActive && styles.trackingCategoryChipActive,
                    ]}
                    onPress={() => setTrackingCategory(category.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.trackingCategoryText,
                        isActive && styles.trackingCategoryTextActive,
                      ]}
                    >
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {loadingOptions ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={styles.loadingText}>Loading options...</Text>
              </View>
            ) : (
              <View style={styles.trackingContent}>
                <View style={styles.trackingTabRow}>
                  <TouchableOpacity
                    style={[
                      styles.trackingTab,
                      trackingTab === 'selected' && styles.trackingTabActive,
                    ]}
                    onPress={() => setTrackingTab('selected')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.trackingTabText,
                        trackingTab === 'selected' && styles.trackingTabTextActive,
                      ]}
                    >
                      Selected ({selectedItems.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.trackingTab,
                      trackingTab === 'available' && styles.trackingTabActive,
                    ]}
                    onPress={() => setTrackingTab('available')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.trackingTabText,
                        trackingTab === 'available' && styles.trackingTabTextActive,
                      ]}
                    >
                      Available ({availableOptions.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.trackingPanel}>
                  <View style={styles.trackingPanelHeader}>
                    <Text style={styles.trackingPanelLabel}>
                      {trackingTab === 'selected'
                        ? `Selected (${selectedItems.length})`
                        : `Available (${availableOptions.length})`}
                    </Text>
                  </View>
                  {trackingTab === 'selected' ? (
                    selectedItems.length > 0 ? (
                      <ScrollView
                        style={styles.trackingPanelScroll}
                        contentContainerStyle={styles.trackingPanelList}
                        showsVerticalScrollIndicator={false}
                      >
                        {selectedItems.map(([key, label]) => (
                          <View key={key} style={styles.trackingItem}>
                            <Text style={styles.trackingItemLabel}>{label}</Text>
                            <TouchableOpacity
                              style={styles.trackingRemoveButton}
                              onPress={() => handleRemoveTrackingItem(key)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.trackingRemoveText}>×</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </ScrollView>
                    ) : (
                      <Text style={styles.trackingColumnEmptyText}>
                        No selected items yet.
                      </Text>
                    )
                  ) : availableOptions.length > 0 ? (
                    <ScrollView
                      style={styles.trackingPanelScroll}
                      contentContainerStyle={styles.trackingPanelList}
                      showsVerticalScrollIndicator={false}
                    >
                      {availableOptions.map((option) => (
                        <TouchableOpacity
                          key={option}
                          style={styles.optionItem}
                          onPress={() => handleAddTrackingItem(option)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.optionText}>{option}</Text>
                          <Text style={styles.optionAddIcon}>+</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={styles.trackingColumnEmptyText}>
                      No available items.
                    </Text>
                  )}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.trackingSaveButton}
              onPress={handleSaveTracking}
              activeOpacity={0.8}
            >
              <Text style={styles.trackingSaveText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  syncNotice: {
    color: COLORS.textMuted,
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 16,
  },

  // Metric Selector
  metricSelector: {
    marginBottom: 24,
  },
  selectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  selectorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectorAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.accentDim,
  },
  selectorActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
  },
  metricChips: {
    gap: 10,
    paddingRight: 20,
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  metricChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  metricChipEmpty: {
    opacity: 0.5,
  },
  metricIcon: {
    fontSize: 18,
  },
  metricInfo: {
    gap: 2,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  metricLabelActive: {
    color: COLORS.accent,
  },
  metricTime: {
    fontSize: 11,
    color: COLORS.textTertiary,
  },
  metricTimeActive: {
    color: COLORS.accent,
    opacity: 0.8,
  },

  // Cards
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textTertiary,
  },

  // Volume
  volumeGrid: {
    gap: 10,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  volumeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    width: 80,
  },
  volumeBarContainer: {
    flex: 1,
    height: 24,
    backgroundColor: COLORS.bgTertiary,
    borderRadius: 12,
    overflow: 'hidden',
  },
  volumeBar: {
    height: '100%',
    borderRadius: 12,
  },
  volumeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    width: 40,
    textAlign: 'right',
  },
  volumeToggle: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
  },
  volumeToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
    letterSpacing: 0.2,
  },

  // Strength
  strengthList: {
    gap: 12,
  },
  strengthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  strengthInfo: {
    flex: 1,
  },
  strengthLift: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  strengthGlyph: {
    fontSize: 11,
    color: COLORS.success,
    letterSpacing: 1,
  },
  strengthStats: {
    alignItems: 'flex-end',
  },
  strengthWeight: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  strengthDelta: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  strengthDeltaPositive: {
    color: COLORS.success,
  },

  // Movement
  movementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  movementPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgTertiary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  movementIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  movementName: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  movementCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // Personal Records
  prList: {
    gap: 12,
  },
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgTertiary,
  },
  prRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
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
    color: COLORS.textPrimary,
  },
  prWeight: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  prBadgeImproved: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successDim,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  prArrow: {
    fontSize: 14,
    color: COLORS.success,
  },
  prBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
  },

  // Empty States
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
    color: COLORS.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: COLORS.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },

  // No Metrics State
  noMetricsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noMetricsEmoji: {
    fontSize: 64,
    marginBottom: 16,
    opacity: 0.6,
  },
  noMetricsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  noMetricsText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Tracking Modal
  trackingOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  trackingBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  trackingSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    minHeight: '60%',
    maxHeight: '85%',
  },
  trackingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  trackingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  trackingCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgSecondary,
  },
  trackingCloseText: {
    fontSize: 22,
    color: COLORS.textSecondary,
    fontWeight: '400',
  },
  trackingCategoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    paddingRight: 8,
    alignItems: 'center',
  },
  trackingCategoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  trackingCategoryChipActive: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.successDim,
  },
  trackingCategoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  trackingCategoryTextActive: {
    color: COLORS.success,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: 12,
    fontSize: 14,
  },
  trackingContent: {
    flex: 1,
    marginBottom: 16,
  },
  trackingTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  trackingTab: {
    paddingVertical: 10,
    paddingHorizontal: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  trackingTabActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  trackingTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  trackingTabTextActive: {
    color: COLORS.accent,
  },
  trackingPanel: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  trackingPanelHeader: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  trackingPanelLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  trackingPanelScroll: {
    flex: 1,
  },
  trackingPanelList: {
    padding: 10,
    gap: 8,
  },
  trackingColumnEmptyText: {
    padding: 12,
    color: COLORS.textTertiary,
    fontSize: 13,
  },
  trackingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
  },
  trackingItemLabel: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  trackingRemoveButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  trackingRemoveText: {
    color: '#FF7B7B',
    fontSize: 18,
    fontWeight: '600',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  optionAddIcon: {
    fontSize: 20,
    color: COLORS.accent,
    fontWeight: '600',
  },
  trackingSaveButton: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  trackingSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});

export default ProgressScreen;
