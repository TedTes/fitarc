import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import {
  User,
  PhasePlan,
  WorkoutSessionEntry,
  MuscleGroup,
} from '../types/domain';
import { useHomeScreenData } from '../hooks/useHomeScreenData';
import { useTodayMeals } from '../hooks/useTodayMeals';
import { useWorkoutSessions } from '../hooks/useWorkoutSessions';
import { MealEntry } from '../services/mealService';
import { useFabAction } from '../contexts/FabActionContext';
import { useScreenAnimation } from '../hooks/useScreenAnimation';
import { Calendar } from 'react-native-calendars';
import { getBodyPartLabel } from '../utils';
import { addDays, formatLocalDateYMD, parseYMDToDate } from '../utils/date';
import {
  computeEntriesMacroTotals,
  formatMacroSummaryLine,
  formatMealEntryMacros,
} from '../utils/mealMacros';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}



// Constants
const CARD_GRADIENT_DEFAULT = ['rgba(30, 35, 64, 0.8)', 'rgba(21, 25, 50, 0.6)'] as const;
const BACKGROUND_GRADIENT = ['#0A0E27', '#151932', '#1E2340'] as const;

const COLORS = {
  bgPrimary: '#0A0E27',
  textPrimary: '#FFFFFF',
  textMuted: '#8B93B0',
  textSecondary: '#C7CCE6',
  accent: '#6C63FF',
  accentDark: '#4C3BFF',
  success: '#00F5A0',
  successGlow: 'rgba(0, 245, 160, 0.4)',
  border: 'rgba(108, 99, 255, 0.2)',
  borderLight: 'rgba(108, 99, 255, 0.15)',
  overlay: 'rgba(255, 255, 255, 0.08)',
  overlayLight: 'rgba(255, 255, 255, 0.25)',
} as const;

const ACTIVITY_TOTAL_DAYS_FALLBACK = 182;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ACTIVITY_SECTION_HEIGHT = Math.min(320, Math.max(240, Math.round(SCREEN_HEIGHT * 0.20)));

const MEAL_TYPE_ORDER = ['breakfast', 'lunch', 'dinner'] as const;
const KNOWN_BODY_PARTS = new Set(['chest', 'back', 'legs', 'shoulders', 'arms', 'core']);

// Animation configurations
const ANIMATION_CONFIG = {
  headerFade: {
    duration: 600,
    easing: Easing.out(Easing.cubic),
  },
  spring: {
    tension: 200,
    friction: 10,
  },
  springLight: {
    tension: 100,
    friction: 5,
  },
  springMedium: {
    tension: 100,
    friction: 10,
  },
  pulse: {
    delay: 2000,
    scale: 1.05,
  },
  checkboxPulse: {
    scale: 1.3,
  },
  exerciseCard: {
    scale: 0.97,
  },
} as const;

