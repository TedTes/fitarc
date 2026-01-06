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
import { getBodyPartLabel } from '../utils';
import { formatLocalDateYMD } from '../utils/date';
import {
  computeEntriesMacroTotals,
  formatMacroSummaryLine,
  formatMealEntryMacros,
} from '../utils/mealMacros';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MEAL_TYPE_EMOJI: Record<string, string> = {
  Breakfast: '🥚',
  Lunch: '🥗',
  Dinner: '🍽️',
};

const getMealTypeEmoji = (mealType: string): string => {
  const key = mealType.trim();
  if (MEAL_TYPE_EMOJI[key]) return MEAL_TYPE_EMOJI[key];
  const normalized = key.toLowerCase();
  if (normalized.includes('snack')) return '🥗';
  if (normalized.includes('pre')) return '⚡';
  return '🍽️';
};

const CARD_GRADIENT_DEFAULT = ['rgba(30, 35, 64, 0.8)', 'rgba(21, 25, 50, 0.6)'] as const;

const ACTIVITY_TOTAL_DAYS = 84;
const DAYS_PER_ACTIVITY_COLUMN = 7;
const ACTIVITY_GAP = 6;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ACTIVITY_SECTION_HEIGHT = Math.min(320, Math.max(220, Math.round(SCREEN_HEIGHT * 0.32)));

const KNOWN_BODY_PARTS = new Set(['chest', 'back', 'legs', 'shoulders', 'arms', 'core']);

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

