import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
  Modal,
  Animated,
  PanResponder,
  Dimensions,
  Pressable,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  PhasePlan,
  WorkoutLog,
  ProgressEstimate,
  StrengthSnapshot,
  WorkoutSessionEntry,
  WorkoutSessionExercise,
  DailyConsistencyLog,
  MuscleGroup,
} from '../types/domain';
import { useHomeScreenData } from '../hooks/useHomeScreenData';
import { useTodayMeals } from '../hooks/useTodayMeals';
import { MealEntry } from '../services/supabaseMealService';
import { getBodyPartLabel } from '../utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MEAL_TYPE_EMOJI: Record<string, string> = {
  Breakfast: '🌅',
  Lunch: '🌞',
  Dinner: '🌙',
};

const MUSCLE_TAG_COLORS: Record<string, string> = {
  chest: 'rgba(255, 107, 107, 0.2)',
  back: 'rgba(78, 205, 196, 0.2)',
  legs: 'rgba(149, 225, 211, 0.2)',
  shoulders: 'rgba(255, 217, 61, 0.2)',
  arms: 'rgba(255, 135, 135, 0.2)',
  core: 'rgba(168, 230, 207, 0.2)',
};

const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'];

const getMealTypeEmoji = (mealType: string): string => {
  const key = mealType.trim();
  if (MEAL_TYPE_EMOJI[key]) return MEAL_TYPE_EMOJI[key];
  const normalized = key.toLowerCase();
  if (normalized.includes('snack')) return '🥗';
  if (normalized.includes('pre')) return '⚡';
  return '🍽️';
};
const CARD_GRADIENT_DEFAULT = ['#1C1F3F', '#101329'];
const CARD_GRADIENT_COMPLETE = ['#0BA360', '#3CBA92'];
const WORKOUT_BAR_TOTAL = 5;
const REP_BAR_TOTAL = 6;
const SWIPE_THRESHOLD = 80;
const ACTIVITY_TOTAL_DAYS = 84; // 12 weeks
const DAYS_PER_ACTIVITY_COLUMN = 7;

const getMuscleTagColor = (muscles: MuscleGroup[]): string => {
  if (!muscles.length) return 'rgba(255, 255, 255, 0.05)';
  const primary = muscles[0];
  return MUSCLE_TAG_COLORS[primary] || 'rgba(255, 255, 255, 0.05)';
};

const formatBodyPartList = (parts: MuscleGroup[]): string => {
  if (!parts.length) {
    return 'Mobility & recovery';
  }
  return parts
    .map((part) => getBodyPartLabel(part))
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

const parseISODateToLocal = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year || 0, (month || 1) - 1, day || 1);
};

const formatMealMacros = (entry: MealEntry): string => {
  const parts: string[] = [];
  if (typeof entry.calories === 'number') {
    parts.push(`${entry.calories} kcal`);
  }
  if (typeof entry.protein === 'number') {
    parts.push(`${entry.protein}g P`);
  }
  if (typeof entry.carbs === 'number') {
    parts.push(`${entry.carbs}g C`);
  }
  if (typeof entry.fats === 'number') {
    parts.push(`${entry.fats}g F`);
  }
  return parts.length ? parts.join(' · ') : 'Macros TBD';
};

const getRepFillCount = (range: string): number => {
  const [lowRaw, highRaw] = range.split('-');
  const high = Number(highRaw) || Number(lowRaw) || 8;
  return Math.min(REP_BAR_TOTAL, Math.max(2, Math.round(high / 2)));
};

const renderBarRow = (filled: number, total: number) => (
  <View style={styles.barRow}>
    {Array.from({ length: total }).map((_, idx) => (
      <View key={idx} style={[styles.barCell, idx < filled && styles.barCellActive]} />
    ))}
  </View>
);

const ProgressRing: React.FC<{ progress: number; size: number; strokeWidth: number }> = ({ 
  progress, 
  size, 
  strokeWidth 
}) => {
  const progressValue = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: '#00F5A0',
          borderTopColor: progressValue > 0 ? '#00F5A0' : 'transparent',
          borderLeftColor: progressValue > 0.25 ? '#00F5A0' : 'transparent',
          borderBottomColor: progressValue > 0.5 ? '#00F5A0' : 'transparent',
          borderRightColor: progressValue > 0.75 ? '#00F5A0' : 'transparent',
        }}
      />
      <View style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <Text style={{ color: '#FFFFFF', fontSize: size * 0.22, fontWeight: 'bold' }}>
          {Math.round(progressValue * 100)}%
        </Text>
      </View>
    </View>
  );
};

