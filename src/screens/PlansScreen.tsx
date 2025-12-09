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
import { User, PhasePlan, WorkoutSessionEntry, DailyMealPlan } from '../types/domain';
import { createSessionForDate } from '../utils/workoutPlanner';
import { createMealPlanForDate } from '../utils/dietPlanner';

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: '🌅',
  lunch: '🌞',
  snack: '🍎',
  dinner: '🌙',
};

const getMealEmoji = (title: string) => MEAL_EMOJIS[title.toLowerCase()] || '🍽️';

type PlansScreenProps = {
  user: User;
  phase: PhasePlan | null;
  workoutSessions: WorkoutSessionEntry[];
  mealPlans: DailyMealPlan[];
  onRegenerateWorkoutPlan?: (date: string) => void;
  onRegenerateMealPlan?: (date: string) => void;
  onLoadTemplate?: () => void;
};

export const PlansScreen: React.FC<PlansScreenProps> = ({
  user,
  phase,
  workoutSessions,
  mealPlans,
  onRegenerateWorkoutPlan,
  onRegenerateMealPlan,
  onLoadTemplate,
}) => {
  const [detailPlan, setDetailPlan] = useState<
    | {
        type: 'workout' | 'meal';
        label: string;
        entries: { title: string; meta: string }[];
      }
    | null
  >(null);

  // Animation for modal
  const modalScale = useRef(new Animated.Value(0)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  if (!phase) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Plans unlock after onboarding</Text>
            <Text style={styles.emptySubtitle}>
              Finish selecting your current and target physique to customize workouts and meals.
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

  const getMealsForDate = (dateStr: string) => {
    const stored = mealPlans.find(
      (plan) => plan.phasePlanId === phase.id && plan.date === dateStr
    );
    if (stored && stored.meals.length) return stored;
    return createMealPlanForDate(user, phase.id, dateStr);
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
        label: `${weekday} · ${displayDate}`,
        isToday,
        workout: getSessionForDate(dateStr),
        meals: getMealsForDate(dateStr),
      };
    });
  }, [todayStr, workoutSessions, mealPlans, phase?.id, user]);

  const openDetail = (
    type: 'workout' | 'meal',
    label: string,
    entries: { title: string; meta: string }[]
  ) => {
    setDetailPlan({ type, label, entries });
    
    // Animate modal in
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
    // Animate modal out
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

  const hasLoadedTemplateRef = useRef(false);

  useEffect(() => {
    if (!phase || !onLoadTemplate || hasLoadedTemplateRef.current) return;
    onLoadTemplate();
    hasLoadedTemplateRef.current = true;
  }, [phase, onLoadTemplate]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
        {/* IMPROVED MODAL with smooth animations */}
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
                {/* Header with better spacing */}
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderLeft}>
                    <Text style={styles.modalTitle}>{detailPlan?.label}</Text>
                    <Text style={styles.modalSubtitle}>
                      {detailPlan?.type === 'workout'
                        ? 'Full session overview'
                        : 'Meal breakdown for the day'}
                    </Text>
                  </View>
                  <TouchableOpacity 
                    onPress={closeDetail}
                    style={styles.modalCloseButton}
                  >
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Scrollable content */}
                <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                  {detailPlan?.entries.map((entry, idx) => (
                    <View key={`${entry.title}-${idx}`} style={styles.modalRow}>
                      <View style={styles.modalRowLeft}>
                        <View style={styles.modalBullet} />
                        <Text style={styles.modalRowTitle}>{entry.title}</Text>
                      </View>
                      <Text style={styles.modalRowMeta}>{entry.meta}</Text>
                    </View>
                  ))}
                </ScrollView>

                {/* Action button */}
                <TouchableOpacity style={styles.modalButton} onPress={closeDetail}>
                  <Text style={styles.modalButtonText}>Got it</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Modal>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Page header with better hierarchy */}
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Plans</Text>
            <Text style={styles.pageSubtitle}>
              Fine-tune today's prescriptions. Reorder moves or refresh the entire plan.
            </Text>
          </View>

          {/* IMPROVED Weekly Workouts section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderSimple}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionLabel}>WEEKLY WORKOUTS</Text>
                <Text style={styles.sectionTitle}>Your seven-day training loop</Text>
              </View>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => onRegenerateWorkoutPlan?.(todayStr)}
              >
                <Text style={styles.linkButtonText}>↻ Regenerate</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.weekScroller}
            >
              {weekPlans.map((plan) => {
                const workoutDone = plan.workout.exercises.every((exercise) => exercise.completed);
                return (
                  <TouchableOpacity
                    key={`workout-${plan.dateStr}`}
                    activeOpacity={0.85}
                    onPress={() =>
                      openDetail(
                        'workout',
                        `${plan.label} · Workout`,
                        plan.workout.exercises.map((exercise) => ({
                          title: exercise.name,
                          meta: `${exercise.sets} × ${exercise.reps}`,
                        }))
                      )
                    }
                  >
                    <LinearGradient 
                      colors={plan.isToday ? ['#2A2F5A', '#1D2245'] : ['#1D2245', '#151B34']} 
                      style={[
                        styles.weekCard,
                        plan.isToday && styles.weekCardToday
                      ]}
                    >
                      {/* Card header */}
                      <View style={styles.weekCardHeader}>
                        <View style={styles.weekCardHeaderLeft}>
                          {plan.isToday && (
                            <View style={styles.todayBadge}>
                              <Text style={styles.todayBadgeText}>TODAY</Text>
                            </View>
                          )}
                          <Text style={styles.weekCardLabel}>{plan.label}</Text>
                        </View>
                        <View style={styles.weekCardHeaderRight}>
                          <Text style={styles.weekCardCount}>
                            {plan.workout.exercises.length} moves
                          </Text>
                          {workoutDone && (
                            <View style={styles.weekStatusPill}>
                              <Text style={styles.weekStatusPillText}>✓ Done</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Exercise preview */}
                      <View style={styles.weekItemsContainer}>
                        {plan.workout.exercises.slice(0, 3).map((exercise, idx) => (
                          <View key={`${exercise.name}-${idx}`} style={styles.weekItemRow}>
                            <View style={styles.weekBullet} />
                            <View style={styles.weekItemCopy}>
                              <Text style={styles.weekItemTitle} numberOfLines={1}>
                                {exercise.name}
                              </Text>
                              <Text style={styles.weekItemMeta}>
                                {exercise.sets} × {exercise.reps}
                              </Text>
                            </View>
                          </View>
                        ))}
                        {plan.workout.exercises.length > 3 && (
                          <Text style={styles.weekMoreText}>
                            +{plan.workout.exercises.length - 3} more
                          </Text>
                        )}
                        <View style={styles.mediaPlaceholder}>
                          <Text style={styles.mediaPlaceholderLabel}>Motion preview</Text>
                          <Text style={styles.mediaPlaceholderMeta}>Drop GIF/video when ready</Text>
                        </View>
                      </View>

                      {/* Action button */}
                      <TouchableOpacity
                        style={styles.weekButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          onRegenerateWorkoutPlan?.(plan.dateStr);
                        }}
                      >
                        <Text style={styles.weekButtonText}>↻ Shuffle day</Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* IMPROVED Weekly Meals section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderSimple}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionLabel}>WEEKLY MEALS</Text>
                <Text style={styles.sectionTitle}>
                  Dialed for {user.eatingMode.replace('_', ' ')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => onRegenerateMealPlan?.(todayStr)}
              >
                <Text style={styles.linkButtonText}>↻ Refresh</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.weekScroller}
            >
              {weekPlans.map((plan) => {
                const mealsDone = plan.meals.meals.every((meal) => meal.completed);
                return (
                  <TouchableOpacity
                    key={`meal-${plan.dateStr}`}
                    activeOpacity={0.85}
                    onPress={() =>
                      openDetail(
                        'meal',
                        `${plan.label} · Meals`,
                        plan.meals.meals.map((meal) => ({
                          title: `${getMealEmoji(meal.title)} ${meal.title}`,
                          meta: `${meal.items.length} items`,
                        }))
                      )
                    }
                  >
                    <LinearGradient 
                      colors={plan.isToday ? ['#2A3F3A', '#1B2F2F'] : ['#1B2F2F', '#121D1D']} 
                      style={[
                        styles.weekCard,
                        plan.isToday && styles.weekCardToday
                      ]}
                    >
                      {/* Card header */}
                      <View style={styles.weekCardHeader}>
                        <View style={styles.weekCardHeaderLeft}>
                          {plan.isToday && (
                            <View style={[styles.todayBadge, styles.todayBadgeMeal]}>
                              <Text style={styles.todayBadgeText}>TODAY</Text>
                            </View>
                          )}
                          <Text style={styles.weekCardLabel}>{plan.label}</Text>
                        </View>
                        <View style={styles.weekCardHeaderRight}>
                          <Text style={styles.weekCardCount}>
                            {plan.meals.meals.length} meals
                          </Text>
                          {mealsDone && (
                            <View style={[styles.weekStatusPill, styles.weekStatusPillSuccess]}>
                              <Text style={[styles.weekStatusPillText, styles.weekStatusPillTextSuccess]}>
                                ✓ Logged
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Meal preview */}
                      <View style={styles.weekItemsContainer}>
                        {plan.meals.meals.slice(0, 3).map((meal, idx) => (
                          <View key={`${meal.title}-${idx}`} style={styles.weekItemRow}>
                            <Text style={styles.mealEmoji}>{getMealEmoji(meal.title)}</Text>
                            <View style={styles.weekItemCopy}>
                              <Text style={styles.weekItemTitle} numberOfLines={1}>
                                {meal.title}
                              </Text>
                              <Text style={styles.weekItemMeta}>
                                {meal.items.length} items
                              </Text>
                            </View>
                          </View>
                        ))}
                        {plan.meals.meals.length > 3 && (
                          <Text style={styles.weekMoreText}>
                            +{plan.meals.meals.length - 3} more
                          </Text>
                        )}
                      </View>

                      {/* Action button */}
                      <TouchableOpacity
                        style={styles.weekButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          onRegenerateMealPlan?.(plan.dateStr);
                        }}
                      >
                        <Text style={styles.weekButtonText}>↻ Swap menu</Text>
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
  pageHeader: {
    gap: 8,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    color: '#A0A3BD',
    fontSize: 15,
    lineHeight: 22,
  },
  sectionCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    gap: 16,
  },
  sectionHeaderSimple: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  sectionHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  sectionLabel: {
    color: '#6C63FF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  weekScroller: {
    gap: 12,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  weekCard: {
    width: 240,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  weekCardToday: {
    borderColor: 'rgba(108, 99, 255, 0.4)',
    borderWidth: 1.5,
  },
  weekCardHeader: {
    gap: 8,
  },
  weekCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  weekCardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayBadge: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  todayBadgeMeal: {
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
  },
  todayBadgeText: {
    color: '#6C63FF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  weekCardLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  weekCardCount: {
    color: '#A0A3BD',
    fontSize: 12,
  },
  weekItemsContainer: {
    gap: 8,
  },
  weekItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weekBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6C63FF',
  },
  mealEmoji: {
    fontSize: 16,
    width: 20,
    textAlign: 'center',
  },
  weekItemCopy: {
    flex: 1,
  },
  weekItemTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  weekItemMeta: {
    color: '#A0A3BD',
    fontSize: 11,
  },
  weekMoreText: {
    color: '#6C63FF',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 16,
    marginTop: 4,
  },
  mediaPlaceholder: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  mediaPlaceholderLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 2,
  },
  mediaPlaceholderMeta: {
    color: '#8F93B6',
    fontSize: 11,
  },
  weekButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  weekButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  weekStatusPill: {
    borderRadius: 6,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  weekStatusPillText: {
    color: '#6C63FF',
    fontSize: 10,
    fontWeight: '700',
  },
  weekStatusPillSuccess: {
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
  },
  weekStatusPillTextSuccess: {
    color: '#00F5A0',
  },
  // IMPROVED MODAL STYLES
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
  linkButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
  },
  linkButtonText: {
    color: '#6C63FF',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
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
