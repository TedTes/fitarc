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
  Image,
  Animated,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { PhasePlan, User } from '../types/domain';
import { formatLocalDateYMD } from '../utils/date';
import { useMealPlans } from '../hooks/useMealPlans';
import { useTodayMeals, DUPLICATE_MEAL_ENTRY_ERROR } from '../hooks/useTodayMeals';
import { FoodItem, MealEntry, createUserFood, fetchStoredFoods, searchFoods } from '../services/mealService';
import { generateMealsForDay } from '../services/mealGenerationService';
import { useFabAction } from '../contexts/FabActionContext';
import { computeEntriesMacroTotals, formatMealEntryMacros } from '../utils/mealMacros';
import { estimateDailyCalories } from '../utils/calorieGoal';

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
};

const SCREEN_GRADIENT = ['#0A0E27', '#151932', '#1E2340'] as const;
const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;
const MACRO_SPLIT = { protein: 0.3, carbs: 0.4, fats: 0.3 };
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
  protein: '#00F5A0',
  carbs: '#6C63FF',
  fats: '#FF6B9D',
};

const getMealEmoji = (title: string): string => {
  const normalized = title.toLowerCase();
  if (normalized.includes('breakfast')) return '🌅';
  if (normalized.includes('lunch')) return '☀️';
  if (normalized.includes('dinner')) return '🌙';
  if (normalized.includes('snack')) return '🥑';
  return '🍽️';
};

