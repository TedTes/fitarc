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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { MealPreferences, PhasePlan, User } from '../types/domain';
import { formatLocalDateYMD } from '../utils/date';
import { useTodayMeals } from '../hooks/useTodayMeals';
import { MealEntry } from '../services/mealService';
import { generateMealsForDay } from '../services/mealGenerationService';
import { updateMealPreferences } from '../services/userProfileService';
import { useFabAction } from '../contexts/FabActionContext';
import { computeEntriesMacroTotals } from '../utils/mealMacros';
import { estimateDailyCalories } from '../utils/calorieGoal';

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
};

const SCREEN_GRADIENT = ['#0A0E27', '#151932', '#1E2340'] as const;
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
  calories: '#FFB800',
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

const HEADER_EXPANDED_HEIGHT = 240;
const HEADER_COLLAPSED_HEIGHT = 80;

// Pure React Native Circular Progress Component
const CircularProgress: React.FC<{
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
}> = ({ size, strokeWidth, progress, color }) => {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: clampedProgress,
      useNativeDriver: true,
      tension: 40,
      friction: 8,
    }).start();
  }, [clampedProgress, progressAnim]);

  const rotation = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {/* Background circle */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: 'transparent',
          backgroundColor: 'transparent',
        }}
      />
      
      {/* Progress circle using rotation */}
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          transform: [{ rotate: rotation }],
        }}
      >
        <LinearGradient
          colors={[color, color]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: 'transparent',
            borderTopColor: color,
            borderRightColor: color,
          }}
        />
      </Animated.View>

      {/* Mask for incomplete progress */}
      {clampedProgress < 1 && (
        <View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: 'transparent',
            borderBottomColor: 'transparent',
            borderLeftColor: 'transparent',
            transform: [{ rotate: `${clampedProgress * 360}deg` }],
          }}
        />
      )}
    </View>
  );
};


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



