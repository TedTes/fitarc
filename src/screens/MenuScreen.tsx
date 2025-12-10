import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
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
  mild_deficit: { calories: '2,200 kcal', protein: '185 g', carbs: '210 g', fats: '65 g' },
  recomp: { calories: '2,450 kcal', protein: '190 g', carbs: '240 g', fats: '70 g' },
  lean_bulk: { calories: '2,800 kcal', protein: '200 g', carbs: '280 g', fats: '80 g' },
  maintenance: { calories: '2,500 kcal', protein: '185 g', carbs: '250 g', fats: '75 g' },
};

export const MenuScreen: React.FC<MenuScreenProps> = ({
  user,
  phase,
  mealPlans,
  onRegenerateMealPlan,
}) => {
  const templateDays = weeklyPlanTemplate as TemplateEntry[];
  const today = new Date();
  const todayKey = today.toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayKey);

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
      const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
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
        label: `${weekday} · ${displayDate}`,
        templateLabel: templateEntry?.label || `Day ${idx + 1}`,
        isToday,
        meals,
      };
    });
  }, [todayKey, mealPlans, phase?.id, user, templateDays]);

  useEffect(() => {
    if (!weeklyMenus.length) return;
    const hasSelection = weeklyMenus.some((plan) => plan.dateStr === selectedDate);
    if (!hasSelection) {
      const fallback = weeklyMenus.find((plan) => plan.isToday) || weeklyMenus[0];
      if (fallback) {
        setSelectedDate(fallback.dateStr);
      }
    }
  }, [weeklyMenus, selectedDate]);

  const selectedPlan =
    weeklyMenus.find((plan) => plan.dateStr === selectedDate) ||
    weeklyMenus.find((plan) => plan.isToday) ||
    weeklyMenus[0] ||
    null;

  const mealsToRender = selectedPlan?.meals ?? [];

  const groceryItems = useMemo(() => {
    if (!selectedPlan) return [];
    const items = selectedPlan.meals.flatMap((meal) => meal.items);
    return Array.from(new Set(items));
  }, [selectedPlan]);

  const hasStoredSelectedPlan = !!mealPlans.find(
    (plan) => plan.phasePlanId === phase?.id && plan.date === selectedPlan?.dateStr
  );

  const isViewingToday = selectedPlan?.dateStr === todayKey;
  const sectionTitle = isViewingToday
    ? "Today's menu"
    : `${selectedPlan?.templateLabel || 'Menu'} menu`;
  const sectionSubtitle = hasStoredSelectedPlan
    ? 'Auto-generated from your phase'
    : 'Sample rotation from this phase';

  const macroTargets = MACRO_TARGETS[user.eatingMode];

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#06081A', '#0D1128', '#151932']} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerEyebrow}>Fuel plan</Text>
              <Text style={styles.headerTitle}>Menu</Text>
              <Text style={styles.headerSubtitle}>
                Dialed for {user.eatingMode.replace('_', ' ')}
              </Text>
            </View>
          </View>

          {/* ✨ ONLY: Weekly meal cards (removed duplicate day selector) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderSimple}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionLabel}>Weekly meals</Text>
                <Text style={styles.sectionTitle}>Preview your next 7 days</Text>
              </View>
              {onRegenerateMealPlan && selectedPlan && (
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => onRegenerateMealPlan(selectedPlan.dateStr)}
                >
                  <Text style={styles.linkButtonText}>↻ Refresh</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.weekScroller}
            >
              {weeklyMenus.map((plan) => {
                const mealsDone = plan.meals.every((meal) => meal.completed);
                const isSelected = plan.dateStr === selectedDate;
                return (
                  <TouchableOpacity
                    key={`menu-${plan.dateStr}`}
                    activeOpacity={0.85}
                    onPress={() => setSelectedDate(plan.dateStr)}
                  >
                    <LinearGradient
                      colors={plan.isToday ? ['#2A3F3A', '#1B2F2F'] : ['#1B2F2F', '#121D1D']}
                      style={[
                        styles.weekCard,
                        plan.isToday && styles.weekCardToday,
                        isSelected && styles.weekCardSelected,
                      ]}
                    >
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
                          <Text style={styles.weekCardCount}>{plan.meals.length} meals</Text>
                          {mealsDone && (
                            <View style={[styles.weekStatusPill, styles.weekStatusPillSuccess]}>
                              <Text style={[styles.weekStatusPillText, styles.weekStatusPillTextSuccess]}>
                                ✓ Logged
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.weekItemsContainer}>
                        {plan.meals.slice(0, 3).map((meal, idx) => (
                          <View key={`${meal.title}-${idx}`} style={styles.weekItemRow}>
                            <Text style={styles.mealEmoji}>{getMealEmoji(meal.title)}</Text>
                            <View style={styles.weekItemCopy}>
                              <Text style={styles.weekItemTitle} numberOfLines={1}>
                                {meal.title}
                              </Text>
                              <Text style={styles.weekItemMeta}>{meal.items.length} items</Text>
                            </View>
                          </View>
                        ))}
                        {plan.meals.length > 3 && (
                          <Text style={styles.weekMoreText}>
                            +{plan.meals.length - 3} more
                          </Text>
                        )}
                      </View>
                      {onRegenerateMealPlan && (
                        <TouchableOpacity
                          style={styles.weekButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            onRegenerateMealPlan(plan.dateStr);
                          }}
                        >
                          <Text style={styles.weekButtonText}>↻ Swap menu</Text>
                        </TouchableOpacity>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Macro Card */}
          <LinearGradient colors={['#1C2144', '#11152A']} style={styles.macroCard}>
            <View style={styles.macroHeader}>
              <View>
                <Text style={styles.macroEyebrow}>Daily targets</Text>
                <Text style={styles.macroTitle}>{macroTargets.calories}</Text>
              </View>
              <View style={styles.macroBadge}>
                <Text style={styles.macroBadgeText}>
                  {selectedPlan?.meals.length || 0} meals
                </Text>
              </View>
            </View>
            <View style={styles.macroGrid}>
              <View style={styles.macroItem}>
                <Text style={styles.macroLabel}>Protein</Text>
                <Text style={styles.macroValue}>{macroTargets.protein}</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={styles.macroLabel}>Carbs</Text>
                <Text style={styles.macroValue}>{macroTargets.carbs}</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={styles.macroLabel}>Fats</Text>
                <Text style={styles.macroValue}>{macroTargets.fats}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Today's Menu Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{sectionTitle}</Text>
              <Text style={styles.sectionSubtitle}>{sectionSubtitle}</Text>
            </View>

            <View style={styles.mealList}>
              {mealsToRender.map((meal, mealIndex) => (
                <LinearGradient
                  key={`${meal.title}-${mealIndex}`}
                  colors={['#1B233F', '#101529']}
                  style={styles.mealCard}
                >
                  <View style={styles.mealCardHeader}>
                    <Text style={styles.mealEmoji}>{getMealEmoji(meal.title)}</Text>
                    <Text style={styles.mealTitle}>{meal.title}</Text>
                  </View>
                  {meal.items.map((item, itemIndex) => (
                    <View key={`${item}-${itemIndex}`} style={styles.mealItemRow}>
                      <View style={styles.mealBullet} />
                      <Text style={styles.mealItemText}>{item}</Text>
                    </View>
                  ))}
                  <View style={styles.mealFooter}>
                    <Text style={styles.mealFooterLabel}>
                      {meal.items.length} items
                    </Text>
                    {meal.completed && <Text style={styles.mealFooterDone}>✓ Logged</Text>}
                  </View>
                </LinearGradient>
              ))}
            </View>
          </View>

          {/* Grocery List */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Grocery list</Text>
              <Text style={styles.sectionSubtitle}>Auto-built from this menu</Text>
            </View>
            <View style={styles.groceryGrid}>
              {groceryItems.map((item) => (
                <View key={item} style={styles.groceryPill}>
                  <Text style={styles.groceryText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
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
    backgroundColor: '#050814',
  },
  gradient: {
    flex: 1,
  },
  content: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
    gap: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerEyebrow: {
    color: '#6C7CFF',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    color: '#A0A3BD',
    fontSize: 14,
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: '#151A2E',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
  linkButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  linkButtonText: {
    color: '#6C63FF',
    fontWeight: '600',
  },
  weekScroller: {
    gap: 12,
    paddingVertical: 4,
  },
  weekCard: {
    width: 220,
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  weekCardToday: {
    borderColor: 'rgba(0, 245, 160, 0.3)',
  },
  weekCardSelected: {
    borderColor: '#6C63FF',
    borderWidth: 2,
  },
  weekCardHeader: {
    gap: 6,
  },
  weekCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekCardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
  },
  todayBadgeText: {
    color: '#00F5A0',
    fontSize: 10,
    fontWeight: '700',
  },
  weekCardLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
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
  weekItemCopy: {
    flex: 1,
  },
  weekItemTitle: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  weekItemMeta: {
    color: '#A0A3BD',
    fontSize: 12,
  },
  weekMoreText: {
    color: '#6C63FF',
    fontSize: 11,
    fontWeight: '600',
  },
  weekButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  weekButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  weekStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
  },
  weekStatusPillText: {
    color: '#6C63FF',
    fontSize: 11,
    fontWeight: '700',
  },
  weekStatusPillSuccess: {
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
  },
  weekStatusPillTextSuccess: {
    color: '#00F5A0',
  },
  macroCard: {
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  macroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  macroEyebrow: {
    color: '#A0A3BD',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  macroTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  macroBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  macroBadgeText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  macroGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroItem: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: 12,
    marginRight: 8,
  },
  macroLabel: {
    color: '#A0A3BD',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  macroValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: '#7C80A7',
    fontSize: 14,
  },
  mealList: {
    gap: 12,
  },
  mealCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 10,
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mealEmoji: {
    fontSize: 20,
  },
  mealTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
    backgroundColor: '#6C63FF',
  },
  mealItemText: {
    color: '#E3E6FF',
    fontSize: 14,
  },
  mealFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealFooterLabel: {
    color: '#A0A3BD',
    fontSize: 12,
  },
  mealFooterDone: {
    color: '#00F5A0',
    fontWeight: '700',
  },
  groceryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  groceryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  groceryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default MenuScreen;