const getMealGradient = (mealType: string): [string, string] => {
  const type = mealType.toLowerCase();
  if (type.includes('breakfast')) return ['#FF9A56', '#FF6B9D'];
  if (type.includes('lunch')) return ['#FFD93D', '#FFB800'];
  if (type.includes('dinner')) return ['#6C63FF', '#9D8FFF'];
  if (type.includes('snack')) return ['#00F5A0', '#00D4A1'];
  return ['#6C63FF', '#9D8FFF'];
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
  const selectedDateObj = useMemo(() => {
    const [yearStr, monthStr, dayStr] = todayKey.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr) - 1;
    const day = Number(dayStr);
    return new Date(year, month, day);
  }, [todayKey]);

  const {
    dailyMeal,
    mealsByType,
    isLoading: isMealsLoading,
    isMutating: isMealsMutating,
    addEntryFromFood: addFoodEntry,
    removeEntry,
    refetch: refetchMeals,
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
  const [isGeneratingMeals, setIsGeneratingMeals] = useState(false);
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
  const [mealDetailsVisible, setMealDetailsVisible] = useState(false);
  const [mealDetailsGroup, setMealDetailsGroup] = useState<{
    mealType: string;
    entries: MealEntry[];
    featured?: MealEntry | null;
  } | null>(null);
  const foodSearchCache = useRef<Map<string, FoodItem[]>>(new Map());
  const storedFoodsLoadedRef = useRef(false);
  const mealGenerationAttemptedRef = useRef<Set<string>>(new Set());

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

  const calorieGoal = useMemo(
    () => estimateDailyCalories(user).goalCalories,
    [user]
  );

  const buildMacroTargets = useCallback((calorieTarget: number) => {
    const proteinCalories = calorieTarget * MACRO_SPLIT.protein;
    const carbCalories = calorieTarget * MACRO_SPLIT.carbs;
    const fatCalories = calorieTarget * MACRO_SPLIT.fats;
    return {
      protein_g: Math.round(proteinCalories / 4),
      carbs_g: Math.round(carbCalories / 4),
      fats_g: Math.round(fatCalories / 9),
    };
  }, []);

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

  useEffect(() => {
    if (!phase || !user?.id) return;
    if (isMealsLoading || isGeneratingMeals) return;
    const attemptKey = `${phase.id}:${todayKey}`;
    if (mealGenerationAttemptedRef.current.has(attemptKey)) return;

    const generateMeals = async () => {
      mealGenerationAttemptedRef.current.add(attemptKey);
      setIsGeneratingMeals(true);
      try {
        const calorieTarget = calorieGoal;
        const macroTargets = buildMacroTargets(calorieTarget);
        await generateMealsForDay({
          user_id: user.id,
          plan_id: phase.id,
          date: todayKey,
          calorie_target: calorieTarget,
          macro_targets: macroTargets,
          meal_count: 3,
          dietary_tags: [],
          excluded_ingredients: [],
          preferred_ingredients: [
            'chicken',
            'tofu',
            'oats',
            'greek yogurt',
            'apple',
            'orange',
            'kiwi',
            'sweet potatoes',
            'sardine',
            'cottage cheese',
            'chickpeas',
            'peanut butter',
            'eggs',
          ],
          cuisine: '',
          max_ready_time_minutes: 30,
          force_regenerate: false,
        });
        await refetchMeals();
      } catch (err) {
        console.error('Failed to generate meals', err);
      } finally {
        setIsGeneratingMeals(false);
      }
    };

    generateMeals();
  }, [
    buildMacroTargets,
    calorieGoal,
    isGeneratingMeals,
    isMealsLoading,
    mealGroups.length,
    phase,
    refetchMeals,
    todayKey,
    user?.id,
  ]);

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

  const openMealDetails = (mealType: string, entries: MealEntry[]) => {
    const featured = entries.find((entry) => entry.imageUrl) || entries[0] || null;
    setMealDetailsGroup({ mealType, entries, featured });
    setMealDetailsVisible(true);
  };

  const closeMealDetails = () => {
    setMealDetailsVisible(false);
    setMealDetailsGroup(null);
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
    const gradientColors = getMealGradient(mealType);

    // Get the first entry with an image for the card header
    const featuredEntry = entries.find(e => e.imageUrl) || entries[0];

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => openMealDetails(mealType, entries)}
        style={styles.mealCardContainer}
      >
        <View style={styles.mealCard}>
          {/* Meal Image Header */}
          {featuredEntry?.imageUrl ? (
            <View style={styles.mealImageContainer}>
              <Image
                source={{ uri: featuredEntry.imageUrl }}
                style={styles.mealImage}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.9)']}
                style={styles.mealImageGradient}
              />

              {/* Meal Type Badge */}
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.mealTypeBadge}
              >
                <Text style={styles.mealTypeBadgeEmoji}>{getMealEmoji(mealType)}</Text>
                <Text style={styles.mealTypeBadgeText}>{mealType}</Text>
              </LinearGradient>

              {/* Completion Badge */}
              {entries.every(e => e.isDone) && (
                <View style={styles.completedBadge}>
                  <Text style={styles.completedBadgeText}>✓</Text>
                </View>
              )}

              {/* Meal Name Overlay - Bottom Left */}
              <View style={styles.mealNameOverlay}>
                <Text style={styles.mealNameText} numberOfLines={2}>
                  {featuredEntry.foodName}
                </Text>
              </View>

              {/* Macro Grid Overlay - Bottom */}
              <View style={styles.macroGridOverlay}>
                <View style={styles.macroItemOverlay}>
                  <Text style={styles.macroValueOverlay}>{Math.round(totals.calories) || 0}</Text>
                  <Text style={styles.macroLabelOverlay}>kcal</Text>
                </View>
                <View style={styles.macroItemDividerOverlay} />
                <View style={styles.macroItemOverlay}>
                  <Text style={[styles.macroValueOverlay, { color: COLORS.protein }]}>
                    {Math.round(totals.protein) || 0}g
                  </Text>
                  <Text style={styles.macroLabelOverlay}>P</Text>
                </View>
                <View style={styles.macroItemDividerOverlay} />
                <View style={styles.macroItemOverlay}>
                  <Text style={[styles.macroValueOverlay, { color: COLORS.carbs }]}>
                    {Math.round(totals.carbs) || 0}g
                  </Text>
                  <Text style={styles.macroLabelOverlay}>C</Text>
                </View>
                <View style={styles.macroItemDividerOverlay} />
                <View style={styles.macroItemOverlay}>
                  <Text style={[styles.macroValueOverlay, { color: COLORS.fats }]}>
                    {Math.round(totals.fats) || 0}g
                  </Text>
                  <Text style={styles.macroLabelOverlay}>F</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.mealHeaderNoImage}>
              <View style={styles.mealHeaderNoImageTop}>
                <LinearGradient
                  colors={gradientColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.mealTypeBadgeNoImage}
                >
                  <Text style={styles.mealTypeBadgeEmoji}>{getMealEmoji(mealType)}</Text>
                  <Text style={styles.mealTypeBadgeText}>{mealType}</Text>
                </LinearGradient>
              </View>
              <Text style={styles.mealNameNoImage} numberOfLines={2}>
                {featuredEntry.foodName}
              </Text>
              <View style={styles.macroGridNoImage}>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{Math.round(totals.calories) || 0}</Text>
                  <Text style={styles.macroLabel}>kcal</Text>
                </View>
                <View style={styles.macroItemDivider} />
                <View style={styles.macroItem}>
                  <Text style={[styles.macroValue, { color: COLORS.protein }]}>
                    {Math.round(totals.protein) || 0}g
                  </Text>
                  <Text style={styles.macroLabel}>P</Text>
                </View>
                <View style={styles.macroItemDivider} />
                <View style={styles.macroItem}>
                  <Text style={[styles.macroValue, { color: COLORS.carbs }]}>
                    {Math.round(totals.carbs) || 0}g
                  </Text>
                  <Text style={styles.macroLabel}>C</Text>
                </View>
                <View style={styles.macroItemDivider} />
                <View style={styles.macroItem}>
                  <Text style={[styles.macroValue, { color: COLORS.fats }]}>
                    {Math.round(totals.fats) || 0}g
                  </Text>
                  <Text style={styles.macroLabel}>F</Text>
                </View>
              </View>
            </View>
          )}

        </View>
      </TouchableOpacity>
    );
  };

  const renderMacroSummary = () => {
    if (!mealGroups.length) return null;
    const { calories, protein, carbs, fats } = totalDayMacros;
    const macroTargets = buildMacroTargets(calorieGoal);

    const macroItems = [
      {
        label: 'Protein',
        current: protein ?? 0,
        target: macroTargets.protein_g,
        color: COLORS.protein,
        size: 80,
      },
      {
        label: 'Carbs',
        current: carbs ?? 0,
        target: macroTargets.carbs_g,
        color: COLORS.carbs,
        size: 80,
      },
      {
        label: 'Fat',
        current: fats ?? 0,
        target: macroTargets.fats_g,
        color: COLORS.fats,
        size: 80,
      },
    ];

    return (
      <View style={styles.macroSummaryCard}>
        <View style={styles.macroRingsRow}>
          {macroItems.map((item) => {
            const radius = (item.size - 6) / 2;
            const circumference = 2 * Math.PI * radius;
            const progress = Math.min(item.current / item.target, 1);
            const strokeDashoffset = circumference * (1 - progress);

            return (
              <View key={item.label} style={styles.macroRingContainer}>
                <Svg width={item.size} height={item.size} style={{ transform: [{ rotate: '-90deg' }] }}>
                  <Circle
                    cx={item.size / 2}
                    cy={item.size / 2}
                    r={radius}
                    stroke={COLORS.border}
                    strokeWidth={6}
                    fill="none"
                  />
                  <Circle
                    cx={item.size / 2}
                    cy={item.size / 2}
                    r={radius}
                    stroke={item.color}
                    strokeWidth={6}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </Svg>
                <View style={styles.macroRingCenter}>
                  <Text style={styles.macroRingValue}>{Math.round(item.current)}</Text>
                  <Text style={styles.macroRingLabel}>{item.label[0]}</Text>
                </View>
                <Text style={styles.macroRingTarget}>/{item.target}g</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.calorieSummary}>
          <Text style={styles.calorieValue}>{Math.round(calories ?? 0).toLocaleString()}</Text>
          <Text style={styles.calorieLabel}>/ {calorieGoal.toLocaleString()} kcal</Text>
        </View>
      </View>
    );
  };

  const renderMealsEmpty = () => {
    if (isGeneratingMeals) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.loadingText}>Generating your meals...</Text>
        </View>
      );
    }
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
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerDate}>
              {today.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <Text style={styles.headerSubtitle}>Your Daily Nutrition</Text>
          </View>

          {/* Macro Summary */}
          {renderMacroSummary()}

          {/* Meals Section */}
          <View style={styles.mealsSection}>
            {mealGroups.length > 0 && (
              <View style={styles.mealsSectionHeader}>
                <Text style={styles.mealsSectionTitle}>Today's Meals</Text>
                <View style={styles.completionBadge}>
                  <Text style={styles.completionBadgeText}>
                    {mealGroups.filter(g => g.entries.every(e => e.isDone)).length}/{mealGroups.length}
                  </Text>
                </View>
              </View>
            )}

            <FlatList
              data={mealGroups}
              renderItem={renderMealGroup}
              keyExtractor={(item) => item.mealType}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
              ListEmptyComponent={renderMealsEmpty}
              ItemSeparatorComponent={renderMealGroupSeparator}
              ListFooterComponent={renderMealListFooter}
            />
          </View>
        </ScrollView>
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

      <Modal
        transparent
        animationType="fade"
        visible={mealDetailsVisible}
        onRequestClose={closeMealDetails}
      >
        <View style={styles.detailModalOverlay}>
          <Pressable style={styles.detailModalBackdrop} onPress={closeMealDetails} />
          <View style={styles.detailModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ingredients</Text>
              <TouchableOpacity onPress={closeMealDetails}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.ingredientsList}>
              {mealDetailsGroup?.entries.map((entry) => {
                const ingredients = entry.ingredients ?? [];
                return (
                  <View key={entry.id} style={styles.detailMealBlock}>
                    <View style={styles.detailMealHeader}>
                      <View style={styles.detailMealHeaderText}>
                        <Text style={styles.detailMealTitle}>{entry.foodName}</Text>
                        <Text style={styles.detailMealMacros}>{formatMealEntryMacros(entry)}</Text>
                      </View>
                    </View>
                    {ingredients.length > 0 ? (
                      ingredients.map((ingredient, index) => (
                        <View key={`${entry.id}-ingredient-${index}`} style={styles.detailIngredientRow}>
                          <View style={styles.detailIngredientBullet} />
                          <Text style={styles.detailIngredientText}>{ingredient}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.detailIngredientEmpty}>Ingredients unavailable.</Text>
                    )}
                  </View>
                );
              })}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 100,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  headerDate: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // Macro Summary
  macroSummaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  macroRingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  macroRingContainer: {
    alignItems: 'center',
    gap: 8,
  },
  macroRingCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  macroRingValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  macroRingLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textTertiary,
    marginTop: -2,
  },
  macroRingTarget: {
    fontSize: 13,
    color: COLORS.textTertiary,
    fontWeight: '600',
  },
  calorieSummary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  calorieValue: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  calorieLabel: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },

  // Meals Section
  mealsSection: {
    paddingHorizontal: 20,
  },
  mealsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  mealsSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  completionBadge: {
    backgroundColor: COLORS.accentDim,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  completionBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },

  // Meal Card
  mealCardContainer: {
    marginBottom: 16,
  },
  mealCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mealImageContainer: {
    height: 220,
    position: 'relative',
  },
  mealImage: {
    width: '100%',
    height: '100%',
  },
  mealImageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  mealTypeBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  mealTypeBadgeEmoji: {
    fontSize: 16,
  },
  mealTypeBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  completedBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  completedBadgeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mealNameOverlay: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    right: 16,
  },
  mealNameText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 26,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  macroGridOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 12,
    padding: 10,
    backdropFilter: 'blur(10px)',
  },
  macroItemOverlay: {
    flex: 1,
    alignItems: 'center',
  },
  macroItemDividerOverlay: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  macroValueOverlay: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  macroLabelOverlay: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  mealHeaderNoImage: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mealHeaderNoImageTop: {
    marginBottom: 12,
  },
  mealTypeBadgeNoImage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  mealNameNoImage: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
    lineHeight: 24,
  },
  macroGridNoImage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 12,
    padding: 12,
  },

  // Macro items (for no-image cards)
  macroItem: {
    flex: 1,
    alignItems: 'center',
  },
  macroItemDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  macroLabel: {
    fontSize: 11,
    color: COLORS.textTertiary,
    fontWeight: '600',
  },
  expandIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 16,
  },
  expandIndicatorWithBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  expandText: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '600',
  },
  expandIcon: {
    fontSize: 18,
    color: COLORS.accent,
    fontWeight: '700',
    transform: [{ rotate: '90deg' }],
  },
  expandIconRotated: {
    transform: [{ rotate: '270deg' }],
  },

  // Expanded Items
  mealItemsContainer: {
    backgroundColor: COLORS.bgPrimary,
    padding: 16,
    paddingTop: 8,
  },
  mealEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mealEntryImage: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: COLORS.elevated,
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

  // Empty States
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  emptyCard: {
    padding: 32,
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

  mealGroupSeparator: {
    height: 0,
  },
  mealsListFooter: {
    height: 32,
  },

  // Modal Styles
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
  ingredientsList: {
    maxHeight: 520,
  },
  detailModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  detailModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  detailModalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
    maxHeight: '85%',
  },
  detailMealBlock: {
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailMealHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  detailMealHeaderText: {
    flex: 1,
  },
  detailMealTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  detailMealMacros: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  detailIngredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  detailIngredientBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.accent,
    marginTop: 7,
  },
  detailIngredientText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  detailIngredientEmpty: {
    fontSize: 13,
    color: COLORS.textTertiary,
    fontStyle: 'italic',
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
  errorText: {
    textAlign: 'center',
    color: '#FF3B30',
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

export default MenuScreen;
