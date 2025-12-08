import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  PhasePlan,
  WorkoutSessionEntry,
  DailyMealPlan,
  MuscleGroup,
} from '../types/domain';
import { createSessionForDate } from '../utils/workoutPlanner';
import { createMealPlanForDate } from '../utils/dietPlanner';
import { getBodyPartLabel } from '../utils';

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: '🌅',
  lunch: '🌞',
  snack: '🍎',
  dinner: '🌙',
};

const getMealEmoji = (title: string) => MEAL_EMOJIS[title.toLowerCase()] || '🍽️';

const formatBodyParts = (parts?: MuscleGroup[]) =>
  parts && parts.length ? parts.map((part) => getBodyPartLabel(part)).join(' • ') : 'Full body focus';

type PlansScreenProps = {
  user: User;
  phase: PhasePlan | null;
  workoutSessions: WorkoutSessionEntry[];
  mealPlans: DailyMealPlan[];
  onToggleWorkoutExercise?: (date: string, exerciseName: string) => void;
  onReorderWorkoutExercise?: (date: string, from: number, to: number) => void;
  onRegenerateWorkoutPlan?: (date: string) => void;
  onToggleMeal?: (date: string, mealTitle: string) => void;
  onRegenerateMealPlan?: (date: string) => void;
};

export const PlansScreen: React.FC<PlansScreenProps> = ({
  user,
  phase,
  workoutSessions,
  mealPlans,
  onToggleWorkoutExercise,
  onReorderWorkoutExercise,
  onRegenerateWorkoutPlan,
  onToggleMeal,
  onRegenerateMealPlan,
}) => {
  const [expandedSection, setExpandedSection] = useState<'workout' | 'meal' | null>('workout');
  const toggleSection = (section: 'workout' | 'meal') => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

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

  const storedSession = workoutSessions.find(
    (session) => session.phasePlanId === phase.id && session.date === todayStr
  );
  const todaySession =
    storedSession && storedSession.exercises.length
      ? storedSession
      : createSessionForDate(user, phase.id, todayStr);

  const storedPlan = mealPlans.find(
    (plan) => plan.phasePlanId === phase.id && plan.date === todayStr
  );
  const todayMealPlan =
    storedPlan && storedPlan.meals.length
      ? storedPlan
      : createMealPlanForDate(user, phase.id, todayStr);

  const handleMove = (from: number, direction: number) => {
    const to = from + direction;
    if (to < 0 || to >= todaySession.exercises.length) return;
    onReorderWorkoutExercise?.(todayStr, from, to);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.pageTitle}>Plans</Text>
          <Text style={styles.pageSubtitle}>
            Fine-tune today's prescriptions. Reorder moves or refresh the entire plan.
          </Text>

          <View style={styles.summaryRow}>
            <LinearGradient colors={['#232956', '#1B1F41']} style={[styles.summaryCard, styles.summaryCardAccent]}
            >
              <Text style={styles.summaryLabel}>Workouts</Text>
              <Text style={styles.summaryValue}>{todaySession.exercises.length}</Text>
              <Text style={styles.summaryHint}>movements queued</Text>
              <TouchableOpacity
                style={styles.summaryButton}
                onPress={() => onRegenerateWorkoutPlan?.(todayStr)}
              >
                <Text style={styles.summaryButtonText}>↻ Refresh set</Text>
              </TouchableOpacity>
            </LinearGradient>
            <LinearGradient colors={['#1F3B2F', '#172923']} style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Meals</Text>
              <Text style={styles.summaryValue}>{todayMealPlan.meals.length}</Text>
              <Text style={styles.summaryHint}>plates planned</Text>
              <TouchableOpacity
                style={styles.summaryButton}
                onPress={() => onRegenerateMealPlan?.(todayStr)}
              >
                <Text style={styles.summaryButtonText}>↻ Refresh menu</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>

          <View style={styles.sectionCard}>
            <TouchableOpacity
              style={styles.sectionHeader}
              activeOpacity={0.8}
              onPress={() => toggleSection('workout')}
            >
              <View>
                <Text style={styles.sectionLabel}>Workout Plan</Text>
                <Text style={styles.sectionTitle}>
                  {todaySession.exercises.length} movements · {today.toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => onRegenerateWorkoutPlan?.(todayStr)}
                >
                  <Text style={styles.linkButtonText}>Regenerate</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.sectionChevron}>
                {expandedSection === 'workout' ? '−' : '+'}
              </Text>
            </TouchableOpacity>

            {expandedSection === 'workout' && (
              <View style={styles.planGrid}>
            {todaySession.exercises.map((exercise, index) => {
              const bodyPartLabel = formatBodyParts(exercise.bodyParts as MuscleGroup[] | undefined);
              return (
                <LinearGradient
                  key={exercise.name}
                  colors={['#1D2245', '#151B34']}
                  style={styles.planRow}
                >
                  <View style={styles.planRowHeader}>
                    <View style={styles.planBadge}>
                      <Text style={styles.planBadgeText}>#{index + 1}</Text>
                    </View>
                    <View style={styles.planRowContent}>
                      <Text style={styles.planRowTitle}>{exercise.name}</Text>
                      <Text style={styles.planRowDetail}>
                        {exercise.sets} sets · {exercise.reps}
                      </Text>
                      <Text style={styles.planRowMeta}>{bodyPartLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.planRowFooter}>
                    <Text style={styles.planRowHint}>Complete from Home</Text>
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        style={styles.moveButton}
                        onPress={() => handleMove(index, -1)}
                      >
                        <Text style={styles.moveButtonText}>↑</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.moveButton}
                        onPress={() => handleMove(index, 1)}
                      >
                        <Text style={styles.moveButtonText}>↓</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </LinearGradient>
              );
            })}
              </View>
            )}
          </View>

          <View style={styles.sectionCard}>
            <TouchableOpacity
              style={styles.sectionHeader}
              activeOpacity={0.8}
              onPress={() => toggleSection('meal')}
            >
              <View>
                <Text style={styles.sectionLabel}>Meal Plan</Text>
                <Text style={styles.sectionTitle}>
                  {todayMealPlan.meals.length} meals · {user.eatingMode.replace('_', ' ')}
                </Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => onRegenerateMealPlan?.(todayStr)}
                >
                  <Text style={styles.linkButtonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.sectionChevron}>
                {expandedSection === 'meal' ? '−' : '+'}
              </Text>
            </TouchableOpacity>

            {expandedSection === 'meal' && (
              <View style={styles.planGrid}>
            {todayMealPlan.meals.map((meal) => (
              <LinearGradient
                key={meal.title}
                colors={['#1B2F2F', '#121D1D']}
                style={styles.planRow}
              >
                <View style={styles.planRowHeader}>
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{getMealEmoji(meal.title)}</Text>
                  </View>
                  <View style={styles.planRowContent}>
                    <Text style={styles.planRowTitle}>{meal.title}</Text>
                    <Text style={styles.planRowDetail}>{meal.items.join(' · ')}</Text>
                    <Text style={styles.planRowMeta}>{meal.items.length} components</Text>
                  </View>
                </View>
                <View style={styles.planRowFooter}>
                  <Text style={styles.planRowHint}>Log from Home</Text>
                </View>
              </LinearGradient>
            ))}
              </View>
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
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    gap: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  pageSubtitle: {
    color: '#A0A3BD',
    marginBottom: 16,
    lineHeight: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 4,
  },
  summaryCardAccent: {
    borderColor: 'rgba(108,99,255,0.3)',
  },
  summaryLabel: {
    color: '#A0A3BD',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryHint: {
    color: '#C6C7E0',
    fontSize: 12,
  },
  summaryButton: {
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  summaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  sectionCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  sectionLabel: {
    color: '#A0A3BD',
    fontSize: 12,
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionChevron: {
    fontSize: 20,
    color: '#A0A3BD',
  },
  planGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  planRow: {
    borderRadius: 12,
    padding: 12,
    flexDirection: 'column',
    gap: 12,
    flexBasis: '48%',
    flexGrow: 1,
  },
  planRowHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  planRowContent: {
    flex: 1,
    gap: 4,
  },
  planRowTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  planRowDetail: {
    color: '#A0A3BD',
    fontSize: 13,
  },
  planRowMeta: {
    color: '#6C7CFF',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  planRowHint: {
    color: '#6C7CFF',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  planRowFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#151B3C',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#272F5B',
  },
  planBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  moveButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moveButtonText: {
    color: '#A0A3BD',
    fontSize: 11,
  },
  linkButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  linkButtonText: {
    color: '#6C63FF',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#A0A3BD',
    textAlign: 'center',
    lineHeight: 20,
  },
});
