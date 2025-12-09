import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  PhasePlan,
  WorkoutLog,
  ProgressEstimate,
  StrengthSnapshot,
  WorkoutSessionEntry,
  DailyConsistencyLog,
  MuscleGroup,
  DailyMealPlan,
} from '../types/domain';
import { createSessionForDate } from '../utils/workoutPlanner';
import { dietTips, mealPlanTemplates } from '../data';
import { getBodyPartLabel } from '../utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: '🌅',
  lunch: '🌞',
  snack: '🍎',
  dinner: '🌙',
};

// ✨ REFINED: Subtle accent colors for muscle tags (not backgrounds)
const MUSCLE_TAG_COLORS: Record<string, string> = {
  chest: 'rgba(255, 107, 107, 0.2)',      // Soft red tint
  back: 'rgba(78, 205, 196, 0.2)',        // Soft teal tint
  legs: 'rgba(149, 225, 211, 0.2)',       // Soft green tint
  shoulders: 'rgba(255, 217, 61, 0.2)',   // Soft yellow tint
  arms: 'rgba(255, 135, 135, 0.2)',       // Soft pink tint
  core: 'rgba(168, 230, 207, 0.2)',       // Soft mint tint
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

// ✨ IMPROVED: Cleaner Progress Ring Component
const ProgressRing: React.FC<{ progress: number; size: number; strokeWidth: number }> = ({ 
  progress, 
  size, 
  strokeWidth 
}) => {
  const progressValue = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {/* Background circle */}
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
      {/* Progress arc - simplified visual */}
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

// ✨ Swipeable Card Component
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

// ✨ Date Navigation Component
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

// ✨ IMPROVED: Cleaner Bottom Sheet Celebration
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
  onRegenerateWorkoutPlan?: (date: string) => void;
  onRegenerateMealPlan?: (date: string) => void;
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
  onRegenerateWorkoutPlan,
  onRegenerateMealPlan,
}) => {
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [hasQueuedNextSession, setHasQueuedNextSession] = useState(false);
  const [activeDate, setActiveDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentDateStr = activeDate || todayStr;
  const currentDateObj = new Date(currentDateStr);
  const isToday = currentDateStr === todayStr;
  const isPastDate = currentDateStr < todayStr;
  
  const activePhaseId = phase?.id || 'preview';
  const storedSession =
    phase &&
    workoutSessions.find(
      (session) => session.phasePlanId === phase.id && session.date === currentDateStr
    );
  const fallbackSession = createSessionForDate(user, activePhaseId, currentDateStr);
  const todaySession =
    storedSession && storedSession.exercises.length
      ? storedSession
      : fallbackSession;
  const displayExercises = todaySession.exercises;
  
  const focusAreas = Array.from(
    new Set(displayExercises.flatMap((exercise) => exercise.bodyParts))
  ) as MuscleGroup[];
  const workoutSummary = `${displayExercises.length} ${getWorkoutDescriptor(focusAreas)}`;
  const focusDescription = formatBodyPartList(focusAreas);
  const weekdayLabel = currentDateObj.toLocaleDateString(undefined, { weekday: 'long' });
  const dateLabel = currentDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  
  const dietGuide = dietTips[user.eatingMode];
  const mealTemplates = mealPlanTemplates[user.eatingMode];
  const savedMealPlan =
    phase &&
    mealPlans.find((plan) => plan.phasePlanId === phase.id && plan.date === currentDateStr);
  const meals = mealTemplates.map((meal) => {
    const saved = savedMealPlan?.meals.find((savedMeal) => savedMeal.title === meal.title);
    return {
      ...meal,
      completed: saved?.completed ?? false,
    };
  });
  
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
    onRegenerateWorkoutPlan?.(nextDateStr);
    onRegenerateMealPlan?.(nextDateStr);
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

  const markEverythingDone = () => {
    if (!hasPendingLogs || !isToday) return;
    pendingExercises.forEach((ex) => onToggleWorkoutExercise?.(currentDateStr, ex.name));
    pendingMeals.forEach((meal) => onToggleMeal?.(currentDateStr, meal.title));
  };

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

        <ScrollView
          contentContainerStyle={styles.dashboardContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ✨ IMPROVED: Cleaner header with progress ring */}
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

          {/* ✨ IMPROVED: Workout Section with cleaner structure */}
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

            {canLogWorkouts && completedExercises.length === totalWorkoutCount && totalWorkoutCount > 0 ? (
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
                      style={[
                        styles.exerciseCardWrapper,
                        index === visibleWorkoutCards.length - 1 && styles.lastCardWrapper,
                      ]}
                    >
                      <LinearGradient
                        colors={
                          isCompleted
                            ? ['#0BA360', '#3CBA92']
                            : ['#1C1F3F', '#101329']  // ✨ FIXED: Dark gradient for all incomplete cards
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
                        
                        {/* ✨ NEW: Subtle muscle tag */}
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
                    </SwipeableCard>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* ✨ Meals Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionEyebrow}>Nutrition · {dietGuide.label}</Text>
                <Text style={styles.sectionTitle}>Meals for your goal</Text>
                <Text style={styles.sectionSubtitle}>{dietGuide.description}</Text>
              </View>
              {totalMealCount > 0 && (
                <View style={styles.sectionProgress}>
                  <Text style={styles.sectionProgressText}>
                    {completedMealCount}/{totalMealCount}
                  </Text>
                </View>
              )}
            </View>

            {canLogMeals && completedMeals.length === totalMealCount && totalMealCount > 0 ? (
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
                      style={[
                        styles.mealCardWrapper,
                        index === visibleMealCards.length - 1 && styles.lastCardWrapper,
                      ]}
                    >
                      <LinearGradient
                        colors={
                          isCompleted
                            ? ['#16302F', '#10201F']
                            : ['#1F2A44', '#11152A']
                        }
                        style={[styles.mealCard, isCompleted && styles.mealCardCompleted]}
                      >
                        <View style={styles.mealHeaderRow}>
                          <Text style={styles.mealEmoji}>{getMealEmoji(meal.title)}</Text>
                          <View style={[styles.mealCheckbox, isCompleted && styles.mealCheckboxComplete]}>
                            {isCompleted && (
                              <Text style={styles.mealCheckboxMark}>✓</Text>
                            )}
                          </View>
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
    gap: 16,  // Reduced from 20 to 16
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
  
  // Date Navigator - Compact Design
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
  
  // Bulk Action Button - Compact
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
  
  // Past/Future Cards - Compact
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
  
  // Section Styles - Compact
  section: {
    gap: 12,  // Reduced from 16
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
  
  // All Complete Card
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
  
  // Exercise Cards
  horizontalScroller: {
    paddingVertical: 4,
    paddingRight: 4,
  },
  exerciseCardWrapper: {
    width: WORKOUT_CARD_WIDTH,
    marginRight: 16,
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
  // ✨ NEW: Subtle muscle tag
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
  
  // Swipe Indicator
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
  
  // Meal Cards
  mealCarousel: {
    paddingVertical: 4,
    paddingRight: 4,
  },
  mealCardWrapper: {
    width: MEAL_CARD_WIDTH,
    marginRight: 16,
  },
  lastCardWrapper: {
    marginRight: 0,
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
  mealCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealCheckboxComplete: {
    backgroundColor: '#00F5A0',
    borderColor: '#00F5A0',
  },
  mealCheckboxMark: {
    color: '#051937',
    fontWeight: '700',
    fontSize: 16,
  },
  mealStatusText: {
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  
  // Celebration Bottom Sheet
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