type ActivityCell = {
  date: Date;
  iso: string;
  count: number;
  level: number;
  isToday: boolean;
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
  const activityCellAnims = useRef<Map<string, Animated.Value>>(new Map()).current;
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
  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, WorkoutSessionEntry[]>();
    resolvedSessions.forEach((session) => {
      if (!session.date) return;
      const key = session.date;
      map.set(key, [...(map.get(key) || []), session]);
    });
    return map;
  }, [resolvedSessions]);

  const activityCells = useMemo<ActivityCell[]>(() => {
    const now = new Date();
    const cells: ActivityCell[] = [];
    for (let i = ACTIVITY_TOTAL_DAYS - 1; i >= 0; i -= 1) {
      const cellDate = new Date(now);
      cellDate.setDate(now.getDate() - i);
      const iso = cellDate.toISOString().split('T')[0];
      const count = sessionsByDate.get(iso)?.length || 0;
      cells.push({
        date: cellDate,
        iso,
        count,
        level: Math.min(3, count),
        isToday: i === 0,
      });
    }
    return cells;
  }, [resolvedSessions]);

  const [gridLayout, setGridLayout] = useState({ width: 0, height: 0 });
  const [selectedActivityMeta, setSelectedActivityMeta] = useState<{
    iso: string;
    row: number;
    col: number;
  } | null>(null);
  
  useEffect(() => {
    if (!selectedActivityMeta) return;
    const timeout = setTimeout(() => {
      setSelectedActivityMeta(null);
    }, 2500);
    return () => clearTimeout(timeout);
  }, [selectedActivityMeta]);

  useEffect(() => {
    if (
      selectedActivityMeta &&
      !activityCells.some((cell) => cell.iso === selectedActivityMeta.iso)
    ) {
      setSelectedActivityMeta(null);
    }
  }, [activityCells, selectedActivityMeta]);

  const selectedActivity =
    (selectedActivityMeta &&
      activityCells.find((cell) => cell.iso === selectedActivityMeta.iso)) ||
    null;

  const activityColumns = useMemo(() => {
    const columns: ActivityCell[][] = [];
    for (let i = 0; i < activityCells.length; i += DAYS_PER_ACTIVITY_COLUMN) {
      columns.push(activityCells.slice(i, i + DAYS_PER_ACTIVITY_COLUMN));
    }
    return columns.reverse();
  }, [activityCells]);

  const phaseStats = useMemo(() => {
    if (!activityCells.length) {
      return { completed: 0, total: 0, streak: 0, percentage: 0 };
    }
    const completed = activityCells.filter((cell) => cell.level > 0).length;
    const total = activityCells.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    let streak = 0;
    for (let i = activityCells.length - 1; i >= 0; i -= 1) {
      if (activityCells[i].level > 0) {
        streak += 1;
      } else {
        break;
      }
    }

    return { completed, total, streak, percentage };
  }, [activityCells]);

  const getActivityLevelStyle = (level: number) => {
    if (level >= 3) return styles.activityLevel3;
    if (level === 2) return styles.activityLevel2;
    if (level === 1) return styles.activityLevel1;
    return styles.activityLevel0;
  };

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

  const baseMealTypes = useMemo(() => Object.keys(mealsByType), [mealsByType]);
  const orderedMealTypes = useMemo(() => {
    const preferredOrder = ['breakfast', 'lunch', 'dinner'];
    const baseIndex = new Map(
      baseMealTypes.map((mealType, index) => [mealType, index])
    );
    return [...baseMealTypes].sort((a, b) => {
      const aKey = a.toLowerCase();
      const bKey = b.toLowerCase();
      const aRank = preferredOrder.indexOf(aKey);
      const bRank = preferredOrder.indexOf(bKey);
      const aOrder = aRank === -1 ? Number.POSITIVE_INFINITY : aRank;
      const bOrder = bRank === -1 ? Number.POSITIVE_INFINITY : bRank;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (baseIndex.get(a) ?? 0) - (baseIndex.get(b) ?? 0);
    });
  }, [baseMealTypes]);
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

  useEffect(() => {
    if (shouldCreatePlan) {
      setFabAction('Home', {
        label: 'Create Plan',
        icon: '+',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: onStartPhase!,
      });
    } else if (shouldPromptPlan) {
      setFabAction('Home', {
        label: 'Session',
        icon: '+',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: handleOpenPlans,
      });
    } else if (activeTab === 'meals' && pendingMealCount > 0) {
      setFabAction('Home', {
        label: 'Complete',
        icon: '✓',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: () => {
          void toggleDayCompleted?.(true);
        },
      });
    } else if (activeTab === 'meals' && pendingMealCount === 0) {
      setFabAction('Home', {
        label: 'Completed',
        icon: '✓',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: () =>
          Alert.alert("Great job!", "You have already completed today's meals."),
      });
    } else if (onCompleteAllToday && pendingWorkoutCount > 0) {
      setFabAction('Home', {
        label: 'Complete',
        icon: '✓',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: onCompleteAllToday,
      });
    } else if (shouldPromptNext) {
      setFabAction('Home', {
        label: 'Completed',
        icon: '✓',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: () =>
          Alert.alert("Great job!", "Congrats, you have already completed today's workout."),
      });
    } else {
      setFabAction('Home', null);
    }

    return () => setFabAction('Home', null);
  }, [
    handleOpenPlans,
    hasActivePlan,
    onCompleteAllToday,
    pendingWorkoutCount,
    pendingMealCount,
    setFabAction,
    shouldCreatePlan,
    shouldPromptNext,
    shouldPromptPlan,
    onStartPhase,
    activeTab,
    toggleDayCompleted,
  ]);

  // 🎨 Animation functions
  const getActivityCellAnimation = (iso: string) => {
    if (!activityCellAnims.has(iso)) {
      const anim = new Animated.Value(1);
      activityCellAnims.set(iso, anim);
    }
    return activityCellAnims.get(iso)!;
  };

  const triggerActivityCellPulse = (iso: string, level: number) => {
    if (level === 0) return;
    
    const anim = getActivityCellAnimation(iso);
    
    Animated.sequence([
      Animated.spring(anim, {
        toValue: 1.2,
        tension: 200,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(anim, {
        toValue: 1,
        tension: 200,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  };

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
        toValue: 0.97,
        tension: 200,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 200,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // 🎨 Header entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
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

  // 🎨 Trigger pulse animation for activity cells on mount
  useEffect(() => {
    const delay = 300;
    activityCells.forEach((cell, index) => {
      setTimeout(() => {
        triggerActivityCellPulse(cell.iso, cell.level);
      }, delay + index * 15);
    });
  }, [activityCells.length]);

  // 🎨 Tab switch animation
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
      tension: 100,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [activeTab]);

  // 🎨 Create button pulse animation
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(2000),
        Animated.spring(createButtonPulse, {
          toValue: 1.05,
          tension: 100,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.spring(createButtonPulse, {
          toValue: 1,
          tension: 100,
          friction: 5,
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
        toValue: 1.3,
        tension: 200,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(checkboxPulseAnim, {
        toValue: 1,
        tension: 200,
        friction: 8,
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

  const renderActivityDetails = () => {
    if (!selectedActivity || !selectedActivityMeta) return null;
    
    const sessionsForDay = sessionsByDate.get(selectedActivity.iso) || [];
    const workoutCount = sessionsForDay.length;
    
    const totalExercises = sessionsForDay.reduce(
      (sum, session) => sum + session.exercises.length,
      0
    );
    
    const totalSets = sessionsForDay.reduce((sum, session) => {
      return (
        sum +
        session.exercises.reduce((exerciseSum, exercise) => {
          const setsLogged = exercise.setDetails?.length ?? exercise.sets ?? 0;
          return exerciseSum + setsLogged;
        }, 0)
      );
    }, 0);
  
    const columnsCount = activityColumns.length || 1;
    const columnWidth =
      columnsCount > 0
        ? (gridLayout.width - ACTIVITY_GAP * (columnsCount - 1)) / columnsCount
        : 0;
    const rowHeight =
      (gridLayout.height - ACTIVITY_GAP * (DAYS_PER_ACTIVITY_COLUMN - 1)) /
      DAYS_PER_ACTIVITY_COLUMN;
  
    if (!columnWidth || !rowHeight) return null;
  
    const baseLeft =
      selectedActivityMeta.col * (columnWidth + ACTIVITY_GAP) + columnWidth / 2;
    const baseTop =
      selectedActivityMeta.row * (rowHeight + ACTIVITY_GAP) - rowHeight;
  
    const tooltipHalfWidth = 60;
    const clampedLeft = Math.min(
      Math.max(baseLeft, tooltipHalfWidth),
      gridLayout.width - tooltipHalfWidth
    );
  
    return (
      <LinearGradient
        colors={['rgba(16, 20, 39, 0.98)', 'rgba(25, 30, 55, 0.98)']}
        style={[
          styles.activityDetailCard,
          {
            left: clampedLeft - tooltipHalfWidth,
            top: Math.max(baseTop, -10),
          },
        ]}
        pointerEvents="none"
      >
        {workoutCount === 0 ? (
          <View style={styles.activityTooltipCompact}>
            <Text style={styles.activityCompactIcon}>💤</Text>
          </View>
        ) : (
          <View style={styles.activityTooltipCompact}>
            <View style={styles.activityCompactStat}>
              <Text style={styles.activityCompactIcon}>🏋️</Text>
              <Text style={styles.activityCompactValue}>{workoutCount}</Text>
            </View>
            
            <View style={styles.activityCompactDivider} />
            
            <View style={styles.activityCompactStat}>
              <Text style={styles.activityCompactIcon}>💪</Text>
              <Text style={styles.activityCompactValue}>{totalExercises}</Text>
            </View>
            
            <View style={styles.activityCompactDivider} />
            
            <View style={styles.activityCompactStat}>
              <Text style={styles.activityCompactIcon}>🔥</Text>
              <Text style={styles.activityCompactValue}>{totalSets}</Text>
            </View>
          </View>
        )}
  
        <View style={styles.activityTooltipArrow} />
      </LinearGradient>
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
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
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
            <Text style={styles.dateInfo}>{dateLabel}</Text>
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
            <View style={styles.activityHeader}>
              <View style={styles.activityHeaderLeft}>
                <Text style={styles.activityTitle}>ACTIVITY STREAK</Text>
                <Text style={styles.activitySubtitle}>
                  {resolvedPhase?.name || 'Current Phase'}
                </Text>
              </View>
              <View style={styles.activityStats}>
                <View style={styles.statBadge}>
                  <Text style={styles.statValue}>{phaseStats.streak}</Text>
                  <Text style={styles.statLabel}>day streak</Text>
                </View>
                <View style={styles.statBadge}>
                  <Text style={styles.statValue}>{phaseStats.percentage}%</Text>
                  <Text style={styles.statLabel}>complete</Text>
                </View>
              </View>
            </View>
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${phaseStats.percentage}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {phaseStats.completed} of {phaseStats.total} days completed
              </Text>
            </View>
            <View style={styles.activityLegendRow}>
              <Text style={styles.legendLabel}>Sessions per day:</Text>
              <View style={styles.activityLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.activityLevel0]} />
                  <Text style={styles.legendText}>None</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.activityLevel1]} />
                  <Text style={styles.legendText}>1</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.activityLevel2]} />
                  <Text style={styles.legendText}>2</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.activityLevel3]} />
                  <Text style={styles.legendText}>3+</Text>
                </View>
              </View>
            </View>
            <View style={styles.activityGridWrapper}>
              <View
                style={styles.activityGrid}
                onLayout={(event) =>
                    setGridLayout({
                      width: event.nativeEvent.layout.width,
                      height: event.nativeEvent.layout.height,
                    })
                  }
                >
                  {activityColumns.map((column, colIdx) => (
                    <View key={`col-${colIdx}`} style={styles.activityColumn}>
                      {column.map((cell, rowIdx) => {
                        const cellAnim = getActivityCellAnimation(cell.iso);
                        return (
                          <Animated.View
                            key={cell.iso}
                            style={{
                              transform: [{ scale: cellAnim }],
                            }}
                          >
                            <TouchableOpacity
                              style={[
                                styles.activityCell,
                                getActivityLevelStyle(cell.level),
                                cell.isToday && styles.activityCellToday,
                              ]}
                              onPress={() => {
                                triggerActivityCellPulse(cell.iso, cell.level);
                                setSelectedActivityMeta({ iso: cell.iso, row: rowIdx, col: colIdx });
                              }}
                              activeOpacity={0.85}
                            />
                          </Animated.View>
                        );
                      })}
                    </View>
                  ))}
                </View>
                {selectedActivity && renderActivityDetails()}
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
  dateInfo: {
    fontSize: 15,
    color: '#6C63FF',
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
    paddingBottom: 20,
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
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.15)',
    marginBottom: 8,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  activityHeaderLeft: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 11,
    color: '#8B93B0',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  activitySubtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  activityStats: {
    flexDirection: 'row',
    gap: 12,
  },
  statBadge: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#00F5A0',
  },
  statLabel: {
    fontSize: 10,
    color: '#8B93B0',
    marginTop: 2,
  },
  progressBarContainer: {
    marginBottom: 16,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00F5A0',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#8B93B0',
    marginTop: 8,
    textAlign: 'center',
  },
  activityLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  legendLabel: {
    fontSize: 11,
    color: '#8B93B0',
    fontWeight: '600',
  },
  activityLegend: {
    flexDirection: 'row',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    color: '#8B93B0',
  },
  activityGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  activityGridWrapper: {
    position: 'relative',
    marginTop: 8,
  },
  activityColumn: {
    flex: 1,
    gap: 6,
  },
  activityCell: {
    height: 10,
    borderRadius: 4,
    backgroundColor: 'rgba(108, 99, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.15)',
  },
  activityLevel0: {
    backgroundColor: 'rgba(108, 99, 255, 0.08)',
  },
  activityLevel1: {
    backgroundColor: 'rgba(0, 245, 160, 0.35)',
    borderColor: 'rgba(0, 245, 160, 0.45)',
  },
  activityLevel2: {
    backgroundColor: 'rgba(0, 245, 160, 0.6)',
    borderColor: 'rgba(0, 245, 160, 0.7)',
  },
  activityLevel3: {
    backgroundColor: '#00F5A0',
    borderColor: 'rgba(0, 245, 160, 0.95)',
  },
  activityCellToday: {
    borderWidth: 2,
    borderColor: '#00F5A0',
    shadowColor: '#00F5A0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 5,
  },
  activityDetailCard: {
    position: 'absolute',
    width: 100,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'visible',
  },
  activityTooltipArrow: {
    position: 'absolute',
    bottom: -5,
    left: '50%',
    marginLeft: -5,
    width: 10,
    height: 10,
    backgroundColor: 'rgba(16, 20, 39, 0.98)',
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.4)',
    transform: [{ rotate: '45deg' }],
  },
  activityTooltipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  activityCompactStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  activityCompactIcon: {
    fontSize: 12,
  },
  activityCompactValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  activityCompactDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
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
  createSessionButton: {
    marginTop: 16,
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
  mealEmoji: {
    fontSize: 24,
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
  mealEntryDoneBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,245,160,0.15)',
    borderWidth: 1,
    borderColor: '#00F5A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealEntryDoneText: {
    fontSize: 14,
    color: '#00F5A0',
    fontWeight: '700',
  },
});
