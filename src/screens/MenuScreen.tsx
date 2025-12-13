import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DailyMealPlan, PhasePlan, User } from '../types/domain';
import { useMealPlans } from '../hooks/useMealPlans';

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
  mealPlans: DailyMealPlan[];
};

type MacroTargets = {
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
};

const MACRO_TARGETS: Record<User['eatingMode'], MacroTargets> = {
  mild_deficit: { calories: '2,200', protein: '185', carbs: '210', fats: '65' },
  recomp: { calories: '2,450', protein: '190', carbs: '240', fats: '70' },
  lean_bulk: { calories: '2,800', protein: '200', carbs: '280', fats: '80' },
  maintenance: { calories: '2,500', protein: '185', carbs: '250', fats: '75' },
};

const SCREEN_GRADIENT = ['#0A0A0A', '#0E1014', '#14161C'] as const;
const COLORS = {
  bgPrimary: '#0A0A0A',
  card: '#1A1C21',
  elevated: '#1F2229',
  surface: '#15171D',
  textPrimary: '#FFFFFF',
  textSecondary: '#A3A7B7',
  textTertiary: '#6B6F7B',
  accent: '#6C63FF',
  accentDim: 'rgba(108,99,255,0.15)',
  accentGlow: 'rgba(108,99,255,0.2)',
  success: '#00F5A0',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
};

type WeeklyMenu = {
  dateStr: string;
  weekday: string;
  displayDate: string;
  isToday: boolean;
  meals: DailyMealPlan['meals'];
};

const formatDayLabel = (dateStr: string) => {
  const date = new Date(dateStr);
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
    day: date.getDate(),
  };
};

const getMealEmoji = (title: string): string => {
  const normalized = title.toLowerCase();
  if (normalized.includes('breakfast')) return '🌅';
  if (normalized.includes('lunch')) return '🌞';
  if (normalized.includes('dinner')) return '🌙';
  if (normalized.includes('snack')) return '🥑';
  return '🍽️';
};

