import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated,
  Dimensions,
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

const SCREEN_GRADIENT = ['#0A0E27', '#151932', '#1E2340'];

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CARD_WIDTH = SCREEN_WIDTH - 40;

export const PlansScreen: React.FC<PlansScreenProps> = ({
  user,
  phase,
  workoutSessions,
  onRegenerateWorkoutPlan,
  onLoadTemplate,
}) => {
  const [animationModal, setAnimationModal] = useState<{
    visible: boolean;
    exerciseName: string;
    muscleGroups: string;
  } | null>(null);

  const animModalScale = useRef(new Animated.Value(0)).current;
  const animModalOpacity = useRef(new Animated.Value(0)).current;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  if (!phase) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
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
      const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
      const displayDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const isToday = dateStr === todayStr;
      return {
        date,
        dateStr,
        weekday,
        displayDate,
        label: `${weekday}, ${displayDate}`,
        isToday,
        workout: getSessionForDate(dateStr),
      };
    });
  }, [todayStr, workoutSessions, phase?.id, user]);

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
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
        {/* ✨ Animation Modal */}
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

        {/* ✨ MINIMAL: Compact Header */}
        <View style={styles.pageHeader}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.pageTitle}>Workouts</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.weekStatsValue}>{completedExercises}/{totalExercises}</Text>
            </View>
          </View>
          
          {/* ✨ WORKOUT SPLIT IN HEADER */}
          <View style={styles.splitHeader}>
            <Text style={styles.splitHeaderText}>
              {user.trainingSplit.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Program
            </Text>
          </View>
        </View>

        {/* ✨ HORIZONTAL SCROLLING Full-Height Workout Cards */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroller}
          snapToInterval={CARD_WIDTH + 20}
          decelerationRate="fast"
        >
          {weekPlans.map((plan) => {
            const workoutDone = plan.workout.exercises.every((exercise) => exercise.completed);
            const workoutProgress = plan.workout.exercises.length > 0
              ? plan.workout.exercises.filter(e => e.completed).length / plan.workout.exercises.length
              : 0;
            const totalSets = plan.workout.exercises.reduce((sum, e) => sum + (e.sets || 4), 0);
            
            return (
              <LinearGradient
                key={`workout-${plan.dateStr}`}
                colors={plan.isToday ? ['#2A2F5A', '#1D2245'] : ['#1A1F3D', '#141832']}
                style={[
                  styles.workoutCard,
                  plan.isToday && styles.workoutCardToday,
                ]}
              >
                {/* ✨ MINIMAL: Card Header (just date) */}
                <View style={styles.cardHeader}>
                  <Text style={styles.cardDate}>{plan.label}</Text>
                  {plan.isToday && (
                    <View style={styles.todayBadge}>
                      <View style={styles.todayDot} />
                      <Text style={styles.todayBadgeText}>TODAY</Text>
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

                {/* ✨ DYNAMIC/FLEXIBLE: Scrollable Exercise List */}
                <ScrollView 
                  style={styles.cardScrollContent}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.cardScrollContentInner}
                >
                  {/* Exercise Details List */}
                  <View style={styles.exerciseDetailsList}>
                    {plan.workout.exercises.map((exercise, idx) => (
                      <TouchableOpacity
                        key={`${exercise.name}-${idx}`}
                        style={styles.exerciseDetailCard}
                        onPress={() => {
                          const muscleGroups = exercise.bodyParts?.join(' • ') || 'Full Body';
                          openAnimationModal(exercise.name, muscleGroups);
                        }}
                        activeOpacity={0.7}
                      >
                        {/* Exercise Header */}
                        <View style={styles.exerciseDetailHeader}>
                          <View style={styles.exerciseGifBox}>
                            <Text style={styles.exerciseGifIcon}>🎬</Text>
                          </View>
                          <View style={styles.exerciseDetailHeaderText}>
                            <Text style={[
                              styles.exerciseDetailTitle,
                              exercise.completed && styles.exerciseDetailTitleComplete
                            ]}>
                              {exercise.name}
                            </Text>
                            <Text style={styles.exerciseDetailMeta}>
                              {exercise.sets} sets × {exercise.reps} reps
                            </Text>
                          </View>
                          <View style={[
                            styles.exerciseCheckbox,
                            exercise.completed && styles.exerciseCheckboxComplete
                          ]}>
                            {exercise.completed && (
                              <Text style={styles.exerciseCheckboxCheck}>✓</Text>
                            )}
                          </View>
                        </View>
                        
                        {/* Muscle Groups */}
                        {exercise.bodyParts && exercise.bodyParts.length > 0 && (
                          <View style={styles.muscleTagsRow}>
                            {exercise.bodyParts.slice(0, 3).map((part, partIdx) => (
                              <View key={`${part}-${partIdx}`} style={styles.muscleTag}>
                                <Text style={styles.muscleTagText}>{part}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Action Button */}
                  <TouchableOpacity
                    style={styles.cardActionButton}
                    onPress={() => onRegenerateWorkoutPlan?.(plan.dateStr)}
                  >
                    <Text style={styles.cardActionButtonText}>↻ Regenerate Day</Text>
                  </TouchableOpacity>
                </ScrollView>
              </LinearGradient>
            );
          })}
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
  
  // ✨ COMPACT: Minimal Header
  pageHeader: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  weekStatsValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6C63FF',
  },

  // ✨ NEW: Split Info in Header
  splitHeader: {
    backgroundColor: '#151932',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    alignItems: 'center',
  },
  splitHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6C63FF',
    textTransform: 'capitalize',
  },

  // Horizontal Scroller
  horizontalScroller: {
    paddingHorizontal: 20,
    gap: 20,
    paddingBottom: 20,
  },
  
  // ✨ IMPROVED: Full-Height Workout Cards
  workoutCard: {
    width: CARD_WIDTH,
    height: SCREEN_HEIGHT - 170, // ✨ MAXIMUM HEIGHT
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  workoutCardToday: {
    borderColor: 'rgba(108, 99, 255, 0.5)',
    borderWidth: 2,
  },
  
  // ✨ MINIMAL: Card Header (just date)
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDate: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00F5A0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBadgeText: {
    color: '#0A0E27',
    fontSize: 14,
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

  // ✨ DYNAMIC: Flexible Scrollable Content
  cardScrollContent: {
    flex: 1, // ✨ Takes all remaining space
  },
  cardScrollContentInner: {
    paddingBottom: 20,
    gap: 12, // ✨ Flexible gap between exercises
  },
  
  // Exercise Details List
  exerciseDetailsList: {
    gap: 12, // ✨ Dynamic spacing
  },
  exerciseDetailCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  exerciseDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exerciseGifBox: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#1E2340',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseGifIcon: {
    fontSize: 24,
  },
  exerciseDetailHeaderText: {
    flex: 1,
  },
  exerciseDetailTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  exerciseDetailTitleComplete: {
    color: '#A0A3BD',
  },
  exerciseDetailMeta: {
    fontSize: 12,
    color: '#A0A3BD',
  },
  exerciseCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1E2340',
    borderWidth: 2,
    borderColor: '#2A2F4F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseCheckboxComplete: {
    backgroundColor: '#00F5A0',
    borderColor: '#00F5A0',
  },
  exerciseCheckboxCheck: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0A0E27',
  },
  muscleTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  muscleTag: {
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
  },
  muscleTagText: {
    fontSize: 10,
    color: '#6C63FF',
    fontWeight: '600',
  },
  
  // Card Action
  cardActionButton: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 8,
  },
  cardActionButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
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