export const MenuScreen: React.FC<MenuScreenProps> = ({ user, phase }) => {
  const { setFabAction } = useFabAction();
  const isFocused = useIsFocused();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = formatLocalDateYMD(today);

  const scrollY = useRef(new Animated.Value(0)).current;
  
  const headerHeight = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [HEADER_EXPANDED_HEIGHT, HEADER_COLLAPSED_HEIGHT],
    extrapolate: 'clamp',
  });

  const expandedOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const compactOpacity = scrollY.interpolate({
    inputRange: [40, 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  
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
    refetch: refetchMeals,
  } = useTodayMeals(
    phase ? user.id : undefined,
    phase ? selectedDateObj : undefined,
    Boolean(phase),
    phase?.id ?? null
  );

  const [isGeneratingMeals, setIsGeneratingMeals] = useState(false);
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

  const macroTargets = useMemo(
    () => buildMacroTargets(calorieGoal),
    [buildMacroTargets, calorieGoal]
  );
  const formatPercent = useCallback((current: number, goal: number) => {
    if (!goal || goal <= 0) return 0;
    return Math.min(Math.round((current / goal) * 100), 999);
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
          dietary_tags: mealPreferences.dietary_tags,
          excluded_ingredients: mealPreferences.excluded_ingredients,
          cuisine: mealPreferences.cuisine === 'mixed' ? '' : mealPreferences.cuisine,
          max_ready_time_minutes: mealPreferences.max_ready_time_minutes,
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
    isFocused,
    isGeneratingMeals,
    isMealsLoading,
    mealGroups.length,
    mealPreferences,
    phase,
    refetchMeals,
    todayKey,
    user?.id,
  ]);



  const handleToggleDietaryTag = (tag: string) => {
    setMealPreferences((prev) => ({
      ...prev,
      dietary_tags: prev.dietary_tags.includes(tag)
        ? prev.dietary_tags.filter((t) => t !== tag)
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
      excluded_ingredients: prev.excluded_ingredients.filter((i) => i !== ingredient),
    }));
  };

  const handleSavePreferences = async () => {
    try {
      await updateMealPreferences(user.id, mealPreferences);
      setPreferencesModalVisible(false);
      Alert.alert('Preferences Saved', 'Your meal preferences have been updated.');
    } catch (err) {
      console.error('Failed to save meal preferences', err);
      Alert.alert('Error', 'Unable to save meal preferences.');
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


  const renderMealGroup = ({ item: group }: { item: { mealType: string; entries: MealEntry[] } }) => {
    const { mealType, entries } = group;
    const totals = computeEntriesMacroTotals(entries);
    const gradientColors = getMealGradient(mealType);

    const featuredEntry = entries.find(e => e.imageUrl) || entries[0];

    return (
      <View style={styles.mealCardContainer}>
        <View style={styles.mealCard}>
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

              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.mealTypeBadge}
              >
                <Text style={styles.mealTypeBadgeEmoji}>{getMealEmoji(mealType)}</Text>
                <Text style={styles.mealTypeBadgeText}>{mealType}</Text>
              </LinearGradient>

              {entries.every(e => e.isDone) && (
                <View style={styles.completedBadge}>
                  <Text style={styles.completedBadgeText}>✓</Text>
                </View>
              )}

              <View style={styles.mealNameOverlay}>
                <Text style={styles.mealNameText} numberOfLines={2}>
                  {featuredEntry.foodName}
                </Text>
              </View>

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
        {/* Radial Progress Header */}
        <Animated.View style={[styles.stickyHeader, { height: headerHeight }]}>
          <LinearGradient colors={SCREEN_GRADIENT} style={styles.stickyHeaderGradient}>
            {/* Expanded View */}
            <Animated.View style={[styles.expandedHeader, { opacity: expandedOpacity }]}>
              <Text style={styles.headerLabel}>Daily Nutrition</Text>
              <View style={styles.headerContentRow}>
                <LinearGradient colors={SCREEN_GRADIENT} style={styles.headerRadialStack}>
                  <CircularProgress
                    size={120}
                    strokeWidth={7}
                    progress={
                      macroTargets.protein_g
                        ? (totalDayMacros.protein ?? 0) / macroTargets.protein_g
                        : 0
                    }
                    color={COLORS.protein}
                  />
                  <LinearGradient
                    colors={SCREEN_GRADIENT}
                    style={[styles.headerRadialRing, styles.headerRadialRingGap]}
                  >
                    <CircularProgress
                      size={100}
                      strokeWidth={7}
                      progress={
                        macroTargets.carbs_g
                          ? (totalDayMacros.carbs ?? 0) / macroTargets.carbs_g
                          : 0
                      }
                      color={COLORS.carbs}
                    />
                  </LinearGradient>
                  <LinearGradient
                    colors={SCREEN_GRADIENT}
                    style={[styles.headerRadialRing, styles.headerRadialRingGap]}
                  >
                    <CircularProgress
                      size={80}
                      strokeWidth={7}
                      progress={
                        macroTargets.fats_g
                          ? (totalDayMacros.fats ?? 0) / macroTargets.fats_g
                          : 0
                      }
                      color={COLORS.fats}
                    />
                  </LinearGradient>
                  <LinearGradient colors={SCREEN_GRADIENT} style={styles.headerRadialCore} />
                  <View style={styles.headerRadialCenter}>
                    <Text style={styles.headerRadialValue}>
                      {Math.round(totalDayMacros.calories ?? 0).toLocaleString()}
                    </Text>
                    <Text style={styles.headerRadialLabel}>kcal</Text>
                  </View>
                </LinearGradient>
                <View style={styles.headerLegend}>
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.protein }]} />
                    <View style={styles.legendText}>
                      <Text style={styles.legendLabel}>Protein</Text>
                      <Text style={styles.legendValue}>
                        {Math.round(totalDayMacros.protein ?? 0)}g ·{' '}
                        {formatPercent(totalDayMacros.protein ?? 0, macroTargets.protein_g)}% goal
                      </Text>
                    </View>
                  </View>
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.carbs }]} />
                    <View style={styles.legendText}>
                      <Text style={styles.legendLabel}>Carbs</Text>
                      <Text style={styles.legendValue}>
                        {Math.round(totalDayMacros.carbs ?? 0)}g ·{' '}
                        {formatPercent(totalDayMacros.carbs ?? 0, macroTargets.carbs_g)}% goal
                      </Text>
                    </View>
                  </View>
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.fats }]} />
                    <View style={styles.legendText}>
                      <Text style={styles.legendLabel}>Fat</Text>
                      <Text style={styles.legendValue}>
                        {Math.round(totalDayMacros.fats ?? 0)}g ·{' '}
                        {formatPercent(totalDayMacros.fats ?? 0, macroTargets.fats_g)}% goal
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* Compact View */}
            <Animated.View style={[styles.compactHeader, { opacity: compactOpacity }]}>
              <View style={styles.headerRowCompact}>
                <View style={styles.headerTextBlock}>
                  <Text style={styles.compactHeaderLabel}>Today</Text>
                  <Text style={styles.compactHeaderKcal}>
                    {Math.round(totalDayMacros.calories ?? 0).toLocaleString()} kcal
                  </Text>
                </View>
                <View style={styles.headerRadialCompact}>
                  <CircularProgress
                    size={54}
                    strokeWidth={5}
                    progress={
                      calorieGoal ? (totalDayMacros.calories ?? 0) / calorieGoal : 0
                    }
                    color={COLORS.calories}
                  />
                  <View style={styles.headerRadialCoreSmall} />
                  <View style={styles.headerRadialCenter}>
                    <Text style={styles.headerRadialValueSmall}>
                      {Math.round(totalDayMacros.calories ?? 0)}
                    </Text>
                    <Text style={styles.headerRadialLabelSmall}>kcal</Text>
                  </View>
                </View>
              </View>
            </Animated.View>
          </LinearGradient>
        </Animated.View>

        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Meals Section */}
          <View style={styles.mealsSection}>
            {mealGroups.length > 0 && (
              <View style={styles.mealsSectionHeader}>
                <Text style={styles.mealsSectionTitle}>Today's Meals</Text>
                <View style={styles.progressDots}>
                  {mealGroups.map((group, index) => (
                    <View
                      key={`${group.mealType}-${index}`}
                      style={[
                        styles.progressDot,
                        group.entries.every((entry) => entry.isDone) &&
                          styles.progressDotComplete,
                      ]}
                    />
                  ))}
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
        </Animated.ScrollView>
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
                        <Text style={[styles.cuisineLabel, isSelected && styles.cuisineLabelSelected]}>
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
                        <Text style={[styles.dietaryLabel, isSelected && styles.dietaryLabelSelected]}>
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
                      placeholderTextColor={COLORS.textTertiary}
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
                        <Text style={[styles.exclusionButtonText, styles.exclusionConfirmText]}>
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
                        <Text style={[styles.cookTimeLabel, isSelected && styles.cookTimeLabelSelected]}>
                          {minutes} min
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.savePreferencesButton} onPress={handleSavePreferences}>
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
    backgroundColor: COLORS.bgPrimary,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_EXPANDED_HEIGHT + 24,
    paddingBottom: 100,
  },

  // Sticky Header
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  stickyHeaderGradient: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },

  // Expanded Header
  expandedHeader: {
    position: 'absolute',
    top: 24,
    left: 20,
    right: 20,
  },
  headerRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  headerContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 28,
  },
  headerRadialStack: {
    position: 'relative',
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 60,
    marginTop: 40,
    marginLeft: 44
  },
  headerRadialRing: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRadialRingGap: {
    borderRadius: 999,
    padding: 4,
  },
  headerRadialCompact: {
    position: 'relative',
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRadialCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRadialCore: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  headerRadialCoreSmall: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bgPrimary,
  },
  headerRadialValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerRadialLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  headerRadialValueSmall: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerRadialLabelSmall: {
    fontSize: 8,
    fontWeight: '600',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  headerLegend: {
    flex: 1,
    gap: 12,
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    marginLeft: 'auto',
    paddingLeft: 20,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-end',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    flex: 1,
    alignItems: 'flex-start',
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'left',
  },
  legendValue: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'left',
  },

  // Compact Header
  compactHeader: {
    position: 'absolute',
    top: 18,
    left: 20,
    right: 20,
  },
  compactHeaderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  compactHeaderKcal: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  // Meals Section (keeping all original meal card styles)
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
  progressDots: {
    flexDirection: 'row',
    gap: 6,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  progressDotComplete: {
    backgroundColor: COLORS.success,
  },
  mealCardContainer: { marginBottom: 16 },
  mealCard: { borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  mealImageContainer: { height: 180, position: 'relative' },
  mealImage: { width: '100%', height: '100%' },
  mealImageGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 140 },
  mealTypeBadge: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  mealTypeBadgeEmoji: { fontSize: 16 },
  mealTypeBadgeText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', textShadowColor: 'rgba(0, 0, 0, 0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  completedBadge: { position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  completedBadgeText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  mealNameOverlay: { position: 'absolute', bottom: 60, left: 16, right: 16 },
  mealNameText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', lineHeight: 26, textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  macroGridOverlay: { position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0, 0, 0, 0.4)', borderRadius: 12, padding: 10, backdropFilter: 'blur(10px)' },
  macroItemOverlay: { flex: 1, alignItems: 'center' },
  macroItemDividerOverlay: { width: 1, height: 28, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  macroValueOverlay: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 2, textShadowColor: 'rgba(0, 0, 0, 0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  macroLabelOverlay: { fontSize: 10, color: 'rgba(255, 255, 255, 0.8)', fontWeight: '600', textShadowColor: 'rgba(0, 0, 0, 0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  mealHeaderNoImage: { padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  mealHeaderNoImageTop: { marginBottom: 12 },
  mealTypeBadgeNoImage: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignSelf: 'flex-start' },
  mealNameNoImage: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12, lineHeight: 24 },
  macroGridNoImage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.bgPrimary, borderRadius: 12, padding: 12 },
  macroItem: { flex: 1, alignItems: 'center' },
  macroItemDivider: { width: 1, height: 32, backgroundColor: COLORS.border },
  macroValue: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 2 },
  macroLabel: { fontSize: 11, color: COLORS.textTertiary, fontWeight: '600' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 40 },
  loadingText: { color: COLORS.textSecondary, fontSize: 14 },
  emptyCard: { padding: 32, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  emptyCardIcon: { fontSize: 40, marginBottom: 12 },
  emptyCardTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
  emptyCardSubtitle: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center' },
  mealGroupSeparator: { height: 0 },
  mealsListFooter: { height: 32 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  modalCloseButton: { fontSize: 28, color: COLORS.textSecondary, fontWeight: '300' },
  preferencesModalContent: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 30, maxHeight: '85%' },
  preferencesScroll: { maxHeight: 520 },
  prefSection: { marginBottom: 24 },
  prefSectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
  prefSectionSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 },
  cuisineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cuisineChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  cuisineChipSelected: { backgroundColor: COLORS.accentDim, borderColor: COLORS.accent },
  cuisineEmoji: { fontSize: 16 },
  cuisineLabel: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  cuisineLabelSelected: { color: COLORS.accent },
  dietaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dietaryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  dietaryChipSelected: { backgroundColor: COLORS.accentDim, borderColor: COLORS.accent },
  dietaryLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  dietaryLabelSelected: { color: COLORS.accent },
  exclusionsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  exclusionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  exclusionText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  exclusionRemove: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,59,48,0.2)', alignItems: 'center', justifyContent: 'center' },
  exclusionRemoveText: { fontSize: 14, color: '#FF3B30', fontWeight: '700', marginTop: -1 },
  addExclusionButton: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.surface, alignItems: 'center' },
  addExclusionText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 13 },
  exclusionInputContainer: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 12, padding: 12 },
  exclusionInput: { color: COLORS.textPrimary, fontSize: 14, paddingVertical: 6 },
  exclusionActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  exclusionButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  exclusionCancel: { backgroundColor: COLORS.surface },
  exclusionConfirm: { backgroundColor: COLORS.accentDim, borderColor: COLORS.accent },
  exclusionButtonText: { color: COLORS.textSecondary, fontWeight: '600' },
  exclusionConfirmText: { color: COLORS.accent },
  cookTimeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cookTimeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  cookTimeChipSelected: { backgroundColor: COLORS.accentDim, borderColor: COLORS.accent },
  cookTimeLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  cookTimeLabelSelected: { color: COLORS.accent },
  savePreferencesButton: { backgroundColor: COLORS.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  savePreferencesButtonText: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
});

export default MenuScreen;
