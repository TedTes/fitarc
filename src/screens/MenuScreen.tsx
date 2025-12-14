import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { DailyMealPlan, PhasePlan, User } from '../types/domain';
import { useMealPlans } from '../hooks/useMealPlans';
import { formatLocalDateYMD } from '../utils/date';
import { useTodayMeals } from '../hooks/useTodayMeals';
import { MealEntry } from '../services/supabaseMealService';

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
  mealPlans: DailyMealPlan[];
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

const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'] as const;

type WeeklyMenu = {
  dateStr: string;
  weekday: string;
  displayDate: string;
  isToday: boolean;
  meals: DailyMealPlan['meals'];
};

const parseLocalDateFromYMD = (dateStr: string) => {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);
  return new Date(year, month, day);
};

const formatDayLabel = (dateStr: string) => {
  const date = parseLocalDateFromYMD(dateStr);
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

const formatMealMacros = (entry: MealEntry): string => {
  const parts: string[] = [];
  if (typeof entry.calories === 'number') parts.push(`${entry.calories} kcal`);
  if (typeof entry.protein === 'number') parts.push(`${entry.protein}g P`);
  if (typeof entry.carbs === 'number') parts.push(`${entry.carbs}g C`);
  if (typeof entry.fats === 'number') parts.push(`${entry.fats}g F`);
  return parts.length ? parts.join(' · ') : 'Macros TBD';
};

export const MenuScreen: React.FC<MenuScreenProps> = ({ user, phase, mealPlans }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = formatLocalDateYMD(today);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 6);
  const endKey = formatLocalDateYMD(endDate);

  const { mealPlansByDate, refresh: refreshMealPlans } = useMealPlans(user.id, todayKey, endKey);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const selectedDateObj = useMemo(() => parseLocalDateFromYMD(selectedDate), [selectedDate]);

  const {
    dailyMeal,
    mealsByType,
    isLoading: isMealsLoading,
    isMutating: isMealsMutating,
    error: todayMealsError,
    addEntry,
    editEntry,
    removeEntry,
    toggleDayCompleted,
  } = useTodayMeals(phase ? user.id : undefined, phase ? selectedDateObj : undefined, Boolean(phase));

  const [mealModalVisible, setMealModalVisible] = useState(false);
  const [mealModalMode, setMealModalMode] = useState<'add' | 'edit'>('add');
  const [mealModalType, setMealModalType] = useState('');
  const [mealTypeLocked, setMealTypeLocked] = useState(false);
  const [mealForm, setMealForm] = useState({
    foodName: '',
    calories: '',
    protein: '',
    carbs: '',
    fats: '',
  });
  const [editingMealEntryId, setEditingMealEntryId] = useState<string | null>(null);
  const resetMealModal = useCallback(() => {
    setMealModalType('');
    setMealTypeLocked(false);
    setMealForm({
      foodName: '',
      calories: '',
      protein: '',
      carbs: '',
      fats: '',
    });
    setEditingMealEntryId(null);
  }, []);

  const closeMealModal = useCallback(() => {
    setMealModalVisible(false);
    resetMealModal();
  }, [resetMealModal]);

  const openAddMealModal = (mealType?: string) => {
    setMealModalMode('add');
    setMealModalType(mealType || '');
    setMealTypeLocked(Boolean(mealType));
    setMealForm({
      foodName: '',
      calories: '',
      protein: '',
      carbs: '',
      fats: '',
    });
    setEditingMealEntryId(null);
    setMealModalVisible(true);
  };

  const openEditMealModal = (mealType: string, entry: MealEntry) => {
    setMealModalMode('edit');
    setMealModalType(mealType);
    setMealTypeLocked(false);
    setMealForm({
      foodName: entry.foodName,
      calories: entry.calories != null ? String(entry.calories) : '',
      protein: entry.protein != null ? String(entry.protein) : '',
      carbs: entry.carbs != null ? String(entry.carbs) : '',
      fats: entry.fats != null ? String(entry.fats) : '',
    });
    setEditingMealEntryId(entry.id);
    setMealModalVisible(true);
  };

  const handleMealFormChange = (field: keyof typeof mealForm, value: string) => {
    setMealForm((prev) => ({ ...prev, [field]: value }));
  };

  const parseNumberField = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleMealModalSave = async () => {
    const typeLabel = (mealModalType || '').trim() || 'Meal';
    const foodName = mealForm.foodName.trim();
    if (!foodName) {
      Alert.alert('Meals', 'Please enter a food name.');
      return;
    }
    const payload = {
      mealType: typeLabel,
      foodName,
      calories: parseNumberField(mealForm.calories),
      protein: parseNumberField(mealForm.protein),
      carbs: parseNumberField(mealForm.carbs),
      fats: parseNumberField(mealForm.fats),
    };
    try {
      if (mealModalMode === 'add') {
        await addEntry(payload);
      } else if (editingMealEntryId) {
        await editEntry({
          entryId: editingMealEntryId,
          ...payload,
        });
      }
      await refreshMealPlans();
      closeMealModal();
    } catch (err: any) {
      Alert.alert('Meals', err?.message || 'Failed to save meal item.');
    }
  };

  const confirmDeleteEntry = (entryId: string) => {
    Alert.alert('Delete meal', 'Remove this meal item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeEntry(entryId);
            await refreshMealPlans();
          } catch (err: any) {
            Alert.alert('Meals', err?.message || 'Unable to delete meal item.');
          }
        },
      },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      refreshMealPlans();
    }, [refreshMealPlans])
  );

  const getMealsForDate = (dateStr: string) => {
    if (!phase) return [];
    const remotePlan = mealPlansByDate[dateStr];
    const stored = remotePlan ?? mealPlans.find((plan) => plan.phasePlanId === phase.id && plan.date === dateStr);
    return stored?.meals ?? [];
  };

  const weeklyMenus: WeeklyMenu[] = useMemo(() => {
    const anchor = parseLocalDateFromYMD(todayKey);
    return Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + idx);
      const dateStr = formatLocalDateYMD(date);
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
  const totalMeals = weeklyMenus.reduce((sum, plan) => sum + plan.meals.length, 0);
  const completedMeals = weeklyMenus.reduce(
    (sum, plan) => sum + plan.meals.filter((meal) => meal.completed).length,
    0
  );

  const totalMealEntries = useMemo(
    () => Object.values(mealsByType).reduce((sum, entries) => sum + entries.length, 0),
    [mealsByType]
  );
  const hasDailyMeal = Boolean(dailyMeal) || totalMealEntries > 0;
  const dayMealsCompleted = Boolean(dailyMeal?.completed);
  const fallbackMealTypes = useMemo(
    () => selectedPlan?.meals.map((meal) => meal.title).filter(Boolean) ?? [],
    [selectedPlan]
  );
  const allMealTypes = useMemo((): string[] => {
    const ordered: string[] = [...DEFAULT_MEAL_TYPES];
    [...fallbackMealTypes, ...Object.keys(mealsByType)].forEach((type) => {
      if (type && !ordered.includes(type)) {
        ordered.push(type);
      }
    });
    return ordered;
  }, [fallbackMealTypes, mealsByType]);

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

  const renderMealGroup = (mealType: string) => {
    const entries = mealsByType[mealType] ?? [];
    return (
      <View key={mealType} style={styles.detailGroup}>
        <View style={styles.detailGroupHeader}>
          <View style={styles.detailGroupInfo}>
            <View style={styles.detailGroupIcon}>
              <Text style={styles.detailGroupEmoji}>{getMealEmoji(mealType)}</Text>
            </View>
            <View>
              <Text style={styles.detailGroupTitle}>{mealType}</Text>
              <Text style={styles.detailGroupMeta}>
                {entries.length ? `${entries.length} item${entries.length > 1 ? 's' : ''}` : 'No items yet'}
              </Text>
            </View>
          </View>
          <Text style={styles.detailGroupHint}>Use the + button above to add foods</Text>
        </View>
        {entries.length === 0 ? (
          <Text style={styles.detailEmptyText}>
            Use the Add Meal button to start logging {mealType.toLowerCase()}.
          </Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.detailEntryRow}>
              <View style={styles.detailEntryInfo}>
                <Text style={styles.detailEntryName}>{entry.foodName}</Text>
                <Text style={styles.detailEntryMeta}>{formatMealMacros(entry)}</Text>
              </View>
              <View style={styles.detailEntryActions}>
                <TouchableOpacity
                  style={styles.detailActionButton}
                  onPress={() => openEditMealModal(mealType, entry)}
                  disabled={isMealsMutating}
                >
                  <Text style={styles.detailActionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.detailActionButton, styles.detailActionDanger]}
                  onPress={() => confirmDeleteEntry(entry.id)}
                  disabled={isMealsMutating}
                >
                  <Text style={[styles.detailActionText, styles.detailActionDangerText]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    );
  };

  const renderMeals = () => {
    if (!hasDailyMeal && !isMealsLoading) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardIcon}>🥗</Text>
          <Text style={styles.emptyCardTitle}>No meals logged</Text>
          <Text style={styles.emptyCardSubtitle}>
            Tap “+” to start planning this day’s nutrition.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.mealsCard}>
        {isMealsLoading && !hasDailyMeal ? (
          <Text style={styles.detailEmptyText}>Loading meals...</Text>
        ) : (
          allMealTypes.map((mealType) => renderMealGroup(mealType))
        )}

        {todayMealsError && <Text style={styles.errorText}>{todayMealsError}</Text>}
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
            <View style={styles.completionRow}>
              <View>
                <Text style={styles.completionLabel}>
                  {dayMealsCompleted ? 'Meals completed' : 'Mark meals complete'}
                </Text>
                <Text style={styles.completionMeta}>
                  {totalMealEntries} item{totalMealEntries === 1 ? '' : 's'} planned
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.completionButton,
                  dayMealsCompleted && styles.completionButtonActive,
                ]}
                onPress={() => toggleDayCompleted(!dayMealsCompleted)}
                disabled={isMealsMutating}
              >
                <Text
                  style={[
                    styles.completionButtonText,
                    dayMealsCompleted && styles.completionButtonTextActive,
                  ]}
                >
                  {dayMealsCompleted ? 'Completed' : 'Mark'}
                </Text>
              </TouchableOpacity>
            </View>
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
              <View style={styles.dayActions}>
                <TouchableOpacity
                  style={styles.inlineAddMealButton}
                  onPress={() => openAddMealModal()}
                  disabled={isMealsMutating}
                >
                  <Text style={styles.inlineAddMealText}>＋</Text>
                </TouchableOpacity>
                {selectedPlan?.isToday && (
                  <View style={styles.todayBadge}>
                    <Text style={styles.todayBadgeText}>Today</Text>
                  </View>
                )}
              </View>
            </View>
            {renderMeals()}
          </View>
        </ScrollView>
      </LinearGradient>
      <Modal
        transparent
        animationType="fade"
        visible={mealModalVisible}
        onRequestClose={closeMealModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={closeMealModal} />
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {mealModalMode === 'add' ? 'Add meal item' : 'Edit meal item'}
                </Text>
                <TouchableOpacity style={styles.modalCloseButton} onPress={closeMealModal}>
                  <Text style={styles.modalCloseText}>×</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalForm}
              >
                {!mealTypeLocked ? (
                  <View style={styles.modalField}>
                    <Text style={styles.modalLabel}>Meal type</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="e.g. Breakfast, Snack"
                      placeholderTextColor={COLORS.textTertiary}
                      value={mealModalType}
                      onChangeText={setMealModalType}
                    />
                  </View>
                ) : (
                  <View style={styles.modalField}>
                    <Text style={styles.modalLabel}>Meal type</Text>
                    <TextInput
                      style={[styles.modalInput, styles.modalInputDisabled]}
                      value={mealModalType}
                      editable={false}
                    />
                  </View>
                )}
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>Food name</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Food or recipe name"
                    placeholderTextColor={COLORS.textTertiary}
                    value={mealForm.foodName}
                    onChangeText={(value) => handleMealFormChange('foodName', value)}
                  />
                </View>
                <View style={styles.modalRow}>
                  <View style={styles.modalField}>
                    <Text style={styles.modalLabel}>Calories</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="kcal"
                      keyboardType="number-pad"
                      placeholderTextColor={COLORS.textTertiary}
                      value={mealForm.calories}
                      onChangeText={(value) => handleMealFormChange('calories', value)}
                    />
                  </View>
                  <View style={styles.modalField}>
                    <Text style={styles.modalLabel}>Protein (g)</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="0"
                      keyboardType="number-pad"
                      placeholderTextColor={COLORS.textTertiary}
                      value={mealForm.protein}
                      onChangeText={(value) => handleMealFormChange('protein', value)}
                    />
                  </View>
                </View>
                <View style={styles.modalRow}>
                  <View style={styles.modalField}>
                    <Text style={styles.modalLabel}>Carbs (g)</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="0"
                      keyboardType="number-pad"
                      placeholderTextColor={COLORS.textTertiary}
                      value={mealForm.carbs}
                      onChangeText={(value) => handleMealFormChange('carbs', value)}
                    />
                  </View>
                  <View style={styles.modalField}>
                    <Text style={styles.modalLabel}>Fats (g)</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="0"
                      keyboardType="number-pad"
                      placeholderTextColor={COLORS.textTertiary}
                      value={mealForm.fats}
                      onChangeText={(value) => handleMealFormChange('fats', value)}
                    />
                  </View>
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[
                      styles.modalSaveButton,
                      (isMealsMutating || !mealModalType.trim() || !mealForm.foodName.trim()) &&
                        styles.modalSaveButtonDisabled,
                    ]}
                    onPress={handleMealModalSave}
                    disabled={isMealsMutating}
                  >
                    <Text style={styles.modalSaveText}>
                      {mealModalMode === 'add' ? 'Add meal' : 'Save changes'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  weekStrip: {
    paddingVertical: 12,
    gap: 8,
  },
  completionRow: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  completionLabel: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  completionMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  completionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  completionButtonActive: {
    borderColor: COLORS.success,
    backgroundColor: 'rgba(0,245,160,0.12)',
  },
  completionButtonText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  completionButtonTextActive: {
    color: COLORS.success,
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
  dayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  inlineAddMealButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineAddMealText: {
    color: COLORS.textPrimary,
    fontSize: 20,
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
  detailGroup: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  detailGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  detailGroupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  detailGroupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailGroupEmoji: {
    fontSize: 18,
  },
  detailGroupTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  detailGroupMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  detailGroupHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  detailEmptyText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  detailEntryRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailEntryInfo: {
    flex: 1,
  },
  detailEntryName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  detailEntryMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  detailEntryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  detailActionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.elevated,
  },
  detailActionText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  detailActionDanger: {
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  detailActionDangerText: {
    color: '#ef4444',
  },
  errorText: {
    marginTop: 12,
    color: '#FF6B6B',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: '95%',
    minHeight: '70%',
    marginHorizontal: 12,
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: COLORS.textPrimary,
    fontSize: 20,
  },
  modalForm: {
    paddingBottom: 40,
    gap: 16,
  },
  modalField: {
    gap: 6,
  },
  modalLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInput: {
    backgroundColor: COLORS.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  modalInputDisabled: {
    opacity: 0.5,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalActions: {
    marginTop: 12,
  },
  modalSaveButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  modalSaveButtonDisabled: {
    opacity: 0.5,
  },
  modalSaveText: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 15,
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