// Calendar theme configuration
const getCalendarTheme = () => ({
  calendarBackground: 'transparent',
  monthTextColor: COLORS.textPrimary,
  textSectionTitleColor: COLORS.textMuted,
  dayTextColor: COLORS.textSecondary,
  textDisabledColor: 'rgba(255,255,255,0.15)',
  arrowColor: COLORS.accent,
  todayTextColor: COLORS.textPrimary,
  textDayFontSize: 9,
  textMonthFontSize: 11,
  textDayHeaderFontSize: 7,
  'stylesheet.day.basic': {
    base: {
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
  },
  'stylesheet.calendar.main': {
    week: {
      marginTop: 1,
      marginBottom: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
  },
} as any);

// Helper functions
const formatBodyPartList = (parts: MuscleGroup[]): string => {
  if (!parts.length) return 'Full Body';
  return parts
    .map((part) => {
      const key = part.toLowerCase();
      return KNOWN_BODY_PARTS.has(key) ? getBodyPartLabel(key as any) : part;
    })
    .join(' • ');
};

const getGreetingMessage = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const getCalendarDateStyles = (isComplete: boolean, isToday: boolean) => {
  let backgroundColor: string;
  let borderColor: string = 'transparent';
  let shadowOpacity: number = 0;
  
  if (isComplete) {
    backgroundColor = COLORS.success;
    shadowOpacity = 0.4;
  } else if (isToday) {
    backgroundColor = 'rgba(108, 99, 255, 0.3)';
    borderColor = COLORS.accent;
  } else {
    backgroundColor = COLORS.overlay;
  }
  
  return {
    container: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor,
      borderWidth: isToday && !isComplete ? 2 : 0,
      borderColor,
      shadowColor: isComplete ? COLORS.success : 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity,
      shadowRadius: 6,
    },
    text: {
      color: isComplete ? COLORS.bgPrimary : COLORS.textPrimary,
      fontWeight: isComplete ? '700' : isToday ? '600' : '500',
      fontSize: 10,
    },
  };
};

type DashboardScreenProps = {
  user: User;
  phase: PhasePlan | null;
  workoutSessions: WorkoutSessionEntry[];
  onProfilePress?: () => void;
  onStartPhase?: () => void;
  onToggleWorkoutExercise?: (date: string, exerciseName: string) => void;
  onCreateSession?: (date: string) => void;
  onCompleteAllToday?: () => void;
};

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  user,
  phase,
  workoutSessions,
  onProfilePress,
  onStartPhase,
  onToggleWorkoutExercise,
  onCreateSession: _onCreateSession,
  onCompleteAllToday,
}) => {
  const { setFabAction } = useFabAction();
  const { headerStyle, contentStyle } = useScreenAnimation();
  const navigation = useNavigation<any>();
  const { data: homeData, isLoading: isHomeLoading } = useHomeScreenData(user.id);
  const derivedPhaseId = phase?.id ?? homeData?.phase?.id;
  const { sessions: phaseSessions, isLoading: isSessionsLoading } = useWorkoutSessions(
    user.id,
    derivedPhaseId
  );
  const [activeTab, setActiveTab] = useState<'workouts' | 'meals'>('workouts');
  const [localCompletionOverrides, setLocalCompletionOverrides] = useState<Record<string, boolean>>(
    {}
  );
  const pendingToggleRef = useRef<Map<string, { name: string; count: number }>>(new Map());
  const toggleFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActiveTabRef = useRef<'workouts' | 'meals'>('workouts');
  
  // 🎨 Animation values
  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const activityCardSlideAnim = useRef(new Animated.Value(50)).current;
  const tabSwitchAnim = useRef(new Animated.Value(0)).current;
  const exerciseCardAnims = useRef<Map<string, Animated.Value>>(new Map()).current;
  const checkboxPulseAnim = useRef(new Animated.Value(1)).current;
  const createButtonPulse = useRef(new Animated.Value(1)).current;
  const pendingOrderRef = useRef<string[]>([]);
  const completedOrderRef = useRef<string[]>([]);
  
  const resolvedPhase = phase ?? homeData?.phase ?? null;
  const hasActivePlan = resolvedPhase?.status === 'active';
  const activePhaseId = hasActivePlan ? resolvedPhase?.id ?? null : null;
  const resolvedSessions = useMemo(() => {
    const fallbackSessions = phaseSessions.length
      ? phaseSessions
      : homeData?.recentSessions ?? [];
    const preferredSessions = workoutSessions.length ? workoutSessions : fallbackSessions;
    if (!derivedPhaseId) return preferredSessions;
    return preferredSessions.filter((session) => session.phasePlanId === derivedPhaseId);
  }, [derivedPhaseId, homeData?.recentSessions, phaseSessions, workoutSessions]);

  const today = new Date();
  const todayStr = formatLocalDateYMD(today);
  const todaySession = resolvedSessions.find((session) => session.date === todayStr) || null;

  const displayExercises = todaySession?.exercises ?? [];
  const getExerciseKey = (exercise: WorkoutSessionEntry['exercises'][number]) => {
    if (exercise.id) return exercise.id;
    if (exercise.exerciseId && exercise.displayOrder !== undefined && exercise.displayOrder !== null) {
      return `${exercise.exerciseId}-${exercise.displayOrder}`;
    }
    if (exercise.exerciseId) return exercise.exerciseId;
    const orderSuffix = exercise.displayOrder ?? '';
    const parts = [
      exercise.name,
      orderSuffix,
      exercise.sets ?? '',
      exercise.reps ?? '',
      exercise.movementPattern ?? '',
    ];
    return parts.filter(Boolean).join('-');
  };

  useEffect(() => {
    setLocalCompletionOverrides({});
    pendingToggleRef.current.clear();
    if (toggleFlushTimeoutRef.current) {
      clearTimeout(toggleFlushTimeoutRef.current);
      toggleFlushTimeoutRef.current = null;
    }
  }, [todaySession?.id]);

  const isExerciseMarked = useCallback(
    (exercise: WorkoutSessionEntry['exercises'][number]) => {
      const key = getExerciseKey(exercise);
      const override = localCompletionOverrides[key];
      return override ?? exercise.completed;
    },
    [localCompletionOverrides]
  );

  useEffect(() => {
    const nextKeys = displayExercises.map((exercise) => getExerciseKey(exercise));
    const nextSet = new Set(nextKeys);
    const pending = pendingOrderRef.current.filter((key) => nextSet.has(key));
    const completed = completedOrderRef.current.filter((key) => nextSet.has(key));
    const seen = new Set([...pending, ...completed]);

    displayExercises.forEach((exercise) => {
      const key = getExerciseKey(exercise);
      if (seen.has(key)) return;
      if (isExerciseMarked(exercise)) {
        completed.push(key);
      } else {
        pending.push(key);
      }
      seen.add(key);
    });

    pendingOrderRef.current = pending;
    completedOrderRef.current = completed;
  }, [displayExercises, isExerciseMarked]);

  const sortedWorkoutCards = useMemo(() => {
    const byKey = new Map(displayExercises.map((exercise) => [getExerciseKey(exercise), exercise]));
    const pending: typeof displayExercises = [];
    const completed: typeof displayExercises = [];
    pendingOrderRef.current.forEach((key) => {
      const exercise = byKey.get(key);
      if (!exercise) return;
      pending.push(exercise);
    });
    completedOrderRef.current.forEach((key) => {
      const exercise = byKey.get(key);
      if (!exercise) return;
      completed.push(exercise);
    });
    return [...pending, ...completed];
  }, [displayExercises, isExerciseMarked]);
  
  const hasSyncedWorkout = displayExercises.length > 0;
  const greetingMessage = getGreetingMessage();
  const displayName = user.name?.trim() || 'Athlete';
  const avatarLabel = displayName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const avatarUrl = user.avatarUrl;

  const completedSessionsByDate = useMemo(() => {
    const map = new Map<string, number>();
    const isSessionCompleted = (session: WorkoutSessionEntry) => {
      const sessionComplete = (session as WorkoutSessionEntry & { complete?: boolean }).complete;
      if (sessionComplete !== undefined) return sessionComplete;
      if (session.completed !== undefined) return session.completed;
      if (!session.exercises?.length) return false;
      return session.exercises.every(
        (exercise) =>
          (exercise as typeof exercise & { complete?: boolean }).complete ?? exercise.completed
      );
    };
    resolvedSessions.forEach((session) => {
      if (!session.date) return;
      if (!isSessionCompleted(session)) return;
      const key = session.date;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [resolvedSessions]);

  const activityRange = useMemo(() => {
    const startValue = resolvedPhase?.startDate;
    const endValue = resolvedPhase?.expectedEndDate;
    const startDate = startValue ? parseYMDToDate(startValue) : null;
    const endDate = endValue ? parseYMDToDate(endValue) : null;
    const isValidRange =
      !!startDate &&
      !!endDate &&
      !Number.isNaN(startDate.getTime()) &&
      !Number.isNaN(endDate.getTime()) &&
      endDate.getTime() >= startDate.getTime();
    if (!isValidRange) {
      const paddedDays = Math.max(7, Math.ceil(ACTIVITY_TOTAL_DAYS_FALLBACK / 7) * 7);
      return {
        startDate: null,
        totalDays: ACTIVITY_TOTAL_DAYS_FALLBACK,
        paddedDays,
        usePhaseRange: false,
      };
    }
    const diffMs = endDate.getTime() - startDate.getTime();
    const totalDays = Math.max(1, Math.floor(diffMs / 86400000) + 1);
    const paddedDays = Math.max(7, Math.ceil(totalDays / 7) * 7);
    return { startDate, totalDays, paddedDays, usePhaseRange: true };
  }, [resolvedPhase?.expectedEndDate, resolvedPhase?.startDate]);

  const calendarRange = useMemo(() => {
    if (!activityRange.usePhaseRange || !activityRange.startDate) return null;
    const startDate = activityRange.startDate;
    const endDate = addDays(startDate, activityRange.totalDays - 1);
    const startKey = formatLocalDateYMD(startDate);
    const endKey = formatLocalDateYMD(endDate);
    let currentKey = todayStr;
    if (currentKey < startKey) currentKey = startKey;
    if (currentKey > endKey) currentKey = endKey;
    return { startDate, endDate, startKey, endKey, currentKey };
  }, [activityRange, todayStr]);

  const phaseDates = useMemo(() => {
    if (!calendarRange) return [];
    const dates: string[] = [];
    for (let i = 0; i < activityRange.totalDays; i += 1) {
      dates.push(formatLocalDateYMD(addDays(calendarRange.startDate, i)));
    }
    return dates;
  }, [activityRange.totalDays, calendarRange]);

  const calendarMarkedDates = useMemo(() => {
    if (!calendarRange) return {};
    const marks: Record<string, { customStyles: { container: object; text: object } }> = {};
    phaseDates.forEach((dateKey) => {
      const isComplete = (completedSessionsByDate.get(dateKey) || 0) > 0;
      const isToday = dateKey === todayStr;
      marks[dateKey] = {
        customStyles: getCalendarDateStyles(isComplete, isToday),
      };
    });
    return marks;
  }, [calendarRange, completedSessionsByDate, phaseDates, todayStr]);

  const {
    mealsByType,
    isLoading: isMealsLoading,
    isMutating: isMealsMutating,
    error: _todayMealsError,
    toggleDayCompleted,
    toggleMealTypeCompleted,
  } = useTodayMeals(
    hasActivePlan ? user.id : undefined,
    hasActivePlan ? today : undefined,
    hasActivePlan,
    activePhaseId
  );

  const orderedMealTypes = useMemo(() => {
    const baseMealTypes = Object.keys(mealsByType);
    const baseIndex = new Map(
      baseMealTypes.map((mealType, index) => [mealType, index])
    );
    return [...baseMealTypes].sort((a, b) => {
      const aKey = a.toLowerCase();
      const bKey = b.toLowerCase();
      const aRank = MEAL_TYPE_ORDER.indexOf(aKey as any);
      const bRank = MEAL_TYPE_ORDER.indexOf(bKey as any);
      const aOrder = aRank === -1 ? Number.POSITIVE_INFINITY : aRank;
      const bOrder = bRank === -1 ? Number.POSITIVE_INFINITY : bRank;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (baseIndex.get(a) ?? 0) - (baseIndex.get(b) ?? 0);
    });
  }, [mealsByType]);
  const mealGroups = useMemo(() => {
    return orderedMealTypes
      .map((mealType) => ({
        mealType,
        entries: mealsByType[mealType] ?? [],
      }))
      .filter((group) => group.entries.length > 0);
  }, [mealsByType, orderedMealTypes]);
  const pendingMealCount = useMemo(
    () => mealGroups.reduce((sum, group) => sum + group.entries.filter((e) => !e.isDone).length, 0),
    [mealGroups]
  );

  const canLogWorkouts = hasActivePlan && !!onToggleWorkoutExercise;

  const pendingWorkoutCount = useMemo(
    () => displayExercises.filter((exercise) => !isExerciseMarked(exercise)).length,
    [displayExercises, isExerciseMarked]
  );
  const shouldPromptPlan = hasActivePlan && !hasSyncedWorkout;
  const shouldPromptNext = hasActivePlan && hasSyncedWorkout && pendingWorkoutCount === 0;
  const shouldCreatePlan = !hasActivePlan && !!onStartPhase;
  
  const handleOpenPlans = useCallback(() => {
    navigation.navigate('Workouts', { openExerciseModal: true });
  }, [navigation]);

  // FAB Action configuration
  const getFabActionConfig = useCallback(() => {
    const baseConfig = {
      colors: [COLORS.accent, COLORS.accentDark] as const,
      iconColor: COLORS.bgPrimary,
      labelColor: COLORS.accent,
    };

    if (shouldCreatePlan) {
      return {
        ...baseConfig,
        label: 'Create Plan',
        icon: '+',
        onPress: onStartPhase!,
      };
    }
    if (shouldPromptPlan) {
      return {
        ...baseConfig,
        label: 'Session',
        icon: '+',
        onPress: handleOpenPlans,
      };
    }
    if (activeTab === 'meals' && pendingMealCount > 0) {
      return {
        ...baseConfig,
        label: 'Complete',
        icon: '✓',
        onPress: () => void toggleDayCompleted?.(true),
      };
    }
    if (activeTab === 'meals' && pendingMealCount === 0) {
      return {
        ...baseConfig,
        label: 'Completed',
        icon: '✓',
        onPress: () => Alert.alert("Great job!", "You have already completed today's meals."),
      };
    }
    if (onCompleteAllToday && pendingWorkoutCount > 0) {
      return {
        ...baseConfig,
        label: 'Complete',
        icon: '✓',
        onPress: onCompleteAllToday,
      };
    }
    if (shouldPromptNext) {
      return {
        ...baseConfig,
        label: 'Completed',
        icon: '✓',
        onPress: () => Alert.alert("Great job!", "Congrats, you have already completed today's workout."),
      };
    }
    return null;
  }, [
    shouldCreatePlan,
    shouldPromptPlan,
    shouldPromptNext,
    activeTab,
    pendingMealCount,
    pendingWorkoutCount,
    onStartPhase,
    handleOpenPlans,
    toggleDayCompleted,
    onCompleteAllToday,
  ]);

  useEffect(() => {
    const config = getFabActionConfig();
    setFabAction('Home', config);
    return () => setFabAction('Home', null);
  }, [getFabActionConfig, setFabAction]);

  const getExerciseCardAnimation = (key: string) => {
    if (!exerciseCardAnims.has(key)) {
      const anim = new Animated.Value(1);
      exerciseCardAnims.set(key, anim);
    }
    return exerciseCardAnims.get(key)!;
  };

  const animateExerciseCompletion = (key: string) => {
    const scaleAnim = getExerciseCardAnimation(key);
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: ANIMATION_CONFIG.exerciseCard.scale,
        ...ANIMATION_CONFIG.spring,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        ...ANIMATION_CONFIG.spring,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Header entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFadeAnim, {
        toValue: 1,
        ...ANIMATION_CONFIG.headerFade,
        useNativeDriver: true,
      }),
      Animated.spring(activityCardSlideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Tab switch animation
  useEffect(() => {
    LayoutAnimation.configureNext({
      duration: 300,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.spring,
        springDamping: 0.7,
      },
    });

    Animated.spring(tabSwitchAnim, {
      toValue: activeTab === 'workouts' ? 0 : 1,
      ...ANIMATION_CONFIG.springMedium,
      useNativeDriver: true,
    }).start();
  }, [activeTab]);

  // Create button pulse animation
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(ANIMATION_CONFIG.pulse.delay),
        Animated.spring(createButtonPulse, {
          toValue: ANIMATION_CONFIG.pulse.scale,
          ...ANIMATION_CONFIG.springLight,
          useNativeDriver: true,
        }),
        Animated.spring(createButtonPulse, {
          toValue: 1,
          ...ANIMATION_CONFIG.springLight,
          useNativeDriver: true,
        }),
      ])
    );
    
    if (!hasActivePlan) {
      pulseLoop.start();
    }
    
    return () => pulseLoop.stop();
  }, [hasActivePlan]);

  const flushPendingToggles = useCallback(async () => {
    if (toggleFlushTimeoutRef.current) {
      clearTimeout(toggleFlushTimeoutRef.current);
      toggleFlushTimeoutRef.current = null;
    }
    if (!onToggleWorkoutExercise) return;
    const pending = pendingToggleRef.current;
    if (!pending.size) return;
    const entries = Array.from(pending.entries());
    pending.clear();
    await Promise.all(
      entries
        .filter(([, payload]) => payload.count % 2 === 1)
        .map(([, payload]) => onToggleWorkoutExercise(todayStr, payload.name))
    );
  }, [onToggleWorkoutExercise, todayStr]);

  const handleToggleExercise = (exercise: WorkoutSessionEntry['exercises'][number]) => {
    if (!canLogWorkouts) return;
    setLocalCompletionOverrides((prev) => {
      const key = getExerciseKey(exercise);
      const current = prev[key] ?? exercise.completed;
      const nextValue = !current;
      if (nextValue) {
        pendingOrderRef.current = pendingOrderRef.current.filter((entry) => entry !== key);
        if (!completedOrderRef.current.includes(key)) {
          completedOrderRef.current.push(key);
        }
      } else {
        completedOrderRef.current = completedOrderRef.current.filter((entry) => entry !== key);
        if (!pendingOrderRef.current.includes(key)) {
          pendingOrderRef.current.push(key);
        }
      }
      if (nextValue === exercise.completed) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: nextValue };
    });

    const pending = pendingToggleRef.current;
    const entry = pending.get(getExerciseKey(exercise));
    pending.set(getExerciseKey(exercise), {
      name: exercise.name,
      count: (entry?.count ?? 0) + 1,
    });
    if (toggleFlushTimeoutRef.current) {
      clearTimeout(toggleFlushTimeoutRef.current);
    }
    toggleFlushTimeoutRef.current = setTimeout(() => {
      void flushPendingToggles();
    }, 700);
  };

  const handleToggleExerciseAnimated = (exercise: WorkoutSessionEntry['exercises'][number]) => {
    const key = `${todayStr}-${getExerciseKey(exercise)}`;
    animateExerciseCompletion(key);

    Animated.sequence([
      Animated.spring(checkboxPulseAnim, {
        toValue: ANIMATION_CONFIG.checkboxPulse.scale,
        ...ANIMATION_CONFIG.spring,
        useNativeDriver: true,
      }),
      Animated.spring(checkboxPulseAnim, {
        toValue: 1,
        ...ANIMATION_CONFIG.spring,
        useNativeDriver: true,
      }),
    ]).start();
    
    handleToggleExercise(exercise);
  };

  useEffect(() => {
    if (lastActiveTabRef.current !== activeTab && activeTab === 'meals') {
      void flushPendingToggles();
    }
    lastActiveTabRef.current = activeTab;
  }, [activeTab, flushPendingToggles]);

  useEffect(() => {
    return () => {
      void flushPendingToggles();
    };
  }, [flushPendingToggles]);


  const renderMealGroup = (group: { mealType: string; entries: MealEntry[] }) => {
    const { mealType, entries } = group;
    if (entries.length === 0) return null;
    const isMealComplete = entries.every((entry) => entry.isDone);

    const totals = computeEntriesMacroTotals(entries);
    const macroSummary = formatMacroSummaryLine(totals);
    const totalCount = entries.length;
    return (
      <TouchableOpacity
        key={mealType}
        activeOpacity={0.9}
        disabled={isMealsMutating}
        onPress={() => {
          void toggleMealTypeCompleted?.(mealType, !isMealComplete);
        }}
      >
        <LinearGradient
          colors={CARD_GRADIENT_DEFAULT}
          style={styles.mealCard}
        >
          <View style={styles.mealCardHeader}>
            <TouchableOpacity
              style={[
                styles.mealGroupToggle,
                isMealComplete && styles.mealGroupToggleActive,
              ]}
              onPress={() => {
                void toggleMealTypeCompleted?.(mealType, !isMealComplete);
              }}
              disabled={isMealsMutating}
            >
              {isMealComplete && (
                <Text
                  style={[
                    styles.mealGroupToggleText,
                    styles.mealGroupToggleTextActive,
                  ]}
                >
                  ✓
                </Text>
              )}
            </TouchableOpacity>
            <View style={styles.mealInfo}>
              <Text style={styles.mealName}>{mealType}</Text>
              <Text style={styles.mealMeta}>
                {totalCount
                  ? `${totalCount} item${totalCount > 1 ? 's' : ''} · ${macroSummary}`
                  : 'Suggested by your plan'}
              </Text>
            </View>
          </View>
          {entries.map((entry) => (
            <View key={entry.id} style={styles.mealEntry}>
              <View>
                <Text style={styles.mealEntryName}>{entry.foodName}</Text>
                <Text style={styles.mealEntryMacros}>{formatMealEntryMacros(entry)}</Text>
              </View>
            </View>
          ))}
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const renderWorkoutsSection = () => (
    <View style={styles.section}>
      {!hasActivePlan && !isHomeLoading && !isSessionsLoading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🎯</Text>
          <Text style={styles.emptyTitle}>No active plan</Text>
          <Text style={styles.emptyText}>
            Create your personalized training plan to get started.
          </Text>
          
          {onStartPhase && (
            <Animated.View style={{ transform: [{ scale: createButtonPulse }] }}>
              <TouchableOpacity 
                style={styles.createPlanButton} 
                onPress={onStartPhase}
              >
                <Text style={styles.createPlanButtonText}>Create Plan</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      ) : !hasSyncedWorkout ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>No workout scheduled</Text>
          <Text style={styles.emptyText}>
            Your workout for today will appear here once scheduled.
          </Text>
        </View>
      ) : (
        <View style={styles.verticalList}>
          {sortedWorkoutCards.map((exercise) => {
            const isMarked = isExerciseMarked(exercise);
            const cardKey = `${todayStr}-${getExerciseKey(exercise)}`;
            const scaleAnim = getExerciseCardAnimation(cardKey);
            
            return (
              <Animated.View
                key={cardKey}
                style={{
                  transform: [{ scale: scaleAnim }],
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={!canLogWorkouts}
                  onPress={() => canLogWorkouts && handleToggleExerciseAnimated(exercise)}
                >
                  <LinearGradient
                    colors={CARD_GRADIENT_DEFAULT}
                    style={[
                      styles.exerciseCard,
                      !canLogWorkouts && styles.exerciseCardDisabled,
                    ]}
                  >
                    <View style={styles.exerciseCardRow}>
                      <View style={styles.exerciseCardMain}>
                        <View style={styles.cardHeader}>
                          <Animated.View
                            style={{
                              transform: [{ scale: checkboxPulseAnim }],
                            }}
                          >
                            <View
                              style={isMarked ? styles.checkCircleActive : styles.checkCircleInactive}
                            >
                              {isMarked && <Text style={styles.checkCircleText}>✓</Text>}
                            </View>
                          </Animated.View>
                          <View style={styles.exerciseHeaderText}>
                            <Text style={styles.exerciseName}>{exercise.name}</Text>
                            <Text style={styles.exerciseMetaLine}>
                              {`${exercise.sets ?? '—'} sets • ${exercise.reps ?? '—'} reps`}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.exerciseBodyParts}>
                          {formatBodyPartList(exercise.bodyParts)}
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderMealsSection = () => (
    <View style={styles.section}>
      {!hasActivePlan ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyTitle}>Meals unlock soon</Text>
          <Text style={styles.emptyText}>Complete onboarding first.</Text>
        </View>
      ) : isMealsLoading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>⏳</Text>
          <Text style={styles.emptyTitle}>Loading meals</Text>
          <Text style={styles.emptyText}>Fetching today's plan.</Text>
        </View>
      ) : mealGroups.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyTitle}>No meals for today</Text>
          <Text style={styles.emptyText}>Use Menu tab to create meals.</Text>
        </View>
      ) : (
        <View style={styles.verticalList}>
          {mealGroups.map((group) => renderMealGroup(group))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={BACKGROUND_GRADIENT} style={styles.gradient}>
        <Animated.View
          style={[
            styles.header,
            headerStyle,
            {
              opacity: headerFadeAnim,
              transform: [
                {
                  translateY: headerFadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greetingMessage},</Text>
            <Text style={styles.userName}>{displayName}</Text>
            <View style={styles.calendarLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendDoneDot]} />
                <Text style={styles.legendLabel}>Done</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendTodayDot]} />
                <Text style={styles.legendLabel}>Today</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendUpcomingDot]} />
                <Text style={styles.legendLabel}>Upcoming</Text>
              </View>
            </View>
          </View>
          {onProfilePress && (
            <TouchableOpacity style={styles.avatarButton} onPress={onProfilePress}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{avatarLabel || 'A'}</Text>
              )}
            </TouchableOpacity>
          )}
        </Animated.View>

        <Animated.ScrollView
          style={[styles.scrollView, contentStyle]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          bounces={true}
        >
        <Animated.View
          style={{
            opacity: headerFadeAnim,
            transform: [{ translateY: activityCardSlideAnim }],
          }}
        >
          <LinearGradient colors={CARD_GRADIENT_DEFAULT} style={styles.activityCard}>
            <View style={styles.activityCalendarWrapper}>
              {calendarRange ? (
                <Calendar
                  current={calendarRange.currentKey}
                  minDate={calendarRange.startKey}
                  maxDate={calendarRange.endKey}
                  enableSwipeMonths
                  markingType="custom"
                  markedDates={calendarMarkedDates}
                  hideExtraDays={false}
                  showSixWeeks
                  theme={getCalendarTheme()}
                  style={styles.activityCalendar}
                />
              ) : (
                <Text style={styles.activityCalendarEmptyText}>
                  No phase dates available.
                </Text>
              )}
            </View>
          </LinearGradient>
        </Animated.View>
        </Animated.ScrollView>

        <ScrollView
          style={styles.contentScrollView}
          contentContainerStyle={styles.contentScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          {activeTab === 'workouts' ? renderWorkoutsSection() : renderMealsSection()}
        </ScrollView>

        {/* Vertical Tab Sidebar - Right side, near FAB position */}
        <View style={styles.verticalTabBar}>
          <TouchableOpacity
            style={[
              styles.verticalTab,
              activeTab === 'meals' && styles.verticalTabActive,
            ]}
            onPress={() => setActiveTab('meals')}
            onLongPress={() => Alert.alert('Meals', 'View your nutrition plan')}
            activeOpacity={0.7}
          >
            <Animated.View
              style={{
                transform: [
                  {
                    scale: tabSwitchAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.15],
                    }),
                  },
                ],
              }}
            >
              <Text style={[
                styles.verticalTabIcon,
                activeTab === 'meals' && styles.verticalTabIconActive,
              ]}>
                🥗
              </Text>
            </Animated.View>
          </TouchableOpacity>

          <View style={styles.verticalTabDivider} />

          <TouchableOpacity
            style={[
              styles.verticalTab,
              activeTab === 'workouts' && styles.verticalTabActive,
            ]}
            onPress={() => setActiveTab('workouts')}
            onLongPress={() => Alert.alert('Workouts', 'View your workout exercises')}
            activeOpacity={0.7}
          >
            <Animated.View
              style={{
                transform: [
                  {
                    scale: tabSwitchAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1.15, 1],
                    }),
                  },
                ],
              }}
            >
              <Text style={[
                styles.verticalTabIcon,
                activeTab === 'workouts' && styles.verticalTabIconActive,
              ]}>
                💪
              </Text>
            </Animated.View>
          </TouchableOpacity>
        </View>

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 15,
    color: '#8B93B0',
    marginBottom: 4,
  },
  userName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  calendarLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendDoneDot: {
    backgroundColor: '#00F5A0',
  },
  legendTodayDot: {
    backgroundColor: '#6C63FF',
  },
  legendUpcomingDot: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  legendLabel: {
    fontSize: 12,
    color: '#8B93B0',
    fontWeight: '500',
  },
  avatarButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
  },
  scrollView: {
    flex: 0,
    maxHeight: ACTIVITY_SECTION_HEIGHT,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  contentScrollView: {
    flex: 1,
  },
  contentScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 120,
  },
  activityCard: {
    borderRadius: 20,
    padding: 0, 
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.15)',
    marginBottom: 0,
  },
  activityCalendarWrapper: {
    marginTop: 0,
  },
  activityCalendar: {
    alignSelf: 'stretch',
    height: 220, // Allow room for 6 weeks
    paddingBottom: 0,
  },
  activityCalendarEmptyText: {
    color: '#8B93B0',
    textAlign: 'center',
    fontSize: 12,
    paddingVertical: 12,
  },
  
  verticalTabBar: {
    position: 'absolute',
    right: 20,
    bottom: 160, // Above FAB (typically at 100)
    backgroundColor: 'rgba(30, 35, 64, 0.95)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.25)',
    padding: 8,
    gap: 8,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 50,
  },
  verticalTab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108, 99, 255, 0.05)',
  },
  verticalTabActive: {
    backgroundColor: 'rgba(108, 99, 255, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(108, 99, 255, 0.5)',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  verticalTabIcon: {
    fontSize: 24,
    opacity: 0.6,
  },
  verticalTabIconActive: {
    opacity: 1,
  },
  verticalTabDivider: {
    height: 1,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    marginVertical: 4,
  },

  section: {
    gap: 16,
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    padding: 32,
    alignItems: 'center',
    backgroundColor: 'rgba(108, 99, 255, 0.05)',
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#8B93B0',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  createPlanButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  createPlanButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  verticalList: {
    gap: 16,
  },
  exerciseCard: {
    borderRadius: 4,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    position: 'relative',
    overflow: 'visible',
    aspectRatio: 5,
    width: '100%',
  },
  exerciseCardDisabled: {
    opacity: 0.6,
  },
  exerciseCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  exerciseCardMain: {
    flex: 1,
    minWidth: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  exerciseHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  checkCircleActive: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00F5A0',
    backgroundColor: 'rgba(0, 245, 160, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleInactive: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleText: {
    color: '#00F5A0',
    fontSize: 14,
    fontWeight: '700',
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  exerciseMetaLine: {
    fontSize: 12,
    color: '#8B93B0',
    marginBottom: 8,
  },
  exerciseBodyParts: {
    fontSize: 13,
    color: '#A0A3BD',
    marginBottom: 12,
  },
  mealCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  mealMeta: {
    fontSize: 13,
    color: '#8B93B0',
  },
  mealEntry: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  mealEntryName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  mealEntryMacros: {
    fontSize: 12,
    color: '#8B93B0',
  },
  mealGroupToggle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealGroupToggleActive: {
    borderColor: '#00F5A0',
    backgroundColor: 'rgba(0, 245, 160, 0.12)',
  },
  mealGroupToggleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  mealGroupToggleTextActive: {
    color: '#00F5A0',
  },
});
