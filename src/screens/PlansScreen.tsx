import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { User, PhasePlan, WorkoutSessionEntry } from '../types/domain';
import { createSessionForDate } from '../utils/workoutPlanner';

type PlansScreenProps = {
  user: User;
  phase: PhasePlan | null;
  workoutSessions: WorkoutSessionEntry[];
  onRegenerateWorkoutPlan?: (date: string) => void;
  onLoadTemplate?: () => void;
};

export const PlansScreen: React.FC<PlansScreenProps> = ({
  user,
  phase,
  workoutSessions,
  onRegenerateWorkoutPlan,
  onLoadTemplate,
}) => {
  const [detailPlan, setDetailPlan] = useState<{
    type: 'workout';
    label: string;
    entries: { title: string; meta: string; bodyParts?: string[] }[];
  } | null>(null);

  const [animationModal, setAnimationModal] = useState<{
    visible: boolean;
    exerciseName: string;
    muscleGroups: string;
  } | null>(null);

  const modalScale = useRef(new Animated.Value(0)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const animModalScale = useRef(new Animated.Value(0)).current;
  const animModalOpacity = useRef(new Animated.Value(0)).current;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  if (!phase) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏋️</Text>
            <Text style={styles.emptyTitle}>No Active Training Plan</Text>
            <Text style={styles.emptySubtitle}>
              Complete onboarding to generate your personalized workout schedule
            </Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  const getSessionForDate = (dateStr: string) => {
    const stored = workoutSessions.find(
      (session) => session.phasePlanId === phase.id && session.date === dateStr
    );
    if (stored && stored.exercises.length) return stored;
    return createSessionForDate(user, phase.id, dateStr);
  };

  const weekPlans = useMemo(() => {
    const anchor = new Date(todayStr);
    return Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + idx);
      const dateStr = date.toISOString().split('T')[0];
      const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
      const displayDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const isToday = dateStr === todayStr;
      return {
        date,
        dateStr,
        weekday,
        displayDate,
        label: `${weekday} · ${displayDate}`,
        isToday,
        workout: getSessionForDate(dateStr),
      };
    });
  }, [todayStr, workoutSessions, phase?.id, user]);

  const openDetail = (
    label: string,
    entries: { title: string; meta: string; bodyParts?: string[] }[]
  ) => {
    setDetailPlan({ type: 'workout', label, entries });
    
    Animated.parallel([
      Animated.spring(modalScale, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDetail = () => {
    Animated.parallel([
      Animated.timing(modalScale, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setDetailPlan(null);
      modalScale.setValue(0);
      modalOpacity.setValue(0);
    });
  };

  const openAnimationModal = (exerciseName: string, muscleGroups: string) => {
    setAnimationModal({ visible: true, exerciseName, muscleGroups });
    
    Animated.parallel([
      Animated.spring(animModalScale, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(animModalOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeAnimationModal = () => {
    Animated.parallel([
      Animated.timing(animModalScale, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(animModalOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setAnimationModal(null);
      animModalScale.setValue(0);
      animModalOpacity.setValue(0);
    });
  };

  const hasLoadedTemplateRef = useRef(false);

  useEffect(() => {
    if (!phase || !onLoadTemplate || hasLoadedTemplateRef.current) return;
    onLoadTemplate();
    hasLoadedTemplateRef.current = true;
  }, [phase, onLoadTemplate]);

  const totalExercises = weekPlans.reduce((sum, plan) => sum + plan.workout.exercises.length, 0);
  const completedExercises = weekPlans.reduce(
    (sum, plan) => sum + plan.workout.exercises.filter(e => e.completed).length,
    0
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
        {/* Animation Modal */}
        <Modal
          transparent
          visible={animationModal?.visible || false}
          animationType="none"
          onRequestClose={closeAnimationModal}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={closeAnimationModal}
            style={styles.animModalBackdrop}
          >
            <Animated.View
              style={[
                styles.animModalCard,
                {
                  opacity: animModalOpacity,
                  transform: [{ scale: animModalScale }],
                },
              ]}
            >
              <TouchableOpacity activeOpacity={1}>
                <View style={styles.animModalHeader}>
                  <View style={styles.animModalHeaderLeft}>
                    <Text style={styles.animModalTitle}>
                      {animationModal?.exerciseName}
                    </Text>
                    <Text style={styles.animModalSubtitle}>
                      {animationModal?.muscleGroups}
                    </Text>
                  </View>
                  <TouchableOpacity 
                    onPress={closeAnimationModal}
                    style={styles.animModalCloseButton}
                  >
                    <Text style={styles.animModalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.animationPlaceholder}>
                  <LinearGradient
                    colors={['#1E2340', '#151932']}
                    style={styles.animationPlaceholderGradient}
                  >
                    <View style={styles.stickFigurePlaceholder}>
                      <Text style={styles.placeholderIcon}>🏃</Text>
                      <Text style={styles.placeholderText}>Animation Preview</Text>
                      <Text style={styles.placeholderSubtext}>
                        Stick figure animation will appear here
                      </Text>
                    </View>
                  </LinearGradient>
                </View>

                <View style={styles.formTipsContainer}>
                  <Text style={styles.formTipsTitle}>Form Tips</Text>
                  <View style={styles.formTipsList}>
                    <View style={styles.formTipRow}>
                      <View style={styles.formTipBullet} />
                      <Text style={styles.formTipText}>Maintain proper posture throughout</Text>
                    </View>
                    <View style={styles.formTipRow}>
                      <View style={styles.formTipBullet} />
                      <Text style={styles.formTipText}>Control the movement, don't rush</Text>
                    </View>
                    <View style={styles.formTipRow}>
                      <View style={styles.formTipBullet} />
                      <Text style={styles.formTipText}>Breathe steadily through the exercise</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity 
                  style={styles.animModalButton} 
                  onPress={closeAnimationModal}
                >
                  <Text style={styles.animModalButtonText}>Got it</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Modal>

        {/* Detail Modal */}
        <Modal
          transparent
          visible={!!detailPlan}
          animationType="none"
          onRequestClose={closeDetail}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={closeDetail}
            style={styles.modalBackdrop}
          >
            <Animated.View
              style={[
                styles.modalCard,
                {
                  opacity: modalOpacity,
                  transform: [{ scale: modalScale }],
                },
              ]}
            >
              <TouchableOpacity activeOpacity={1}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderLeft}>
                    <Text style={styles.modalTitle}>{detailPlan?.label}</Text>
                    <Text style={styles.modalSubtitle}>
                      Tap any exercise to see form guide
                    </Text>
                  </View>
                  <TouchableOpacity 
                    onPress={closeDetail}
                    style={styles.modalCloseButton}
                  >
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                  {detailPlan?.entries.map((entry, idx) => (
                    <TouchableOpacity
                      key={`${entry.title}-${idx}`}
                      style={styles.modalRow}
                      onPress={() => {
                        const muscleGroups = entry.bodyParts?.join(' • ') || 'Full Body';
                        openAnimationModal(entry.title, muscleGroups);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.modalRowLeft}>
                        <View style={styles.modalBullet} />
                        <Text style={styles.modalRowTitle}>{entry.title}</Text>
                      </View>
                      <View style={styles.modalRowRight}>
                        <Text style={styles.modalRowMeta}>{entry.meta}</Text>
                        <Text style={styles.animationIcon}>🎬</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity style={styles.modalButton} onPress={closeDetail}>
                  <Text style={styles.modalButtonText}>Close</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Modal>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* ✨ IMPROVED: Compact Header with inline week overview */}
          <View style={styles.pageHeader}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <Text style={styles.pageTitle}>Workouts</Text>
                <Text style={styles.pageSubtitle}>
                  {user.trainingSplit.replace('_', ' ')} program
                </Text>
              </View>
              <View style={styles.headerRight}>
                <Text style={styles.weekStatsValue}>{completedExercises}/{totalExercises}</Text>
                <Text style={styles.weekStatsLabel}>This Week</Text>
              </View>
            </View>
            
            {/* ✨ COMPACT: Week dots inline */}
            <View style={styles.weekDotsInline}>
              {weekPlans.map((plan) => {
                const completionPercent = plan.workout.exercises.length > 0
                  ? plan.workout.exercises.filter(e => e.completed).length / plan.workout.exercises.length
                  : 0;
                const isComplete = completionPercent === 1;
                
                return (
                  <View key={plan.dateStr} style={styles.weekDotCompact}>
                    <View style={[
                      styles.weekDotCircleCompact,
                      plan.isToday && styles.weekDotTodayCompact,
                      isComplete && styles.weekDotCompleteCompact,
                    ]}>
                      {isComplete && <Text style={styles.weekDotCheckCompact}>✓</Text>}
                    </View>
                    <Text style={[
                      styles.weekDotLabelCompact,
                      plan.isToday && styles.weekDotLabelTodayCompact
                    ]}>
                      {plan.weekday.charAt(0)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ✨ IMPROVED: Weekly Workouts Section with TALLER cards */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>7-Day Plan</Text>
              <TouchableOpacity
                style={styles.regenerateButton}
                onPress={() => onRegenerateWorkoutPlan?.(todayStr)}
              >
                <Text style={styles.regenerateButtonText}>↻</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.workoutScroller}
              snapToInterval={290}
              decelerationRate="fast"
            >
              {weekPlans.map((plan) => {
                const totalSets = plan.workout.exercises.reduce((sum, e) => sum + (e.sets || 4), 0);
                const workoutDone = plan.workout.exercises.every((exercise) => exercise.completed);
                const workoutProgress = plan.workout.exercises.length > 0
                  ? plan.workout.exercises.filter(e => e.completed).length / plan.workout.exercises.length
                  : 0;
                
                return (
                  <TouchableOpacity
                    key={`workout-${plan.dateStr}`}
                    activeOpacity={0.85}
                    onPress={() =>
                      openDetail(
                        `${plan.weekday}, ${plan.displayDate}`,
                        plan.workout.exercises.map((exercise) => ({
                          title: exercise.name,
                          meta: `${exercise.sets} × ${exercise.reps}`,
                          bodyParts: exercise.bodyParts,
                        }))
                      )
                    }
                  >
                    <LinearGradient 
                      colors={plan.isToday ? ['#2A2F5A', '#1D2245'] : ['#1A1F3D', '#141832']} 
                      style={[
                        styles.workoutCard,
                        plan.isToday && styles.workoutCardToday
                      ]}
                    >
                      {/* Card Header */}
                      <View style={styles.cardHeader}>
                        <View style={styles.cardHeaderLeft}>
                          <Text style={styles.cardWeekday}>{plan.weekday}</Text>
                          <Text style={styles.cardDate}>{plan.displayDate}</Text>
                        </View>
                        {plan.isToday && (
                          <View style={styles.todayBadge}>
                            <View style={styles.todayDot} />
                            <Text style={styles.todayBadgeText}>NOW</Text>
                          </View>
                        )}
                        {workoutDone && !plan.isToday && (
                          <View style={styles.doneBadge}>
                            <Text style={styles.doneBadgeText}>✓</Text>
                          </View>
                        )}
                      </View>

                      {/* Progress Bar */}
                      {workoutProgress > 0 && (
                        <View style={styles.progressBarContainer}>
                          <View style={styles.progressBarTrack}>
                            <View 
                              style={[
                                styles.progressBarFill,
                                { width: `${workoutProgress * 100}%` }
                              ]} 
                            />
                          </View>
                          <Text style={styles.progressBarText}>
                            {Math.round(workoutProgress * 100)}%
                          </Text>
                        </View>
                      )}

                      {/* Workout Summary */}
                      <View style={styles.workoutSummary}>
                        <View style={styles.summaryBadge}>
                          <Text style={styles.summaryBadgeText}>
                            {plan.workout.exercises.length} exercises
                          </Text>
                        </View>
                        <View style={styles.summaryBadge}>
                          <Text style={styles.summaryBadgeText}>{totalSets} sets</Text>
                        </View>
                      </View>

                      {/* ✨ IMPROVED: Exercise List with GIF placeholders */}
                      <View style={styles.exerciseList}>
                        {plan.workout.exercises.slice(0, 5).map((exercise, idx) => (
                          <View 
                            key={`${exercise.name}-${idx}`} 
                            style={styles.exerciseRow}
                          >
                            {/* ✨ NEW: GIF Placeholder on left */}
                            <View style={styles.exerciseGifPlaceholder}>
                              <Text style={styles.gifPlaceholderIcon}>🎬</Text>
                            </View>
                            
                            <View style={styles.exerciseContent}>
                              <View style={styles.exerciseTopRow}>
                                <View style={[
                                  styles.exerciseBullet,
                                  exercise.completed && styles.exerciseBulletComplete
                                ]}>
                                  {exercise.completed && (
                                    <Text style={styles.exerciseBulletCheck}>✓</Text>
                                  )}
                                </View>
                                <View style={styles.exerciseInfo}>
                                  <Text 
                                    style={[
                                      styles.exerciseTitle,
                                      exercise.completed && styles.exerciseTitleComplete
                                    ]} 
                                    numberOfLines={1}
                                  >
                                    {exercise.name}
                                  </Text>
                                  <Text style={styles.exerciseMeta}>
                                    {exercise.sets} × {exercise.reps}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        ))}
                        {plan.workout.exercises.length > 5 && (
                          <Text style={styles.moreExercises}>
                            +{plan.workout.exercises.length - 5} more
                          </Text>
                        )}
                      </View>

                      {/* Action Button */}
                      <TouchableOpacity
                        style={styles.cardActionButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          onRegenerateWorkoutPlan?.(plan.dateStr);
                        }}
                      >
                        <Text style={styles.cardActionButtonText}>↻ Regenerate</Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    gap: 20,
  },
  
  // ✨ IMPROVED: Compact Header
  pageHeader: {
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  pageSubtitle: {
    color: '#A0A3BD',
    fontSize: 14,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  weekStatsValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#00F5A0',
  },
  weekStatsLabel: {
    fontSize: 10,
    color: '#A0A3BD',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  
  // ✨ COMPACT: Inline week dots
  weekDotsInline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#151932',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  weekDotCompact: {
    alignItems: 'center',
    gap: 6,
  },
  weekDotCircleCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E2340',
    borderWidth: 2,
    borderColor: '#2A2F4F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekDotTodayCompact: {
    borderColor: '#6C63FF',
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
  },
  weekDotCompleteCompact: {
    backgroundColor: '#00F5A0',
    borderColor: '#00F5A0',
  },
  weekDotCheckCompact: {
    color: '#0A0E27',
    fontSize: 14,
    fontWeight: 'bold',
  },
  weekDotLabelCompact: {
    fontSize: 10,
    color: '#A0A3BD',
    fontWeight: '600',
  },
  weekDotLabelTodayCompact: {
    color: '#6C63FF',
  },
  
  // Section
  section: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  regenerateButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  regenerateButtonText: {
    fontSize: 20,
    color: '#6C63FF',
  },
  
  // ✨ IMPROVED: TALLER Workout Cards
  workoutScroller: {
    gap: 16,
    paddingVertical: 4,
    paddingRight: 20,
  },
  workoutCard: {
    width: 290,       // Slightly wider
    minHeight: 480,   // ✨ TALLER: Increased from ~380px
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 14,
  },
  workoutCardToday: {
    borderColor: 'rgba(108, 99, 255, 0.5)',
    borderWidth: 2,
  },
  
  // Card Header
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardHeaderLeft: {
    gap: 2,
  },
  cardWeekday: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardDate: {
    fontSize: 13,
    color: '#A0A3BD',
  },
  todayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6C63FF',
  },
  todayBadgeText: {
    color: '#6C63FF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  doneBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00F5A0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBadgeText: {
    color: '#0A0E27',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Progress Bar
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#1E2340',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6C63FF',
    borderRadius: 3,
  },
  progressBarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6C63FF',
    minWidth: 36,
    textAlign: 'right',
  },
  
  // Workout Summary
  workoutSummary: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  summaryBadgeText: {
    fontSize: 11,
    color: '#A0A3BD',
    fontWeight: '600',
  },
  
  // ✨ IMPROVED: Exercise List with GIF placeholders
  exerciseList: {
    gap: 12,  // Increased gap for taller rows
    flex: 1,   // Take up remaining space
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  // ✨ NEW: GIF Placeholder
  exerciseGifPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#1E2340',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gifPlaceholderIcon: {
    fontSize: 24,
  },
  exerciseContent: {
    flex: 1,
  },
  exerciseTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  exerciseBullet: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1E2340',
    borderWidth: 2,
    borderColor: '#2A2F4F',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  exerciseBulletComplete: {
    backgroundColor: '#00F5A0',
    borderColor: '#00F5A0',
  },
  exerciseBulletCheck: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0A0E27',
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  exerciseTitleComplete: {
    color: '#A0A3BD',
  },
  exerciseMeta: {
    fontSize: 12,
    color: '#A0A3BD',
  },
  moreExercises: {
    fontSize: 11,
    color: '#6C63FF',
    fontWeight: '600',
    marginLeft: 66,  // Align with exercise titles (56px GIF + 10px gap)
    marginTop: 4,
  },
  
  // Card Action
  cardActionButton: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardActionButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  
  // Modals (abbreviated for space)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 20, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 20,
    backgroundColor: '#151932',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 16,
  },
  modalHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: '#A0A3BD',
    fontSize: 18,
    fontWeight: '600',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#A0A3BD',
    fontSize: 13,
  },
  modalList: {
    maxHeight: 400,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 8,
  },
  modalRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  modalRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6C63FF',
  },
  modalRowTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  modalRowMeta: {
    color: '#A0A3BD',
    fontSize: 12,
    fontWeight: '500',
  },
  animationIcon: {
    fontSize: 16,
  },
  modalButton: {
    marginTop: 16,
    alignSelf: 'stretch',
    borderRadius: 12,
    backgroundColor: '#6C63FF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  
  // Animation Modal
  animModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 20, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  animModalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    backgroundColor: '#151932',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    padding: 24,
  },
  animModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 16,
  },
  animModalHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  animModalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  animModalCloseText: {
    color: '#A0A3BD',
    fontSize: 18,
    fontWeight: '600',
  },
  animModalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  animModalSubtitle: {
    color: '#6C63FF',
    fontSize: 13,
    fontWeight: '600',
  },
  animationPlaceholder: {
    width: '100%',
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  animationPlaceholderGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2A2F4F',
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  stickFigurePlaceholder: {
    alignItems: 'center',
    gap: 12,
  },
  placeholderIcon: {
    fontSize: 64,
  },
  placeholderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  placeholderSubtext: {
    color: '#A0A3BD',
    fontSize: 12,
    textAlign: 'center',
  },
  formTipsContainer: {
    marginBottom: 20,
  },
  formTipsTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  formTipsList: {
    gap: 10,
  },
  formTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  formTipBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00F5A0',
    marginTop: 6,
  },
  formTipText: {
    flex: 1,
    color: '#E3E5FF',
    fontSize: 14,
    lineHeight: 20,
  },
  animModalButton: {
    borderRadius: 12,
    backgroundColor: '#6C63FF',
    paddingVertical: 14,
    alignItems: 'center',
  },
  animModalButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  
  // Empty State
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  emptyIcon: {
    fontSize: 64,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#A0A3BD',
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 15,
  },
});

export default PlansScreen;
