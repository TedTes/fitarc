import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Modal,
  TextInput,
  Pressable,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
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
  { id: 'muscles', label: 'Muscles' },
  { id: 'movements', label: 'Movements' },
  { id: 'lifts', label: 'Lifts' },
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
  const [newTrackingLabel, setNewTrackingLabel] = useState('');

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

  const handleOpenTrackingModal = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTrackingDraft(createTrackingDraft(user.trackingPreferences));
    setTrackingCategory('muscles');
    setNewTrackingLabel('');
    setTrackingModalVisible(true);
  }, [user.trackingPreferences]);

  const handleCloseTrackingModal = useCallback(() => {
    setTrackingModalVisible(false);
    setNewTrackingLabel('');
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

  const handleAddTrackingItem = useCallback(() => {
    const label = newTrackingLabel.trim();
    if (!label) return;
    const key = toTrackingKey(label);
    if (!key) return;
    setTrackingDraft((prev) => {
      const next = createTrackingDraft(prev);
      const bucket = next[trackingCategory] ?? {};
      if (bucket[key]) return prev;
      next[trackingCategory] = { ...bucket, [key]: label };
      return next;
    });
    setNewTrackingLabel('');
  }, [newTrackingLabel, trackingCategory]);

  const handleRemoveTrackingItem = useCallback((key: string) => {
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
    [createTrackingDraft, onUpdateTrackingPreferences, user.trackingPreferences]
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
                !hasContent && styles.metricChipDisabled,
              ]}
              onPress={() => hasContent && toggleMetric(metric.id)}
              activeOpacity={0.7}
              disabled={!hasContent}
            >
              <Text style={styles.metricChipIcon}>{metric.icon}</Text>
              <Text
                style={[
                  styles.metricChipText,
                  isActive && styles.metricChipTextActive,
                  !hasContent && styles.metricChipTextDisabled,
                ]}
              >
                {metric.label}
              </Text>
              {isActive && <View style={styles.metricChipIndicator} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderVolumeCard = () => {
    if (!activeMetrics.includes('volume')) return null;

    const metric = AVAILABLE_METRICS.find((m) => m.id === 'volume')!;

    return (
      <View style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardIcon}>{metric.icon}</Text>
              <Text style={styles.cardTitle}>Training Volume</Text>
            </View>
            <Text style={styles.cardSubtitle}>{metric.timeframe}</Text>
          </View>
        </View>

        {weeklyVolume.length > 0 ? (
          <View style={styles.volumeBars}>
            {visibleVolume.map((entry: VolumeEntryView) => {
              const maxSets = weeklyVolume[0]?.sets || 1;
              const percent = Math.max(0, Math.min(100, (entry.sets / maxSets) * 100));
              const intensity = entry.sets / maxSets;
              const barColor = getHeatColor(intensity);
              return (
                <View key={entry.key} style={styles.volumeRow}>
                  <View style={styles.volumeRowHeader}>
                    <Text style={styles.volumeLabel}>{entry.group}</Text>
                    <View style={styles.volumeRowMeta}>
                      <Text style={styles.volumeValue}>{entry.sets}</Text>
                      {onUpdateTrackingPreferences && (
                        <TouchableOpacity
                          style={styles.trackingRemoveInline}
                          onPress={() => handleRemoveTracking('muscles', entry.key)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.trackingRemoveInlineText}>x</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <View style={styles.volumeTrack}>
                    <Animated.View
                      style={[
                        styles.volumeFill,
                        { 
                          width: `${percent}%`, 
                          backgroundColor: barColor,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState
            emoji="📊"
            title="Volume tracking starts soon"
            description="Log workouts to see your training volume breakdown"
          />
        )}

        {hasExtraVolume && (
          <TouchableOpacity
            style={styles.volumeToggle}
            onPress={toggleVolumeExpand}
            activeOpacity={0.8}
          >
            <Text style={styles.volumeToggleText}>
              {showAllVolume ? 'Show less' : `Show ${weeklyVolume.length - maxVolumeRows} more`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderStrengthCard = () => {
    if (!activeMetrics.includes('strength')) return null;

    const metric = AVAILABLE_METRICS.find((m) => m.id === 'strength')!;

    return (
      <View style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardIcon}>{metric.icon}</Text>
              <Text style={styles.cardTitle}>Strength Trends</Text>
            </View>
            <Text style={styles.cardSubtitle}>{metric.timeframe}</Text>
          </View>
        </View>

        {strengthTrends.length > 0 ? (
          strengthTrends.slice(0, 5).map((trend: StrengthTrendView) => {
            const maxWeight = Math.max(...trend.weights);
            return (
              <View key={trend.key} style={styles.trendRow}>
                <View style={styles.trendLeft}>
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
                              backgroundColor:
                                idx === trend.weights.length - 1 ? COLORS.success : COLORS.accent,
                            },
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
                  {onUpdateTrackingPreferences && (
                    <TouchableOpacity
                      style={[styles.trackingRemoveInline, styles.trackingRemoveInlineSmall]}
                      onPress={() => handleRemoveTracking('lifts', trend.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.trackingRemoveInlineText, styles.trackingRemoveInlineTextSmall]}>
                        x
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState
            emoji="💪"
            title="Your strength journey starts here"
            description="Complete a few workouts to see your progress trends"
          />
        )}
      </View>
    );
  };

  const renderMovementCard = () => {
    if (!activeMetrics.includes('movement')) return null;

    const metric = AVAILABLE_METRICS.find((m) => m.id === 'movement')!;

    return (
      <View style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardIcon}>{metric.icon}</Text>
              <Text style={styles.cardTitle}>Movement Balance</Text>
            </View>
            <Text style={styles.cardSubtitle}>{metric.timeframe}</Text>
          </View>
        </View>

        {movementBalance.length > 0 ? (
          <View style={styles.movementGrid}>
            {movementBalance.map((pattern: MovementPatternView) => {
              const maxSessions = Math.max(...movementBalance.map((p) => p.sessions));
              const intensity = pattern.sessions / maxSessions;
              return (
                <View key={pattern.key} style={styles.movementPill}>
                  <View
                    style={[
                      styles.movementIndicator,
                      { opacity: Math.max(0.3, intensity) },
                    ]}
                  />
                  <Text style={styles.movementName}>{pattern.name}</Text>
                  <Text style={styles.movementCount}>{pattern.sessions}x</Text>
                  {onUpdateTrackingPreferences && (
                    <TouchableOpacity
                      style={[styles.trackingRemoveInline, styles.trackingRemoveInlineTiny]}
                      onPress={() => handleRemoveTracking('movements', pattern.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.trackingRemoveInlineText, styles.trackingRemoveInlineTextSmall]}>
                        x
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState
            emoji="🎯"
            title="Balance your training"
            description="Movement patterns appear after tracking workouts"
          />
        )}
      </View>
    );
  };

  const renderRecordsCard = () => {
    if (!activeMetrics.includes('records') || bestLiftRows.length === 0) return null;

    const metric = AVAILABLE_METRICS.find((m) => m.id === 'records')!;

    return (
      <View style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardIcon}>{metric.icon}</Text>
              <Text style={styles.cardTitle}>Personal Records</Text>
            </View>
            <Text style={styles.cardSubtitle}>{metric.timeframe}</Text>
          </View>
        </View>

        {bestLiftRows.map((row, index) => {
          const rankStyle =
            index === 0
              ? styles.prRank1
              : index === 1
              ? styles.prRank2
              : index === 2
              ? styles.prRank3
              : styles.prRank;
          const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '💪';

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
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
        {/* Sticky Header */}
        <Animated.View
          style={[
            styles.stickyHeader,
            {
              opacity: headerFadeAnim,
              transform: [{ translateY: headerSlideAnim }],
            },
          ]}
        >
          <Text style={styles.title}>Progress</Text>
          <Text style={styles.subtitle}>
            Level {resolvedPhase.currentLevelId} → {resolvedPhase.targetLevelId}
          </Text>
        </Animated.View>

        <Animated.ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
        >
          {showSyncNotice && (
            <Text style={styles.syncNotice}>Syncing latest progress data...</Text>
          )}

          {/* Metric Selector */}
          {renderMetricSelector()}

          {/* Dynamic Metric Cards */}
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

          {/* Empty state when no metrics selected */}
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

            <View style={styles.trackingInputRow}>
              <TextInput
                style={styles.trackingInput}
                placeholder="Add label"
                placeholderTextColor={COLORS.textTertiary}
                value={newTrackingLabel}
                onChangeText={setNewTrackingLabel}
              />
              <TouchableOpacity
                style={styles.trackingAddButton}
                onPress={handleAddTrackingItem}
                activeOpacity={0.8}
              >
                <Text style={styles.trackingAddText}>Add</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.trackingList} showsVerticalScrollIndicator={false}>
              {Object.entries(trackingDraft[trackingCategory] ?? {}).length === 0 ? (
                <Text style={styles.trackingEmptyText}>
                  No items tracked yet.
                </Text>
              ) : (
                Object.entries(trackingDraft[trackingCategory] ?? {}).map(([key, label]) => (
                  <View key={key} style={styles.trackingItem}>
                    <Text style={styles.trackingItemLabel}>{label}</Text>
                    <TouchableOpacity
                      style={styles.trackingRemoveButton}
                      onPress={() => handleRemoveTrackingItem(key)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.trackingRemoveText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.trackingSaveButton}
              onPress={handleSaveTracking}
              activeOpacity={0.85}
            >
              <Text style={styles.trackingSaveText}>Save Tracking</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// Empty State Component
const EmptyState = ({
  emoji,
  title,
  description,
}: {
  emoji: string;
  title: string;
  description: string;
}) => (
  <View style={styles.emptyStateCard}>
    <Text style={styles.emptyStateEmoji}>{emoji}</Text>
    <Text style={styles.emptyStateTitle}>{title}</Text>
    <Text style={styles.emptyStateText}>{description}</Text>
    <View style={styles.emptyStateDots}>
      <View style={styles.emptyStateDot} />
      <View style={[styles.emptyStateDot, styles.emptyStateDotActive]} />
      <View style={styles.emptyStateDot} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  gradient: {
    flex: 1,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: COLORS.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    zIndex: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  scrollContent: {
    paddingTop: 140,
    paddingHorizontal: 20,
    paddingBottom: 100,
    gap: 16,
  },
  syncNotice: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 8,
  },

  // Metric Selector
  metricSelector: {
    marginBottom: 8,
  },
  selectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectorAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.accentDim,
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
  },
  selectorActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.accent,
  },
  metricChips: {
    gap: 8,
    paddingVertical: 4,
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    position: 'relative',
  },
  metricChipActive: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  metricChipDisabled: {
    opacity: 0.4,
  },
  metricChipIcon: {
    fontSize: 16,
  },
  metricChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  metricChipTextActive: {
    color: COLORS.accent,
  },
  metricChipTextDisabled: {
    color: COLORS.textMuted,
  },
  metricChipIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 16,
    right: 16,
    height: 2,
    backgroundColor: COLORS.accent,
    borderRadius: 1,
  },

  // Card Styles
  compactCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardIcon: {
    fontSize: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // Strength Trends
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgTertiary,
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
    color: COLORS.textPrimary,
  },
  trendProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  trendStart: {
    fontSize: 11,
    color: COLORS.textTertiary,
  },
  trendArrow: {
    fontSize: 10,
    color: COLORS.accent,
  },
  trendCurrent: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  trendRight: {
    alignItems: 'flex-end',
  },
  trendBadge: {
    backgroundColor: COLORS.successDim,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  trendDelta: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.success,
  },
  trendPercent: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Volume Bars
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
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  volumeValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  volumeTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  volumeFill: {
    height: '100%',
    borderRadius: 999,
  },
  volumeToggle: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: COLORS.accentDim,
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
  },
  volumeToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
    letterSpacing: 0.2,
  },

  // Movement Grid
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
    backgroundColor: COLORS.accent,
  },

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
    backgroundColor: COLORS.elevated,
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
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  trackingCategoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  trackingCategoryTextActive: {
    color: COLORS.accent,
  },
  trackingInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  trackingInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  trackingAddButton: {
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
  },
  trackingAddText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  trackingList: {
    flex: 1,
    marginBottom: 16,
  },
  trackingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  trackingItemLabel: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  trackingRemoveInline: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  trackingRemoveInlineSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  trackingRemoveInlineTiny: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  trackingRemoveInlineText: {
    color: '#FF7B7B',
    fontSize: 12,
    fontWeight: '700',
  },
  trackingRemoveInlineTextSmall: {
    fontSize: 10,
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
  trackingEmptyText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 24,
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
