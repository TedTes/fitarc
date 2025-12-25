import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
const CARD_GRADIENT_COMPLETE = ['rgba(0, 245, 160, 0.15)', 'rgba(0, 214, 143, 0.1)'] as const;
const ACTIVITY_TOTAL_DAYS = 84;
const DAYS_PER_ACTIVITY_COLUMN = 7;
const ACTIVITY_GAP = 6;

const formatBodyPartList = (parts: MuscleGroup[]): string => {
  if (!parts.length) return 'Full Body';
  return parts.map((part) => getBodyPartLabel(part)).join(' • ');
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
  onCreateSession,
  onCompleteAllToday,
}) => {
  const { setFabAction } = useFabAction();
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
  const pendingToggleRef = useRef<Map<string, number>>(new Map());
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
  
  const resolvedPhase = phase ?? homeData?.phase ?? null;
  const activePhaseId = resolvedPhase?.id ?? null;
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
  const getExerciseKey = (exercise: WorkoutSessionEntry['exercises'][number]) =>
    (exercise.id as string) ||
    (exercise.exerciseId as string) ||
    `${exercise.name}-${exercise.sets ?? ''}-${exercise.reps ?? ''}`;

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

  const visibleWorkoutCards = useMemo(
    () => displayExercises.filter((exercise) => !isExerciseMarked(exercise)),
    [displayExercises, isExerciseMarked]
  );
  
  const hasAnySessions = resolvedSessions.length > 0;
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
    return columns;
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
    error: todayMealsError,
  } = useTodayMeals(
    resolvedPhase ? user.id : undefined,
    resolvedPhase ? today : undefined,
    Boolean(resolvedPhase),
    activePhaseId
  );

  const baseMealTypes = useMemo(() => Object.keys(mealsByType), [mealsByType]);
  const mealGroups = useMemo(() => {
    return baseMealTypes
      .map((mealType) => ({
        mealType,
        entries: mealsByType[mealType] ?? [],
      }))
      .filter((group) => group.entries.length > 0);
  }, [baseMealTypes, mealsByType]);

  const canLogWorkouts = !!resolvedPhase && !!onToggleWorkoutExercise;

  const pendingWorkoutCount = visibleWorkoutCards.length;

  useEffect(() => {
    if (!onCompleteAllToday) {
      setFabAction('Home', null);
      return () => setFabAction('Home', null);
    }

    setFabAction('Home', {
      label: 'Complete',
      icon: '✓',
      colors: ['#6C63FF', '#4C3BFF'] as const,
      iconColor: '#0A0E27',
      labelColor: '#6C63FF',
      onPress: onCompleteAllToday,
    });

    return () => setFabAction('Home', null);
  }, [onCompleteAllToday, setFabAction]);

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
    
    if (!resolvedPhase) {
      pulseLoop.start();
    }
    
    return () => pulseLoop.stop();
  }, [resolvedPhase]);

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
        .filter(([, count]) => count % 2 === 1)
        .map(([exerciseName]) => onToggleWorkoutExercise(todayStr, exerciseName))
    );
  }, [onToggleWorkoutExercise, todayStr]);

  const handleToggleExercise = (exerciseName: string) => {
    if (!canLogWorkouts) return;
    setLocalCompletionOverrides((prev) => {
      const target = displayExercises.find((exercise) => exercise.name === exerciseName);
      if (!target) return prev;
      const key = getExerciseKey(target);
      const current = prev[key] ?? target.completed;
      const nextValue = !current;
      if (nextValue === target.completed) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: nextValue };
    });

    const pending = pendingToggleRef.current;
    pending.set(exerciseName, (pending.get(exerciseName) ?? 0) + 1);
    if (toggleFlushTimeoutRef.current) {
      clearTimeout(toggleFlushTimeoutRef.current);
    }
    toggleFlushTimeoutRef.current = setTimeout(() => {
      void flushPendingToggles();
    }, 700);
  };

  const handleToggleExerciseAnimated = (exerciseName: string) => {
    const target = displayExercises.find((ex) => ex.name === exerciseName);
    if (!target) return;
    
    const key = `${todayStr}-${exerciseName}`;
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
    
    handleToggleExercise(exerciseName);
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

    const totals = computeEntriesMacroTotals(entries);
    const macroSummary = formatMacroSummaryLine(totals);
    const totalCount = entries.length;
    return (
      <LinearGradient
        key={mealType}
        colors={CARD_GRADIENT_DEFAULT}
        style={styles.mealCard}
      >
        <View style={styles.mealCardHeader}>
          <Text style={styles.mealEmoji}>{getMealTypeEmoji(mealType)}</Text>
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
            {entry.isDone && (
              <View style={styles.mealEntryDoneBadge}>
                <Text style={styles.mealEntryDoneText}>Done</Text>
              </View>
            )}
          </View>
        ))}
      </LinearGradient>
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
      {!resolvedPhase && !hasAnySessions && !isHomeLoading && !isSessionsLoading ? (
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
          {onCreateSession && (
            <TouchableOpacity
              style={[styles.createPlanButton, styles.createSessionButton]}
              onPress={() => onCreateSession(todayStr)}
            >
              <Text style={styles.createPlanButtonText}>Create Session</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : pendingWorkoutCount === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <Text style={styles.emptyTitle}>Workouts complete</Text>
          <Text style={styles.emptyText}>Rest up and check Plans for tomorrow's session.</Text>
        </View>
      ) : (
        <View style={styles.verticalList}>
          {visibleWorkoutCards.map((exercise, index) => {
            const isMarked = isExerciseMarked(exercise);
            const cardKey = `${todayStr}-${exercise.name}-${index}`;
            const scaleAnim = getExerciseCardAnimation(cardKey);
            
            return (
              <Animated.View
                key={cardKey}
                style={{
                  transform: [{ scale: scaleAnim }],
                }}
              >
                <LinearGradient
                  colors={isMarked ? CARD_GRADIENT_COMPLETE : CARD_GRADIENT_DEFAULT}
                  style={[
                    styles.exerciseCard,
                    isMarked && styles.exerciseCardCompleted,
                  ]}
                >
                  {isMarked && <View style={styles.completedTopBar} />}
                  
                  <View style={styles.exerciseCardRow}>
                    <View style={styles.exerciseCardMain}>
                      <View style={styles.cardHeader}>
                        <View style={styles.exerciseHeaderText}>
                          <Text style={styles.exerciseName}>{exercise.name}</Text>
                          <Text style={styles.exerciseMetaLine}>
                            {`${exercise.sets ?? '—'} sets • ${exercise.reps ?? '—'} reps`}
                          </Text>
                        </View>

                        <Animated.View
                          style={{
                            transform: [{ scale: isMarked ? checkboxPulseAnim : 1 }],
                          }}
                        >
                          <TouchableOpacity
                            style={[
                              styles.checkBox,
                              !canLogWorkouts && styles.checkBoxDisabled,
                              isMarked && styles.checkBoxActive,
                            ]}
                            onPress={() => canLogWorkouts && handleToggleExerciseAnimated(exercise.name)}
                            disabled={!canLogWorkouts}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.checkBoxText}>{isMarked ? '✓' : ''}</Text>
                          </TouchableOpacity>
                        </Animated.View>
                      </View>
                      <Text style={styles.exerciseBodyParts}>
                        {formatBodyPartList(exercise.bodyParts)}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </Animated.View>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderMealsSection = () => (
    <View style={styles.section}>
      {!resolvedPhase ? (
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

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
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
                <Text style={styles.activityTitle}>ACTIVITY STREAK</Text>
                <View style={styles.activityLegend}>
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
        </ScrollView>

        <View style={styles.stickyTabsContainer}>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'workouts' && styles.tabActive]}
              onPress={() => setActiveTab('workouts')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'workouts' && styles.tabTextActive]}>
                Workouts
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'meals' && styles.tabActive]}
              onPress={() => setActiveTab('meals')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'meals' && styles.tabTextActive]}>
                Meals
              </Text>
            </TouchableOpacity>
            
            <Animated.View
              style={[
                styles.tabIndicator,
                {
                  transform: [
                    {
                      translateX: tabSwitchAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 180],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
        </View>

        <ScrollView
          style={styles.contentScrollView}
          contentContainerStyle={styles.contentScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          {activeTab === 'workouts' ? renderWorkoutsSection() : renderMealsSection()}
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
    maxHeight: 180,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  stickyTabsContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#0A0E27',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(108, 99, 255, 0.1)',
  },
  contentScrollView: {
    flex: 1,
  },
  contentScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 120,
  },
  activityCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.15)',
    marginBottom: 8,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  activityTitle: {
    fontSize: 11,
    color: '#8B93B0',
    fontWeight: '700',
    letterSpacing: 0.5,
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
    backgroundColor: 'rgba(108, 99, 255, 0.3)',
    borderColor: 'rgba(108, 99, 255, 0.4)',
  },
  activityLevel2: {
    backgroundColor: 'rgba(108, 99, 255, 0.5)',
    borderColor: 'rgba(108, 99, 255, 0.6)',
  },
  activityLevel3: {
    backgroundColor: '#6C63FF',
    borderColor: '#00F5A0',
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(30, 35, 64, 0.4)',
    padding: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.15)',
    gap: 12,
    marginBottom: 12,
    position: 'relative',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    zIndex: 1,
  },
  tabActive: {
    // backgroundColor is now handled by animated indicator
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 170,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(108, 99, 255, 0.3)',
    zIndex: 0,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8B93B0',
  },
  tabTextActive: {
    color: '#FFFFFF',
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
    overflow: 'hidden',
    aspectRatio: 5,
    width: '100%',
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
  exerciseCardCompleted: {
    borderColor: 'rgba(0, 245, 160, 0.4)',
  },
  completedTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#00F5A0',
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
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxActive: {
    borderColor: 'rgba(0,245,160,0.6)',
    backgroundColor: 'rgba(0,245,160,0.15)',
  },
  checkBoxDisabled: {
    opacity: 0.4,
  },
  checkBoxText: {
    color: '#00F5A0',
    fontSize: 14,
    fontWeight: '800',
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
  mealEntryDoneBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#00F5A0',
    backgroundColor: 'rgba(0,245,160,0.1)',
  },
  mealEntryDoneText: {
    color: '#00F5A0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
