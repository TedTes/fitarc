import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DailyMealPlan, PhasePlan, User } from '../types/domain';
import weeklyPlanTemplate from '../data/weeklyPlanTemplate.json';
import { createMealPlanForDate } from '../utils/dietPlanner';

type TemplateEntry = typeof weeklyPlanTemplate[number];

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
  mealPlans: DailyMealPlan[];
  onRegenerateMealPlan?: (date: string) => void;
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

const SCREEN_GRADIENT = ['#0A0E27', '#151932', '#1E2340'];
const CARD_GRADIENT = {
  today: ['#2A2F5A', '#1D2245'],
  default: ['#1B233F', '#101529'],
};
const ACCENT_COLOR = '#6C63FF';
const ACCENT_GLOW = 'rgba(108, 99, 255, 0.2)';
const ACCENT_DARK = '#0A0E27';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CARD_WIDTH = SCREEN_WIDTH - 40;

export const MenuScreen: React.FC<MenuScreenProps> = ({
  user,
  phase,
  mealPlans,
  onRegenerateMealPlan,
}) => {
  const templateDays = weeklyPlanTemplate as TemplateEntry[];
  const today = new Date();
  const todayKey = today.toISOString().split('T')[0];

  const getMealsForDate = (dateStr: string) => {
    if (!phase) return null;
    const stored = mealPlans.find(
      (plan) => plan.phasePlanId === phase.id && plan.date === dateStr
    );
    if (stored && stored.meals.length) {
      return stored.meals;
    }
    return createMealPlanForDate(user, phase.id, dateStr).meals;
  };

  const weeklyMenus = useMemo(() => {
    const anchor = new Date(todayKey);
    return Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + idx);
      const dateStr = date.toISOString().split('T')[0];
      const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
      const displayDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const isToday = dateStr === todayKey;
      const templateEntry = templateDays[idx % templateDays.length];
      const meals =
        getMealsForDate(dateStr) ||
        (templateEntry?.meals.map((meal) => ({
          title: meal.title,
          items: meal.items,
          completed: false,
        })) ?? []);
      return {
        dateStr,
        weekday,
        displayDate,
        label: `${weekday}, ${displayDate}`,
        templateLabel: templateEntry?.label || `Day ${idx + 1}`,
        isToday,
        meals,
      };
    });
  }, [todayKey, mealPlans, phase?.id, user, templateDays]);

  const macroTargets = MACRO_TARGETS[user.eatingMode];

  // Calculate total meals and completed meals in week
  const totalMeals = weeklyMenus.reduce((sum, plan) => sum + plan.meals.length, 0);
  const completedMeals = weeklyMenus.reduce(
    (sum, plan) => sum + plan.meals.filter(m => m.completed).length,
    0
  );

  if (!phase) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={styles.emptyTitle}>No Active Meal Plan</Text>
            <Text style={styles.emptySubtitle}>
              Complete onboarding to generate your personalized nutrition plan
            </Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
        {/* ✨ MINIMAL: Compact Header with Macros */}
        <View style={styles.pageHeader}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.pageTitle}>Menu</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.weekStatsValue}>{completedMeals}/{totalMeals}</Text>
            </View>
          </View>
          
          {/* ✨ MACROS IN HEADER */}
          <View style={styles.macrosHeader}>
            <View style={styles.macroHeaderItem}>
              <Text style={styles.macroHeaderValue}>{macroTargets.calories}</Text>
              <Text style={styles.macroHeaderLabel}>kcal</Text>
            </View>
            <View style={styles.macroHeaderDivider} />
            <View style={styles.macroHeaderItem}>
              <Text style={styles.macroHeaderValue}>{macroTargets.protein}g</Text>
              <Text style={styles.macroHeaderLabel}>Protein</Text>
            </View>
            <View style={styles.macroHeaderDivider} />
            <View style={styles.macroHeaderItem}>
              <Text style={styles.macroHeaderValue}>{macroTargets.carbs}g</Text>
              <Text style={styles.macroHeaderLabel}>Carbs</Text>
            </View>
            <View style={styles.macroHeaderDivider} />
            <View style={styles.macroHeaderItem}>
              <Text style={styles.macroHeaderValue}>{macroTargets.fats}g</Text>
              <Text style={styles.macroHeaderLabel}>Fats</Text>
            </View>
          </View>
        </View>

        {/* ✨ HORIZONTAL SCROLLING Meal Cards */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroller}
          snapToInterval={CARD_WIDTH + 20}
          decelerationRate="fast"
        >
          {weeklyMenus.map((plan) => {
            const mealsDone = plan.meals.every((meal) => meal.completed);
            const mealProgress = plan.meals.length > 0
              ? plan.meals.filter(m => m.completed).length / plan.meals.length
              : 0;
            
            return (
              <LinearGradient
                key={`menu-${plan.dateStr}`}
                colors={plan.isToday ? CARD_GRADIENT.today : CARD_GRADIENT.default}
                style={[
                  styles.mealCard,
                  plan.isToday && styles.mealCardToday,
                ]}
              >
                {/* ✨ MINIMAL: Card Header (date + badge only) */}
                <View style={styles.cardHeader}>
                  <Text style={styles.cardDate}>{plan.label}</Text>
                  {plan.isToday && (
                    <View style={styles.todayBadge}>
                      <View style={styles.todayDot} />
                      <Text style={styles.todayBadgeText}>TODAY</Text>
                    </View>
                  )}
                  {mealsDone && !plan.isToday && (
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneBadgeText}>✓</Text>
                    </View>
                  )}
                </View>

                {/* Progress Bar */}
                {mealProgress > 0 && (
                  <View style={styles.progressBarContainer}>
                    <View style={styles.progressBarTrack}>
                      <View 
                        style={[
                          styles.progressBarFill,
                          { width: `${mealProgress * 100}%` }
                        ]} 
                      />
                    </View>
                    <Text style={styles.progressBarText}>
                      {Math.round(mealProgress * 100)}%
                    </Text>
                  </View>
                )}

                {/* ✨ DYNAMIC/FLEXIBLE: Scrollable Meal List */}
                <ScrollView 
                  style={styles.cardScrollContent}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.cardScrollContentInner}
                >
                  {/* Meal Details List */}
                  <View style={styles.mealDetailsList}>
                    {plan.meals.map((meal, idx) => (
                      <View key={`${meal.title}-${idx}`} style={styles.mealDetailCard}>
                        {/* Meal Header */}
                        <View style={styles.mealDetailHeader}>
                          <View style={styles.mealIconBox}>
                            <Text style={styles.mealIcon}>{getMealEmoji(meal.title)}</Text>
                          </View>
                          <View style={styles.mealDetailHeaderText}>
                            <Text style={styles.mealDetailTitle}>{meal.title}</Text>
                            <Text style={styles.mealDetailMeta}>{meal.items.length} items</Text>
                          </View>
                          <View style={[
                            styles.mealCheckbox,
                            meal.completed && styles.mealCheckboxComplete
                          ]}>
                            {meal.completed && (
                              <Text style={styles.mealCheckboxCheck}>✓</Text>
                            )}
                          </View>
                        </View>
                        
                        {/* Meal Items */}
                        <View style={styles.mealItemsList}>
                          {meal.items.map((item, itemIdx) => (
                            <View key={`${item}-${itemIdx}`} style={styles.mealItemRow}>
                              <View style={styles.mealItemBullet} />
                              <Text style={styles.mealItemText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Action Button */}
                  <TouchableOpacity
                    style={styles.cardActionButton}
                    onPress={() => onRegenerateMealPlan?.(plan.dateStr)}
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

const MEAL_EMOJIS: Record<string, string> = {
  breakfast: '🌅',
  lunch: '🌞',
  dinner: '🌙',
  snack: '🥑',
};

const getMealEmoji = (title: string): string => {
  const key = title.toLowerCase();
  return MEAL_EMOJIS[key] || '🍽️';
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  gradient: {
    flex: 1,
  },
  
  // ✨ COMPACT: Minimal Header with Macros
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
    color: ACCENT_COLOR,
  },

  // ✨ NEW: Macros in Header
  macrosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151932',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  macroHeaderItem: {
    flex: 1,
    alignItems: 'center',
  },
  macroHeaderValue: {
    fontSize: 16,
    fontWeight: '700',
    color: ACCENT_COLOR,
    marginBottom: 2,
  },
  macroHeaderLabel: {
    fontSize: 10,
    color: '#A0A3BD',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  macroHeaderDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#2A2F4F',
  },

  // Horizontal Scroller
  horizontalScroller: {
    paddingHorizontal: 20,
    gap: 20,
    paddingBottom: 20,
  },
  
  // ✨ IMPROVED: Full-Height Meal Cards
  mealCard: {
    width: CARD_WIDTH,
    height: SCREEN_HEIGHT - 170, // ✨ MAXIMUM HEIGHT
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  mealCardToday: {
    borderColor: ACCENT_GLOW,
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
    backgroundColor: ACCENT_GLOW,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT_COLOR,
  },
  todayBadgeText: {
    color: ACCENT_COLOR,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  doneBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACCENT_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBadgeText: {
    color: ACCENT_DARK,
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
    backgroundColor: ACCENT_COLOR,
    borderRadius: 3,
  },
  progressBarText: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT_COLOR,
    minWidth: 36,
    textAlign: 'right',
  },

  // ✨ DYNAMIC: Flexible Scrollable Content
  cardScrollContent: {
    flex: 1, // ✨ Takes all remaining space
  },
  cardScrollContentInner: {
    paddingBottom: 20,
    gap: 12, // ✨ Flexible gap between meals
  },
  
  // Meal Details List
  mealDetailsList: {
    gap: 12, // ✨ Dynamic spacing
  },
  mealDetailCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  mealDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1E2340',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealIcon: {
    fontSize: 20,
  },
  mealDetailHeaderText: {
    flex: 1,
  },
  mealDetailTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  mealDetailMeta: {
    fontSize: 12,
    color: '#A0A3BD',
  },
  mealCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1E2340',
    borderWidth: 2,
    borderColor: '#2A2F4F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealCheckboxComplete: {
    backgroundColor: ACCENT_COLOR,
    borderColor: ACCENT_COLOR,
  },
  mealCheckboxCheck: {
    fontSize: 12,
    fontWeight: 'bold',
    color: ACCENT_DARK,
  },
  mealItemsList: {
    gap: 6,
  },
  mealItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealItemBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACCENT_COLOR,
  },
  mealItemText: {
    color: '#E3E6FF',
    fontSize: 13,
    flex: 1,
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

export default MenuScreen;
