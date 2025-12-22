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
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import {  PhasePlan, User } from '../types/domain';
import { useMealPlans } from '../hooks/useMealPlans';
import { formatLocalDateYMD } from '../utils/date';
import { useTodayMeals, DUPLICATE_MEAL_ENTRY_ERROR } from '../hooks/useTodayMeals';
import { FoodItem, createUserFood, fetchStoredFoods, searchFoods } from '../services/foodCatalogService';
import { MealEntry } from '../services/supabaseMealService';
import { computeEntriesMacroTotals, formatMealEntryMacros } from '../utils/mealMacros';

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
};

const SCREEN_GRADIENT = ['#0A0E27', '#151932', '#1E2340'] as const;
const COLORS = {
  bgPrimary: '#0A0E27',
  card: '#101427',
  elevated: '#151A2E',
  surface: '#0C1021',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A3BD',
  textTertiary: '#7B80A0',
  accent: '#6C63FF',
  accentDim: 'rgba(108,99,255,0.15)',
  accentGlow: 'rgba(108,99,255,0.3)',
  success: '#00F5A0',
  successDim: 'rgba(0,245,160,0.15)',
  border: '#1E2340',
  borderStrong: '#2A2F4F',
};

const parseLocalDateFromYMD = (dateStr: string) => {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);
  return new Date(year, month, day);
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
    removeEntry,

  } = useTodayMeals(
    phase ? user.id : undefined,
    phase ? selectedDateObj : undefined,
    Boolean(phase),
    phase?.id ?? null
  );

  const [mealModalVisible, setMealModalVisible] = useState(false);
  const [mealModalMode, setMealModalMode] = useState<'search' | 'custom'>('search');
  const [selectedMealTypeForAdding, setSelectedMealTypeForAdding] = useState<string>('');
  const [customMealTypes, setCustomMealTypes] = useState<string[]>([]);
  const [mealTypeDraftVisible, setMealTypeDraftVisible] = useState(false);
  const [mealTypeDraft, setMealTypeDraft] = useState('');
  const [foodQuery, setFoodQuery] = useState('');
  const [foodSuggestions, setFoodSuggestions] = useState<FoodItem[]>([]);
  const [isSearchingFoods, setIsSearchingFoods] = useState(false);
  const [foodSearchError, setFoodSearchError] = useState<string | null>(null);
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
  const [storedFoods, setStoredFoods] = useState<FoodItem[]>([]);
  const [isLoadingStoredFoods, setIsLoadingStoredFoods] = useState(false);
  const foodSearchCache = useRef<Map<string, FoodItem[]>>(new Map());
  const storedFoodsLoadedRef = useRef(false);

  const loadStoredFoods = useCallback(async () => {
    try {
      setIsLoadingStoredFoods(true);
      const foods = await fetchStoredFoods(user.id);
      setStoredFoods(foods);
      storedFoodsLoadedRef.current = true;
    } catch (err) {
      console.error('Failed to load stored foods', err);
    } finally {
      setIsLoadingStoredFoods(false);
    }
  }, [user.id]);

  const weeklyMenus = useMemo(() => {
    const menus: Array<{
      dateStr: string;
      weekday: string;
      isToday: boolean;
      hasMeals: boolean;
    }> = [];
    const start = parseLocalDateFromYMD(todayKey);
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateStr = formatLocalDateYMD(date);
      const plan = mealPlansByDate[dateStr];
      menus.push({
        dateStr,
        weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
        isToday: dateStr === todayKey,
        hasMeals: Boolean(plan && plan.meals && plan.meals.length > 0),
      });
    }
    return menus;
  }, [mealPlansByDate, todayKey]);

  useEffect(() => {
    if (!weeklyMenus.some((menu) => menu.dateStr === selectedDate)) {
      setSelectedDate(todayKey);
    }
  }, [weeklyMenus, selectedDate, todayKey]);

  const baseMealTypes = useMemo(() => Object.keys(mealsByType), [mealsByType]);

  const mealGroups = useMemo(() => {
    return baseMealTypes
      .map((mealType) => ({
        mealType,
        entries: mealsByType[mealType] ?? [],
      }))
      .filter((group) => group.entries.length > 0);
  }, [baseMealTypes, mealsByType]);

  // Meal types shown in the UI (plan + logged + custom)
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
    mealGroups.forEach((group) => pushType(group.mealType));
    customMealTypes.forEach((type) => pushType(type));
    return ordered;
  }, [mealGroups, customMealTypes]);

  const handleAddCustomMealType = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      const existingTypes = [...mealGroups.map((group) => group.mealType), ...customMealTypes];
      if (!existingTypes.some((type) => type.toLowerCase() === lower)) {
        setCustomMealTypes((prev) => [...prev, trimmed]);
      }
      setSelectedMealTypeForAdding(trimmed);
    },
    [customMealTypes, mealGroups]
  );

  const parseNumberField = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = parseFloat(trimmed);
    return !isNaN(parsed) && isFinite(parsed) ? parsed : null;
  };

  const openAddMealModal = (defaultMealType?: string) => {
    setSelectedMealTypeForAdding(defaultMealType || allMealTypes[0] || '');
    setMealModalMode('search');
    setFoodQuery('');
    setFoodSuggestions([]);
    setFoodSearchError(null);
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
    if (!storedFoodsLoadedRef.current) {
      loadStoredFoods();
    }
  };

  const closeMealModal = () => {
    setMealModalVisible(false);
    setFoodQuery('');
    setFoodSuggestions([]);
    setSelectedMealTypeForAdding('');
    setMealModalMode('search');
  };

  const handleFoodQueryChange = (text: string) => {
    setFoodQuery(text);
    setFoodSearchError(null);
    if (!text.trim()) {
      setFoodSuggestions([]);
    }
  };

  useEffect(() => {
    if (!mealModalVisible || mealModalMode !== 'search') return;
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
  }, [foodQuery, mealModalVisible, mealModalMode, user.id]);

  const handleSelectFoodSuggestion = async (food: FoodItem) => {
    try {
      if (!selectedMealTypeForAdding) {
        Alert.alert('Select Meal Type', 'Please choose which meal to add this to.');
        return;
      }
      await addFoodEntry(selectedMealTypeForAdding, food);
      await refreshMealPlans();
      await loadStoredFoods();
      closeMealModal();
    } catch (err: any) {
      if (err?.message === DUPLICATE_MEAL_ENTRY_ERROR) {
        Alert.alert('Duplicate Item', 'This meal already contains that food.');
        return;
      }
      console.error('Failed to add food entry', err);
      Alert.alert('Error', 'Unable to add this food.');
    }
  };

  const handleCustomFoodFormChange = (field: keyof typeof customFoodForm, value: string) => {
    setCustomFoodForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveCustomFood = async () => {
    const baseName = (customFoodForm.name || foodQuery).trim();
    if (!baseName) {
      Alert.alert('Missing Name', 'Enter a food name to save.');
      return;
    }
    if (!selectedMealTypeForAdding) {
      Alert.alert('Select Meal Type', 'Please choose which meal to add this to.');
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
      await addFoodEntry(selectedMealTypeForAdding, food);
      await refreshMealPlans();
      closeMealModal();
    } catch (err: any) {
      if (err?.message === DUPLICATE_MEAL_ENTRY_ERROR) {
        Alert.alert('Duplicate Item', 'This meal already contains that food.');
      } else {
        console.error('Failed to create custom food', err);
        Alert.alert('Error', 'Unable to save this food.');
      }
    } finally {
      setIsCreatingFood(false);
    }
  };

  const confirmDeleteEntry = (entryId: string) => {
    Alert.alert('Delete Meal', 'Remove this meal item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeEntry(entryId);
            await refreshMealPlans();
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Unable to delete meal item.');
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

  if (!phase) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={styles.emptyTitle}>No Active Meal Plan</Text>
            <Text style={styles.emptySubtitle}>
              Complete onboarding to generate your personalized nutrition plan.
            </Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  const renderMealGroup = (group: { mealType: string; entries: MealEntry[] }) => {
    const { mealType, entries } = group;
    if (entries.length === 0) return null;

    const totals = computeEntriesMacroTotals(entries);
    const caloriesLabel = `${Math.round(totals.calories) || 0} kcal`;

    return (
      <View key={mealType} style={styles.mealGroupCard}>
        <View style={styles.mealGroupHeader}>
          <View style={styles.mealGroupIconContainer}>
            <Text style={styles.mealGroupEmoji}>{getMealEmoji(mealType)}</Text>
          </View>
          <View style={styles.mealGroupInfo}>
            <Text style={styles.mealGroupTitle}>{mealType}</Text>
            <Text style={styles.mealGroupMeta}>
              {entries.length > 0 ? caloriesLabel : 'No items logged'}
            </Text>
          </View>
        </View>

        {/* Logged meal entries */}
        <View style={styles.loggedEntriesContainer}>
          {entries.map((entry) => (
            <View key={entry.id} style={styles.mealEntryCard}>
              <View style={styles.mealEntryInfo}>
                <Text style={styles.mealEntryName}>{entry.foodName}</Text>
                <Text style={styles.mealEntryMeta}>{formatMealEntryMacros(entry)}</Text>
              </View>
              <View style={styles.mealEntryActions}>
                {entry.isDone && (
                  <View style={styles.mealEntryDoneBadge}>
                    <Text style={styles.mealEntryDoneText}>✓</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.mealEntryDeleteButton}
                  onPress={() => confirmDeleteEntry(entry.id)}
                  disabled={isMealsMutating}
                >
                  <Text style={styles.mealEntryDeleteText}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderMeals = () => {
    const showEmptyState = mealGroups.length === 0 && !isMealsLoading;

    return (
      <View style={styles.mealsContainer}>
        {isMealsLoading && !dailyMeal ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.loadingText}>Loading meals...</Text>
          </View>
        ) : showEmptyState ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardIcon}>🥗</Text>
            <Text style={styles.emptyCardTitle}>No meals planned</Text>
            <Text style={styles.emptyCardSubtitle}>
              Tap the "+" button below to start planning your nutrition.
            </Text>
          </View>
        ) : (
          mealGroups.map((group) => renderMealGroup(group))
        )}
        {todayMealsError && <Text style={styles.errorText}>{todayMealsError}</Text>}
      </View>
    );
  };

  const renderMealTypeSelector = () => {
    return (
      <View style={styles.mealTypeSelectorContainer}>
        <Text style={styles.mealTypeSelectorLabel}>Add to:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mealTypeChipsScroll}>
          <View style={styles.mealTypeChips}>
            {allMealTypes.map((type) => {
              const isSelected = selectedMealTypeForAdding === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.mealTypeChip, isSelected && styles.mealTypeChipSelected]}
                  onPress={() => setSelectedMealTypeForAdding(type)}
                >
                  <Text style={[styles.mealTypeChipText, isSelected && styles.mealTypeChipTextSelected]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.mealTypeChip}
              onPress={() => {
                setMealTypeDraft('');
                setMealTypeDraftVisible(true);
              }}
            >
              <Text style={styles.mealTypeChipText}>+ New</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        {mealTypeDraftVisible && (
          <View style={styles.customMealTypeInputContainer}>
            <TextInput
              style={styles.customMealTypeInput}
              placeholder="New meal name"
              placeholderTextColor={COLORS.textTertiary}
              value={mealTypeDraft}
              onChangeText={setMealTypeDraft}
              autoFocus
            />
            <View style={styles.customMealTypeActions}>
              <TouchableOpacity
                style={[styles.customMealTypeButton, styles.customMealTypeCancel]}
                onPress={() => {
                  setMealTypeDraft('');
                  setMealTypeDraftVisible(false);
                }}
              >
                <Text style={styles.customMealTypeButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.customMealTypeButton, styles.customMealTypeConfirm]}
                onPress={() => {
                  handleAddCustomMealType(mealTypeDraft);
                  setMealTypeDraft('');
                  setMealTypeDraftVisible(false);
                }}
              >
                <Text style={[styles.customMealTypeButtonText, styles.customMealTypeConfirmText]}>
                  Add
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
          {/* Sticky Header */}
          <View style={styles.stickyHeader}>
            <View style={styles.headerTop}>
              <Text style={styles.headerTitle}>Nutrition</Text>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={styles.weekStrip}
            >
              {weeklyMenus.map((menu) => {
                const isActive = menu.dateStr === selectedDate;
                return (
                  <TouchableOpacity
                    key={menu.dateStr}
                    style={[styles.dayChip, isActive && styles.dayChipActive]}
                    onPress={() => setSelectedDate(menu.dateStr)}
                  >
                    <Text style={[styles.dayChipLabel, isActive && styles.dayChipLabelActive]}>
                      {menu.weekday}
                    </Text>
                    {menu.hasMeals && <View style={styles.dayIndicatorDot} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {renderMeals()}
          </View>
        </ScrollView>

        {/* Global FAB "+" Button */}
        <TouchableOpacity 
          style={styles.fabButton}
          onPress={() => openAddMealModal()}
          activeOpacity={0.9}
        >
          <Text style={styles.fabButtonText}>+</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Add Food Modal */}
      <Modal
        transparent
        animationType="slide"
        visible={mealModalVisible}
        onRequestClose={closeMealModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeMealModal} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {mealModalMode === 'search' ? 'Search Foods' : 'Create Custom Food'}
              </Text>
              <TouchableOpacity onPress={closeMealModal}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {renderMealTypeSelector()}

            <View style={styles.modalModeToggle}>
              <TouchableOpacity
                style={[styles.modeToggleButton, mealModalMode === 'search' && styles.modeToggleButtonActive]}
                onPress={() => setMealModalMode('search')}
              >
                <Text style={[styles.modeToggleText, mealModalMode === 'search' && styles.modeToggleTextActive]}>
                  Search
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeToggleButton, mealModalMode === 'custom' && styles.modeToggleButtonActive]}
                onPress={() => setMealModalMode('custom')}
              >
                <Text style={[styles.modeToggleText, mealModalMode === 'custom' && styles.modeToggleTextActive]}>
                  Custom
                </Text>
              </TouchableOpacity>
            </View>

            {mealModalMode === 'search' ? (
              <>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search for a food..."
                  placeholderTextColor={COLORS.textTertiary}
                  value={foodQuery}
                  onChangeText={handleFoodQueryChange}
                  autoFocus
                />

                <ScrollView style={styles.foodList}>
                  {isSearchingFoods && (
                    <View style={styles.searchingContainer}>
                      <ActivityIndicator size="small" color={COLORS.accent} />
                      <Text style={styles.searchingText}>Searching...</Text>
                    </View>
                  )}
                  {foodSearchError && (
                    <Text style={styles.errorText}>{foodSearchError}</Text>
                  )}
                  {!isSearchingFoods && foodQuery.trim() && foodSuggestions.length === 0 && (
                    <Text style={styles.noResultsText}>No foods found. Try creating a custom food.</Text>
                  )}
                  {foodSuggestions.map((food) => (
                    <TouchableOpacity
                      key={food.id}
                      style={styles.foodSuggestionItem}
                      onPress={() => handleSelectFoodSuggestion(food)}
                    >
                      <View style={styles.foodSuggestionInfo}>
                        <Text style={styles.foodSuggestionName}>{formatFoodDisplayName(food)}</Text>
                        <Text style={styles.foodSuggestionMeta}>{formatFoodMacroSummary(food)}</Text>
                      </View>
                      <Text style={styles.foodSuggestionArrow}>→</Text>
                    </TouchableOpacity>
                  ))}
                  {!foodQuery.trim() && storedFoods.length > 0 && (
                    <>
                      <Text style={styles.recentFoodsLabel}>Recent Foods</Text>
                      {storedFoods.slice(0, 10).map((food) => (
                        <TouchableOpacity
                          key={food.id}
                          style={styles.foodSuggestionItem}
                          onPress={() => handleSelectFoodSuggestion(food)}
                        >
                          <View style={styles.foodSuggestionInfo}>
                            <Text style={styles.foodSuggestionName}>{formatFoodDisplayName(food)}</Text>
                            <Text style={styles.foodSuggestionMeta}>{formatFoodMacroSummary(food)}</Text>
                          </View>
                          <Text style={styles.foodSuggestionArrow}>→</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </ScrollView>
              </>
            ) : (
              <ScrollView style={styles.customFoodForm}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Food Name *</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Chicken Breast"
                    placeholderTextColor={COLORS.textTertiary}
                    value={customFoodForm.name}
                    onChangeText={(text) => handleCustomFoodFormChange('name', text)}
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Brand (optional)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Kirkland"
                    placeholderTextColor={COLORS.textTertiary}
                    value={customFoodForm.brand}
                    onChangeText={(text) => handleCustomFoodFormChange('brand', text)}
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Serving Size (optional)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 100g"
                    placeholderTextColor={COLORS.textTertiary}
                    value={customFoodForm.servingLabel}
                    onChangeText={(text) => handleCustomFoodFormChange('servingLabel', text)}
                  />
                </View>
                <View style={styles.macrosRow}>
                  <View style={[styles.formGroup, styles.macroField]}>
                    <Text style={styles.formLabel}>Calories</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="0"
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="numeric"
                      value={customFoodForm.calories}
                      onChangeText={(text) => handleCustomFoodFormChange('calories', text)}
                    />
                  </View>
                  <View style={[styles.formGroup, styles.macroField]}>
                    <Text style={styles.formLabel}>Protein (g)</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="0"
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="numeric"
                      value={customFoodForm.protein}
                      onChangeText={(text) => handleCustomFoodFormChange('protein', text)}
                    />
                  </View>
                </View>
                <View style={styles.macrosRow}>
                  <View style={[styles.formGroup, styles.macroField]}>
                    <Text style={styles.formLabel}>Carbs (g)</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="0"
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="numeric"
                      value={customFoodForm.carbs}
                      onChangeText={(text) => handleCustomFoodFormChange('carbs', text)}
                    />
                  </View>
                  <View style={[styles.formGroup, styles.macroField]}>
                    <Text style={styles.formLabel}>Fats (g)</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="0"
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="numeric"
                      value={customFoodForm.fats}
                      onChangeText={(text) => handleCustomFoodFormChange('fats', text)}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.saveCustomFoodButton, isCreatingFood && styles.saveCustomFoodButtonDisabled]}
                  onPress={handleSaveCustomFood}
                  disabled={isCreatingFood}
                >
                  {isCreatingFood ? (
                    <ActivityIndicator size="small" color={COLORS.textPrimary} />
                  ) : (
                    <Text style={styles.saveCustomFoodButtonText}>Save & Add to Meal</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
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
    paddingBottom: 100,
  },
  stickyHeader: {
    backgroundColor: COLORS.bgPrimary,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  weekStrip: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  dayChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 70,
    alignItems: 'center',
  },
  dayChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  dayChipLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  dayChipLabelActive: {
    color: COLORS.textPrimary,
  },
  dayIndicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.success,
    marginTop: 4,
  },
  content: {
    padding: 20,
  },
  mealsContainer: {
    gap: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  emptyCard: {
    padding: 32,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  emptyCardIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptyCardSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  mealGroupCard: {
    padding: 18,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  mealGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealGroupIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealGroupEmoji: {
    fontSize: 24,
  },
  mealGroupInfo: {
    flex: 1,
  },
  mealGroupTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  mealGroupMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  loggedEntriesContainer: {
    gap: 6,
  },
  mealEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    gap: 12,
  },
  mealEntryInfo: {
    flex: 1,
  },
  mealEntryName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  mealEntryMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  mealEntryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealEntryDoneBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.successDim,
    borderWidth: 1,
    borderColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealEntryDoneText: {
    fontSize: 14,
    color: COLORS.success,
    fontWeight: '700',
  },
  mealEntryDeleteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,59,48,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealEntryDeleteText: {
    fontSize: 18,
    color: '#FF3B30',
    fontWeight: '600',
  },
  fabButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabButtonText: {
    fontSize: 32,
    fontWeight: '300',
    color: COLORS.textPrimary,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 13,
    textAlign: 'center',
    padding: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalCloseButton: {
    fontSize: 28,
    color: COLORS.textSecondary,
    fontWeight: '300',
  },
  mealTypeSelectorContainer: {
    marginBottom: 16,
  },
  mealTypeSelectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  mealTypeChipsScroll: {
    flexDirection: 'row',
  },
  mealTypeChips: {
    flexDirection: 'row',
    gap: 8,
  },
  mealTypeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mealTypeChipSelected: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  mealTypeChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  mealTypeChipTextSelected: {
    color: COLORS.accent,
  },
  customMealTypeInputContainer: {
    marginTop: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 12,
    padding: 12,
  },
  customMealTypeInput: {
    color: COLORS.textPrimary,
    fontSize: 15,
    paddingVertical: 8,
  },
  customMealTypeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
  },
  customMealTypeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  customMealTypeCancel: {
    backgroundColor: COLORS.surface,
  },
  customMealTypeConfirm: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  customMealTypeButtonText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  customMealTypeConfirmText: {
    color: COLORS.accent,
  },
  modalModeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  modeToggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeToggleButtonActive: {
    backgroundColor: COLORS.elevated,
  },
  modeToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modeToggleTextActive: {
    color: COLORS.textPrimary,
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  foodList: {
    maxHeight: 400,
  },
  searchingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  searchingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  noResultsText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
    padding: 20,
  },
  recentFoodsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  foodSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  foodSuggestionInfo: {
    flex: 1,
  },
  foodSuggestionName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  foodSuggestionMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  foodSuggestionArrow: {
    fontSize: 18,
    color: COLORS.accent,
    marginLeft: 8,
  },
  customFoodForm: {
    maxHeight: 450,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  macrosRow: {
    flexDirection: 'row',
    gap: 12,
  },
  macroField: {
    flex: 1,
  },
  saveCustomFoodButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveCustomFoodButtonDisabled: {
    opacity: 0.5,
  },
  saveCustomFoodButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});
