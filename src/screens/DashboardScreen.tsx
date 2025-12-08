import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TouchableWithoutFeedback, Modal } from 'react-native';
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

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: '🌅',
  lunch: '🌞',
  snack: '🍎',
  dinner: '🌙',
};

const WORKOUT_CARD_WIDTH = 280;
const MEAL_CARD_WIDTH = 220;
const WORKOUT_BAR_TOTAL = 5;
const REP_BAR_TOTAL = 6;

const getMealEmoji = (title: string): string => {
  const key = title.toLowerCase();
  return MEAL_EMOJIS[key] || '🍽️';
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
  const [focusedExercise, setFocusedExercise] = useState<string | null>(null);
  const [focusedMeal, setFocusedMeal] = useState<string | null>(null);
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
  const dayLabel = currentDateStr === todayStr ? 'Today' : 'Next Session';
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
  const canLogWorkouts = !!phase && !!onToggleWorkoutExercise;
  const canLogMeals = !!phase && !!onToggleMeal;

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
  const visibleExercises = canLogWorkouts
    ? enhancedExercises.filter((exercise) => !exercise.completed)
    : enhancedExercises;
  const visibleMeals = canLogMeals ? meals.filter((meal) => !meal.completed) : meals;
  const pendingWorkoutNames = canLogWorkouts ? visibleExercises.map((exercise) => exercise.name) : [];
  const pendingMealTitles = canLogMeals ? visibleMeals.map((meal) => meal.title) : [];
  const hasPendingLogs = pendingWorkoutNames.length > 0 || pendingMealTitles.length > 0;
  const totalWorkoutCount = enhancedExercises.length;
  const totalWorkoutSets = enhancedExercises.reduce((sum, exercise) => sum + exercise.setCount, 0);
  const totalMealCount = meals.length;
  const totalMealItems = meals.reduce((sum, meal) => sum + meal.items.length, 0);
  const mealTitlePreview = meals.length ? meals.map((meal) => meal.title).join(' · ') : 'Meals ready for tomorrow';
  const completedWorkoutCount = Math.max(0, totalWorkoutCount - pendingWorkoutNames.length);
  const completedMealCount = Math.max(0, totalMealCount - pendingMealTitles.length);
  const showCompletionSummary = (canLogWorkouts || canLogMeals) && !hasPendingLogs && (totalWorkoutCount || totalMealCount);
  const completionDateLabel = currentDateObj.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  useEffect(() => {
    setActiveDate((prev) => (prev < todayStr ? todayStr : prev || todayStr));
  }, [todayStr]);

  useEffect(() => {
    if (showCompletionSummary) {
      setCelebrationVisible(true);
      setHasQueuedNextSession(false);
    }
  }, [showCompletionSummary]);
  useEffect(() => {
    if (!celebrationVisible) return;
    const timer = setTimeout(() => {
      closeCelebration();
    }, 3500);
    return () => clearTimeout(timer);
  }, [celebrationVisible]);
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

  const clearFocus = () => {
    if (focusedExercise || focusedMeal) {
      setFocusedExercise(null);
      setFocusedMeal(null);
    }
  };

  const handleExercisePress = (exerciseName: string) => {
    if (!canLogWorkouts) return;
    setFocusedMeal(null);
    setFocusedExercise((prev) => (prev === exerciseName ? null : exerciseName));
  };

  const handleMealPress = (mealTitle: string) => {
    if (!canLogMeals) return;
    setFocusedExercise(null);
    setFocusedMeal((prev) => (prev === mealTitle ? null : mealTitle));
  };

  const confirmExerciseComplete = (exerciseName: string) => {
    if (!canLogWorkouts || !onToggleWorkoutExercise) return;
    onToggleWorkoutExercise(currentDateStr, exerciseName);
    setFocusedExercise(null);
  };

  const confirmMealLogged = (mealTitle: string) => {
    if (!canLogMeals || !onToggleMeal) return;
    onToggleMeal(currentDateStr, mealTitle);
    setFocusedMeal(null);
  };

  const markEverythingDone = () => {
    if (!hasPendingLogs) return;
    pendingWorkoutNames.forEach((name) => onToggleWorkoutExercise?.(currentDateStr, name));
    pendingMealTitles.forEach((title) => onToggleMeal?.(currentDateStr, title));
    clearFocus();
  };

  return (
    <TouchableWithoutFeedback onPress={clearFocus} accessible={false}>
      <View style={styles.container}>
        <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
          <Modal
            visible={celebrationVisible}
            animationType="fade"
            transparent
            onRequestClose={closeCelebration}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>🎉 Congrats!</Text>
                <Text style={styles.modalSubtitle}>You crushed every assignment for {completionDateLabel}.</Text>
                <Text style={styles.modalSectionLabel}>Next session will be ready in a moment.</Text>
                <TouchableOpacity style={styles.modalButton} onPress={closeCelebration}>
                  <Text style={styles.modalButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <ScrollView
            contentContainerStyle={styles.dashboardContent}
            onScrollBeginDrag={clearFocus}
            keyboardShouldPersistTaps="handled"
          >
          <View style={styles.dashboardHeader}>
            <View>
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
            {phase && onProfilePress && (
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

          {(canLogWorkouts || canLogMeals) && (
            <TouchableOpacity
              style={[styles.bulkButton, !hasPendingLogs && styles.bulkButtonDisabled]}
              onPress={markEverythingDone}
              disabled={!hasPendingLogs}
              activeOpacity={0.85}
            >
              <Text style={styles.bulkButtonText}>Mark everything done</Text>
              <Text style={styles.bulkButtonMeta}>
                {hasPendingLogs
                  ? `${pendingWorkoutNames.length} workouts · ${pendingMealTitles.length} meals remaining`
                  : 'All workouts and meals logged'}
              </Text>
            </TouchableOpacity>
          )}

          {showCompletionSummary && (
            <View style={styles.completionCard}>
              <Text style={styles.completionTitle}>Logged · {completionDateLabel}</Text>
              <Text style={styles.completionMeta}>
                Workouts {completedWorkoutCount}/{totalWorkoutCount} · Meals {completedMealCount}/{totalMealCount}
              </Text>
              <Text style={styles.completionHint}>
                Relax! Your next session will auto-populate once you close the celebration modal.
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>{dayLabel} · {weekdayLabel}, {dateLabel}</Text>
                <Text style={styles.sectionTitle}>{workoutSummary}</Text>
                <Text style={styles.sectionSubtitle}>{focusDescription}</Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={WORKOUT_CARD_WIDTH + 20}
              decelerationRate="fast"
              contentContainerStyle={styles.horizontalScroller}
              onScrollBeginDrag={() => setFocusedExercise(null)}
            >
              {(visibleExercises.length ? visibleExercises : enhancedExercises).map((exercise, index) => (
                <TouchableOpacity
                  key={exercise.name}
                  activeOpacity={0.9}
                  style={styles.exerciseCardWrapper}
                  onPress={() => handleExercisePress(exercise.name)}
                  >
                  <LinearGradient
                    colors={
                      focusedExercise === exercise.name ? ['#0BA360', '#3CBA92'] : ['#1C1F3F', '#101329']
                    }
                    style={styles.exerciseCard}
                  >
                    <View style={styles.exerciseCardHeader}>
                      <Text style={styles.exerciseBadge}>#{index + 1}</Text>
                      <Text style={styles.exerciseMuscles}>
                        {formatBodyPartList(exercise.bodyParts)}
                      </Text>
                    </View>
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
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
                      {canLogWorkouts
                        ? 'Tap to queue completion'
                        : 'Preview · start your arc to log'}
                    </Text>
                    {canLogWorkouts && focusedExercise === exercise.name && (
                      <View style={styles.overlayRow}>
                        <TouchableOpacity
                          style={styles.overlayButton}
                          onPress={() => confirmExerciseComplete(exercise.name)}
                        >
                          <Text style={styles.overlayButtonText}>Confirm done</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>Nutrition · {dietGuide.label}</Text>
                <Text style={styles.sectionTitle}>Meals for your goal</Text>
                <Text style={styles.sectionSubtitle}>{dietGuide.description}</Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={MEAL_CARD_WIDTH + 16}
              decelerationRate="fast"
              contentContainerStyle={styles.mealCarousel}
              onScrollBeginDrag={() => setFocusedMeal(null)}
            >
              {visibleMeals.length === 0 && canLogMeals ? (
                <View style={[styles.summaryCard, styles.summaryCardMeal]}>
                  <Text style={styles.summaryTitle}>Meals logged</Text>
                  <Text style={styles.summaryMeta}>
                    {totalMealCount} meals · {totalMealItems} items
                  </Text>
                  <Text style={styles.summaryHint} numberOfLines={2}>
                    {mealTitlePreview}
                  </Text>
                </View>
              ) : (
                visibleMeals.map((meal) => (
                <TouchableOpacity
                  key={meal.title}
                  style={styles.mealCardWrapper}
                  activeOpacity={0.9}
                  onPress={() => handleMealPress(meal.title)}
                >
                  <LinearGradient
                    colors={
                      focusedMeal === meal.title ? ['#16302F', '#10201F'] : ['#1F2A44', '#11152A']
                    }
                    style={styles.mealCard}
                  >
                    <View style={styles.mealHeaderRow}>
                      <Text style={styles.mealEmoji}>{getMealEmoji(meal.title)}</Text>
                      <View style={styles.mealCheckbox}>
                        {focusedMeal === meal.title && canLogMeals && (
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
                      {canLogMeals ? 'Tap to queue log' : 'Preview · log once you start'}
                    </Text>
                    {canLogMeals && focusedMeal === meal.title && (
                      <View style={styles.overlayRow}>
                        <TouchableOpacity
                          style={styles.overlayButton}
                          onPress={() => confirmMealLogged(meal.title)}
                        >
                          <Text style={styles.overlayButtonText}>Confirm done</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>

        </ScrollView>
        </LinearGradient>
      </View>
    </TouchableWithoutFeedback>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 9, 25, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: '#151932',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    color: '#A0A3BD',
    fontSize: 14,
  },
  modalSectionLabel: {
    color: '#6C7CFF',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  modalButton: {
    marginTop: 4,
    backgroundColor: '#00F5A0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#051937',
    fontWeight: '700',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    gap: 24,
  },
  dashboardContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  greeting: {
    fontSize: 16,
    color: '#A0A3BD',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A3BD',
    lineHeight: 24,
  },
  profileCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  infoItem: {
    flex: 1,
    backgroundColor: '#1E2340',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: '#A0A3BD',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'capitalize',
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
  bulkButton: {
    backgroundColor: '#111638',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    marginBottom: 12,
  },
  bulkButtonDisabled: {
    opacity: 0.35,
  },
  bulkButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 4,
  },
  bulkButtonMeta: {
    fontSize: 13,
    color: '#A0A3BD',
  },
  completionCard: {
    backgroundColor: '#111638',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    marginBottom: 12,
    gap: 8,
  },
  completionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  completionMeta: {
    color: '#A0A3BD',
    fontSize: 13,
  },
  completionHint: {
    color: '#7C82B5',
    fontSize: 12,
    lineHeight: 18,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  smallLabel: {
    fontSize: 12,
    color: '#A0A3BD',
    marginBottom: 4,
  },
  dashboardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  sectionEyebrow: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#6C7CFF',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#A0A3BD',
    marginTop: 4,
  },
  horizontalScroller: {
    paddingVertical: 4,
    paddingRight: 20,
  },
  exerciseCardWrapper: {
    width: WORKOUT_CARD_WIDTH,
    marginRight: 16,
  },
  exerciseCard: {
    borderRadius: 24,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  exerciseMuscles: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    textAlign: 'right',
  },
  exerciseName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
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
    color: 'rgba(255,255,255,0.6)',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  barCellActive: {
    backgroundColor: '#00F5A0',
  },
  exerciseStatus: {
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  overlayRow: {
    marginTop: 12,
    alignItems: 'flex-start',
  },
  overlayButton: {
    backgroundColor: '#00F5A0',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  overlayButtonText: {
    color: '#051937',
    fontWeight: '700',
    fontSize: 13,
  },
  summaryCard: {
    width: WORKOUT_CARD_WIDTH,
    marginRight: 16,
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#121633',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    gap: 6,
  },
  summaryCardMeal: {
    width: MEAL_CARD_WIDTH,
  },
  summaryTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  summaryMeta: {
    color: '#A0A3BD',
    fontSize: 13,
  },
  summaryHint: {
    color: '#7C82B5',
    fontSize: 12,
  },
  mealCarousel: {
    paddingVertical: 4,
    paddingRight: 20,
  },
  mealCardWrapper: {
    width: MEAL_CARD_WIDTH,
    marginRight: 16,
  },
  mealCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    gap: 10,
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
  },
  mealCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealCheckboxMark: {
    color: '#0A0E27',
    fontWeight: '700',
  },
  mealStatusText: {
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
});
