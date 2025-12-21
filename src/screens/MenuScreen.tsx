import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { FoodItem, createUserFood, fetchStoredFoods, searchFoods } from '../services/foodCatalogService';
import {
  computeEntriesMacroTotals,
  formatMacroSummaryLine,
  formatMealEntryMacros,
} from '../utils/mealMacros';

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
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

const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;

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

const formatFoodDisplayName = (food: FoodItem): string =>
  food.brand ? `${food.name} (${food.brand})` : food.name;

const formatFoodMacroSummary = (food: FoodItem): string => {
  const parts: string[] = [];
  if (typeof food.calories === 'number') parts.push(`${food.calories} kcal`);
  if (typeof food.protein === 'number') parts.push(`${food.protein}g P`);
  if (typeof food.carbs === 'number') parts.push(`${food.carbs}g C`);
  if (typeof food.fats === 'number') parts.push(`${food.fats}g F`);
  return parts.length ? parts.join(' · ') : 'Macros TBD';
};

export const MenuScreen: React.FC<MenuScreenProps> = ({ user, phase }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = formatLocalDateYMD(today);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 6);
  const endKey = formatLocalDateYMD(endDate);

  const { mealPlansByDate, refresh: refreshMealPlans } = useMealPlans(
    user.id,
    todayKey,
    endKey,
    phase?.id ?? null
  );
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const selectedDateObj = useMemo(() => parseLocalDateFromYMD(selectedDate), [selectedDate]);

  const {
    dailyMeal,
    mealsByType,
    isLoading: isMealsLoading,
    isMutating: isMealsMutating,
    error: todayMealsError,
    addEntryFromFood: addFoodEntry,
    addEntry,
    editEntry,
    removeEntry,
    toggleDayCompleted,
  } = useTodayMeals(
    phase ? user.id : undefined,
    phase ? selectedDateObj : undefined,
    Boolean(phase),
    phase?.id ?? null
  );

  const [mealModalVisible, setMealModalVisible] = useState(false);
  const [mealModalMode, setMealModalMode] = useState<'add' | 'edit'>('add');
  const [mealModalType, setMealModalType] = useState('');
  const [isCustomMealType, setIsCustomMealType] = useState(false);
  const [lastSelectedMealType, setLastSelectedMealType] = useState<string>(DEFAULT_MEAL_TYPES[0]);
  const [lastSelectedIsCustom, setLastSelectedIsCustom] = useState(false);
  const [lastCustomMealType, setLastCustomMealType] = useState('');
  const [mealForm, setMealForm] = useState({
    foodName: '',
    calories: '',
    protein: '',
    carbs: '',
    fats: '',
  });
  const [editingMealEntryId, setEditingMealEntryId] = useState<string | null>(null);
  const [foodQuery, setFoodQuery] = useState('');
  const [foodSuggestions, setFoodSuggestions] = useState<FoodItem[]>([]);
  const [isSearchingFoods, setIsSearchingFoods] = useState(false);
  const [foodSearchError, setFoodSearchError] = useState<string | null>(null);
  const [showNewFoodForm, setShowNewFoodForm] = useState(false);
  const [customFoodForm, setCustomFoodForm] = useState({
    name: '',
    brand: '',
    servingLabel: '',
    calories: '',
    protein: '',
    carbs: '',
    fats: '',
  });
  const [isCreatingFood, setIsCreatingFood] = useState(false);
  const [mealDetailModal, setMealDetailModal] = useState<{
    mealType: string;
    entries: MealEntry[];
  } | null>(null);
  const [storedFoods, setStoredFoods] = useState<FoodItem[]>([]);
  const [isLoadingStoredFoods, setIsLoadingStoredFoods] = useState(false);
  const [storedFoodsError, setStoredFoodsError] = useState<string | null>(null);
  const foodSearchCache = useRef<Map<string, FoodItem[]>>(new Map());
  const storedFoodsLoadedRef = useRef(false);
  const loadStoredFoods = useCallback(async () => {
    try {
      setStoredFoodsError(null);
      setIsLoadingStoredFoods(true);
      const foods = await fetchStoredFoods(user.id);
      setStoredFoods(foods);
      storedFoodsLoadedRef.current = true;
    } catch (err) {
      console.error('Failed to load stored foods', err);
      setStoredFoodsError('Unable to load foods.');
    } finally {
      setIsLoadingStoredFoods(false);
    }
  }, [user.id]);
  useEffect(() => {
    storedFoodsLoadedRef.current = false;
    setStoredFoods([]);
  }, [user.id]);
  useEffect(() => {
    if (mealModalVisible && !storedFoodsLoadedRef.current) {
      loadStoredFoods();
    }
  }, [mealModalVisible, loadStoredFoods]);
  const mealDetailSummary = useMemo(
    () => (mealDetailModal ? computeEntriesMacroTotals(mealDetailModal.entries) : null),
    [mealDetailModal]
  );

  const getCurrentMealType = useCallback(() => {
    const raw = (mealModalType || '').trim();
    if (!raw) return '';
    const canonicalTypes = [
      ...DEFAULT_MEAL_TYPES,
      ...Object.keys(mealsByType),
    ];
    const match = canonicalTypes.find(
      (type) => (type || '').trim().toLowerCase() === raw.toLowerCase()
    );
    return match ? match.trim() : raw;
  }, [mealModalType, mealsByType]);
  const resetMealModal = useCallback(() => {
    setMealModalType('');
    setIsCustomMealType(false);
    setMealForm({
      foodName: '',
      calories: '',
      protein: '',
      carbs: '',
      fats: '',
    });
    setEditingMealEntryId(null);
    setFoodQuery('');
    setFoodSuggestions([]);
    setFoodSearchError(null);
    setShowNewFoodForm(false);
    setCustomFoodForm({
      name: '',
      brand: '',
      servingLabel: '',
      calories: '',
      protein: '',
      carbs: '',
      fats: '',
    });
  }, []);

  const closeMealModal = useCallback(() => {
    setMealModalVisible(false);
    resetMealModal();
  }, [resetMealModal]);

  const openAddMealModal = useCallback(
    (mealType?: string) => {
      setMealModalMode('add');
      const requestedType =
        mealType ??
        (lastSelectedIsCustom ? lastCustomMealType : lastSelectedMealType);
      const normalized = (requestedType || '').trim();
      const resolvedType = normalized || DEFAULT_MEAL_TYPES[0];
      const shouldUseCustom =
        mealType != null
          ? isCustomMealTypeValue(mealType)
          : lastSelectedIsCustom && Boolean((lastCustomMealType || '').trim());
      const finalCustomFlag =
        shouldUseCustom && isCustomMealTypeValue(resolvedType);
      setMealModalType(resolvedType);
      setIsCustomMealType(finalCustomFlag);
    setMealForm({
      foodName: '',
      calories: '',
      protein: '',
      carbs: '',
      fats: '',
    });
    setEditingMealEntryId(null);
    setFoodQuery('');
    setFoodSuggestions([]);
    setFoodSearchError(null);
    setShowNewFoodForm(false);
    setCustomFoodForm({
      name: '',
      brand: '',
      servingLabel: '',
      calories: '',
      protein: '',
      carbs: '',
      fats: '',
    });
      setMealModalVisible(true);
    },
    [
      lastCustomMealType,
      lastSelectedIsCustom,
      lastSelectedMealType,
      isCustomMealTypeValue,
    ]
  );

  const openMealDetailModal = useCallback(
    (mealType: string, entries: MealEntry[]) => {
      if (!entries.length) return;
      setMealDetailModal({ mealType, entries });
    },
    []
  );

  const closeMealDetailModal = useCallback(() => {
    setMealDetailModal(null);
  }, []);

  const rememberMealTypeSelection = useCallback(
    (type: string) => {
      if (!type) return;
      const normalized = type.trim();
      const isCustom = isCustomMealTypeValue(normalized);
      setLastSelectedMealType(normalized);
      setLastSelectedIsCustom(isCustom);
      if (isCustom) {
        setLastCustomMealType(normalized);
      }
    },
    [isCustomMealTypeValue]
  );

  const handleMealFormChange = (field: keyof typeof mealForm, value: string) => {
    setMealForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleMealTypeSelect = useCallback(
    (type: string) => {
      setMealModalType(type);
      setIsCustomMealType(false);
      rememberMealTypeSelection(type);
    },
    [rememberMealTypeSelection]
  );

  const handleMealTypeCustomSelect = useCallback(() => {
    setIsCustomMealType(true);
    setMealModalType((prev) => {
      const nextValue = prev || lastCustomMealType || '';
      if (nextValue) {
        rememberMealTypeSelection(nextValue);
      }
      return nextValue;
    });
    setLastSelectedIsCustom(true);
  }, [lastCustomMealType, rememberMealTypeSelection]);

  const parseNumberField = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleFoodQueryChange = (text: string) => {
    setFoodQuery(text);
    setFoodSearchError(null);
    if (!text.trim()) {
      setFoodSuggestions([]);
      setShowNewFoodForm(false);
    }
  };

  useEffect(() => {
    if (!mealModalVisible) return;
    const trimmed = foodQuery.trim();
    if (trimmed.length < 1) {
      setFoodSuggestions([]);
      setIsSearchingFoods(false);
      return;
    }
    const normalized = trimmed.toLowerCase();
    if (foodSearchCache.current.has(normalized)) {
      setFoodSuggestions(foodSearchCache.current.get(normalized)!);
      return;
    }
    const searchTimeout = setTimeout(async () => {
      if (!mealModalVisible) return;
      try {
        setIsSearchingFoods(true);
        const results = await searchFoods(trimmed, user.id);
        foodSearchCache.current.set(normalized, results);
        setFoodSuggestions(results);
        setFoodSearchError(null);
      } catch (err) {
        console.error('Failed to search foods', err);
        setFoodSearchError('Unable to fetch foods.');
      } finally {
        setIsSearchingFoods(false);
      }
    }, 300);
    return () => clearTimeout(searchTimeout);
  }, [foodQuery, mealModalVisible, user.id]);

  const handleSelectFoodSuggestion = async (food: FoodItem) => {
    try {
      const currentMealType = getCurrentMealType();
      if (!currentMealType) {
        Alert.alert('Meals', 'Select a meal type first.');
        return;
      }
      await addFoodEntry(currentMealType, food);
      await refreshMealPlans();
      await loadStoredFoods();
      rememberMealTypeSelection(currentMealType);
      closeMealModal();
    } catch (err) {
      console.error('Failed to add food entry', err);
      Alert.alert('Meals', 'Unable to add this food.');
    }
  };

  const handleOpenCustomFoodForm = () => {
    setShowNewFoodForm(true);
    setCustomFoodForm((prev) => ({
      ...prev,
      name: foodQuery.trim() || prev.name,
    }));
  };

  const handleCustomFoodFormChange = (field: keyof typeof customFoodForm, value: string) => {
    setCustomFoodForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddCustomFood = async () => {
    const baseName = (customFoodForm.name || foodQuery).trim();
    if (!baseName) {
      Alert.alert('Meals', 'Enter a food name to save.');
      return;
    }
    const currentMealType = getCurrentMealType();
    if (!currentMealType) {
      Alert.alert('Meals', 'Select a meal type first.');
      return;
    }
    try {
      setIsCreatingFood(true);
      const food = await createUserFood(user.id, {
        name: baseName,
        brand: customFoodForm.brand.trim() || undefined,
        servingLabel: customFoodForm.servingLabel.trim() || undefined,
        calories: parseNumberField(customFoodForm.calories) ?? undefined,
        protein: parseNumberField(customFoodForm.protein) ?? undefined,
        carbs: parseNumberField(customFoodForm.carbs) ?? undefined,
        fats: parseNumberField(customFoodForm.fats) ?? undefined,
      });
      await addFoodEntry(currentMealType, food);
      await refreshMealPlans();
      rememberMealTypeSelection(currentMealType);
      closeMealModal();
    } catch (err) {
      console.error('Failed to create custom food', err);
      Alert.alert('Meals', 'Unable to save this food.');
    } finally {
      setIsCreatingFood(false);
    }
  };

  const handleMealModalSave = async () => {
    const typeLabel = getCurrentMealType();
    const foodName = mealForm.foodName.trim();
    if (!typeLabel) {
      Alert.alert('Meals', 'Select a meal type first.');
      return;
    }
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
        rememberMealTypeSelection(typeLabel);
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
    return remotePlan?.meals ?? [];
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
  }, [todayKey, mealPlansByDate]);

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
  const hasLoggedMeals = Boolean(dailyMeal) || totalMealEntries > 0;
  const dayMealsCompleted = Boolean(dailyMeal?.completed);
  const planMealsByType = useMemo(() => {
    const map: Record<string, DailyMealPlan['meals'][number]> = {};
    (selectedPlan?.meals || []).forEach((meal) => {
      if (!meal?.title) return;
      map[meal.title] = meal;
    });
    return map;
  }, [selectedPlan]);

  const existingMealTypesSet = useMemo(() => {
    const set = new Set<string>();
    Object.keys(mealsByType).forEach((type) => {
      const normalized = (type || '').trim().toLowerCase();
      if (normalized) set.add(normalized);
    });
    Object.keys(planMealsByType).forEach((type) => {
      const normalized = (type || '').trim().toLowerCase();
      if (normalized) set.add(normalized);
    });
    return set;
  }, [mealsByType, planMealsByType]);

  const isCustomMealTypeValue = useCallback(
    (value: string) => {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return false;
      if (DEFAULT_MEAL_TYPES.some((type) => type.toLowerCase() === normalized)) {
        return false;
      }
      return !existingMealTypesSet.has(normalized);
    },
    [existingMealTypesSet]
  );

  const allMealTypes = useMemo((): string[] => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const pushType = (type?: string) => {
      const normalized = (type || '').trim();
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      ordered.push(normalized);
      seen.add(key);
    };
    DEFAULT_MEAL_TYPES.forEach((type) => pushType(type));
    Object.keys(planMealsByType).forEach((type) => pushType(type));
    Object.keys(mealsByType).forEach((type) => pushType(type));
    return ordered;
  }, [planMealsByType, mealsByType]);
  const hasPlanMeals = (selectedPlan?.meals?.length ?? 0) > 0;
  const normalizedMealType = (mealModalType || '').trim();

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
    const planMeal = planMealsByType[mealType];
    const planItems = planMeal?.items ?? [];
    const totalSources = planItems.length + entries.length;
    if (!totalSources) return null;
    const totals = computeEntriesMacroTotals(entries);
    const caloriesLabel = `${Math.round(totals.calories) || 0} kcal`;
    return (
      <TouchableOpacity
        key={mealType}
        style={styles.mealGroupCard}
        activeOpacity={0.9}
        onPress={() => (entries.length > 0 ? openMealDetailModal(mealType, entries) : undefined)}
      >
        <View style={styles.mealGroupHeader}>
          <View style={styles.mealGroupInfo}>
            <View style={styles.mealGroupIcon}>
              <Text style={styles.mealGroupEmoji}>{getMealEmoji(mealType)}</Text>
            </View>
            <View>
              <Text style={styles.mealGroupTitle}>{mealType}</Text>
              <Text style={styles.mealGroupMeta}>{caloriesLabel}</Text>
            </View>
          </View>
        </View>
        {planItems.length > 0 && (
          <View style={styles.mealPlanItems}>
            {planItems.map((item, index) => (
              <View key={`${mealType}-plan-${index}`} style={styles.planItemChip}>
                <Text style={styles.planItemBullet}>•</Text>
                <Text style={styles.planItemText}>{item}</Text>
              </View>
            ))}
          </View>
        )}
        {entries.map((entry) => (
          <View key={entry.id} style={styles.mealEntryCard}>
            <View style={styles.mealEntryInfo}>
              <Text style={styles.mealEntryName}>{entry.foodName}</Text>
              <Text style={styles.mealEntryMeta}>{formatMealEntryMacros(entry)}</Text>
            </View>
            <View style={styles.mealEntryActions}>
              {entry.isDone && (
                <View style={styles.mealEntryDoneBadge}>
                  <Text style={styles.mealEntryDoneText}>Done</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.mealEntryCloseButton}
                onPress={() => confirmDeleteEntry(entry.id)}
                disabled={isMealsMutating}
              >
                <Text style={styles.mealEntryCloseText}>x</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </TouchableOpacity>
    );
  };

  const renderMeals = () => {
    const showEmptyState = !hasLoggedMeals && !hasPlanMeals && !isMealsLoading;
    return (
      <View style={styles.mealsCard}>
        <View style={styles.mealAddRow}>
          <Text style={styles.mealAddRowLabel}>Log meal items</Text>
          <TouchableOpacity style={styles.mealAddRowButton} onPress={() => openAddMealModal()}>
            <Text style={styles.mealAddRowButtonText}>＋</Text>
          </TouchableOpacity>
        </View>
        {isMealsLoading && !hasDailyMeal ? (
          <Text style={styles.detailEmptyText}>Loading meals...</Text>
        ) : showEmptyState ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardIcon}>🥗</Text>
            <Text style={styles.emptyCardTitle}>No meals logged</Text>
            <Text style={styles.emptyCardSubtitle}>
              Tap “＋” to start planning this day’s nutrition.
            </Text>
          </View>
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
                const { weekday } = formatDayLabel(plan.dateStr);
                const isActive = plan.dateStr === selectedDate;
                const hasMeals = plan.meals.length > 0;
                return (
                  <TouchableOpacity
                    key={plan.dateStr}
                    style={[styles.dayChip, isActive && styles.dayChipActive]}
                    onPress={() => setSelectedDate(plan.dateStr)}
                  >
                    <Text style={[styles.dayChipLabel, isActive && styles.dayChipLabelActive]}>{weekday}</Text>
                    <View style={[styles.dayStatusDot, hasMeals && styles.dayStatusDotVisible]} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.content}>
            <View style={styles.dayHeaderSpacer} />
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
                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Search foods</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Search by name"
                    placeholderTextColor={COLORS.textTertiary}
                    value={foodQuery}
                    onChangeText={handleFoodQueryChange}
                  />
                  <View style={styles.mealCategorySection}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.mealTypeChipsRow}
                    >
                      {allMealTypes.map((type) => {
                        const isActive = !isCustomMealType && mealModalType === type;
                        return (
                          <TouchableOpacity
                            key={`meal-type-${type}`}
                            style={[
                              styles.mealTypeChip,
                              isActive && styles.mealTypeChipActive,
                            ]}
                            onPress={() => handleMealTypeSelect(type)}
                          >
                            <Text
                              style={[
                                styles.mealTypeChipText,
                                isActive && styles.mealTypeChipTextActive,
                              ]}
                            >
                              {type}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        style={[
                          styles.mealTypeChip,
                          isCustomMealType && styles.mealTypeChipActive,
                        ]}
                        onPress={handleMealTypeCustomSelect}
                      >
                        <Text
                          style={[
                            styles.mealTypeChipText,
                            isCustomMealType && styles.mealTypeChipTextActive,
                          ]}
                        >
                          ＋
                        </Text>
                      </TouchableOpacity>
                    </ScrollView>
                    {isCustomMealType && (
                      <TextInput
                        style={styles.modalInput}
                        placeholder="Custom meal name"
                        placeholderTextColor={COLORS.textTertiary}
                        value={mealModalType}
                        onChangeText={(value) => {
                          setMealModalType(value);
                          setLastCustomMealType(value);
                          setLastSelectedMealType(value);
                          setLastSelectedIsCustom(true);
                        }}
                      />
                    )}
                  </View>
                  <View style={styles.foodResultsList}>
                    {foodSearchError && <Text style={styles.errorText}>{foodSearchError}</Text>}
                    {isSearchingFoods && (
                      <Text style={styles.helperText}>Searching foods...</Text>
                    )}
                    {foodSuggestions.map((food) => (
                      <TouchableOpacity
                        key={food.id}
                        style={styles.foodSuggestion}
                        onPress={() => handleSelectFoodSuggestion(food)}
                        disabled={isMealsMutating}
                      >
                        <View>
                          <Text style={styles.foodSuggestionName}>{formatFoodDisplayName(food)}</Text>
                          <Text style={styles.foodSuggestionMeta}>{formatFoodMacroSummary(food)}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {foodQuery.trim().length >= 2 &&
                    !isSearchingFoods &&
                    !foodSuggestions.length &&
                    !showNewFoodForm && (
                      <TouchableOpacity
                        style={styles.addCustomFoodButton}
                        onPress={handleOpenCustomFoodForm}
                      >
                        <Text style={styles.addCustomFoodText}>
                          Add “{foodQuery.trim()}” as new food
                        </Text>
                      </TouchableOpacity>
                    )}
                  {showNewFoodForm && (
                    <View style={styles.customFoodForm}>
                      <TextInput
                        style={styles.modalInput}
                        placeholder="Food name"
                        placeholderTextColor={COLORS.textTertiary}
                        value={customFoodForm.name}
                        onChangeText={(value) => handleCustomFoodFormChange('name', value)}
                      />
                      <TextInput
                        style={styles.modalInput}
                        placeholder="Brand (optional)"
                        placeholderTextColor={COLORS.textTertiary}
                        value={customFoodForm.brand}
                        onChangeText={(value) => handleCustomFoodFormChange('brand', value)}
                      />
                      <TextInput
                        style={styles.modalInput}
                        placeholder="Serving label (e.g. 1 cup)"
                        placeholderTextColor={COLORS.textTertiary}
                        value={customFoodForm.servingLabel}
                        onChangeText={(value) => handleCustomFoodFormChange('servingLabel', value)}
                      />
                      <View style={styles.modalRow}>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>Calories</Text>
                          <TextInput
                            style={styles.modalInput}
                            placeholder="0"
                            keyboardType="number-pad"
                            placeholderTextColor={COLORS.textTertiary}
                            value={customFoodForm.calories}
                            onChangeText={(value) => handleCustomFoodFormChange('calories', value)}
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>Protein (g)</Text>
                          <TextInput
                            style={styles.modalInput}
                            placeholder="0"
                            keyboardType="number-pad"
                            placeholderTextColor={COLORS.textTertiary}
                            value={customFoodForm.protein}
                            onChangeText={(value) => handleCustomFoodFormChange('protein', value)}
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
                            value={customFoodForm.carbs}
                            onChangeText={(value) => handleCustomFoodFormChange('carbs', value)}
                          />
                        </View>
                        <View style={styles.modalField}>
                          <Text style={styles.modalLabel}>Fats (g)</Text>
                          <TextInput
                            style={styles.modalInput}
                            placeholder="0"
                            keyboardType="number-pad"
                            placeholderTextColor={COLORS.textTertiary}
                            value={customFoodForm.fats}
                            onChangeText={(value) => handleCustomFoodFormChange('fats', value)}
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.addCustomFoodSaveButton,
                          isCreatingFood && styles.modalSaveButtonDisabled,
                        ]}
                        onPress={handleAddCustomFood}
                        disabled={isCreatingFood}
                      >
                        <Text style={styles.addCustomFoodSaveText}>
                          {isCreatingFood ? 'Saving…' : 'Add food'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {!foodQuery.trim() && (
                    <View style={styles.savedFoodsSection}>
                      <View style={styles.savedFoodsHeader}>
                        <Text style={styles.modalLabel}>Stored foods</Text>
                        {isLoadingStoredFoods && (
                          <Text style={styles.helperText}>Loading…</Text>
                        )}
                      </View>
                      <ScrollView
                        style={styles.savedFoodsScroll}
                        contentContainerStyle={styles.savedFoodsList}
                      >
                        {storedFoodsError && (
                          <Text style={styles.errorText}>{storedFoodsError}</Text>
                        )}
                        {!isLoadingStoredFoods && !storedFoodsError && !storedFoods.length && (
                          <Text style={styles.helperText}>No foods saved yet.</Text>
                        )}
                        {storedFoods.map((food) => (
                          <TouchableOpacity
                            key={`stored-${food.id}`}
                            style={styles.foodSuggestion}
                            onPress={() => handleSelectFoodSuggestion(food)}
                            disabled={isMealsMutating}
                          >
                            <View>
                              <Text style={styles.foodSuggestionName}>
                                {formatFoodDisplayName(food)}
                              </Text>
                              <Text style={styles.foodSuggestionMeta}>
                                {formatFoodMacroSummary(food)}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
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
      <Modal
        transparent
        animationType="fade"
        visible={Boolean(mealDetailModal)}
        onRequestClose={closeMealDetailModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeMealDetailModal} />
          <View style={styles.detailModalContent}>
            <View style={styles.detailModalHeader}>
              <View>
                <Text style={styles.detailModalTitle}>{mealDetailModal?.mealType}</Text>
                {mealDetailSummary && (
                  <Text style={styles.detailModalSubtitle}>
                    {formatMacroSummaryLine(mealDetailSummary)}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.detailModalCloseButton}
                onPress={closeMealDetailModal}
              >
                <Text style={styles.detailModalCloseText}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.detailEntriesList}
            >
              {mealDetailModal?.entries?.map((entry) => (
                <View key={entry.id} style={styles.detailEntryRow}>
                  <View style={styles.detailEntryInfo}>
                    <Text style={styles.detailEntryName}>{entry.foodName}</Text>
                    <Text style={styles.detailEntryMeta}>{formatMealEntryMacros(entry)}</Text>
                  </View>
                  <Text style={styles.detailEntryCalories}>
                    {typeof entry.calories === 'number' ? `${entry.calories} kcal` : '—'}
                  </Text>
                </View>
              ))}
              {!mealDetailModal?.entries?.length && (
                <Text style={styles.detailEmptyText}>No meal items logged.</Text>
              )}
            </ScrollView>
          </View>
        </View>
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
  dayChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  dayChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textTertiary,
  },
  dayChipLabelActive: {
    color: COLORS.textPrimary,
  },
  dayStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
    opacity: 0,
  },
  dayStatusDotVisible: {
    opacity: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  dayHeaderSpacer: {
    height: 12,
  },
  mealsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  mealAddRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mealAddRowLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  mealAddRowButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealAddRowButtonText: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  mealGroupCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  mealPlanItems: {
    gap: 6,
    marginTop: 8,
  },
  planItemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  planItemBullet: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  planItemText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    flex: 1,
  },
  mealGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mealGroupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  mealGroupIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealGroupEmoji: {
    fontSize: 20,
  },
  mealGroupTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  mealGroupMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  detailEmptyText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  mealEntryCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  mealEntryInfo: {
    flex: 1,
  },
  mealEntryName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  mealEntryMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  mealEntryDoneBadge: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.success,
    backgroundColor: 'rgba(0,245,160,0.1)',
  },
  mealEntryDoneText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  mealEntryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealEntryCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealEntryCloseText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
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
  detailModalContent: {
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 20,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detailModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  detailModalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  detailModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailModalCloseText: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '600',
  },
  detailEntriesList: {
    paddingBottom: 8,
  },
  detailEntryRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
  detailEntryCalories: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  modalForm: {
    paddingBottom: 40,
    gap: 16,
  },
  modalField: {
    gap: 6,
  },
  modalSection: {
    gap: 10,
  },
  modalLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  helperText: {
    fontSize: 12,
    color: COLORS.textTertiary,
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
  mealCategorySection: {
    marginTop: 16,
    gap: 8,
  },
  mealTypeChipsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingRight: 12,
  },
  mealTypeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTypeChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  mealTypeChipText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  mealTypeChipTextActive: {
    color: COLORS.bgPrimary,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalActions: {
    marginTop: 12,
  },
  foodSuggestion: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginTop: 4,
  },
  foodSuggestionName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  foodSuggestionMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  foodResultsList: {
    marginTop: 8,
    gap: 4,
  },
  savedFoodsSection: {
    marginTop: 12,
    gap: 8,
    maxHeight: 220,
  },
  savedFoodsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedFoodsScroll: {
    borderRadius: 12,
  },
  savedFoodsList: {
    gap: 6,
    paddingBottom: 8,
  },
  addCustomFoodButton: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  addCustomFoodText: {
    color: COLORS.accent,
    fontWeight: '600',
    textAlign: 'center',
  },
  customFoodForm: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addCustomFoodSaveButton: {
    marginTop: 4,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  addCustomFoodSaveText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
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
