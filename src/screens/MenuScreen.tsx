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
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { PhasePlan, User } from '../types/domain';
import { formatLocalDateYMD } from '../utils/date';
import { useMealPlans } from '../hooks/useMealPlans';
import { useTodayMeals, DUPLICATE_MEAL_ENTRY_ERROR } from '../hooks/useTodayMeals';
import { FoodItem, MealEntry, createUserFood, fetchStoredFoods, searchFoods } from '../services/mealService';
import { useFabAction } from '../contexts/FabActionContext';
import { computeEntriesMacroTotals, formatMealEntryMacros } from '../utils/mealMacros';

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
};

const SCREEN_GRADIENT = ['#0A0E27', '#151932', '#1E2340'] as const;
const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;
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
  const { setFabAction } = useFabAction();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = formatLocalDateYMD(today);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 6);
  const endKey = formatLocalDateYMD(endDate);

  const { refresh: refreshMealPlans } = useMealPlans(
    user.id,
    todayKey,
    endKey,
    phase?.id ?? null
  );
  const selectedDateObj = useMemo(() => parseLocalDateFromYMD(todayKey), [todayKey]);

  const {
    dailyMeal,
    mealsByType,
    isLoading: isMealsLoading,
    isMutating: isMealsMutating,
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
  const foodSearchCache = useRef<Map<string, FoodItem[]>>(new Map());
  const storedFoodsLoadedRef = useRef(false);

  const loadStoredFoods = useCallback(async () => {
    try {
      const foods = await fetchStoredFoods(user.id);
      setStoredFoods(foods);
      storedFoodsLoadedRef.current = true;
    } catch (err) {
      console.error('Failed to load stored foods', err);
    } 
  }, [user.id]);

  const baseMealTypes = useMemo(() => Object.keys(mealsByType), [mealsByType]);

  const mealGroups = useMemo(() => {
    return baseMealTypes
      .map((mealType) => ({
        mealType,
        entries: mealsByType[mealType] ?? [],
      }))
      .filter((group) => group.entries.length > 0);
  }, [baseMealTypes, mealsByType]);
  const totalDayMacros = useMemo(() => {
    const allEntries = mealGroups.flatMap((group) => group.entries);
    return computeEntriesMacroTotals(allEntries);
  }, [mealGroups]);

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
    DEFAULT_MEAL_TYPES.forEach((type) => pushType(type));
    mealGroups.forEach((group) => pushType(group.mealType));
    customMealTypes.forEach((type) => pushType(type));
    return ordered;
  }, [mealGroups, customMealTypes]);

  useEffect(() => {
    if (!selectedMealTypeForAdding && allMealTypes.length > 0) {
      setSelectedMealTypeForAdding(allMealTypes[0]);
    }
  }, [allMealTypes, selectedMealTypeForAdding]);

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

  const openAddMealModal = useCallback((defaultMealType?: string) => {
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
  }, [allMealTypes, loadStoredFoods]);

  useFocusEffect(
    useCallback(() => {
      setFabAction('Menu', {
        label: 'Meal',
        icon: '+',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: () => openAddMealModal(),
      });

      return () => setFabAction('Menu', null);
    }, [openAddMealModal, setFabAction])
  );

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
    if (mealModalVisible && mealModalMode !== 'search') return;
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

  useEffect(() => {
    if (!storedFoodsLoadedRef.current) {
      loadStoredFoods();
    }
  }, [loadStoredFoods]);

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

  const renderMealGroup = ({ item: group }: { item: { mealType: string; entries: MealEntry[] } }) => {
    const { mealType, entries } = group;

    const totals = computeEntriesMacroTotals(entries);
    const caloriesLabel = `${Math.round(totals.calories) || 0} kcal`;
    const macroLine = `${Math.round(totals.protein) || 0}g P · ${Math.round(totals.carbs) || 0}g C · ${Math.round(totals.fats) || 0}g F`;

    return (
      <View style={styles.mealGroupCard}>
        <View style={styles.mealGroupHeader}>
          <View style={styles.mealGroupIcon}>
            <Text style={styles.mealGroupEmoji}>{getMealEmoji(mealType)}</Text>
          </View>
          <View style={styles.mealGroupHeaderText}>
            <Text style={styles.mealGroupTitle}>{mealType}</Text>
            <Text style={styles.mealGroupMeta}>{caloriesLabel}</Text>
            <Text style={styles.mealGroupMacros}>{macroLine}</Text>
          </View>
        </View>
        <View style={styles.mealItems}>
          {entries.map((entry, index) => (
            <View
              key={entry.id}
              style={[
                styles.mealEntryRow,
                index === entries.length - 1 && styles.mealEntryRowLast,
              ]}
            >
              <View style={styles.mealEntryInfo}>
                <Text style={styles.mealEntryName}>{entry.foodName}</Text>
                <Text style={styles.mealEntryMacros}>{formatMealEntryMacros(entry)}</Text>
              </View>
              <View style={styles.mealEntryActions}>
                {entry.isDone ? (
                  <View style={styles.mealEntryDoneBadge}>
                    <Text style={styles.mealEntryDoneText}>✓</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.mealEntryDeleteButton}
                    onPress={() => confirmDeleteEntry(entry.id)}
                    disabled={isMealsMutating}
                  >
                    <Text style={styles.mealEntryDeleteText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderMacroSummary = () => {
    if (!mealGroups.length) return null;
    const { calories, protein, carbs, fats } = totalDayMacros;
    const calorieGoal = 2500;
    const macroCalories = {
      protein: (protein ?? 0) * 4,
      carbs: (carbs ?? 0) * 4,
      fats: (fats ?? 0) * 9,
    };
    const macroItems = [
      {
        label: 'Protein',
        calories: macroCalories.protein,
        grams: protein ?? 0,
        color: '#00F5A0',
        radius: 86,
      },
      {
        label: 'Carbs',
        calories: macroCalories.carbs,
        grams: carbs ?? 0,
        color: '#FF6B9D',
        radius: 74,
      },
      {
        label: 'Fat',
        calories: macroCalories.fats,
        grams: fats ?? 0,
        color: '#FFB74D',
        radius: 62,
      },
    ];
    const ringSize = 190;
    const ringCenter = ringSize / 2;

    return (
      <View style={styles.macroSummaryCard}>
        <View style={styles.macroSummaryRow}>
          <View style={styles.macroDonut}>
            <Svg
              width={ringSize}
              height={ringSize}
              viewBox={`0 0 ${ringSize} ${ringSize}`}
              style={styles.ringSvg}
            >
              {macroItems.map((item) => {
                const circumference = 2 * Math.PI * item.radius;
                const progress = Math.min(item.calories / calorieGoal, 1);
                return (
                  <React.Fragment key={item.label}>
                    <Circle
                      cx={ringCenter}
                      cy={ringCenter}
                      r={item.radius}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth={14}
                      fill="none"
                    />
                    <Circle
                      cx={ringCenter}
                      cy={ringCenter}
                      r={item.radius}
                      stroke={item.color}
                      strokeWidth={14}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${circumference} ${circumference}`}
                      strokeDashoffset={circumference * (1 - progress)}
                      rotation={-90}
                      originX={ringCenter}
                      originY={ringCenter}
                    />
                  </React.Fragment>
                );
              })}
            </Svg>
            <View style={styles.donutCenter}>
              <Text style={styles.donutLabel}>Calories</Text>
              <Text style={styles.donutValue}>{Math.round(calories ?? 0)}</Text>
              <Text style={styles.donutUnit}>kcal</Text>
            </View>
          </View>
          <View style={styles.macroLegend}>
            {macroItems.map((item) => {
              const percent = calorieGoal
                ? Math.min(100, Math.round((item.calories / calorieGoal) * 100))
                : 0;
              return (
                <View key={item.label} style={styles.macroLegendItem}>
                  <View style={[styles.macroLegendDot, { backgroundColor: item.color }]} />
                  <View>
                    <Text style={styles.macroLegendLabel}>{item.label}</Text>
                    <Text style={styles.macroLegendValue}>
                      {Math.round(item.grams)}g · {percent}% goal
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const renderMealsEmpty = () => {
    if (isMealsLoading && !dailyMeal) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.loadingText}>Loading meals...</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyCardIcon}>🥗</Text>
        <Text style={styles.emptyCardTitle}>No meals for today</Text>
        <Text style={styles.emptyCardSubtitle}>
          Tap the + button to add foods to your meals.
        </Text>
      </View>
    );
  };

  const renderMealGroupSeparator = () => <View style={styles.mealGroupSeparator} />;
  const renderMealListFooter = () => <View style={styles.mealsListFooter} />;

  return (
    <View style={styles.container}>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
        {/* Sticky Header */}
        <View style={styles.stickyHeader}>
          <View style={styles.headerTop}>
          </View>
        </View>

        {renderMacroSummary()}

        {/* Content */}
        <View style={styles.content}>
          <FlatList
            data={mealGroups}
            renderItem={renderMealGroup}
            keyExtractor={(item) => item.mealType}
            showsVerticalScrollIndicator={false}
            style={styles.mealsScroll}
            contentContainerStyle={styles.mealsScrollContent}
            ListEmptyComponent={renderMealsEmpty}
            ItemSeparatorComponent={renderMealGroupSeparator}
            ListFooterComponent={renderMealListFooter}
          />
        </View>

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
                      <Text style={styles.foodSuggestionArrow}>+</Text>
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
                          <Text style={styles.foodSuggestionArrow}>+</Text>
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
  stickyHeader: {
    backgroundColor: COLORS.bgPrimary,
    paddingTop: 72,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTop: {
    minHeight: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 0,
  },
  mealsScroll: {
    flex: 1,
  },
  macroSummaryCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 220,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  mealsScrollContent: {
    paddingTop: 0,
    flexGrow: 1,
  },
  mealsListFooter: {
    height: 220,
  },
  macroSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  macroDonut: {
    width: 190,
    height: 190,
    borderRadius: 95,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  donutCenter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    position: 'absolute',
    backgroundColor: COLORS.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutLabel: {
    fontSize: 11,
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  donutValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  donutUnit: {
    fontSize: 11,
    color: COLORS.textTertiary,
  },
  macroLegend: {
    flex: 1,
    gap: 12,
  },
  macroLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  macroLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  macroLegendLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  macroLegendValue: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  mealGroupSeparator: {
    height: 16,
  },
  mealGroupCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  mealGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
  mealGroupHeaderText: {
    flex: 1,
  },
  mealGroupTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  mealGroupMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  mealGroupMacros: {
    fontSize: 12,
    color: COLORS.textTertiary,
  },
  mealItems: {
    paddingTop: 12,
  },
  mealEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mealEntryRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  mealEntryInfo: {
    flex: 1,
    paddingRight: 12,
  },
  mealEntryName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  mealEntryMacros: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  mealEntryActions: {
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,59,48,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealEntryDeleteText: {
    fontSize: 18,
    color: '#FF3B30',
    fontWeight: '600',
    marginTop: -2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  emptyCardIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  emptyCardSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
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