export const MenuScreen: React.FC<MenuScreenProps> = ({ user, phase, mealPlans }) => {
  const today = new Date();
  const todayKey = today.toISOString().split('T')[0];
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 6);
  const endKey = endDate.toISOString().split('T')[0];

  const { mealPlansByDate } = useMealPlans(user.id, todayKey, endKey);
  const [selectedDate, setSelectedDate] = useState(todayKey);

  const getMealsForDate = (dateStr: string) => {
    if (!phase) return [];
    const remotePlan = mealPlansByDate[dateStr];
    const stored = remotePlan ?? mealPlans.find((plan) => plan.phasePlanId === phase.id && plan.date === dateStr);
    return stored?.meals ?? [];
  };

  const weeklyMenus: WeeklyMenu[] = useMemo(() => {
    const anchor = new Date(todayKey);
    return Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + idx);
      const dateStr = date.toISOString().split('T')[0];
      const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
      const displayDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return {
        dateStr,
        weekday,
        displayDate,
        isToday: dateStr === todayKey,
        meals: getMealsForDate(dateStr),
      };
    });
  }, [todayKey, mealPlansByDate, mealPlans, phase?.id]);

  useEffect(() => {
    if (!weeklyMenus.find((plan) => plan.dateStr === selectedDate)) {
      setSelectedDate(weeklyMenus[0]?.dateStr ?? todayKey);
    }
  }, [weeklyMenus, selectedDate, todayKey]);

  const selectedPlan = weeklyMenus.find((plan) => plan.dateStr === selectedDate) ?? weeklyMenus[0];
  const macroTargets = MACRO_TARGETS[user.eatingMode];

  const totalMeals = weeklyMenus.reduce((sum, plan) => sum + plan.meals.length, 0);
  const completedMeals = weeklyMenus.reduce(
    (sum, plan) => sum + plan.meals.filter((meal) => meal.completed).length,
    0
  );

  const selectedProgress = useMemo(() => {
    if (!selectedPlan) return { completed: 0, total: 0, ratio: 0 };
    const total = selectedPlan.meals.length;
    const completed = selectedPlan.meals.filter((meal) => meal.completed).length;
    return { completed, total, ratio: total ? completed / total : 0 };
  }, [selectedPlan]);

  if (!phase) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={styles.emptyTitle}>No Active Meal Plan</Text>
            <Text style={styles.emptySubtitle}>Complete onboarding to generate your personalized nutrition plan.</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  const renderMeals = () => {
    if (!selectedPlan || selectedPlan.meals.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardIcon}>🥗</Text>
          <Text style={styles.emptyCardTitle}>No meals logged</Text>
          <Text style={styles.emptyCardSubtitle}>Use the Plans tab to set up your nutrition for this day.</Text>
        </View>
      );
    }

    return (
      <View style={styles.mealsCard}>
        <View style={styles.progressRow}>
          <View style={styles.progressInfo}>
            <Text style={styles.progressLabel}>Today's meals</Text>
            <Text style={styles.progressValue}>
              {selectedProgress.completed}/{selectedProgress.total} completed
            </Text>
          </View>
          <View style={styles.progressChip}>
            <Text style={styles.progressChipText}>{Math.round(selectedProgress.ratio * 100)}%</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${selectedProgress.ratio * 100}%` }]} />
        </View>

        <View style={styles.mealList}>
          {selectedPlan.meals.map((meal, idx) => (
            <View key={`${meal.title}-${idx}`} style={styles.mealRow}>
              <View style={styles.mealIconBox}>
                <Text style={styles.mealIcon}>{getMealEmoji(meal.title)}</Text>
              </View>
              <View style={styles.mealInfo}>
                <Text style={styles.mealTitle}>{meal.title}</Text>
                <Text style={styles.mealMeta}>{meal.items.length} items</Text>
                <View style={styles.mealItems}>
                  {meal.items.map((item, itemIdx) => (
                    <Text key={`${item}-${itemIdx}`} style={styles.mealItemText}>
                      • {item}
                    </Text>
                  ))}
                </View>
              </View>
              <View style={[styles.mealStatus, meal.completed && styles.mealStatusDone]}>
                <Text style={[styles.mealStatusText, meal.completed && styles.mealStatusTextDone]}>
                  {meal.completed ? 'Done' : 'Pending'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
        <ScrollView
          stickyHeaderIndices={[0]}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.stickyHeader}>
            <View style={styles.headerTop}>
              <Text style={styles.headerTitle}>Menu</Text>
              <View style={styles.weekChip}>
                <Text style={styles.weekChipText}>
                  {completedMeals}/{totalMeals} meals this week
                </Text>
              </View>
            </View>
            <View style={styles.macroCard}>
              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{macroTargets.calories}</Text>
                <Text style={styles.macroLabel}>Calories</Text>
              </View>
              <View style={styles.macroDivider} />
              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{macroTargets.protein}g</Text>
                <Text style={styles.macroLabel}>Protein</Text>
              </View>
              <View style={styles.macroDivider} />
              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{macroTargets.carbs}g</Text>
                <Text style={styles.macroLabel}>Carbs</Text>
              </View>
              <View style={styles.macroDivider} />
              <View style={styles.macroItem}>
                <Text style={styles.macroValue}>{macroTargets.fats}g</Text>
                <Text style={styles.macroLabel}>Fats</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
              {weeklyMenus.map((plan) => {
                const { weekday, day } = formatDayLabel(plan.dateStr);
                const isActive = plan.dateStr === selectedDate;
                const hasMeals = plan.meals.length > 0;
                return (
                  <TouchableOpacity
                    key={plan.dateStr}
                    style={[styles.dayChip, isActive && styles.dayChipActive]}
                    onPress={() => setSelectedDate(plan.dateStr)}
                  >
                    <Text style={[styles.dayChipLabel, isActive && styles.dayChipLabelActive]}>{weekday}</Text>
                    <Text style={[styles.dayChipNumber, isActive && styles.dayChipNumberActive]}>{day}</Text>
                    <View style={[styles.dayStatusDot, hasMeals && styles.dayStatusDotVisible]} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.content}>
            <View style={styles.dayHeader}>
              <View>
                <Text style={styles.dayTitle}>
                  {selectedPlan
                    ? `${selectedPlan.weekday}, ${selectedPlan.displayDate}`
                    : 'No date selected'}
                </Text>
                <Text style={styles.daySubtitle}>
                  {selectedPlan?.meals.length ? `${selectedPlan.meals.length} planned meals` : 'No meals logged'}
                </Text>
              </View>
              {selectedPlan?.isToday && <View style={styles.todayBadge}><Text style={styles.todayBadgeText}>Today</Text></View>}
            </View>
            {renderMeals()}
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  stickyHeader: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 24,
    backgroundColor: COLORS.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -1,
  },
  weekChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.elevated,
    borderRadius: 20,
  },
  weekChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textTertiary,
  },
  macroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  macroItem: {
    flex: 1,
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.accent,
  },
  macroLabel: {
    fontSize: 11,
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  macroDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
  },
  weekStrip: {
    paddingVertical: 12,
    gap: 8,
  },
  dayChip: {
    minWidth: 52,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  dayChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  dayChipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textTertiary,
  },
  dayChipLabelActive: {
    color: COLORS.textPrimary,
  },
  dayChipNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  dayChipNumberActive: {
    color: COLORS.textPrimary,
  },
  dayStatusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.success,
    marginTop: 4,
    opacity: 0,
  },
  dayStatusDotVisible: {
    opacity: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  daySubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  todayBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.accentDim,
  },
  todayBadgeText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  mealsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressInfo: {
    gap: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressValue: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  progressChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  progressChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accent,
  },
  progressTrack: {
    marginTop: 12,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 4,
  },
  mealList: {
    marginTop: 16,
    gap: 12,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    backgroundColor: COLORS.elevated,
  },
  mealIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mealIcon: {
    fontSize: 22,
  },
  mealInfo: {
    flex: 1,
    gap: 6,
  },
  mealTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  mealMeta: {
    fontSize: 12,
    color: COLORS.textTertiary,
  },
  mealItems: {
    gap: 4,
  },
  mealItemText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  mealStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: 'flex-start',
  },
  mealStatusDone: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  mealStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textTertiary,
  },
  mealStatusTextDone: {
    color: COLORS.accent,
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyCardIcon: {
    fontSize: 48,
    color: COLORS.textPrimary,
    opacity: 0.3,
  },
  emptyCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  emptyCardSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  emptyIcon: {
    fontSize: 56,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptySubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default MenuScreen;
