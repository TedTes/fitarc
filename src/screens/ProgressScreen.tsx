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
import { useScreenAnimation } from '../hooks/useScreenAnimation';
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
} from '../utils/performanceSelectors';
import { fetchExerciseDefaults, ExerciseDefault } from '../services/workoutService';
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

const TRACKING_CATEGORIES = [
  { id: 'muscles', label: 'Training Volume' },
  { id: 'lifts', label: 'Strength Training' },
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
  onUpdateTrackingPreferences,
}) => {
  const { setFabAction } = useFabAction();
  const { headerStyle, contentStyle } = useScreenAnimation({
    headerDuration: 140,
    contentDuration: 140,
  });
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
  const volumeCardRef = useRef<View | null>(null);

  const [activeMetrics] = useState<MetricType[]>(['volume', 'strength', 'movement']);
  const [showAllVolume, setShowAllVolume] = useState(false);
  const [showAllStrength, setShowAllStrength] = useState(false);
  const [trackingModalVisible, setTrackingModalVisible] = useState(false);
  const [trackingDraft, setTrackingDraft] = useState<TrackingPreferences>(() =>
    createTrackingDraft(user.trackingPreferences)
  );

  // Dropdown (category) + tabs (selected/available)
  const [trackingCategory, setTrackingCategory] = useState<TrackingCategory>('muscles');
  const [trackingTab, setTrackingTab] = useState<'selected' | 'available'>('selected');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  // DB-backed options state
  const [muscleOptions, setMuscleOptions] = useState<MuscleGroupOption[]>([]);
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [movementOptions, setMovementOptions] = useState<string[]>([]);
  const [exerciseDefaults, setExerciseDefaults] = useState<ExerciseDefault[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Header entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFadeAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headerSlideAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [headerFadeAnim, headerSlideAnim]);

  // Card entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardFadeAnim, {
        toValue: 1,
        duration: 240,
        delay: 120,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(cardSlideAnim, {
        toValue: 0,
        duration: 240,
        delay: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardFadeAnim, cardSlideAnim]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    let isMounted = true;
    const loadDefaults = async () => {
      try {
        const [defaults, exercises] = await Promise.all([
          fetchExerciseDefaults(user.id),
          fetchExercises(),
        ]);
        if (!isMounted) return;
        setExerciseDefaults(defaults);
        if (exerciseOptions.length === 0) {
          setExerciseOptions(exercises);
        }
      } catch (error) {
        console.error('Failed to load exercise defaults:', error);
      }
    };
    loadDefaults();
    return () => {
      isMounted = false;
    };
  }, [user.id, exerciseOptions.length]);

  const loadTrackingOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [muscles, exercises] = await Promise.all([fetchMuscleGroups(), fetchExercises()]);
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
    setShowCategoryMenu(false);
    setTrackingModalVisible(true);
    await loadTrackingOptions();
  }, [user.trackingPreferences, loadTrackingOptions]);

  const handleCloseTrackingModal = useCallback(() => {
    setShowCategoryMenu(false);
    setTrackingModalVisible(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setShowAllVolume(false);
      setShowAllStrength(false);
      setFabAction('Progress', {
        label: 'Metrics',
        icon: '+',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: handleOpenTrackingModal,
      });

      return () => {
        setShowAllVolume(false);
        setShowAllStrength(false);
        setFabAction('Progress', null);
      };
    }, [handleOpenTrackingModal, setFabAction])
  );

  const handleAddTrackingItem = useCallback(
    (label: string) => {
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
    },
    [trackingCategory]
  );

  const handleRemoveTrackingItem = useCallback(
    (key: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTrackingDraft((prev) => {
        const next = createTrackingDraft(prev);
        const bucket = { ...(next[trackingCategory] ?? {}) };
        if (!bucket[key]) return prev;
        delete bucket[key];
        next[trackingCategory] = bucket;
        return next;
      });
    },
    [trackingCategory]
  );

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

  const labelMaps = useMemo(
    () => ({
      lifts: user.trackingPreferences?.lifts,
      movements: user.trackingPreferences?.movements,
      muscles: user.trackingPreferences?.muscles,
    }),
    [user.trackingPreferences]
  );

  const resolvedPhase = data?.phase ?? phase;
  const resolvedPhaseId = resolvedPhase.id;

  const mergedSessions = useMemo(() => data?.sessions || [], [data?.sessions]);
  const mergedWorkoutLogs = useMemo(() => data?.workoutLogs || [], [data?.workoutLogs]);
  const mergedSnapshots = useMemo(() => data?.strengthSnapshots || [], [data?.strengthSnapshots]);

  const sessions = useMemo(
    () => mergedSessions.filter((session) => session.phasePlanId === resolvedPhaseId),
    [mergedSessions, resolvedPhaseId]
  );
  const workoutLogs = useMemo(
    () => mergedWorkoutLogs.filter((log) => log.phasePlanId === resolvedPhaseId),
    [mergedWorkoutLogs, resolvedPhaseId]
  );
  const strengthSnapshots = useMemo(
    () => mergedSnapshots.filter((snap) => snap.phasePlanId === resolvedPhaseId),
    [mergedSnapshots, resolvedPhaseId]
  );

  const strengthTrendsRaw = buildStrengthTrends(strengthSnapshots, labelMaps);

  const preferredWeightsByKey = useMemo(() => {
    const exerciseKeyById = new Map(
      exerciseOptions.map((exercise) => [exercise.id, toTrackingKey(exercise.name)])
    );
    const result = new Map<string, number>();
    exerciseDefaults.forEach((def) => {
      if (!def.exerciseId || !def.defaultWeight || def.defaultWeight <= 0) return;
      const key = exerciseKeyById.get(def.exerciseId);
      if (!key) return;
      if (!result.has(key)) {
        result.set(key, def.defaultWeight);
      }
    });
    return result;
  }, [exerciseDefaults, exerciseOptions]);

  const hasStrengthSnapshots = strengthSnapshots.length > 0;

  const strengthTrends = useMemo(() => {
    if (!hasStrengthSnapshots) return [];

    const existingKeys = new Set(strengthTrendsRaw.map((trend) => toTrackingKey(trend.lift)));
    const selected = Object.entries(user.trackingPreferences?.lifts ?? {});

    const filled = strengthTrendsRaw.map((trend) => {
      if (trend.weights.length > 0) return trend;
      const key = toTrackingKey(trend.lift);
      const weight = preferredWeightsByKey.get(key);
      if (!weight) return trend;
      return {
        ...trend,
        weights: [weight],
        glyph: '▅',
        deltaLbs: 0,
        deltaPercent: 0,
      };
    });

    const fallback = selected.reduce<StrengthTrendView[]>((acc, [key, label]) => {
      const normalizedKey = key || toTrackingKey(label);
      if (existingKeys.has(normalizedKey)) return acc;
      const weight = preferredWeightsByKey.get(normalizedKey);
      if (!weight) return acc;
      acc.push({
        key: normalizedKey as any,
        lift: label,
        weights: [weight],
        glyph: '▅',
        deltaLbs: 0,
        deltaPercent: 0,
      });
      return acc;
    }, []);

    return [...filled, ...fallback];
  }, [hasStrengthSnapshots, strengthTrendsRaw, preferredWeightsByKey, user.trackingPreferences?.lifts]);

  const weeklyVolume = buildWeeklyVolumeSummary(workoutLogs, labelMaps);
  const movementBalance = buildMovementBalanceSummary(workoutLogs, labelMaps);

  const selectedMuscles = Object.entries(user.trackingPreferences?.muscles ?? {}).map(
    ([key, label]) => ({ key, group: label, sets: 0 })
  );
  const volumeEntries = weeklyVolume.length > 0 ? weeklyVolume : selectedMuscles.slice(0, 3);

  const selectedMovements = Object.entries(user.trackingPreferences?.movements ?? {}).map(
    ([key, label]) => ({ key, name: label, sessions: 0 })
  );
  const movementEntries = movementBalance.length > 0 ? movementBalance : selectedMovements.slice(0, 3);

  const selectedLifts = Object.entries(user.trackingPreferences?.lifts ?? {}).map(
    ([key, label]) => ({ key, lift: label })
  );
  const strengthTrendEntries =
    strengthTrends.length > 0
      ? strengthTrends
      : selectedLifts.slice(0, 3).map((lift) => ({
          key: lift.key as any,
          lift: lift.lift,
          weights: [0],
          glyph: '▁',
          deltaLbs: 0,
          deltaPercent: 0,
        }));

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

  const recordRows =
    bestLiftRows.length > 0
      ? bestLiftRows
      : strengthTrendEntries.map((trend) => ({
          lift: trend.lift,
          current: trend.weights[trend.weights.length - 1] || 0,
          delta: 0,
        }));

  const getHeatColor = (intensity: number) => {
    if (intensity >= 0.8) return COLORS.success;
    if (intensity >= 0.5) return COLORS.accent;
    if (intensity >= 0.3) return '#4B5385';
    return '#4A527F';
  };

  const maxVolumeRows = 3;
  const volumeHasData = volumeEntries.length > 0;
  const strengthHasData = strengthTrendEntries.length > 0;
  const movementHasData = movementEntries.length > 0;
  const recordsHasData = recordRows.length > 0;

  const hasAnyMetricData = volumeHasData || strengthHasData || movementHasData || recordsHasData;

  const hasExtraVolume = volumeEntries.length > maxVolumeRows;
  const visibleVolume = showAllVolume ? volumeEntries : volumeEntries.slice(0, maxVolumeRows);

  const maxStrengthRows = 3;
  const hasExtraStrength = strengthTrendEntries.length > maxStrengthRows;
  const visibleStrength = showAllStrength ? strengthTrendEntries : strengthTrendEntries.slice(0, maxStrengthRows);

  const planWeeks = Math.max(resolvedPhase?.expectedWeeks ?? 8, 1);
  const volumeWindowWeeks = 4;

  const maxWindowSets = Math.max(...volumeEntries.map((entry) => entry.sets), 0);
  const maxWeeklyAvg = maxWindowSets / volumeWindowWeeks;
  const planBaseline = Math.max(maxWeeklyAvg * planWeeks, maxWindowSets, 1);

  const toggleVolumeExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAllVolume((prev) => !prev);
  };

  const toggleStrengthExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAllStrength((prev) => !prev);
  };

  const collapseVolumeIfExpanded = () => {
    if (!showAllVolume) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAllVolume(false);
  };

  const handleContentTap = useCallback(
    (event: any) => {
      if (!showAllVolume) return;
      const pageY = event.nativeEvent.pageY;
      const node = volumeCardRef.current;
      if (!node) return;
      node.measureInWindow((_x, y, _width, height) => {
        if (pageY < y || pageY > y + height) {
          collapseVolumeIfExpanded();
        }
      });
    },
    [showAllVolume]
  );

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
        return movementOptions.filter((pattern) => !selectedKeys.has(toTrackingKey(pattern)));
      default:
        return [];
    }
  }, [trackingCategory, trackingDraft, muscleOptions, exerciseOptions, movementOptions]);

  const renderVolumeCard = () => {
    if (!activeMetrics.includes('volume') || !volumeHasData) return null;

    return (
      <View style={styles.card} ref={volumeCardRef}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>💪 Training Volume</Text>
          <Text style={styles.cardSubtitle}>Last 4 weeks • Scaled to plan progress</Text>
        </View>

        <View style={styles.volumeGrid}>
          {visibleVolume.map((volume) => {
            const intensity = Math.min(volume.sets / planBaseline, 1);
            const barColor = getHeatColor(intensity);
            return (
              <View key={volume.key} style={styles.volumeRow}>
                <Text style={styles.volumeLabel}>{volume.group}</Text>
                <View style={styles.volumeBarContainer}>
                  <View style={[styles.volumeBar, { width: `${intensity * 100}%`, backgroundColor: barColor }]} />
                </View>
                <Text style={styles.volumeValue}>{volume.sets}</Text>
              </View>
            );
          })}
        </View>

        {hasExtraVolume && (
          <TouchableOpacity style={styles.volumeToggle} onPress={toggleVolumeExpand} activeOpacity={0.9}>
            <Text style={styles.volumeToggleText}>
              {showAllVolume ? 'Show Less' : `Show ${volumeEntries.length - maxVolumeRows} More`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderStrengthCard = () => {
    if (!activeMetrics.includes('strength') || !strengthHasData) return null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>💪 Strength Trends</Text>
          <Text style={styles.cardSubtitle}>
            {hasStrengthSnapshots ? 'Last 4 weeks' : 'Current starting weights'}
          </Text>
        </View>

        <View style={styles.strengthList}>
          {visibleStrength.map((trend) => (
            <View key={trend.key} style={styles.strengthRow}>
              <View style={styles.strengthInfo}>
                <Text style={styles.strengthLift}>{trend.lift}</Text>
                <Text style={styles.strengthGlyph}>{trend.glyph}</Text>
              </View>
              <View style={styles.strengthStats}>
                <Text style={styles.strengthWeight}>{trend.weights[trend.weights.length - 1]} lbs</Text>
                {trend.deltaLbs !== 0 && (
                  <Text style={[styles.strengthDelta, trend.deltaLbs > 0 && styles.strengthDeltaPositive]}>
                    {trend.deltaLbs > 0 ? '+' : ''}
                    {trend.deltaLbs} lbs
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {hasExtraStrength && (
          <TouchableOpacity style={styles.volumeToggle} onPress={toggleStrengthExpand} activeOpacity={0.9}>
            <Text style={styles.volumeToggleText}>
              {showAllStrength ? 'Show Less' : `Show ${strengthTrends.length - maxStrengthRows} More`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderMovementCard = () => {
    if (!activeMetrics.includes('movement') || !movementHasData) return null;

    const maxSessions = Math.max(...movementEntries.map((m) => m.sessions), 1);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>🎯 Movement Balance</Text>
          <Text style={styles.cardSubtitle}>This month</Text>
        </View>

        <View style={styles.movementGrid}>
          {movementEntries.map((movement) => {
            const intensity = movement.sessions / maxSessions;
            const pillColor = getHeatColor(intensity);
            return (
              <View key={movement.key} style={styles.movementPill}>
                <View style={[styles.movementIndicator, { backgroundColor: pillColor }]} />
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
    if (!activeMetrics.includes('records') || !recordsHasData) return null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>🏆 Personal Records</Text>
          <Text style={styles.cardSubtitle}>Top 3 lifts</Text>
        </View>

        <View style={styles.prList}>
          {recordRows.map((row, idx) => {
            const rankEmojis = ['🥇', '🥈', '🥉'];
            return (
              <View key={row.lift} style={styles.prRow}>
                <View style={[styles.prRank, idx === 0 && styles.prRank1, idx === 1 && styles.prRank2, idx === 2 && styles.prRank3]}>
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
  const selectedCategoryLabel = TRACKING_CATEGORIES.find((c) => c.id === trackingCategory)?.label ?? 'Training Volume';

  const renderEmptyMetrics = () => (
    <View style={[styles.card, styles.emptyStateCard]}>
      <Text style={styles.emptyStateEmoji}>📊</Text>
      <Text style={styles.emptyStateTitle}>No progress data yet</Text>
      <Text style={styles.emptyStateText}>
        Complete workouts to unlock training volume, strength trends, and movement balance.
      </Text>
    </View>
  );

  return (
    <>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <Animated.ScrollView
          style={[styles.scrollView, contentStyle]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            collapseVolumeIfExpanded();
            setShowAllStrength(false);
          }}
          onMomentumScrollBegin={() => {
            collapseVolumeIfExpanded();
            setShowAllStrength(false);
          }}
          onTouchStart={handleContentTap}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        >
          <Animated.View
            style={[
              headerStyle,
              {
                opacity: headerFadeAnim,
                transform: [{ translateY: headerSlideAnim }],
              },
            ]}
          >
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Progress</Text>
                <Text style={styles.headerSubtitle}>Track your transformation</Text>
              </View>
            </View>
          </Animated.View>

          {showSyncNotice && <Text style={styles.syncNotice}>⏳ Syncing latest progress data...</Text>}

          {hasAnyMetricData ? (
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
          ) : (
            renderEmptyMetrics()
          )}

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

      {/* Tracking Modal */}
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

            <View style={styles.trackingControlRow}>
              <View style={styles.dropdownWrapper}>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => setShowCategoryMenu((v) => !v)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.dropdownLabel}>{selectedCategoryLabel}</Text>
                  <Text style={styles.dropdownChevron}>▾</Text>
                </TouchableOpacity>

                {showCategoryMenu && (
                  <View style={styles.dropdownMenu}>
                    {TRACKING_CATEGORIES.map((category) => {
                      const isActive = trackingCategory === category.id;
                      return (
                        <TouchableOpacity
                          key={category.id}
                          style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
                          onPress={() => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setTrackingCategory(category.id);
                            setTrackingTab('selected');
                            setShowCategoryMenu(false);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.dropdownItemText, isActive && styles.dropdownItemTextActive]}>
                            {category.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={styles.trackingTabRow}>
                <TouchableOpacity
                  style={[
                    styles.trackingTabCompact,
                    trackingTab === 'selected' && styles.trackingTabCompactActive,
                  ]}
                  onPress={() => {
                    setShowCategoryMenu(false);
                    setTrackingTab('selected');
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.trackingTabTextCompact,
                      trackingTab === 'selected' && styles.trackingTabTextCompactActive,
                    ]}
                  >
                    Selected
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.trackingTabCompact,
                    trackingTab === 'available' && styles.trackingTabCompactActive,
                  ]}
                  onPress={() => {
                    setShowCategoryMenu(false);
                    setTrackingTab('available');
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.trackingTabTextCompact,
                      trackingTab === 'available' && styles.trackingTabTextCompactActive,
                    ]}
                  >
                    Available
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {loadingOptions ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={styles.loadingText}>Loading options...</Text>
              </View>
            ) : (
              <View style={styles.trackingContent}>
                <Text style={styles.trackingHintText}>
                  Only selected items with logged workouts will appear on the Progress screen.
                </Text>

                <View style={styles.trackingPanel}>
                  <View style={styles.trackingPanelHeader}>
                    <Text style={styles.trackingPanelLabel}>
                      {trackingTab === 'selected'
                        ? `${selectedItems.length} Selected`
                        : `${availableOptions.length} Available`}
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
                        No items selected yet.{'\n'}Switch to "Available" to add metrics.
                      </Text>
                    )
                  ) : availableOptions.length > 0 ? (
                    <ScrollView style={styles.trackingPanelScroll} showsVerticalScrollIndicator={false}>
                      {availableOptions.map((option) => (
                        <TouchableOpacity
                          key={option}
                          style={styles.optionItem}
                          onPress={() => handleAddTrackingItem(option)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.optionText}>{option}</Text>
                          <View style={styles.optionAddIcon}>
                            <Text style={styles.optionAddText}>+</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={styles.trackingColumnEmptyText}>
                      No available items.{'\n'}All options have been added.
                    </Text>
                  )}
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.trackingSaveButton} onPress={handleSaveTracking} activeOpacity={0.8}>
              <Text style={styles.trackingSaveText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
    paddingTop: '20%',
  },

  header: { marginBottom: 24 },
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

  // Cards
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { marginBottom: 16 },
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
  volumeGrid: { gap: 10 },
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
  volumeBar: { height: '100%', borderRadius: 12 },
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
  strengthList: { gap: 8 },
  strengthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  strengthInfo: { flex: 1 },
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
  strengthStats: { alignItems: 'flex-end' },
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
  strengthDeltaPositive: { color: COLORS.success },

  // Movement
  movementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  movementPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgTertiary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
    maxWidth: '100%',
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
    flexShrink: 1,
  },
  movementCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // Personal Records
  prList: { gap: 12 },
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
  prRank1: { backgroundColor: '#FFD700' },
  prRank2: { backgroundColor: '#C0C0C0' },
  prRank3: { backgroundColor: '#CD7F32' },
  prRankEmoji: { fontSize: 20 },
  prInfo: { flex: 1 },
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
  prArrow: { fontSize: 14, color: COLORS.success },
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
    position: 'relative',
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

  // Dropdown - Compact Style
  dropdownWrapper: {
    marginRight: 8,
    zIndex: 50,
    minWidth: 160,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dropdownLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.1,
  },
  dropdownChevron: {
    fontSize: 14,
    color: COLORS.textTertiary,
    fontWeight: '600',
    marginLeft: 6,
  },
  dropdownMenu: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 46,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  dropdownItemActive: {
    backgroundColor: COLORS.accentDim,
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  dropdownItemTextActive: {
    color: COLORS.accent,
  },

  trackingControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  trackingTabRow: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  trackingTabCompact: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  trackingTabCompactActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  trackingTabTextCompact: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textTertiary,
    letterSpacing: 0.3,
  },
  trackingTabTextCompactActive: {
    color: COLORS.accent,
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
  trackingHintText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 12,
    lineHeight: 16,
    paddingHorizontal: 2,
  },
  trackingPanel: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.bgSecondary,
    overflow: 'hidden',
  },
  trackingPanelHeader: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(108, 99, 255, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  trackingPanelLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  trackingPanelScroll: { flex: 1 },
  trackingPanelList: {
    padding: 12,
    gap: 8,
  },
  trackingColumnEmptyText: {
    padding: 32,
    textAlign: 'center',
    color: COLORS.textTertiary,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  trackingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  trackingItemLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  trackingRemoveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 123, 123, 0.3)',
    marginLeft: 12,
  },
  trackingRemoveText: {
    color: '#FF6B6B',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 20,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  optionAddIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accentDim,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  optionAddText: {
    fontSize: 18,
    color: COLORS.accent,
    fontWeight: '700',
    lineHeight: 18,
  },
  trackingSaveButton: {
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  trackingSaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.bgPrimary,
    letterSpacing: 0.5,
  },
});

export default ProgressScreen;