const SwipeableCard: React.FC<{
  children: React.ReactNode;
  onSwipeRight?: () => void;
  enabled: boolean;
  style?: any;
}> = ({ children, onSwipeRight, enabled, style }) => {
  const [pan] = useState(new Animated.ValueXY());
  const [isSwipingRight, setIsSwipingRight] = useState(false);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => enabled,
    onMoveShouldSetPanResponder: (_, gesture) => enabled && Math.abs(gesture.dx) > 10,
    onPanResponderMove: (_, gesture) => {
      if (gesture.dx > 0) {
        pan.setValue({ x: gesture.dx, y: 0 });
        setIsSwipingRight(gesture.dx > SWIPE_THRESHOLD);
      }
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx > SWIPE_THRESHOLD && onSwipeRight) {
        Animated.timing(pan, {
          toValue: { x: SCREEN_WIDTH, y: 0 },
          duration: 200,
          useNativeDriver: false,
        }).start(() => {
          onSwipeRight();
          pan.setValue({ x: 0, y: 0 });
        });
      } else {
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
        }).start();
      }
      setIsSwipingRight(false);
    },
  });

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ translateX: pan.x }],
        },
      ]}
      {...(enabled ? panResponder.panHandlers : {})}
    >
      {isSwipingRight && (
        <View style={styles.swipeIndicator}>
          <Text style={styles.swipeIndicatorText}>✓ Complete</Text>
        </View>
      )}
      {children}
    </Animated.View>
  );
};

const CelebrationBottomSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  completionData: {
    date: string;
    workouts: number;
    totalWorkouts: number;
    meals: number;
    totalMeals: number;
  };
}> = ({ visible, onClose, completionData }) => {
  const [slideAnim] = useState(new Animated.Value(SCREEN_HEIGHT));

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 10,
        useNativeDriver: true,
      }).start();
      
      const timer = setTimeout(() => {
        handleClose();
      }, 4000);
      
      return () => clearTimeout(timer);
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.celebrationBackdrop}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.celebrationSheet,
                { transform: [{ translateY: slideAnim }] },
              ]}
            >
              <LinearGradient
                colors={['#0A0E27', '#151932']}
                style={styles.celebrationContent}
              >
                <View style={styles.swipeDownIndicator}>
                  <View style={styles.swipeDownBar} />
                </View>
                
                <Text style={styles.celebrationEmoji}>🎉</Text>
                <Text style={styles.celebrationTitle}>Day Complete!</Text>
                <Text style={styles.celebrationSubtitle}>
                  {completionData.date}
                </Text>

                <View style={styles.celebrationStats}>
                  <View style={styles.celebrationStatItem}>
                    <ProgressRing 
                      progress={completionData.workouts / completionData.totalWorkouts} 
                      size={60} 
                      strokeWidth={6} 
                    />
                    <Text style={styles.celebrationStatLabel}>
                      {completionData.workouts}/{completionData.totalWorkouts} Workouts
                    </Text>
                  </View>
                  <View style={styles.celebrationStatItem}>
                    <ProgressRing 
                      progress={completionData.meals / completionData.totalMeals} 
                      size={60} 
                      strokeWidth={6} 
                    />
                    <Text style={styles.celebrationStatLabel}>
                      {completionData.meals}/{completionData.totalMeals} Meals
                    </Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.celebrationButton} onPress={handleClose}>
                  <LinearGradient colors={['#00F5A0', '#00D68F']} style={styles.celebrationButtonGradient}>
                    <Text style={styles.celebrationButtonText}>Continue →</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

