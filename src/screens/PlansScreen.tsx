import React, { useMemo } from 'react';
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
  onRegenerateWorkoutPlan?: (date: string) => void;
  onRegenerateMealPlan?: (date: string) => void;
};

export const PlansScreen: React.FC<PlansScreenProps> = ({
  user,
  phase,
  workoutSessions,
  mealPlans,
  onRegenerateWorkoutPlan,
  onRegenerateMealPlan,
}) => {

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
      return {
        date,
        dateStr,
        label: `${weekday} · ${displayDate}`,
        workout: getSessionForDate(dateStr),
        meals: getMealsForDate(dateStr),
      };
    });
  }, [todayStr, workoutSessions, mealPlans, phase?.id, user]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.pageTitle}>Plans</Text>
          <Text style={styles.pageSubtitle}>
            Fine-tune today's prescriptions. Reorder moves or refresh the entire plan.
          </Text>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderSimple}>
              <View>
                <Text style={styles.sectionLabel}>Weekly Workouts</Text>
                <Text style={styles.sectionTitle}>Your seven-day training loop</Text>
              </View>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => onRegenerateWorkoutPlan?.(todayStr)}
              >
                <Text style={styles.linkButtonText}>Regenerate week</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.weekScroller}
            >
              {weekPlans.map((plan) => (
                <LinearGradient
                  key={`workout-${plan.dateStr}`}
                  colors={['#1D2245', '#151B34']}
                  style={styles.weekCard}
                >
                  <View style={styles.weekCardHeader}>
                    <Text style={styles.weekCardLabel}>{plan.label}</Text>
                    <Text style={styles.weekCardCount}>{plan.workout.exercises.length} moves</Text>
                  </View>
                  {plan.workout.exercises.slice(0, 3).map((exercise) => (
                    <View key={exercise.name} style={styles.weekItemRow}>
                      <View style={styles.weekBullet} />
                      <View style={styles.weekItemCopy}>
                        <Text style={styles.weekItemTitle}>{exercise.name}</Text>
                        <Text style={styles.weekItemMeta}>{exercise.sets} x {exercise.reps}</Text>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.weekButton}
                    onPress={() => onRegenerateWorkoutPlan?.(plan.dateStr)}
                  >
                    <Text style={styles.weekButtonText}>Shuffle day</Text>
                  </TouchableOpacity>
                </LinearGradient>
              ))}
            </ScrollView>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderSimple}>
              <View>
                <Text style={styles.sectionLabel}>Weekly Meals</Text>
                <Text style={styles.sectionTitle}>Dialed in for {user.eatingMode.replace('_', ' ')}</Text>
              </View>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => onRegenerateMealPlan?.(todayStr)}
              >
                <Text style={styles.linkButtonText}>Refresh menus</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.weekScroller}
            >
              {weekPlans.map((plan) => (
                <LinearGradient
                  key={`meal-${plan.dateStr}`}
                  colors={['#1B2F2F', '#121D1D']}
                  style={styles.weekCard}
                >
                  <View style={styles.weekCardHeader}>
                    <Text style={styles.weekCardLabel}>{plan.label}</Text>
                    <Text style={styles.weekCardCount}>{plan.meals.meals.length} meals</Text>
                  </View>
                  {plan.meals.meals.slice(0, 3).map((meal) => (
                    <View key={meal.title} style={styles.weekItemRow}>
                      <View style={styles.weekBullet} />
                      <View style={styles.weekItemCopy}>
                        <Text style={styles.weekItemTitle}>{meal.title}</Text>
                        <Text style={styles.weekItemMeta}>{meal.items.length} items</Text>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.weekButton}
                    onPress={() => onRegenerateMealPlan?.(plan.dateStr)}
                  >
                    <Text style={styles.weekButtonText}>Swap menu</Text>
                  </TouchableOpacity>
                </LinearGradient>
              ))}
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
    alignItems: 'center',
    gap: 12,
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
  weekScroller: {
    gap: 12,
    paddingVertical: 8,
  },
  weekCard: {
    width: 260,
    borderRadius: 18,
    padding: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  weekCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekCardLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  weekCardCount: {
    color: '#A0A3BD',
    fontSize: 12,
  },
  weekItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6C63FF',
  },
  weekItemCopy: {
    flex: 1,
  },
  weekItemTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  weekItemMeta: {
    color: '#A0A3BD',
    fontSize: 12,
  },
  weekButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  weekButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
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
