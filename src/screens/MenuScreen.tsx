import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  Image,
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
import Animated, {
  interpolate,
  Extrapolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';

import { MealPreferences, PhasePlan, User } from '../types/domain';
import { formatLocalDateYMD } from '../utils/date';
import { useTodayMeals } from '../hooks/useTodayMeals';
import { MealEntry } from '../services/mealService';
import { generateMealsForDay } from '../services/mealGenerationService';
import { updateMealPreferences } from '../services/userProfileService';
import { useFabAction } from '../contexts/FabActionContext';
import { computeEntriesMacroTotals, MacroSummary } from '../utils/mealMacros';
import { estimateDailyCalories } from '../utils/calorieGoal';

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
};

const SCREEN_GRADIENT = ['#0A0E27', '#0D1229', '#111633'] as const;

const COLORS = {
  background: '#0A0E27',
  surface: '#151932',
  surfaceLight: '#1E2340',
  primary: '#6C63FF',
  accent: '#00F5A0',
  calories: '#FFB800',
  protein: '#00D9A3',
  carbs: '#6C63FF',
  fats: '#FF6B93',
  text: '#FFFFFF',
  textSecondary: '#8B93B0',
  textMuted: '#5A6178',
  border: '#2A2F4F',
  success: '#00F5A0',
  warning: '#FFB800',
  error: '#FF6B93',
  eaten: '#00F5A0',
  planned: '#6C63FF',
  skipped: '#5A6178',
} as const;

const MACRO_SPLIT = { protein: 0.3, carbs: 0.4, fats: 0.3 };

const MEAL_CONFIG: Record<
  string,
  { emoji: string; gradient: readonly [string, string]; time: string }
> = {
  Breakfast: { emoji: '🌅', gradient: ['#FF9A56', '#FF6B35'], time: '7:30 AM' },
  Lunch: { emoji: '🌤️', gradient: ['#FFB800', '#FF9500'], time: '12:30 PM' },
  Dinner: { emoji: '🌙', gradient: ['#6C63FF', '#5449CC'], time: '7:00 PM' },
  Snack: { emoji: '🍎', gradient: ['#00F5A0', '#00D9A3'], time: '3:00 PM' },
};

const CUISINE_OPTIONS = [
  { id: 'mixed', label: 'Mixed (No Preference)', emoji: '🌍' },
  { id: 'mediterranean', label: 'Mediterranean', emoji: '🫒' },
  { id: 'asian', label: 'Asian', emoji: '🍜' },
  { id: 'american', label: 'American', emoji: '🍔' },
  { id: 'latin american', label: 'Latin American', emoji: '🌮' },
  { id: 'middle eastern', label: 'Middle Eastern', emoji: '🧆' },
];

const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'gluten free', label: 'Gluten-Free' },
  { id: 'dairy free', label: 'Dairy-Free' },
  { id: 'ketogenic', label: 'Keto/Low-Carb' },
];

const COOK_TIME_OPTIONS = [15, 30, 45, 60];

type MealGroup = {
  mealType: string;
  entries: MealEntry[];
  isAllEaten: boolean;
  totals: MacroSummary;
};

type MealStatus = 'eaten' | 'planned' | 'skipped';

const getMealStatus = (entries: MealEntry[]): MealStatus => {
  if (entries.length === 0) return 'planned';
  if (entries.every((entry) => entry.isDone)) return 'eaten';
  if (entries.some((entry) => entry.isDone)) return 'planned';
  return 'planned';
};

const getStatusConfig = (status: MealStatus) => {
  switch (status) {
    case 'eaten':
      return { icon: 'checkmark-circle', color: COLORS.eaten, label: 'Eaten' };
    case 'skipped':
      return { icon: 'close-circle', color: COLORS.skipped, label: 'Skipped' };
    default:
      return { icon: 'time-outline', color: COLORS.planned, label: 'Planned' };
  }
};

const getMealConfig = (mealType: string) => MEAL_CONFIG[mealType] || MEAL_CONFIG.Snack;

const buildDefaultMealPreferences = (): MealPreferences => ({
  cuisine: 'mixed',
  dietary_tags: [],
  excluded_ingredients: [],
  max_ready_time_minutes: 30,
});

const resolveMealPreferences = (prefs?: MealPreferences | null): MealPreferences => {
  const base = buildDefaultMealPreferences();
  if (!prefs) return base;
  return {
    ...base,
    ...prefs,
    dietary_tags: prefs.dietary_tags ?? [],
    excluded_ingredients: prefs.excluded_ingredients ?? [],
  };
};

