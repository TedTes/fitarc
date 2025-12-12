import React, { useEffect, useRef, useState } from 'react';
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
  DailyMealPlan,
} from '../types/domain';
import { useHomeScreenData } from '../hooks/useHomeScreenData';
import { dietTips } from '../data';
import { getBodyPartLabel } from '../utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: '🌅',
  lunch: '🌞',
  snack: '🍎',
  dinner: '🌙',
};

const MUSCLE_TAG_COLORS: Record<string, string> = {
  chest: 'rgba(255, 107, 107, 0.2)',
  back: 'rgba(78, 205, 196, 0.2)',
  legs: 'rgba(149, 225, 211, 0.2)',
  shoulders: 'rgba(255, 217, 61, 0.2)',
  arms: 'rgba(255, 135, 135, 0.2)',
  core: 'rgba(168, 230, 207, 0.2)',
};

const WORKOUT_CARD_WIDTH = 280;
const MEAL_CARD_WIDTH = 220;
const WORKOUT_BAR_TOTAL = 5;
const REP_BAR_TOTAL = 6;
const SWIPE_THRESHOLD = 80;

const getMealEmoji = (title: string): string => {
  const key = title.toLowerCase();
  return MEAL_EMOJIS[key] || '🍽️';
};

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

const getWorkoutDescriptor = (parts: MuscleGroup[]): string => {
  if (!parts.length) return 'mobility reset';
  const upper = ['chest', 'back', 'shoulders', 'arms'];
  const lower = ['legs', 'core'];
  const isUpper = parts.every((part) => upper.includes(part));
  const isLower = parts.every((part) => lower.includes(part));

  if (isUpper) return 'upper body workouts';
  if (isLower) return 'lower body workouts';
  if (parts.length > 3) return 'full body workouts';
  return 'mixed focus workouts';
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

const DateNavigator: React.FC<{
  currentDate: string;
  onDateChange: (date: string) => void;
  todayDate: string;
}> = ({ currentDate, onDateChange, todayDate }) => {
  const goToPreviousDay = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - 1);
    const today = new Date(todayDate);
    if (date >= today) {
      onDateChange(date.toISOString().split('T')[0]);
    }
  };

  const goToNextDay = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + 1);
    onDateChange(date.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    onDateChange(todayDate);
  };

  const isToday = currentDate === todayDate;
  const isPast = currentDate < todayDate;
  const currentDateObj = new Date(currentDate);
  const weekday = currentDateObj.toLocaleDateString(undefined, { weekday: 'short' });
  const monthDay = currentDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <View style={styles.dateNavigator}>
      <TouchableOpacity
        onPress={goToPreviousDay}
        style={styles.dateNavButton}
        disabled={currentDate <= todayDate}
      >
        <Text
          style={[
            styles.dateNavButtonText,
            currentDate <= todayDate && styles.dateNavButtonDisabled,
          ]}
        >
          ←
        </Text>
      </TouchableOpacity>

      <View style={styles.dateDisplay}>
        <View style={styles.dateLabelRow}>
          <Text style={styles.dateText}>
            {weekday}, {monthDay}
          </Text>
          {isToday && (
            <View style={styles.todayChip}>
              <Text style={styles.todayChipText}>Today</Text>
            </View>
          )}
        </View>
        {!isToday && (
          <View style={styles.dateStatusRow}>
            {isPast ? (
              <Text style={styles.pastLabel}>Past</Text>
            ) : (
              <Text style={styles.futureLabel}>Upcoming</Text>
            )}
            <TouchableOpacity onPress={goToToday} style={styles.todayJumpButton}>
              <Text style={styles.todayJumpButtonText}>Jump to today</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity onPress={goToNextDay} style={styles.dateNavButton}>
        <Text style={styles.dateNavButtonText}>→</Text>
      </TouchableOpacity>
    </View>
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
  mealPlans: DailyMealPlan[];
  progressEstimate: ProgressEstimate | null;
  onProfilePress?: () => void;
  onStartPhase?: () => void;
  onToggleWorkoutExercise?: (date: string, exerciseName: string) => void;
  onToggleMeal?: (date: string, mealTitle: string) => void;
  onMarkConsistent?: (log: DailyConsistencyLog) => void;
  onCreateSession?: (date: string) => void;
};

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  user,
  phase,
  workoutSessions,
  progressEstimate,
  mealPlans,
  onProfilePress,
  onStartPhase,
  onToggleWorkoutExercise,
  onToggleMeal,
  onCreateSession,
}) => {
  const { data: homeData, isLoading: isHomeLoading } = useHomeScreenData(user.id);
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [exercisePreview, setExercisePreview] = useState<{
    exercises: WorkoutSessionExercise[];
    index: number;
  } | null>(null);
  const [hasQueuedNextSession, setHasQueuedNextSession] = useState(false);
  const [activeDate, setActiveDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });
  const resolvedPhase = homeData?.phase ?? phase;
  const resolvedSessions = homeData?.recentSessions ?? workoutSessions;
  const todayMealPlanFromRemote = homeData?.todayMealPlan;
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentDateStr = activeDate || todayStr;
  const currentDateObj = new Date(currentDateStr);
  const isToday = currentDateStr === todayStr;
  const isPastDate = currentDateStr < todayStr;
  
  const storedSession =
    resolvedPhase &&
    resolvedSessions.find(
      (session) => session.phasePlanId === resolvedPhase.id && session.date === currentDateStr
    );
  const todaySession =
    storedSession && storedSession.exercises.length ? storedSession : null;
  const displayExercises = todaySession?.exercises ?? [];
  
  const focusAreas = Array.from(
    new Set(displayExercises.flatMap((exercise) => exercise.bodyParts))
  ) as MuscleGroup[];
  const hasSyncedWorkout = displayExercises.length > 0;
  const workoutSummary = hasSyncedWorkout
    ? `${displayExercises.length} ${getWorkoutDescriptor(focusAreas)}`
    : isHomeLoading
    ? 'Syncing workouts...'
    : 'No synced workouts';
  const focusDescription = hasSyncedWorkout
    ? formatBodyPartList(focusAreas)
    : isHomeLoading
    ? 'Fetching recent sessions'
    : 'Your synced workouts will appear here';
  const weekdayLabel = currentDateObj.toLocaleDateString(undefined, { weekday: 'long' });
  const dateLabel = currentDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  
  const dietGuide = dietTips[user.eatingMode];
  const savedMealPlan =
    resolvedPhase &&
    (todayMealPlanFromRemote?.date === currentDateStr
      ? todayMealPlanFromRemote
      : mealPlans.find(
          (plan) => plan.phasePlanId === resolvedPhase.id && plan.date === currentDateStr
        ));
  const meals = savedMealPlan?.meals ?? [];
  const hasMeals = meals.length > 0;
  
  const progressPercent = progressEstimate?.progressPercent || 0;
  const weeksIntoPhase = Math.max(1, Math.floor((progressEstimate?.daysActive || 0) / 7) + 1);
  
  const canLogWorkouts = !!phase && !!onToggleWorkoutExercise && isToday;
  const canLogMeals = !!phase && !!onToggleMeal && isToday;

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
  const completedMeals = meals.filter(m => m.completed);
  const pendingMeals = meals.filter(m => !m.completed);
  const visibleWorkoutCards =
    isToday && canLogWorkouts ? pendingExercises : enhancedExercises;
  const visibleMealCards =
    isToday && canLogMeals ? pendingMeals : meals;
  
  const totalWorkoutCount = enhancedExercises.length;
  const completedWorkoutCount = completedExercises.length;
  const totalMealCount = meals.length;
  const completedMealCount = completedMeals.length;
  
  const workoutProgress = totalWorkoutCount > 0 ? completedWorkoutCount / totalWorkoutCount : 0;
  const mealProgress = totalMealCount > 0 ? completedMealCount / totalMealCount : 0;
  const overallProgress = (workoutProgress + mealProgress) / 2;
  
  const hasPendingLogs = pendingExercises.length > 0 || pendingMeals.length > 0;
  const showCompletionSummary = (canLogWorkouts || canLogMeals) && !hasPendingLogs && (totalWorkoutCount || totalMealCount);
  
  const completionDateLabel = currentDateObj.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  useEffect(() => {
    if (showCompletionSummary && !celebrationVisible) {
      setCelebrationVisible(true);
      setHasQueuedNextSession(false);
    }
  }, [showCompletionSummary]);

  const queueNextSessionPlans = () => {
    if (hasQueuedNextSession) return;
    const seedDate = new Date(currentDateStr);
    seedDate.setDate(seedDate.getDate() + 1);
    const nextDateStr = seedDate.toISOString().split('T')[0];
    setActiveDate(nextDateStr);
    setHasQueuedNextSession(true);
  };

  const closeCelebration = () => {
    queueNextSessionPlans();
    setCelebrationVisible(false);
  };

  const handleSwipeExercise = (exerciseName: string) => {
    if (canLogWorkouts && onToggleWorkoutExercise) {
      onToggleWorkoutExercise(currentDateStr, exerciseName);
    }
  };

  const handleSwipeMeal = (mealTitle: string) => {
    if (canLogMeals && onToggleMeal) {
      onToggleMeal(currentDateStr, mealTitle);
    }
  };

  const handleCreateSession = () => {
    onCreateSession?.(currentDateStr);
  };

  const markEverythingDone = () => {
    if (!hasPendingLogs || !isToday) return;
    pendingExercises.forEach((ex) => onToggleWorkoutExercise?.(currentDateStr, ex.name));
    pendingMeals.forEach((meal) => onToggleMeal?.(currentDateStr, meal.title));
  };

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

        <ScrollView
          contentContainerStyle={styles.dashboardContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.dashboardHeader}>
            <View style={styles.headerLeft}>
              <Text style={styles.smallLabel}>
                {phase ? 'Current Arc' : 'Preview your arc'}
              </Text>
              <Text style={styles.dashboardTitle}>
                {phase
                  ? `Level ${phase.currentLevelId} → ${phase.targetLevelId}`
                  : 'Your program is ready'}
              </Text>
              <Text style={styles.dashboardSubtitle}>
                {phase
                  ? `Week ${weeksIntoPhase} · ${progressPercent}% complete`
                  : 'Start your profile to unlock tracking'}
              </Text>
            </View>
            
            {phase && isToday && (
              <View style={styles.headerRight}>
                <ProgressRing progress={overallProgress} size={70} strokeWidth={6} />
              </View>
            )}
            
            {phase && !isToday && onProfilePress && (
              <TouchableOpacity style={styles.profileButton} onPress={onProfilePress}>
                <Text style={styles.profileButtonText}>⚙️</Text>
              </TouchableOpacity>
            )}
          </View>

          {!phase && onStartPhase && (
            <TouchableOpacity style={styles.primaryButton} onPress={onStartPhase}>
              <LinearGradient colors={['#6C63FF', '#5449CC']} style={styles.primaryButtonGradient}>
                <Text style={styles.primaryButtonText}>Start your arc</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {phase && (
            <DateNavigator
              currentDate={currentDateStr}
              onDateChange={setActiveDate}
              todayDate={todayStr}
            />
          )}

          {isToday && (canLogWorkouts || canLogMeals) && (
            <TouchableOpacity
              style={[styles.bulkButton, !hasPendingLogs && styles.bulkButtonDisabled]}
              onPress={markEverythingDone}
              disabled={!hasPendingLogs}
              activeOpacity={0.85}
            >
              <View style={styles.bulkButtonHeader}>
                <Text style={styles.bulkButtonText}>
                  {hasPendingLogs ? '⚡ Quick Complete All' : '✓ All Complete'}
                </Text>
                {hasPendingLogs && (
                  <View style={styles.bulkBadge}>
                    <Text style={styles.bulkBadgeText}>
                      {pendingExercises.length + pendingMeals.length}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.bulkButtonMeta}>
                {hasPendingLogs
                  ? `${pendingExercises.length} exercises · ${pendingMeals.length} meals remaining`
                  : 'Great job! Everything is logged for today'}
              </Text>
            </TouchableOpacity>
          )}

          {isPastDate && (
            <View style={styles.pastSummaryCard}>
              <Text style={styles.pastSummaryTitle}>📊 {completionDateLabel}</Text>
              <View style={styles.pastSummaryStats}>
                <Text style={styles.pastSummaryStat}>
                  ✓ {completedWorkoutCount}/{totalWorkoutCount} Workouts
                </Text>
                <Text style={styles.pastSummaryStat}>
                  ✓ {completedMealCount}/{totalMealCount} Meals
                </Text>
              </View>
            </View>
          )}

          {!isToday && !isPastDate && (
            <View style={styles.futureNotice}>
              <Text style={styles.futureNoticeText}>
                👀 Previewing upcoming session - logging unlocks on {weekdayLabel}
              </Text>
            </View>
          )}

          {/* ✨ FIXED: Workout Section - Proper spacing */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionEyebrow}>
                  {isToday ? 'Today' : isPastDate ? 'Past' : 'Upcoming'} · {weekdayLabel}, {dateLabel}
                </Text>
                <Text style={styles.sectionTitle}>{workoutSummary}</Text>
                <Text style={styles.sectionSubtitle}>{focusDescription}</Text>
              </View>
              {totalWorkoutCount > 0 && (
                <View style={styles.sectionProgress}>
                  <Text style={styles.sectionProgressText}>
                    {completedWorkoutCount}/{totalWorkoutCount}
                  </Text>
                </View>
              )}
            </View>

            {!hasSyncedWorkout ? (
              <View style={styles.emptyWorkoutCard}>
                <Text style={styles.emptyWorkoutEmoji}>📭</Text>
                <Text style={styles.emptyWorkoutTitle}>No workout logged</Text>
                <Text style={styles.emptyWorkoutText}>
                  Start a session when you're ready to train.
                </Text>
                {onCreateSession && !isPastDate && (
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={WORKOUT_CARD_WIDTH + 20}
                decelerationRate="fast"
                contentContainerStyle={styles.horizontalScroller}
              >
                {visibleWorkoutCards.map((exercise, index) => {
                  const actualIndex = enhancedExercises.findIndex(e => e.name === exercise.name);
                  const isCompleted = exercise.completed;
                  
                  return (
                    <SwipeableCard
                      key={`${currentDateStr}-${exercise.name}-${index}`}
                      enabled={canLogWorkouts && !isCompleted}
                      onSwipeRight={() => handleSwipeExercise(exercise.name)}
                      style={styles.exerciseCardWrapper}
                    >
                      <TouchableWithoutFeedback onPress={() => openExercisePreview(exercise, enhancedExercises)}>
                        <LinearGradient
                          colors={
                            isCompleted
                              ? ['#0BA360', '#3CBA92']
                              : ['#1C1F3F', '#101329']
                          }
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
                        
                        <View style={[
                          styles.muscleTag,
                          { backgroundColor: getMuscleTagColor(exercise.bodyParts) }
                        ]}>
                          <Text style={styles.muscleTagText}>
                            {formatBodyPartList(exercise.bodyParts)}
                          </Text>
                        </View>
                        
                        <View style={styles.exerciseMetricBlock}>
                          <View style={styles.metricHeader}>
                            <Text style={styles.metricLabel}>Sets</Text>
                            <Text style={styles.metricValue}>{exercise.setCount} sets</Text>
                          </View>
                          {renderBarRow(
                            Math.min(WORKOUT_BAR_TOTAL, exercise.setCount),
                            WORKOUT_BAR_TOTAL
                          )}
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
                            ? '→ Swipe right to complete'
                            : isPastDate
                            ? 'Past session'
                            : isToday
                            ? 'Tap to mark complete'
                            : 'Preview · unlocks on ' + weekdayLabel}
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
              </ScrollView>
            )}
          </View>

          {/* ✨ FIXED: Meals Section - No checkbox, proper spacing */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionEyebrow}>Nutrition · {dietGuide.label}</Text>
                <Text style={styles.sectionTitle}>
                  {hasMeals ? 'Meals for your goal' : 'No meals synced yet'}
                </Text>
                <Text style={styles.sectionSubtitle}>
                  {hasMeals ? dietGuide.description : 'Generate a plan to see meals for this day.'}
                </Text>
              </View>
              {totalMealCount > 0 && (
                <View style={styles.sectionProgress}>
                  <Text style={styles.sectionProgressText}>
                    {completedMealCount}/{totalMealCount}
                  </Text>
                </View>
              )}
            </View>

            {!hasMeals ? (
              <View style={styles.emptyMealCard}>
                <Text style={styles.emptyMealEmoji}>🍽️</Text>
                <Text style={styles.emptyMealTitle}>Meals not available</Text>
                <Text style={styles.emptyMealText}>
                  {resolvedPhase
                    ? 'No meals logged for this day yet.'
                    : 'Start an arc to unlock nutrition tracking.'}
                </Text>
              </View>
            ) : canLogMeals && completedMeals.length === totalMealCount && totalMealCount > 0 ? (
              <View style={styles.allCompleteCard}>
                <Text style={styles.allCompleteEmoji}>🍽️</Text>
                <Text style={styles.allCompleteTitle}>All Meals Logged!</Text>
                <Text style={styles.allCompleteMeta}>
                  {totalMealCount} meals · Great nutrition today
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={MEAL_CARD_WIDTH + 16}
                decelerationRate="fast"
                contentContainerStyle={styles.mealCarousel}
              >
                {visibleMealCards.map((meal, index) => {
                  const isCompleted = meal.completed;
                  
                  return (
                    <SwipeableCard
                      key={`${currentDateStr}-${meal.title}-${index}`}
                      enabled={canLogMeals && !isCompleted}
                      onSwipeRight={() => handleSwipeMeal(meal.title)}
                      style={styles.mealCardWrapper}
                    >
                      <LinearGradient
                        colors={
                          isCompleted
                            ? ['#16302F', '#10201F']
                            : ['#1F2A44', '#11152A']
                        }
                        style={[styles.mealCard, isCompleted && styles.mealCardCompleted]}
                      >
                        {/* ✨ FIXED: No checkbox - just emoji and badge */}
                        <View style={styles.mealHeaderRow}>
                          <Text style={styles.mealEmoji}>{getMealEmoji(meal.title)}</Text>
                          {isCompleted && (
                            <View style={styles.completedBadge}>
                              <Text style={styles.completedBadgeText}>✓</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.mealTitle}>{meal.title}</Text>
                        {meal.items.map((item) => (
                          <View key={item} style={styles.mealItemRow}>
                            <View style={styles.mealBullet} />
                            <Text style={styles.mealItemText}>{item}</Text>
                          </View>
                        ))}
                        
                        <Text style={styles.mealStatusText}>
                          {isCompleted
                            ? '✓ Logged'
                            : canLogMeals
                            ? '→ Swipe right to log'
                            : isPastDate
                            ? 'Past meal'
                            : isToday
                            ? 'Tap to log'
                            : 'Preview · unlocks on ' + weekdayLabel}
                        </Text>
                        
                        {canLogMeals && !isCompleted && (
                          <TouchableOpacity
                            style={styles.manualCompleteButton}
                            onPress={() => handleSwipeMeal(meal.title)}
                          >
                            <Text style={styles.manualCompleteButtonText}>Log Meal</Text>
                          </TouchableOpacity>
                        )}
                      </LinearGradient>
                    </SwipeableCard>
                  );
                })}
              </ScrollView>
            )}
          </View>
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
  dashboardContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    gap: 16,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    marginLeft: 16,
  },
  smallLabel: {
    fontSize: 12,
    color: '#A0A3BD',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dashboardTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  dashboardSubtitle: {
    fontSize: 14,
    color: '#A0A3BD',
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E2340',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
  },
  primaryButton: {
    borderRadius: 12,
    overflow: 'hidden',
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
  
  dateNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#151932',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    gap: 12,
  },
  dateNavButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E2340',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateNavButtonText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  dateNavButtonDisabled: {
    opacity: 0.3,
  },
  dateDisplay: {
    flex: 1,
    gap: 6,
  },
  dateLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  todayChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 160, 0.4)',
  },
  todayChipText: {
    fontSize: 12,
    color: '#00F5A0',
    fontWeight: '600',
  },
  dateStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  futureLabel: {
    fontSize: 11,
    color: '#6C63FF',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderRadius: 6,
  },
  pastLabel: {
    fontSize: 11,
    color: '#A0A3BD',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(160, 163, 189, 0.15)',
    borderRadius: 6,
  },
  todayJumpButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  todayJumpButtonText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  
  bulkButton: {
    backgroundColor: '#111638',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  bulkButtonDisabled: {
    opacity: 0.5,
  },
  bulkButtonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  bulkButtonText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  bulkBadge: {
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bulkBadgeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  bulkButtonMeta: {
    fontSize: 12,
    color: '#A0A3BD',
  },
  
  pastSummaryCard: {
    backgroundColor: 'rgba(160, 163, 189, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  pastSummaryTitle: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 8,
  },
  pastSummaryStats: {
    gap: 6,
  },
  pastSummaryStat: {
    fontSize: 13,
    color: '#A0A3BD',
  },
  futureNotice: {
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
  },
  futureNoticeText: {
    fontSize: 13,
    color: '#6C63FF',
    textAlign: 'center',
  },
  
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  sectionHeaderLeft: {
    flex: 1,
  },
  sectionEyebrow: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6C7CFF',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#A0A3BD',
  },
  sectionProgress: {
    backgroundColor: '#1E2340',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 50,
    alignItems: 'center',
  },
  sectionProgressText: {
    fontSize: 14,
    color: '#00F5A0',
    fontWeight: 'bold',
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
  
  // ✨ FIXED: Workout cards with proper gap
  horizontalScroller: {
    paddingVertical: 4,
    paddingRight: 20,
    gap: 16,
  },
  exerciseCardWrapper: {
    width: WORKOUT_CARD_WIDTH,
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
  
  // ✨ FIXED: Meal cards with proper gap and NO checkbox
  mealCarousel: {
    paddingVertical: 4,
    paddingRight: 20,
    gap: 16,
  },
  mealCardWrapper: {
    width: MEAL_CARD_WIDTH,
  },
  mealCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    gap: 10,
  },
  mealCardCompleted: {
    opacity: 0.8,
  },
  mealHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealEmoji: {
    fontSize: 28,
  },
  mealTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mealItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00F5A0',
  },
  mealItemText: {
    color: '#E3E5FF',
    fontSize: 14,
    flex: 1,
  },
  mealStatusText: {
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
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
});

export default DashboardScreen;