type DashboardScreenProps = {
  user: User;
  phase: PhasePlan | null;
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
  workoutSessions: WorkoutSessionEntry[];
  progressEstimate: ProgressEstimate | null;
  onProfilePress?: () => void;
  onStartPhase?: () => void;
  onToggleWorkoutExercise?: (date: string, exerciseName: string) => void;
  onMarkConsistent?: (log: DailyConsistencyLog) => void;
  onCreateSession?: (date: string) => void;
};

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  user,
  phase,
  workoutSessions,
  progressEstimate,
  onProfilePress,
  onStartPhase,
  onToggleWorkoutExercise,
  onCreateSession,
}) => {
  const { data: homeData, isLoading: isHomeLoading } = useHomeScreenData(user.id);
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'workouts' | 'meals'>('workouts');
  const [exercisePreview, setExercisePreview] = useState<{
    exercises: WorkoutSessionExercise[];
    index: number;
  } | null>(null);
  
  const resolvedPhase = phase ?? homeData?.phase ?? null;
  const resolvedSessions = workoutSessions.length
    ? workoutSessions
    : homeData?.recentSessions ?? [];
  
  // ✅ FIX: Dashboard always shows TODAY only
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const storedSession =
    resolvedPhase &&
    resolvedSessions.find(
      (session) => session.phasePlanId === resolvedPhase.id && session.date === todayStr
    );
  const todaySession =
    storedSession && storedSession.exercises.length ? storedSession : null;
  const displayExercises = todaySession?.exercises ?? [];
  
  const hasSyncedWorkout = displayExercises.length > 0;
  const greetingMessage = getGreetingMessage();
  const displayName = user?.name || 'Athlete';
  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const activityCells = useMemo<ActivityCell[]>(() => {
    const counts: Record<string, number> = {};
    resolvedSessions.forEach((session) => {
      if (!session.date) return;
      counts[session.date] = (counts[session.date] || 0) + 1;
    });
    const now = new Date();
    const cells: ActivityCell[] = [];
    for (let i = ACTIVITY_TOTAL_DAYS - 1; i >= 0; i -= 1) {
      const cellDate = new Date(now);
      cellDate.setDate(now.getDate() - i);
      const iso = cellDate.toISOString().split('T')[0];
      const count = counts[iso] || 0;
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
    dailyMeal,
    mealsByType,
    isLoading: isMealsLoading,
    isMutating: isMealsMutating,
    error: todayMealsError,
    toggleDayCompleted,
  } = useTodayMeals(phase ? user.id : undefined, today, Boolean(phase));
  const hasDailyMeal = Boolean(dailyMeal);
  const totalMealEntries = Object.values(mealsByType).reduce(
    (sum, entries) => sum + entries.length,
    0
  );
  const dayMealsCompleted = Boolean(dailyMeal?.completed);
  const allMealTypes = useMemo(() => {
    const dynamicTypes = Object.keys(mealsByType).filter((type) => !!type);
    const ordered = [...DEFAULT_MEAL_TYPES];
    dynamicTypes.forEach((type) => {
      if (!ordered.includes(type)) {
        ordered.push(type);
      }
    });
    return ordered;
  }, [mealsByType]);
  const handleDayCompletionToggle = async () => {
    try {
      await toggleDayCompleted(!dayMealsCompleted);
    } catch (err: any) {
      Alert.alert('Meals', err?.message || 'Unable to update completion.');
    }
  };
  const renderMealGroup = (mealType: string) => {
    const entries = mealsByType[mealType] ?? [];
    const isLastGroup = allMealTypes[allMealTypes.length - 1] === mealType;
    return (
      <LinearGradient
        key={mealType}
        colors={CARD_GRADIENT_DEFAULT}
        style={[
          styles.mealGroupCard,
          isLastGroup && styles.mealGroupCardLast,
        ]}
      >
        <View style={styles.mealGroupHeader}>
          <View style={styles.mealGroupInfo}>
            <View style={styles.mealGroupIcon}>
              <Text style={styles.mealGroupEmoji}>{getMealTypeEmoji(mealType)}</Text>
            </View>
            <View>
              <Text style={styles.mealGroupTitle}>{mealType}</Text>
              <Text style={styles.mealGroupMeta}>
                {entries.length ? `${entries.length} item${entries.length > 1 ? 's' : ''}` : 'No items yet'}
              </Text>
            </View>
          </View>
          <Text style={styles.mealGroupManageHint}>Edit via Menu tab</Text>
        </View>
        {entries.length === 0 ? (
          <Text style={styles.mealEmptyEntryText}>
            Add foods for {mealType.toLowerCase()} from the Menu screen to stay on track.
          </Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.mealEntryRow}>
              <View style={styles.mealEntryInfoBlock}>
                <Text style={styles.mealEntryName}>{entry.foodName}</Text>
                <Text style={styles.mealEntryMacros}>{formatMealMacros(entry)}</Text>
              </View>
            </View>
          ))
        )}
      </LinearGradient>
    );
  };
  
  const weeksIntoPhase = Math.max(1, Math.floor((progressEstimate?.daysActive || 0) / 7) + 1);
  
  const canLogWorkouts = !!phase && !!onToggleWorkoutExercise;

  const enhancedExercises = displayExercises.map((exercise) => {
    const sets = exercise.sets || 4;
    const reps = exercise.reps || '8-10';
    return {
      ...exercise,
      setCount: sets,
      repRange: reps,
      repFillCount: getRepFillCount(reps),
    };
  });
  
  const completedExercises = enhancedExercises.filter(e => e.completed);
  const pendingExercises = enhancedExercises.filter(e => !e.completed);
  
  // ✅ FIX: Only show pending items on dashboard for quick action
  const visibleWorkoutCards = canLogWorkouts ? pendingExercises : enhancedExercises;
  
  const totalWorkoutCount = enhancedExercises.length;
  const completedWorkoutCount = completedExercises.length;
  
  const workoutProgress = totalWorkoutCount > 0 ? completedWorkoutCount / totalWorkoutCount : 0;
  const hasPendingLogs = pendingExercises.length > 0;
  const showCompletionSummary = canLogWorkouts && !hasPendingLogs && totalWorkoutCount > 0;
  const totalMealCount = hasDailyMeal ? totalMealEntries : 0;
  const completedMealCount = 0;

  const completionDateLabel = today.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  useEffect(() => {
    if (showCompletionSummary && !celebrationVisible) {
      setCelebrationVisible(true);
    }
  }, [showCompletionSummary]);

  // ✅ FIX: Removed auto-advance to next day
  const closeCelebration = () => {
    setCelebrationVisible(false);
  };

  const handleSwipeExercise = (exerciseName: string) => {
    if (canLogWorkouts && onToggleWorkoutExercise) {
      onToggleWorkoutExercise(todayStr, exerciseName);
    }
  };

  const handleCreateSession = () => {
    onCreateSession?.(todayStr);
  };

  const renderWorkoutsSection = () => (
    <View style={styles.section}>
      {!hasSyncedWorkout ? (
        <View style={styles.emptyWorkoutCard}>
          <Text style={styles.emptyWorkoutEmoji}>📭</Text>
          <Text style={styles.emptyWorkoutTitle}>No workout scheduled</Text>
          <Text style={styles.emptyWorkoutText}>Start a session when you're ready to train.</Text>
          {onCreateSession && (
            <TouchableOpacity style={styles.createSessionButton} onPress={handleCreateSession}>
              <Text style={styles.createSessionButtonText}>Start Session</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : canLogWorkouts && completedExercises.length === totalWorkoutCount && totalWorkoutCount > 0 ? (
        <View style={styles.allCompleteCard}>
          <Text style={styles.allCompleteEmoji}>💪</Text>
          <Text style={styles.allCompleteTitle}>Workout Complete!</Text>
          <Text style={styles.allCompleteMeta}>
            {totalWorkoutCount} exercises · {enhancedExercises.reduce((sum, ex) => sum + ex.setCount, 0)} total sets
          </Text>
        </View>
      ) : (
        <View style={styles.verticalList}>
          {visibleWorkoutCards.map((exercise, index) => {
            const actualIndex = enhancedExercises.findIndex((e) => e.name === exercise.name);
            const isCompleted = exercise.completed;
            return (
              <SwipeableCard
                key={`${todayStr}-${exercise.name}-${index}`}
                enabled={canLogWorkouts && !isCompleted}
                onSwipeRight={() => handleSwipeExercise(exercise.name)}
              >
                <TouchableWithoutFeedback onPress={() => openExercisePreview(exercise, enhancedExercises)}>
                  <LinearGradient
                    colors={isCompleted ? CARD_GRADIENT_COMPLETE : CARD_GRADIENT_DEFAULT}
                    style={[styles.exerciseCard, isCompleted && styles.exerciseCardCompleted]}
                  >
                    <View style={styles.exerciseCardHeader}>
                      <Text style={styles.exerciseBadge}>#{actualIndex + 1}</Text>
                      {isCompleted && (
                        <View style={styles.completedBadge}>
                          <Text style={styles.completedBadgeText}>✓</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.exerciseName}>{exercise.name}</Text>

                    <View style={[styles.muscleTag, { backgroundColor: getMuscleTagColor(exercise.bodyParts) }]}>
                      <Text style={styles.muscleTagText}>{formatBodyPartList(exercise.bodyParts)}</Text>
                    </View>

                    <View style={styles.exerciseMetricBlock}>
                      <View style={styles.metricHeader}>
                        <Text style={styles.metricLabel}>Sets</Text>
                        <Text style={styles.metricValue}>{exercise.setCount} sets</Text>
                      </View>
                      {renderBarRow(Math.min(WORKOUT_BAR_TOTAL, exercise.setCount), WORKOUT_BAR_TOTAL)}
                    </View>

                    <View style={styles.exerciseMetricBlock}>
                      <View style={styles.metricHeader}>
                        <Text style={styles.metricLabel}>Reps</Text>
                        <Text style={styles.metricValue}>{exercise.repRange}</Text>
                      </View>
                      {renderBarRow(exercise.repFillCount, REP_BAR_TOTAL)}
                    </View>

                    <Text style={styles.exerciseStatus}>
                      {isCompleted
                        ? '✓ Completed'
                        : canLogWorkouts
                        ? 'Swipe right to complete'
                        : 'Tap to mark complete'}
                    </Text>

                    {canLogWorkouts && !isCompleted && (
                      <TouchableOpacity
                        style={styles.manualCompleteButton}
                        onPress={() => handleSwipeExercise(exercise.name)}
                      >
                        <Text style={styles.manualCompleteButtonText}>Mark Complete</Text>
                      </TouchableOpacity>
                    )}
                  </LinearGradient>
                </TouchableWithoutFeedback>
              </SwipeableCard>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderMealsSection = () => (
    <View style={styles.section}>
      {!resolvedPhase ? (
        <View style={styles.emptyMealCard}>
          <Text style={styles.emptyMealEmoji}>🍽️</Text>
          <Text style={styles.emptyMealTitle}>Meals unlock soon</Text>
          <Text style={styles.emptyMealText}>Finish onboarding to create your first nutrition plan.</Text>
        </View>
      ) : isMealsLoading && !hasDailyMeal ? (
        <View style={styles.emptyMealCard}>
          <Text style={styles.emptyMealEmoji}>⏳</Text>
          <Text style={styles.emptyMealTitle}>Syncing meals</Text>
          <Text style={styles.emptyMealText}>Pulling today’s plan from the cloud...</Text>
        </View>
      ) : !hasDailyMeal && totalMealEntries === 0 ? (
        <View style={styles.emptyMealCard}>
          <Text style={styles.emptyMealEmoji}>🍽️</Text>
          <Text style={styles.emptyMealTitle}>No meals for today</Text>
          <Text style={styles.emptyMealText}>Use the Menu tab to create meals for your current phase.</Text>
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={[
              styles.mealCompletionChip,
              dayMealsCompleted && styles.mealCompletionChipActive,
            ]}
            onPress={handleDayCompletionToggle}
            disabled={isMealsMutating}
          >
            <Text
              style={[
                styles.mealCompletionChipText,
                dayMealsCompleted && styles.mealCompletionChipTextActive,
              ]}
            >
              {dayMealsCompleted ? 'Meals complete' : 'Mark meals complete'}
            </Text>
          </TouchableOpacity>
          <View style={styles.verticalList}>
            {allMealTypes.map((mealType) => renderMealGroup(mealType))}
          </View>
        </>
      )}

      {todayMealsError && <Text style={styles.errorText}>{todayMealsError}</Text>}
    </View>
  );

const openExercisePreview = (
    exercise: WorkoutSessionExercise,
    collection: WorkoutSessionExercise[]
  ) => {
    const index = Math.max(
      0,
      collection.findIndex((item) => item.name === exercise.name)
    );
    setExercisePreview({
      exercises: collection,
      index,
    });
  };

  const closeExercisePreview = () => setExercisePreview(null);
  const currentPreviewExercise =
    exercisePreview && exercisePreview.exercises[exercisePreview.index];
  const showPreviewDelta = (delta: number) => {
    if (!exercisePreview) return;
    const total = exercisePreview.exercises.length;
    if (total === 0) return;
    const nextIndex = (exercisePreview.index + delta + total) % total;
    setExercisePreview({
      ...exercisePreview,
      index: nextIndex,
    });
  };
  const previewPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 20 && Math.abs(gesture.dy) < 20,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 40) {
          showPreviewDelta(-1);
        } else if (gesture.dx < -40) {
          showPreviewDelta(1);
        }
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
        <CelebrationBottomSheet
          visible={celebrationVisible}
          onClose={closeCelebration}
          completionData={{
            date: completionDateLabel,
            workouts: completedWorkoutCount,
            totalWorkouts: totalWorkoutCount,
            meals: completedMealCount,
            totalMeals: totalMealCount,
          }}
        />
        <Modal
          transparent
          visible={!!exercisePreview}
          animationType="fade"
          onRequestClose={closeExercisePreview}
        >
          <View style={styles.previewBackdrop}>
            <Pressable style={styles.previewOverlay} onPress={closeExercisePreview} />
            <View style={styles.previewFullScreen}>
              <View style={styles.previewTopBar}>
                <Text style={styles.previewCounter}>
                  {(exercisePreview?.index || 0) + 1} /{' '}
                  {exercisePreview?.exercises.length || 0}
                </Text>
                <TouchableOpacity onPress={closeExercisePreview}>
                  <Text style={styles.previewCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              {currentPreviewExercise && (
                <View style={styles.previewContent} {...previewPanResponder.panHandlers}>
                  <Text style={styles.previewTitle}>{currentPreviewExercise.name}</Text>
                  <Text style={styles.previewSubtitle}>
                    {formatBodyPartList(currentPreviewExercise.bodyParts)}
                  </Text>
                  <View style={styles.previewMediaBox}>
                    <Text style={styles.previewMediaLabel}>Motion preview</Text>
                    <Text style={styles.previewMediaMeta}>
                      Embed GIF/video for {currentPreviewExercise.name}
                    </Text>
                  </View>
                  <View style={styles.previewMetricsRow}>
                    <View style={styles.previewMetric}>
                      <Text style={styles.previewMetricLabel}>Sets</Text>
                      <Text style={styles.previewMetricValue}>{currentPreviewExercise.sets}</Text>
                    </View>
                    <View style={styles.previewMetric}>
                      <Text style={styles.previewMetricLabel}>Reps</Text>
                      <Text style={styles.previewMetricValue}>{currentPreviewExercise.reps}</Text>
                    </View>
                  </View>
                  <Text style={styles.previewTip}>Swipe left/right or use arrows</Text>
                </View>
              )}
              <View style={styles.previewControls}>
                <TouchableOpacity
                  style={styles.previewArrow}
                  onPress={() => showPreviewDelta(-1)}
                >
                  <Text style={styles.previewArrowText}>←</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.previewArrow}
                  onPress={() => showPreviewDelta(1)}
                >
                  <Text style={styles.previewArrowText}>→</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.dashboardContent}>
          <View style={styles.headerSection}>
            {onProfilePress && (
              <TouchableOpacity style={styles.profileButton} onPress={onProfilePress}>
                <Text style={styles.profileButtonText}>⚙️</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.greetingText}>{greetingMessage},</Text>
            <Text style={styles.userNameText}>{displayName}</Text>
            <Text style={styles.dateInfoText}>
              {dateLabel}
              {resolvedPhase ? ` • Week ${weeksIntoPhase}` : ''}
            </Text>
          </View>

          <LinearGradient colors={CARD_GRADIENT_DEFAULT} style={styles.progressBox}>
            <View style={styles.activityGridRow}>
              {activityColumns.map((column, colIdx) => (
                <View key={`col-${colIdx}`} style={styles.activityColumn}>
                  {column.map((cell) => (
                    <View
                      key={cell.iso}
                      style={[
                        styles.activityCell,
                        getActivityLevelStyle(cell.level),
                        cell.isToday && styles.activityCellToday,
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </LinearGradient>

          {!resolvedPhase && onStartPhase && (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateEmoji}>🏋️</Text>
              <Text style={styles.emptyStateTitle}>Ready to Start Training?</Text>
              <Text style={styles.emptyStateSubtitle}>
                Create your first session to begin tracking your fitness journey
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={onStartPhase}>
                <LinearGradient colors={['#6C63FF', '#5449CC']} style={styles.primaryButtonGradient}>
                  <Text style={styles.primaryButtonText}>+ New Session</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'workouts' && styles.tabButtonActive]}
              onPress={() => setActiveTab('workouts')}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === 'workouts' && styles.tabButtonTextActive,
                ]}
              >
                Workouts
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'meals' && styles.tabButtonActive]}
              onPress={() => setActiveTab('meals')}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === 'meals' && styles.tabButtonTextActive,
                ]}
              >
                Meals
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.tabScroll}
            contentContainerStyle={styles.tabScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === 'workouts' ? renderWorkoutsSection() : renderMealsSection()}
          </ScrollView>
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
  dashboardContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  headerSection: {
    paddingTop: 60,
    paddingBottom: 12,
    paddingRight: 60,
  },
  greetingText: {
    fontSize: 14,
    color: '#A0A3BD',
    marginBottom: 4,
  },
  userNameText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  dateInfoText: {
    fontSize: 14,
    color: '#6C7CFF',
    fontWeight: '600',
    marginTop: 6,
  },
  profileButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E2340',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 2,
  },
  profileButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
  },
  progressBox: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  progressInfo: {
    flex: 1,
    marginRight: 16,
  },
  progressLabel: {
    fontSize: 11,
    color: '#6C7CFF',
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  progressStatsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 4,
  },
  progressValue: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  streakCount: {
    fontSize: 14,
    color: '#A0A3BD',
    fontWeight: '600',
  },
  streakFire: {
    color: '#FF6B6B',
  },
  progressSubtitle: {
    fontSize: 13,
    color: '#A0A3BD',
  },
  progressRingWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityGridRow: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
    height: 90,
  },
  activityColumn: {
    flex: 1,
    gap: 3,
    alignItems: 'center',
  },
  activityCell: {
    width: '75%',
    height: 10,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  activityLevel0: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  activityLevel1: {
    backgroundColor: 'rgba(0,245,160,0.3)',
  },
  activityLevel2: {
    backgroundColor: 'rgba(0,245,160,0.6)',
  },
  activityLevel3: {
    backgroundColor: '#00F5A0',
  },
  activityCellToday: {
    borderWidth: 2,
    borderColor: '#6C63FF',
  },
  
  // ✅ NEW: Empty state styles
  emptyStateContainer: {
    backgroundColor: 'rgba(108, 99, 255, 0.05)',
    borderRadius: 20,
    padding: 32,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    alignItems: 'center',
    gap: 12,
  },
  emptyStateEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: '#A0A3BD',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  primaryButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  primaryButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#111638',
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
    marginTop: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#1E2340',
  },
  tabButtonText: {
    color: '#A0A3BD',
    fontSize: 14,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  verticalList: {
    gap: 14,
  },
  
  section: {
    gap: 16,
    marginTop: 16,
  },
  emptyWorkoutCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 24,
    backgroundColor: 'rgba(20, 24, 50, 0.8)',
    alignItems: 'center',
    gap: 10,
  },
  emptyWorkoutEmoji: {
    fontSize: 42,
  },
  emptyWorkoutTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyWorkoutText: {
    fontSize: 14,
    color: '#A0A3BD',
    textAlign: 'center',
    lineHeight: 20,
  },
  createSessionButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#6C63FF',
  },
  createSessionButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  emptyMealCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 24,
    backgroundColor: 'rgba(17, 21, 42, 0.9)',
    alignItems: 'center',
    gap: 10,
  },
  emptyMealEmoji: {
    fontSize: 38,
  },
  emptyMealTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyMealText: {
    fontSize: 14,
    color: '#A0A3BD',
    textAlign: 'center',
    lineHeight: 20,
  },
  
  allCompleteCard: {
    backgroundColor: 'rgba(0, 245, 160, 0.08)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 160, 0.2)',
    alignItems: 'center',
  },
  allCompleteEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  allCompleteTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  allCompleteMeta: {
    fontSize: 14,
    color: '#A0A3BD',
  },
  
  exerciseCard: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  exerciseCardCompleted: {
    opacity: 0.8,
  },
  exerciseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  completedBadge: {
    backgroundColor: '#00F5A0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  completedBadgeText: {
    color: '#051937',
    fontSize: 11,
    fontWeight: 'bold',
  },
  exerciseName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  muscleTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 4,
  },
  muscleTagText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  exerciseMetricBlock: {
    gap: 6,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  barRow: {
    flexDirection: 'row',
    gap: 6,
  },
  barCell: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  barCellActive: {
    backgroundColor: '#00F5A0',
  },
  exerciseStatus: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  manualCompleteButton: {
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 160, 0.2)',
  },
  manualCompleteButtonText: {
    color: '#00F5A0',
    fontWeight: 'bold',
    fontSize: 13,
  },
  
  addMealTypeButton: {
    borderWidth: 1,
    borderColor: '#2A2F4F',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#111638',
  },
  addMealTypeText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  mealGroupCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    width: '100%',
    marginBottom: 12,
  },
  mealGroupCardLast: {
    marginBottom: 0,
  },
  mealGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mealGroupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mealGroupIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111638',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealGroupEmoji: {
    fontSize: 18,
  },
  mealGroupTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  mealGroupMeta: {
    color: '#A0A3BD',
    fontSize: 12,
  },
  mealGroupManageHint: {
    color: '#6B6F7B',
    fontSize: 11,
  },
  mealGroupAddButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  mealGroupAddText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  mealEntryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    gap: 12,
  },
  mealEntryInfoBlock: {
    flex: 1,
  },
  mealEntryName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  mealEntryMacros: {
    color: '#A0A3BD',
    fontSize: 12,
    marginTop: 2,
  },
  mealEntryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  mealEntryActionButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mealEntryActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  mealEntryDeleteButton: {
    borderColor: 'rgba(255,107,107,0.5)',
    backgroundColor: 'rgba(255,107,107,0.12)',
  },
  mealEntryDeleteText: {
    color: '#FF6B6B',
  },
  mealCompletionChip: {
    borderWidth: 1,
    borderColor: '#2A2F4F',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  mealCompletionChipActive: {
    borderColor: '#00F5A0',
    backgroundColor: 'rgba(0,245,160,0.12)',
  },
  mealCompletionChipText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  mealCompletionChipTextActive: {
    color: '#00F5A0',
  },
  mealEmptyEntryText: {
    color: '#A0A3BD',
    fontSize: 13,
    marginTop: 6,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 12,
    marginTop: 4,
  },
  mealModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,8,20,0.85)',
    justifyContent: 'flex-end',
  },
  mealModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  mealModalContent: {
    backgroundColor: '#0B0F24',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 30,
  },
  mealModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  mealModalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  mealModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#151932',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealModalCloseText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  mealModalForm: {
    gap: 14,
  },
  mealModalField: {
    gap: 6,
  },
  mealModalLabel: {
    color: '#A0A3BD',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealModalInput: {
    backgroundColor: '#111638',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mealModalInputDisabled: {
    opacity: 0.6,
  },
  mealMacrosRow: {
    flexDirection: 'row',
    gap: 12,
  },
  mealModalActions: {
    marginTop: 8,
  },
  mealModalSaveButton: {
    borderRadius: 12,
    backgroundColor: '#6C63FF',
    paddingVertical: 14,
    alignItems: 'center',
  },
  mealModalSaveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  
  swipeIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: 'rgba(0, 245, 160, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  swipeIndicatorText: {
    color: '#00F5A0',
    fontWeight: 'bold',
    fontSize: 14,
  },
  
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 20, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 8, 20, 0.6)',
  },
  previewFullScreen: {
    width: '100%',
    height: '95%',
    backgroundColor: '#050814',
    borderRadius: 28,
    overflow: 'hidden',
  },
  previewTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  previewCounter: {
    color: '#A0A3BD',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  previewCloseText: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  previewContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 16,
  },
  previewTitle: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  previewSubtitle: {
    fontSize: 14,
    color: '#A0A3BD',
  },
  previewMediaBox: {
    flex: 1,
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewMediaLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 4,
  },
  previewMediaMeta: {
    color: '#A0A3BD',
    fontSize: 12,
  },
  previewMetricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  previewMetric: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  previewMetricLabel: {
    color: '#A0A3BD',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewMetricValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  previewTip: {
    color: '#A0A3BD',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  previewControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  previewArrow: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  previewArrowText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  
  celebrationBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 9, 25, 0.9)',
    justifyContent: 'flex-end',
  },
  celebrationSheet: {
    backgroundColor: '#0A0E27',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: SCREEN_HEIGHT * 0.65,
    overflow: 'hidden',
  },
  celebrationContent: {
    padding: 32,
    paddingTop: 24,
    alignItems: 'center',
  },
  celebrationEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  celebrationTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  celebrationSubtitle: {
    fontSize: 16,
    color: '#A0A3BD',
    marginBottom: 32,
  },
  celebrationStats: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 32,
  },
  celebrationStatItem: {
    alignItems: 'center',
    gap: 12,
  },
  celebrationStatLabel: {
    fontSize: 13,
    color: '#A0A3BD',
    textAlign: 'center',
  },
  celebrationButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  celebrationButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  celebrationButtonText: {
    color: '#051937',
    fontSize: 16,
    fontWeight: 'bold',
  },
  swipeDownIndicator: {
    marginBottom: 20,
    alignItems: 'center',
  },
  swipeDownBar: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
  },
  tabScroll: {
    flex: 1,
    marginTop: 16,
  },
  tabScrollContent: {
    paddingBottom: 40,
    gap: 16,
  },
});