const CircularProgress: React.FC<{
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
}> = ({ size, strokeWidth, progress, color }) => {
  const AnimatedCircle = useMemo(
    () => RNAnimated.createAnimatedComponent(Circle),
    []
  );
  const progressAnim = useRef(new RNAnimated.Value(0)).current;
  const normalizedProgress = Math.max(progress, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gapLength = Math.max(8, strokeWidth * 0.9);
  const maxProgress = (circumference - gapLength) / circumference;
  const clampedProgress = Math.min(normalizedProgress, maxProgress);

  useEffect(() => {
    RNAnimated.timing(progressAnim, {
      toValue: clampedProgress,
      duration: 320,
      useNativeDriver: false,
    }).start();
  }, [clampedProgress, progressAnim]);

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="transparent"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
};

const MealCard: React.FC<{
  group: MealGroup;
  onLogMeal: (mealType: string) => void;
  onSwapMeal: (mealType: string, entryId: string) => void;
  onViewDetails: (entry: MealEntry) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}> = ({
  group,
  onLogMeal,
  onSwapMeal,
  onViewDetails,
  isExpanded,
  onToggleExpand,
}) => {
  const config = getMealConfig(group.mealType);
  const status = getMealStatus(group.entries);
  const statusConfig = getStatusConfig(status);
  const featuredEntry = group.entries.find((entry) => entry.imageUrl) || group.entries[0];

  const expandAnim = useSharedValue(isExpanded ? 1 : 0);

  useEffect(() => {
    expandAnim.value = withTiming(isExpanded ? 1 : 0, { duration: 220 });
  }, [expandAnim, isExpanded]);

  const expandedStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(expandAnim.value, [0, 1], [0, 300], Extrapolate.CLAMP),
    opacity: interpolate(expandAnim.value, [0, 1], [0, 1], Extrapolate.CLAMP),
  }));

  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineConnector}>
        <View style={[styles.timelineDot, { backgroundColor: statusConfig.color }]}
        >
          {status === 'eaten' && (
            <Ionicons name="checkmark" size={12} color={COLORS.background} />
          )}
        </View>
        <View style={styles.timelineLine} />
      </View>

      <View style={styles.mealCardWrapper}>
        <Text style={styles.timeLabel}>{config.time}</Text>

        <TouchableOpacity
          style={styles.mealCard}
          onPress={onToggleExpand}
          activeOpacity={0.9}
        >
          <View style={styles.mealCardHeader}>
            <View style={styles.mealCardMain}>
              {featuredEntry?.imageUrl ? (
                <Image
                  source={{ uri: featuredEntry.imageUrl }}
                  style={styles.mealThumbnail}
                />
              ) : (
                <View style={[styles.mealThumbnailPlaceholder]}>
                  <Text style={styles.mealThumbnailEmoji}>{config.emoji}</Text>
                </View>
              )}

              <View style={styles.mealInfo}>
                <View style={styles.mealTitleRow}>
                  <LinearGradient
                    colors={config.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.mealTypeBadge}
                  >
                    <Text style={styles.mealTypeEmoji}>{config.emoji}</Text>
                    <Text style={styles.mealTypeText}>{group.mealType}</Text>
                  </LinearGradient>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: `${statusConfig.color}20` },
                    ]}
                  >
                    <Ionicons
                      name={statusConfig.icon as never}
                      size={12}
                      color={statusConfig.color}
                    />
                    <Text style={[styles.statusText, { color: statusConfig.color }]}
                    >
                      {statusConfig.label}
                    </Text>
                  </View>
                </View>

                <Text style={styles.mealName} numberOfLines={1}>
                  {featuredEntry?.foodName || 'No meal planned'}
                </Text>

                <Text style={styles.mealMacrosCompact}>
                  {Math.round(group.totals.calories)} kcal · {Math.round(group.totals.protein)}P ·
                  {Math.round(group.totals.carbs)}C · {Math.round(group.totals.fats)}F
                </Text>
              </View>
            </View>

            <View style={styles.quickActions}>
              {status !== 'eaten' && (
                <TouchableOpacity
                  style={styles.quickActionBtn}
                  onPress={() => onLogMeal(group.mealType)}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={22}
                    color={COLORS.success}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={() => featuredEntry && onSwapMeal(group.mealType, featuredEntry.id)}
              >
                <Ionicons name="swap-horizontal" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.textMuted}
              />
            </View>
          </View>

          <Animated.View style={[styles.expandedContent, expandedStyle]}>
            <View style={styles.divider} />

            {group.entries.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={styles.entryRow}
                onPress={() => onViewDetails(entry)}
              >
                <View style={styles.entryInfo}>
                  <Text style={styles.entryName} numberOfLines={1}>
                    {entry.foodName}
                  </Text>
                  <Text style={styles.entryMacros}>
                    {entry.calories} kcal · {entry.protein}P · {entry.carbs}C · {entry.fats}F
                  </Text>
                </View>
                <View style={styles.entryActions}>
                  {entry.isDone ? (
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                  ) : (
                    <TouchableOpacity onPress={() => onLogMeal(group.mealType)}>
                      <Text style={styles.logBtn}>Log</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))}

            <View style={styles.microsSection}>
              <Text style={styles.microsTitle}>Micronutrients</Text>
              <View style={styles.microsGrid}>
                <View style={styles.microItem}>
                  <Text style={styles.microValue}>12%</Text>
                  <Text style={styles.microLabel}>Iron</Text>
                </View>
                <View style={styles.microItem}>
                  <Text style={styles.microValue}>8g</Text>
                  <Text style={styles.microLabel}>Fiber</Text>
                </View>
                <View style={styles.microItem}>
                  <Text style={styles.microValue}>890mg</Text>
                  <Text style={styles.microLabel}>Sodium</Text>
                </View>
                <View style={styles.microItem}>
                  <Text style={styles.microValue}>15%</Text>
                  <Text style={styles.microLabel}>Vit C</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const MealDetailSheet: React.FC<{
  visible: boolean;
  entry: MealEntry | null;
  onClose: () => void;
  onSwap: () => void;
  onLog: () => void;
}> = ({ visible, entry, onClose, onSwap, onLog }) => {
  if (!entry) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.sheetContent}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={2}>
              {entry.foodName}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {entry.imageUrl && (
            <Image source={{ uri: entry.imageUrl }} style={styles.sheetImage} />
          )}

          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionTitle}>MACROS</Text>
            <View style={styles.sheetMacroGrid}>
              <View style={styles.sheetMacroItem}>
                <Text style={[styles.sheetMacroValue, { color: COLORS.calories }]}
                >
                  {entry.calories || 0}
                </Text>
                <Text style={styles.sheetMacroLabel}>Calories</Text>
              </View>
              <View style={styles.sheetMacroItem}>
                <Text style={[styles.sheetMacroValue, { color: COLORS.protein }]}
                >
                  {entry.protein || 0}g
                </Text>
                <Text style={styles.sheetMacroLabel}>Protein</Text>
              </View>
              <View style={styles.sheetMacroItem}>
                <Text style={[styles.sheetMacroValue, { color: COLORS.carbs }]}
                >
                  {entry.carbs || 0}g
                </Text>
                <Text style={styles.sheetMacroLabel}>Carbs</Text>
              </View>
              <View style={styles.sheetMacroItem}>
                <Text style={[styles.sheetMacroValue, { color: COLORS.fats }]}
                >
                  {entry.fats || 0}g
                </Text>
                <Text style={styles.sheetMacroLabel}>Fat</Text>
              </View>
            </View>
          </View>

          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionTitle}>MICRONUTRIENTS</Text>
            <View style={styles.sheetMicroGrid}>
              <View style={styles.sheetMicroRow}>
                <Text style={styles.sheetMicroLabel}>Fiber</Text>
                <Text style={styles.sheetMicroValue}>8g</Text>
              </View>
              <View style={styles.sheetMicroRow}>
                <Text style={styles.sheetMicroLabel}>Sodium</Text>
                <Text style={styles.sheetMicroValue}>890mg</Text>
              </View>
              <View style={styles.sheetMicroRow}>
                <Text style={styles.sheetMicroLabel}>Iron</Text>
                <Text style={styles.sheetMicroValue}>12%</Text>
              </View>
              <View style={styles.sheetMicroRow}>
                <Text style={styles.sheetMicroLabel}>Vitamin C</Text>
                <Text style={styles.sheetMicroValue}>15%</Text>
              </View>
              <View style={styles.sheetMicroRow}>
                <Text style={styles.sheetMicroLabel}>Calcium</Text>
                <Text style={styles.sheetMicroValue}>20%</Text>
              </View>
              <View style={styles.sheetMicroRow}>
                <Text style={styles.sheetMicroLabel}>Vitamin A</Text>
                <Text style={styles.sheetMicroValue}>25%</Text>
              </View>
            </View>
          </View>

          {entry.ingredients && entry.ingredients.length > 0 && (
            <View style={styles.sheetSection}>
              <Text style={styles.sheetSectionTitle}>INGREDIENTS</Text>
              <Text style={styles.sheetIngredients}>
                {entry.ingredients.join(', ')}
              </Text>
            </View>
          )}

          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.sheetActionSecondary} onPress={onSwap}>
              <Ionicons name="swap-horizontal" size={20} color={COLORS.primary} />
              <Text style={styles.sheetActionSecondaryText}>Swap Meal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetActionPrimary} onPress={onLog}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.background} />
              <Text style={styles.sheetActionPrimaryText}>Log as Eaten</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export const MenuScreen: React.FC<MenuScreenProps> = ({ user, phase }) => {
  const { setFabAction } = useFabAction();
  const isFocused = useIsFocused();
  const todayKey = formatLocalDateYMD(new Date());
  const scrollY = useRef(new RNAnimated.Value(0)).current;
  const headerHeight = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [190, 120],
    extrapolate: 'clamp',
  });
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0.92],
    extrapolate: 'clamp',
  });
  const ringScale = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [1, 0.85],
    extrapolate: 'clamp',
  });
  const ringOpacity = scrollY.interpolate({
    inputRange: [0, 90, 140],
    outputRange: [1, 0.7, 0],
    extrapolate: 'clamp',
  });

  const {
    mealsByType,
    isLoading: isMealsLoading,
    refetch: refetchMeals,
    toggleMealTypeCompleted,
  } = useTodayMeals(user?.id, new Date(), Boolean(phase), phase?.id ?? null);

  const [isGeneratingMeals, setIsGeneratingMeals] = useState(false);
  const [expandedMealType, setExpandedMealType] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<MealEntry | null>(null);
  const [detailSheetVisible, setDetailSheetVisible] = useState(false);
  const [preferencesModalVisible, setPreferencesModalVisible] = useState(false);
  const [mealPreferences, setMealPreferences] = useState<MealPreferences>(() =>
    resolveMealPreferences(user.mealPreferences)
  );
  const [excludeInputVisible, setExcludeInputVisible] = useState(false);
  const [excludeInput, setExcludeInput] = useState('');
  const mealGenerationAttemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setMealPreferences(resolveMealPreferences(user.mealPreferences));
  }, [user.mealPreferences]);

  const baseMealTypes = ['Breakfast', 'Lunch', 'Dinner'];

  const mealGroups: MealGroup[] = useMemo(() => {
    const allTypes = new Set([...baseMealTypes, ...Object.keys(mealsByType || {})]);
    return Array.from(allTypes)
      .map((mealType) => {
        const entries = mealsByType?.[mealType] || [];
        return {
          mealType,
          entries,
          isAllEaten: entries.length > 0 && entries.every((entry) => entry.isDone),
          totals: computeEntriesMacroTotals(entries),
        };
      })
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

  const macroTargets = useMemo(
    () => buildMacroTargets(calorieGoal),
    [buildMacroTargets, calorieGoal]
  );

  const preferencesKey = useMemo(() => {
    const normalized = {
      cuisine: mealPreferences.cuisine,
      dietary_tags: [...mealPreferences.dietary_tags].sort(),
      excluded_ingredients: [...mealPreferences.excluded_ingredients].sort(),
      max_ready_time_minutes: mealPreferences.max_ready_time_minutes,
    };
    return JSON.stringify(normalized);
  }, [mealPreferences]);

  const handleLogMeal = useCallback(
    async (mealType: string) => {
      try {
        await toggleMealTypeCompleted(mealType, true);
      } catch (err) {
        Alert.alert('Error', 'Could not log meal. Please try again.');
      }
    },
    [toggleMealTypeCompleted]
  );

  const handleSwapMeal = useCallback((_mealType: string, _entryId: string) => {
    Alert.alert('Swap Meal', 'Generate a new meal suggestion?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Swap',
        onPress: () => {
          Alert.alert('Coming Soon', 'Meal swap feature is being implemented.');
        },
      },
    ]);
  }, []);

  const handleViewDetails = useCallback((entry: MealEntry) => {
    setSelectedEntry(entry);
    setDetailSheetVisible(true);
  }, []);

  const handleToggleExpand = useCallback((mealType: string) => {
    setExpandedMealType((prev) => (prev === mealType ? null : mealType));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFabAction('Menu', {
        label: 'Meal',
        icon: '+',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: () => setPreferencesModalVisible(true),
      });
      return () => setFabAction('Menu', null);
    }, [setFabAction])
  );

  useEffect(() => {
    if (!isFocused) return;
    if (preferencesModalVisible) return;
    if (!phase || !user?.id) return;
    if (isMealsLoading || isGeneratingMeals) return;
    const attemptKey = `${phase.id}:${todayKey}:${preferencesKey}`;
    if (mealGenerationAttemptedRef.current.has(attemptKey)) return;

    const generateMeals = async () => {
      mealGenerationAttemptedRef.current.add(attemptKey);
      setIsGeneratingMeals(true);
      try {
        const calorieTarget = calorieGoal;
        const targets = buildMacroTargets(calorieTarget);
        await generateMealsForDay({
          user_id: user.id,
          plan_id: phase.id,
          date: todayKey,
          calorie_target: calorieTarget,
          macro_targets: targets,
          meal_count: 3,
          dietary_tags: mealPreferences.dietary_tags,
          excluded_ingredients: mealPreferences.excluded_ingredients,
          cuisine: mealPreferences.cuisine === 'mixed' ? '' : mealPreferences.cuisine,
          max_ready_time_minutes: mealPreferences.max_ready_time_minutes,
          force_regenerate: false,
        });
        await refetchMeals();
      } catch (err) {
        // Suppress noisy error logs in the UI.
      } finally {
        setIsGeneratingMeals(false);
      }
    };

    generateMeals();
  }, [
    buildMacroTargets,
    calorieGoal,
    isFocused,
    isGeneratingMeals,
    isMealsLoading,
    mealGroups.length,
    preferencesKey,
    preferencesModalVisible,
    phase,
    refetchMeals,
    todayKey,
    user?.id,
  ]);

  const handleToggleDietaryTag = (tag: string) => {
    setMealPreferences((prev) => ({
      ...prev,
      dietary_tags: prev.dietary_tags.includes(tag)
        ? prev.dietary_tags.filter((item) => item !== tag)
        : [...prev.dietary_tags, tag],
    }));
  };

  const handleAddExclusion = () => {
    const trimmed = excludeInput.trim();
    if (!trimmed) return;

    setMealPreferences((prev) => ({
      ...prev,
      excluded_ingredients: [...prev.excluded_ingredients, trimmed],
    }));
    setExcludeInput('');
    setExcludeInputVisible(false);
  };

  const handleRemoveExclusion = (ingredient: string) => {
    setMealPreferences((prev) => ({
      ...prev,
      excluded_ingredients: prev.excluded_ingredients.filter((item) => item !== ingredient),
    }));
  };

  const handleSavePreferences = async () => {
    try {
      await updateMealPreferences(user.id, mealPreferences);
      const attemptKey = `${phase?.id}:${todayKey}:${preferencesKey}`;
      mealGenerationAttemptedRef.current.delete(attemptKey);
      setIsGeneratingMeals(true);
      await generateMealsForDay({
        user_id: user.id,
        plan_id: phase!.id,
        date: todayKey,
        calorie_target: calorieGoal,
        macro_targets: macroTargets,
        meal_count: 3,
        dietary_tags: mealPreferences.dietary_tags,
        excluded_ingredients: mealPreferences.excluded_ingredients,
        cuisine: mealPreferences.cuisine === 'mixed' ? '' : mealPreferences.cuisine,
        max_ready_time_minutes: mealPreferences.max_ready_time_minutes,
        force_regenerate: true,
      });
      await refetchMeals();
      Alert.alert('Preferences Saved', 'Your meal preferences have been updated.');
    } catch (err) {
      Alert.alert('Try Again', 'We could not update your meals. Please try again.');
    } finally {
      setPreferencesModalVisible(false);
      setIsGeneratingMeals(false);
    }
  };

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

  return (
    <View style={styles.container}>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
        <RNAnimated.View
          style={[
            styles.stickyHeader,
            {
              height: headerHeight,
              opacity: headerOpacity,
            },
          ]}
        >
          <View style={styles.macroDashboard}>
            <RNAnimated.View
              style={[
                styles.headerRingRow,
                {
                  opacity: ringOpacity,
                  transform: [{ scale: ringScale }],
                },
              ]}
            >
              <View style={styles.headerRingItem}>
                <View style={styles.headerRingWrap}>
                  <CircularProgress
                    size={76}
                    strokeWidth={8}
                    progress={calorieGoal ? (totalDayMacros.calories ?? 0) / calorieGoal : 0}
                    color={COLORS.calories}
                  />
                  <View style={styles.headerRingCenter}>
                    <Text style={styles.headerRingValue}>
                      {Math.round(totalDayMacros.calories ?? 0)}
                    </Text>
                    <Text style={styles.headerRingTarget}>
                      /{Math.round(calorieGoal).toLocaleString()}kcal
                    </Text>
                  </View>
                </View>
                <Text style={styles.headerRingLabel}>Cal</Text>
              </View>
              <View style={styles.headerRingItem}>
                <View style={styles.headerRingWrap}>
                  <CircularProgress
                    size={76}
                    strokeWidth={8}
                    progress={
                      macroTargets.protein_g
                        ? (totalDayMacros.protein ?? 0) / macroTargets.protein_g
                        : 0
                    }
                    color={COLORS.protein}
                  />
                  <View style={styles.headerRingCenter}>
                    <Text style={styles.headerRingValue}>
                      {Math.round(totalDayMacros.protein ?? 0)}
                    </Text>
                    <Text style={styles.headerRingTarget}>
                      /{Math.round(macroTargets.protein_g)}g
                    </Text>
                  </View>
                </View>
                <Text style={styles.headerRingLabel}>Protein</Text>
              </View>
              <View style={styles.headerRingItem}>
                <View style={styles.headerRingWrap}>
                  <CircularProgress
                    size={76}
                    strokeWidth={8}
                    progress={
                      macroTargets.carbs_g
                        ? (totalDayMacros.carbs ?? 0) / macroTargets.carbs_g
                        : 0
                    }
                    color={COLORS.carbs}
                  />
                  <View style={styles.headerRingCenter}>
                    <Text style={styles.headerRingValue}>
                      {Math.round(totalDayMacros.carbs ?? 0)}
                    </Text>
                    <Text style={styles.headerRingTarget}>
                      /{Math.round(macroTargets.carbs_g)}g
                    </Text>
                  </View>
                </View>
                <Text style={styles.headerRingLabel}>Carbs</Text>
              </View>
              <View style={styles.headerRingItem}>
                <View style={styles.headerRingWrap}>
                  <CircularProgress
                    size={76}
                    strokeWidth={8}
                    progress={
                      macroTargets.fats_g
                        ? (totalDayMacros.fats ?? 0) / macroTargets.fats_g
                        : 0
                    }
                    color={COLORS.fats}
                  />
                  <View style={styles.headerRingCenter}>
                    <Text style={styles.headerRingValue}>
                      {Math.round(totalDayMacros.fats ?? 0)}
                    </Text>
                    <Text style={styles.headerRingTarget}>
                      /{Math.round(macroTargets.fats_g)}g
                    </Text>
                  </View>
                </View>
                <Text style={styles.headerRingLabel}>Fat</Text>
              </View>
            </RNAnimated.View>
          </View>
        </RNAnimated.View>

        <RNAnimated.ScrollView
          style={styles.timelineScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={RNAnimated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
        >
          <View style={styles.mealsSection}>
          <Text style={styles.sectionTitle}>Today's Meals</Text>

          {isGeneratingMeals || isMealsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={styles.loadingText}>
                {isGeneratingMeals ? 'Generating your meals...' : 'Loading meals...'}
              </Text>
            </View>
          ) : mealGroups.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardIcon}>🥗</Text>
              <Text style={styles.emptyCardTitle}>No meals for today</Text>
              <Text style={styles.emptyCardSubtitle}>
                Tap the + button to generate your meal plan.
              </Text>
            </View>
          ) : (
            <View style={styles.timelineContent}>
              {mealGroups.map((group) => (
                <MealCard
                  key={group.mealType}
                  group={group}
                  onLogMeal={handleLogMeal}
                  onSwapMeal={handleSwapMeal}
                  onViewDetails={handleViewDetails}
                  isExpanded={expandedMealType === group.mealType}
                  onToggleExpand={() => handleToggleExpand(group.mealType)}
                />
              ))}
            </View>
          )}
        </View>
        </RNAnimated.ScrollView>

        <MealDetailSheet
          visible={detailSheetVisible}
          entry={selectedEntry}
          onClose={() => setDetailSheetVisible(false)}
          onSwap={() => {
            if (selectedEntry) {
              handleSwapMeal(selectedEntry.mealType, selectedEntry.id);
            }
            setDetailSheetVisible(false);
          }}
          onLog={() => {
            if (selectedEntry) {
              handleLogMeal(selectedEntry.mealType);
            }
            setDetailSheetVisible(false);
          }}
        />
      </LinearGradient>

      <Modal
        transparent
        animationType="slide"
        visible={preferencesModalVisible}
        onRequestClose={() => setPreferencesModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setPreferencesModalVisible(false)}
          />
          <View style={styles.preferencesModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Meal Preferences</Text>
              <TouchableOpacity onPress={() => setPreferencesModalVisible(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.preferencesScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.prefSection}>
                <Text style={styles.prefSectionTitle}>Cuisine Style</Text>
                <View style={styles.cuisineGrid}>
                  {CUISINE_OPTIONS.map((cuisine) => {
                    const isSelected = mealPreferences.cuisine === cuisine.id;
                    return (
                      <TouchableOpacity
                        key={cuisine.id}
                        style={[styles.cuisineChip, isSelected && styles.cuisineChipSelected]}
                        onPress={() =>
                          setMealPreferences((prev) => ({ ...prev, cuisine: cuisine.id }))
                        }
                        activeOpacity={0.7}
                      >
                        <Text style={styles.cuisineEmoji}>{cuisine.emoji}</Text>
                        <Text
                          style={[
                            styles.cuisineLabel,
                            isSelected && styles.cuisineLabelSelected,
                          ]}
                        >
                          {cuisine.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.prefSection}>
                <Text style={styles.prefSectionTitle}>Dietary Restrictions</Text>
                <View style={styles.dietaryGrid}>
                  {DIETARY_OPTIONS.map((option) => {
                    const isSelected = mealPreferences.dietary_tags.includes(option.id);
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[styles.dietaryChip, isSelected && styles.dietaryChipSelected]}
                        onPress={() => handleToggleDietaryTag(option.id)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.dietaryLabel,
                            isSelected && styles.dietaryLabelSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.prefSection}>
                <Text style={styles.prefSectionTitle}>Exclude Foods</Text>
                <Text style={styles.prefSectionSubtitle}>
                  Add ingredients you want to avoid (allergies, dislikes, etc.)
                </Text>

                {mealPreferences.excluded_ingredients.length > 0 && (
                  <View style={styles.exclusionsList}>
                    {mealPreferences.excluded_ingredients.map((ingredient) => (
                      <View key={ingredient} style={styles.exclusionChip}>
                        <Text style={styles.exclusionText}>{ingredient}</Text>
                        <TouchableOpacity
                          onPress={() => handleRemoveExclusion(ingredient)}
                          style={styles.exclusionRemove}
                        >
                          <Text style={styles.exclusionRemoveText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {!excludeInputVisible ? (
                  <TouchableOpacity
                    style={styles.addExclusionButton}
                    onPress={() => setExcludeInputVisible(true)}
                  >
                    <Text style={styles.addExclusionText}>+ Add Food to Exclude</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.exclusionInputContainer}>
                    <TextInput
                      style={styles.exclusionInput}
                      placeholder="e.g., Mushrooms, Shellfish, Cilantro"
                      placeholderTextColor={COLORS.textMuted}
                      value={excludeInput}
                      onChangeText={setExcludeInput}
                      autoFocus
                    />
                    <View style={styles.exclusionActions}>
                      <TouchableOpacity
                        style={[styles.exclusionButton, styles.exclusionCancel]}
                        onPress={() => {
                          setExcludeInput('');
                          setExcludeInputVisible(false);
                        }}
                      >
                        <Text style={styles.exclusionButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.exclusionButton, styles.exclusionConfirm]}
                        onPress={handleAddExclusion}
                      >
                        <Text style={[styles.exclusionButtonText, styles.exclusionConfirmText]}
                        >
                          Add
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.prefSection}>
                <Text style={styles.prefSectionTitle}>Max Cooking Time</Text>
                <View style={styles.cookTimeGrid}>
                  {COOK_TIME_OPTIONS.map((minutes) => {
                    const isSelected = mealPreferences.max_ready_time_minutes === minutes;
                    return (
                      <TouchableOpacity
                        key={minutes}
                        style={[styles.cookTimeChip, isSelected && styles.cookTimeChipSelected]}
                        onPress={() =>
                          setMealPreferences((prev) => ({
                            ...prev,
                            max_ready_time_minutes: minutes,
                          }))
                        }
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.cookTimeLabel,
                            isSelected && styles.cookTimeLabelSelected,
                          ]}
                        >
                          {minutes} min
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.savePreferencesButton} onPress={handleSavePreferences}
            >
              <Text style={styles.savePreferencesButtonText}>Save Preferences</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  gradient: {
    flex: 1,
  },
  macroDashboard: {
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: COLORS.background,
  },
  headerRingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    gap: 8,
  },
  scrollContent: {
    paddingTop: 200,
    paddingBottom: 100,
  },
  headerRingItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  headerRingWrap: {
    position: 'relative',
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRingCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRingValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerRingTarget: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  headerRingLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  mealsSection: {
    flex: 1,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  timelineScroll: {
    flex: 1,
  },
  timelineContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  timelineConnector: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.border,
    marginTop: 4,
  },
  mealCardWrapper: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  mealCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  mealCardHeader: {
    flexDirection: 'row',
    padding: 12,
  },
  mealCardMain: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  mealThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  mealThumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealThumbnailEmoji: {
    fontSize: 24,
  },
  mealInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  mealTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  mealTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  mealTypeEmoji: {
    fontSize: 10,
  },
  mealTypeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  mealName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  mealMacrosCompact: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedContent: {
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 12,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  entryInfo: {
    flex: 1,
  },
  entryName: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 2,
  },
  entryMacros: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  entryActions: {
    marginLeft: 12,
  },
  logBtn: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  microsSection: {
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  microsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  microsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  microItem: {
    minWidth: 60,
  },
  microValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  microLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheetContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginRight: 16,
  },
  sheetImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 20,
  },
  sheetSection: {
    marginBottom: 20,
  },
  sheetSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  sheetMacroGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetMacroItem: {
    alignItems: 'center',
  },
  sheetMacroValue: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  sheetMacroLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  sheetMicroGrid: {
    gap: 8,
  },
  sheetMicroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetMicroLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  sheetMicroValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  sheetIngredients: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  sheetActionSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  sheetActionSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  sheetActionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.success,
  },
  sheetActionPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.background,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyCard: {
    margin: 20,
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
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  emptyCardSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    color: COLORS.text,
  },
  modalCloseButton: {
    fontSize: 28,
    color: COLORS.textSecondary,
    fontWeight: '300',
  },
  preferencesModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
    maxHeight: '85%',
  },
  preferencesScroll: {
    maxHeight: 520,
  },
  prefSection: {
    marginBottom: 24,
  },
  prefSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  prefSectionSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  cuisineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cuisineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cuisineChipSelected: {
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderColor: COLORS.primary,
  },
  cuisineEmoji: {
    fontSize: 16,
  },
  cuisineLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  cuisineLabelSelected: {
    color: COLORS.primary,
  },
  dietaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dietaryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dietaryChipSelected: {
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderColor: COLORS.primary,
  },
  dietaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  dietaryLabelSelected: {
    color: COLORS.primary,
  },
  exclusionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  exclusionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  exclusionText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  exclusionRemove: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,59,48,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exclusionRemoveText: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '700',
    marginTop: -1,
  },
  addExclusionButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
  },
  addExclusionText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  exclusionInputContainer: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
  },
  exclusionInput: {
    color: COLORS.text,
    fontSize: 14,
    paddingVertical: 6,
  },
  exclusionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  exclusionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exclusionCancel: {
    backgroundColor: COLORS.surfaceLight,
  },
  exclusionConfirm: {
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderColor: COLORS.primary,
  },
  exclusionButtonText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  exclusionConfirmText: {
    color: COLORS.primary,
  },
  cookTimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cookTimeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cookTimeChipSelected: {
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderColor: COLORS.primary,
  },
  cookTimeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  cookTimeLabelSelected: {
    color: COLORS.primary,
  },
  savePreferencesButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  savePreferencesButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
});

export default MenuScreen;
