import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';

import { EatingMode, PhasePlan, User } from '../types/domain';
import { useFabAction } from '../contexts/FabActionContext';
import { estimateDailyCalories } from '../utils/calorieGoal';

// ─── Types ────────────────────────────────────────────────────────────────────

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_GRADIENT = ['#0A0E27', '#0D1229', '#111633'] as const;

const COLORS = {
  background: '#0A0E27',
  surface: '#151932',
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
} as const;

const MACRO_SPLIT = { protein: 0.3, carbs: 0.4, fats: 0.3 };

// ─── Meal Template Types & Data ───────────────────────────────────────────────

type MealTemplate = {
  id: string;
  title: string;
  goalLabel: string;
  icon: string;
  calorieMultiplier: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  cuisine: string;
  dietaryTags: string[];
  maxReadyTime: number;
  mealCount: number;
  tags: string[];
  eatingModes: EatingMode[];
};

type ComputedTemplate = MealTemplate & {
  targetCalories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

const computeTemplateTargets = (template: MealTemplate, userCalorieGoal: number): ComputedTemplate => {
  const targetCalories = Math.round((userCalorieGoal * template.calorieMultiplier) / 10) * 10;
  return {
    ...template,
    targetCalories,
    protein_g: Math.round((targetCalories * template.proteinPct) / 4),
    carbs_g: Math.round((targetCalories * template.carbsPct) / 4),
    fat_g: Math.round((targetCalories * template.fatPct) / 9),
  };
};

const MEAL_TEMPLATES: MealTemplate[] = [
  {
    id: 'high-protein-power',
    title: 'High Protein Power',
    goalLabel: 'Muscle building',
    icon: '💪',
    calorieMultiplier: 1.0,
    proteinPct: 0.35,
    carbsPct: 0.45,
    fatPct: 0.20,
    cuisine: 'mixed',
    dietaryTags: [],
    maxReadyTime: 30,
    mealCount: 4,
    tags: ['high_protein', 'muscle'],
    eatingModes: ['lean_bulk', 'recomp'],
  },
  {
    id: 'low-carb-lean',
    title: 'Low Carb Lean',
    goalLabel: 'Fat loss',
    icon: '🥩',
    calorieMultiplier: 0.85,
    proteinPct: 0.40,
    carbsPct: 0.20,
    fatPct: 0.40,
    cuisine: 'mixed',
    dietaryTags: [],
    maxReadyTime: 30,
    mealCount: 3,
    tags: ['low_carb', 'fat_loss'],
    eatingModes: ['mild_deficit'],
  },
  {
    id: 'balanced-mediterranean',
    title: 'Balanced Mediterranean',
    goalLabel: 'Balanced',
    icon: '🫒',
    calorieMultiplier: 1.0,
    proteinPct: 0.25,
    carbsPct: 0.50,
    fatPct: 0.25,
    cuisine: 'mediterranean',
    dietaryTags: [],
    maxReadyTime: 45,
    mealCount: 3,
    tags: ['balanced', 'mediterranean'],
    eatingModes: ['maintenance', 'recomp'],
  },
  {
    id: 'plant-powered',
    title: 'Plant Powered',
    goalLabel: 'Vegan',
    icon: '🌿',
    calorieMultiplier: 1.0,
    proteinPct: 0.22,
    carbsPct: 0.55,
    fatPct: 0.23,
    cuisine: 'mixed',
    dietaryTags: ['vegan'],
    maxReadyTime: 30,
    mealCount: 4,
    tags: ['vegan', 'balanced'],
    eatingModes: ['maintenance'],
  },
  {
    id: 'quick-clean',
    title: 'Quick & Clean',
    goalLabel: 'Fast prep',
    icon: '⚡',
    calorieMultiplier: 1.0,
    proteinPct: 0.30,
    carbsPct: 0.45,
    fatPct: 0.25,
    cuisine: 'mixed',
    dietaryTags: [],
    maxReadyTime: 15,
    mealCount: 3,
    tags: ['quick', 'balanced'],
    eatingModes: ['maintenance', 'recomp'],
  },
  {
    id: 'asian-lean',
    title: 'Asian Lean',
    goalLabel: 'Asian · lean',
    icon: '🍜',
    calorieMultiplier: 0.90,
    proteinPct: 0.35,
    carbsPct: 0.48,
    fatPct: 0.17,
    cuisine: 'asian',
    dietaryTags: [],
    maxReadyTime: 30,
    mealCount: 3,
    tags: ['asian', 'balanced'],
    eatingModes: ['mild_deficit'],
  },
];

const MEAL_TEMPLATE_TAGS = ['all', 'high_protein', 'low_carb', 'balanced', 'vegan', 'quick', 'mediterranean', 'asian'];
const MEAL_TAG_LABELS: Record<string, string> = {
  all: 'All', high_protein: 'High Protein', low_carb: 'Low Carb',
  balanced: 'Balanced', vegan: 'Vegan', quick: 'Quick', mediterranean: 'Mediterranean', asian: 'Asian',
};

// ─── CircularProgress ─────────────────────────────────────────────────────────

const CircularProgress: React.FC<{
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
}> = ({ size, strokeWidth, progress, color }) => {
  const AnimatedCircle = useMemo(() => RNAnimated.createAnimatedComponent(Circle), []);
  const progressAnim = useRef(new RNAnimated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gapLength = Math.max(8, strokeWidth * 0.9);
  const maxProgress = (circumference - gapLength) / circumference;
  const clampedProgress = Math.min(Math.max(progress, 0), maxProgress);

  useEffect(() => {
    RNAnimated.timing(progressAnim, {
      toValue: clampedProgress,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [clampedProgress, progressAnim]);

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} fill="none" />
      <AnimatedCircle
        cx={size / 2} cy={size / 2} r={radius}
        stroke={color} strokeWidth={strokeWidth} fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const MenuScreen: React.FC<MenuScreenProps> = ({ user }) => {
  const { setFabAction } = useFabAction();

  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);
  const [mealTagFilter, setMealTagFilter] = useState('all');

  const scrollY = useRef(new RNAnimated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({ inputRange: [0, 80], outputRange: [1, 0.92], extrapolate: 'clamp' });
  const ringScale = scrollY.interpolate({ inputRange: [0, 120], outputRange: [1, 0.85], extrapolate: 'clamp' });
  const ringOpacity = scrollY.interpolate({ inputRange: [0, 90, 140], outputRange: [1, 0.7, 0], extrapolate: 'clamp' });

  const calorieGoal = useMemo(() => estimateDailyCalories(user).goalCalories, [user]);

  const macroTargets = useMemo(() => ({
    protein_g: Math.round((calorieGoal * MACRO_SPLIT.protein) / 4),
    carbs_g: Math.round((calorieGoal * MACRO_SPLIT.carbs) / 4),
    fats_g: Math.round((calorieGoal * MACRO_SPLIT.fats) / 9),
  }), [calorieGoal]);

  const selectedTemplate = useMemo(
    () => MEAL_TEMPLATES.find((t) => t.id === appliedTemplateId) ?? null,
    [appliedTemplateId]
  );

  const computedSelected = useMemo(
    () => selectedTemplate ? computeTemplateTargets(selectedTemplate, calorieGoal) : null,
    [selectedTemplate, calorieGoal]
  );

  const rings = useMemo(() => [
    {
      label: 'Cal',
      value: computedSelected?.targetCalories ?? 0,
      target: Math.round(calorieGoal),
      progress: computedSelected ? computedSelected.targetCalories / calorieGoal : 0,
      color: COLORS.calories,
      unit: 'kcal',
    },
    {
      label: 'Protein',
      value: computedSelected?.protein_g ?? 0,
      target: macroTargets.protein_g,
      progress: computedSelected ? computedSelected.protein_g / macroTargets.protein_g : 0,
      color: COLORS.protein,
      unit: 'g',
    },
    {
      label: 'Carbs',
      value: computedSelected?.carbs_g ?? 0,
      target: macroTargets.carbs_g,
      progress: computedSelected ? computedSelected.carbs_g / macroTargets.carbs_g : 0,
      color: COLORS.carbs,
      unit: 'g',
    },
    {
      label: 'Fat',
      value: computedSelected?.fat_g ?? 0,
      target: macroTargets.fats_g,
      progress: computedSelected ? computedSelected.fat_g / macroTargets.fats_g : 0,
      color: COLORS.fats,
      unit: 'g',
    },
  ], [computedSelected, calorieGoal, macroTargets]);

  const filteredTemplates = useMemo(() => {
    const base = MEAL_TEMPLATES.filter((t) => t.id !== appliedTemplateId);
    const filtered = mealTagFilter === 'all' ? base : base.filter((t) => t.tags.includes(mealTagFilter));
    return [...filtered].sort((a, b) => {
      const aRec = a.eatingModes.includes(user.eatingMode) ? 1 : 0;
      const bRec = b.eatingModes.includes(user.eatingMode) ? 1 : 0;
      return bRec - aRec;
    });
  }, [appliedTemplateId, mealTagFilter, user.eatingMode]);

  useFocusEffect(useCallback(() => {
    setFabAction('Menu', null);
    return () => setFabAction('Menu', null);
  }, [setFabAction]));

  const renderCard = (template: MealTemplate, isActive = false) => {
    const computed = computeTemplateTargets(template, calorieGoal);
    const isRecommended = !isActive && template.eatingModes.includes(user.eatingMode);
    return (
      <TouchableOpacity
        key={template.id}
        activeOpacity={0.75}
        onPress={() => setAppliedTemplateId(isActive ? null : template.id)}
        style={[styles.card, isActive && styles.cardActive]}
      >
        {isActive && <View style={styles.cardActiveStrip} />}
        <View style={styles.cardInner}>
          <View style={[styles.cardIcon, isActive && styles.cardIconActive]}>
            <Text style={styles.cardIconText}>{template.icon}</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, isActive && { color: COLORS.accent }]} numberOfLines={1}>
                {template.title}
              </Text>
              {isRecommended && (
                <View style={styles.forYouBadge}>
                  <Text style={styles.forYouText}>For you</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {computed.targetCalories.toLocaleString()} kcal · {template.goalLabel} · {template.mealCount} meals
            </Text>
          </View>
          <Text style={[styles.cardChevron, isActive && { color: COLORS.accent }]}>
            {isActive ? '✓' : '›'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>

        {/* Sticky macro rings header */}
        <RNAnimated.View style={[styles.stickyHeader, { opacity: headerOpacity }]}>
          <RNAnimated.View style={[styles.ringsRow, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}>
            {rings.map((ring) => (
              <View key={ring.label} style={styles.ringItem}>
                <View style={styles.ringWrap}>
                  <CircularProgress size={76} strokeWidth={8} progress={ring.progress} color={ring.color} />
                  <View style={styles.ringCenter}>
                    <Text style={styles.ringValue} numberOfLines={1}>
                      {ring.value > 0 ? ring.value : '—'}
                    </Text>
                    <Text style={styles.ringTarget}>/{ring.target}{ring.unit}</Text>
                  </View>
                </View>
                <Text style={styles.ringLabel}>{ring.label}</Text>
              </View>
            ))}
          </RNAnimated.View>
          {!selectedTemplate && (
            <Text style={styles.noSelectionHint}>Select a plan to see your macros</Text>
          )}
        </RNAnimated.View>

        <RNAnimated.ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={RNAnimated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          {/* Active plan */}
          {selectedTemplate && (
            <View style={styles.activeSection}>
              <Text style={styles.sectionLabel}>ACTIVE PLAN</Text>
              {renderCard(selectedTemplate, true)}
            </View>
          )}

          {/* Meal Plans list */}
          <View style={styles.listSection}>
            <Text style={styles.sectionLabel}>MEAL PLANS</Text>

            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {MEAL_TEMPLATE_TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[styles.filterChip, mealTagFilter === tag && styles.filterChipActive]}
                  onPress={() => setMealTagFilter(tag)}
                >
                  <Text style={[styles.filterChipText, mealTagFilter === tag && styles.filterChipTextActive]}>
                    {MEAL_TAG_LABELS[tag]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredTemplates.map((t) => renderCard(t, false))}
          </View>

          <View style={{ height: 100 }} />
        </RNAnimated.ScrollView>

      </LinearGradient>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  gradient: { flex: 1 },

  // Header
  stickyHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
    backgroundColor: COLORS.background,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    gap: 8,
  },
  ringItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  ringWrap: { position: 'relative', width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  ringTarget: { fontSize: 9, fontWeight: '600', color: COLORS.textSecondary, marginTop: 1 },
  ringLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginTop: 6 },
  noSelectionHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 200, paddingHorizontal: 16 },

  // Sections
  activeSection: { marginBottom: 24 },
  listSection: { marginBottom: 8 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Filter chips
  filterRow: { paddingBottom: 12, gap: 8 },
  filterChip: {
    paddingVertical: 7, paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(108,99,255,0.2)',
    borderColor: 'rgba(108,99,255,0.45)',
  },
  filterChipText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  filterChipTextActive: { color: COLORS.primary },

  // Template cards
  card: {
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardActive: { borderColor: 'rgba(0,245,160,0.3)', backgroundColor: '#0C1A17' },
  cardActiveStrip: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, backgroundColor: COLORS.accent },
  cardInner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 14 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  cardIconActive: { backgroundColor: 'rgba(0,245,160,0.08)' },
  cardIconText: { fontSize: 20 },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, letterSpacing: -0.2 },
  cardMeta: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  cardChevron: { fontSize: 22, color: COLORS.textMuted, fontWeight: '300', marginTop: -1 },

  // For you badge
  forYouBadge: {
    paddingVertical: 2, paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: 'rgba(255,184,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.3)',
  },
  forYouText: { fontSize: 9, fontWeight: '700', color: '#FFB800', textTransform: 'uppercase', letterSpacing: 0.4 },
});

export default MenuScreen;
