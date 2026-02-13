import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';

import { PhasePlan, User } from '../types/domain';
import { useFabAction } from '../contexts/FabActionContext';
import { estimateDailyCalories } from '../utils/calorieGoal';
import {
  applyMealTemplateForDate,
  fetchMealTemplates,
  fetchResolvedMealsForDate,
  RuntimeMealEntry,
  RuntimeMealTemplate,
  RuntimeMealsByType,
} from '../services/mealRuntimeService';
import { formatLocalDateYMD } from '../utils/date';

// ─── Types ────────────────────────────────────────────────────────────────────

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
};

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG = '#0A0E27';

const C = {
  surface: '#151932',
  primary: '#6C63FF',
  accent: '#00F5A0',
  calories: '#FFB800',
  protein: '#00D9A3',
  carbs: '#6C63FF',
  fats: '#FF6B93',
  text: '#FFFFFF',
  textSec: '#8B93B0',
  textMuted: '#5A6178',
  border: '#2A2F4F',
} as const;

const MACRO_SPLIT = { protein: 0.3, carbs: 0.4, fats: 0.3 };

const MEAL_ORDER = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Meal'];

const prettyTag = (tag: string) =>
  tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const sumMacro = (entries: RuntimeMealEntry[], key: 'calories' | 'protein' | 'carbs' | 'fats') =>
  Math.round(entries.reduce((s, e) => s + ((e[key] as number | null | undefined) ?? 0), 0));

const sortedSlots = (mealsByType: RuntimeMealsByType) =>
  Object.entries(mealsByType).sort(([a], [b]) => {
    const ai = MEAL_ORDER.indexOf(a);
    const bi = MEAL_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

// ─── Macro ring ───────────────────────────────────────────────────────────────

const MacroRing: React.FC<{
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  label: string;
  value: number;
  unit: string;
  muted?: boolean;
}> = ({ size, strokeWidth, progress, color, label, value, unit, muted }) => {
  const AnimCircle = useMemo(() => Animated.createAnimatedComponent(Circle), []);
  const anim = useRef(new Animated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const gap = Math.max(8, strokeWidth);
  const maxP = (circ - gap) / circ;
  const clamped = Math.min(Math.max(progress, 0), maxP);

  useEffect(() => {
    Animated.timing(anim, { toValue: clamped, duration: 500, useNativeDriver: false }).start();
  }, [clamped, anim]);

  const dashOffset = anim.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] });
  const ringColor = muted ? color + '44' : color;
  const textColor = muted ? 'rgba(255,255,255,0.4)' : C.text;

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} fill="none"
          />
          <AnimCircle
            cx={size / 2} cy={size / 2} r={radius}
            stroke={ringColor} strokeWidth={strokeWidth} fill="none"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill as object, { alignItems: 'center', justifyContent: 'center' }]}
          pointerEvents="none">
          <Text style={{ fontSize: 13, fontWeight: '800', color: textColor, letterSpacing: -0.3 }}
            numberOfLines={1}>{value}</Text>
          <Text style={{ fontSize: 8, fontWeight: '600', color: C.textMuted, marginTop: 1 }}>{unit}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 11, fontWeight: '600', color: muted ? C.textMuted : C.textSec, marginTop: 5 }}>
        {label}
      </Text>
    </View>
  );
};

// ─── Meal slot card ───────────────────────────────────────────────────────────

const SLOT_COLORS: Record<string, string> = {
  Breakfast: '#FFB800',
  Lunch: '#00D9A3',
  Dinner: '#6C63FF',
  Snack: '#FF6B93',
  Meal: '#8B93B0',
};

const MealSlotCard: React.FC<{ title: string; entries: RuntimeMealEntry[] }> = ({ title, entries }) => {
  const color = SLOT_COLORS[title] ?? SLOT_COLORS.Meal;
  const kcal = sumMacro(entries, 'calories');
  const protein = sumMacro(entries, 'protein');
  const carbs = sumMacro(entries, 'carbs');
  const fats = sumMacro(entries, 'fats');

  return (
    <View style={[styles.slotCard, { borderLeftColor: color }]}>
      <View style={styles.slotHeader}>
        <Text style={[styles.slotTitle, { color }]}>{title}</Text>
        <View style={styles.slotMacroRow}>
          {kcal > 0 && <Text style={styles.slotKcal}>{kcal} kcal</Text>}
          {protein > 0 && <Text style={styles.slotProtein}>P {protein}g</Text>}
        </View>
      </View>
      {entries.map((entry, i) => (
        <View key={entry.id} style={[styles.slotEntry, i < entries.length - 1 && styles.slotEntryDivider]}>
          <Text style={styles.slotEntryName} numberOfLines={1}>{entry.foodName}</Text>
          {entry.quantity != null && (
            <Text style={styles.slotEntryQty}>
              {entry.quantity}{entry.unit ? ` ${entry.unit}` : ''}
            </Text>
          )}
        </View>
      ))}
      {(carbs > 0 || fats > 0) && (
        <View style={styles.slotFooter}>
          {carbs > 0 && <Text style={styles.slotFooterText}>C {carbs}g</Text>}
          {fats > 0 && <Text style={styles.slotFooterText}>F {fats}g</Text>}
        </View>
      )}
    </View>
  );
};

// ─── Template card ────────────────────────────────────────────────────────────

const TemplateCard: React.FC<{
  template: RuntimeMealTemplate;
  active: boolean;
  recommended: boolean;
  calorieTarget: number;
  onPress: () => void;
}> = ({ template, active, recommended, calorieTarget, onPress }) => {
  const mealSlots = useMemo(() => {
    const slots = new Set(template.entries.map((e) => e.mealType));
    return slots.size || 3;
  }, [template.entries]);

  const displayKcal = template.estimatedCalories ?? calorieTarget;

  return (
    <TouchableOpacity
      style={[styles.templateCard, active && styles.templateCardActive]}
      activeOpacity={0.78}
      onPress={onPress}
    >
      {active && <View style={styles.templateStrip} />}
      <View style={styles.templateInner}>
        <View style={styles.templateBody}>
          <View style={styles.templateTitleRow}>
            <Text style={[styles.templateTitle, active && { color: C.accent }]} numberOfLines={1}>
              {template.title}
            </Text>
            {recommended && (
              <View style={styles.forYouBadge}>
                <Text style={styles.forYouText}>For you</Text>
              </View>
            )}
          </View>
          <Text style={styles.templateMeta} numberOfLines={1}>
            {displayKcal.toLocaleString()} kcal · {mealSlots} meals
            {template.difficulty ? ` · ${template.difficulty}` : ''}
          </Text>
          {template.goalTags.length > 0 && (
            <View style={styles.tagRow}>
              {template.goalTags.slice(0, 3).map((tag) => (
                <View key={`${template.id}-${tag}`} style={styles.tagChip}>
                  <Text style={styles.tagText}>{prettyTag(tag)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={[styles.templateCheck, active && styles.templateCheckActive]}>
          <Text style={[styles.templateCheckText, active && { color: C.accent }]}>
            {active ? '✓' : '›'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export const MenuScreen: React.FC<MenuScreenProps> = ({ user, phase }) => {
  const { setFabAction } = useFabAction();

  const [templates, setTemplates] = useState<RuntimeMealTemplate[]>([]);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [mealsByType, setMealsByType] = useState<RuntimeMealsByType>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const today = useMemo(() => formatLocalDateYMD(new Date()), []);
  const planId = phase?.id ?? null;

  const calorieGoal = useMemo(() => estimateDailyCalories(user).goalCalories, [user]);
  const macroTargets = useMemo(() => ({
    protein: Math.round((calorieGoal * MACRO_SPLIT.protein) / 4),
    carbs: Math.round((calorieGoal * MACRO_SPLIT.carbs) / 4),
    fats: Math.round((calorieGoal * MACRO_SPLIT.fats) / 9),
  }), [calorieGoal]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );

  const hasMeals = Object.keys(mealsByType).length > 0;
  const allEntries = useMemo(() => Object.values(mealsByType).flat(), [mealsByType]);

  const totals = useMemo(() => ({
    calories: sumMacro(allEntries, 'calories'),
    protein: sumMacro(allEntries, 'protein'),
    carbs: sumMacro(allEntries, 'carbs'),
    fats: sumMacro(allEntries, 'fats'),
  }), [allEntries]);

  const rings = useMemo(() => {
    const base = hasMeals
      ? { cal: totals.calories, prot: totals.protein, carb: totals.carbs, fat: totals.fats }
      : {
          cal: selectedTemplate?.estimatedCalories ?? calorieGoal,
          prot: selectedTemplate?.estimatedProtein ?? macroTargets.protein,
          carb: selectedTemplate?.estimatedCarbs ?? macroTargets.carbs,
          fat: selectedTemplate?.estimatedFats ?? macroTargets.fats,
        };
    return [
      { label: 'Calories', value: Math.round(base.cal), unit: 'kcal', color: C.calories, progress: base.cal / calorieGoal },
      { label: 'Protein', value: Math.round(base.prot), unit: 'g', color: C.protein, progress: base.prot / macroTargets.protein },
      { label: 'Carbs', value: Math.round(base.carb), unit: 'g', color: C.carbs, progress: base.carb / macroTargets.carbs },
      { label: 'Fat', value: Math.round(base.fat), unit: 'g', color: C.fats, progress: base.fat / macroTargets.fats },
    ];
  }, [hasMeals, totals, selectedTemplate, calorieGoal, macroTargets]);

  const isMuted = !hasMeals && !selectedTemplate;
  const isPendingApply = selectedTemplateId !== null && selectedTemplateId !== appliedTemplateId;

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadMeals = useCallback(async () => {
    setIsLoading(true);
    try {
      const [templateRows, resolved] = await Promise.all([
        fetchMealTemplates(user.id),
        fetchResolvedMealsForDate(user.id, planId, today, user.eatingMode),
      ]);
      setTemplates(templateRows);
      setMealsByType(resolved.mealsByType);

      const currentId = resolved.template?.id ?? null;
      setAppliedTemplateId(currentId);
      if (currentId) {
        setSelectedTemplateId(currentId);
      } else if (templateRows.length) {
        const bestMatch = templateRows.find(
          (t) => (t.eatingMode ?? '').toLowerCase() === user.eatingMode
        ) ?? templateRows[0];
        setSelectedTemplateId(bestMatch.id);
      }
    } catch (error) {
      console.error('Failed loading meals:', error);
    } finally {
      setIsLoading(false);
    }
  }, [planId, today, user.eatingMode, user.id]);

  useFocusEffect(useCallback(() => {
    setFabAction('Menu', null);
    void loadMeals();
    return () => setFabAction('Menu', null);
  }, [loadMeals, setFabAction]));

  // ── Apply template ────────────────────────────────────────────────────────

  const handleApply = useCallback(async () => {
    if (!selectedTemplate) return;
    if (!planId) {
      Alert.alert('No active plan', 'Start a training plan before applying meal templates.');
      return;
    }
    setIsApplying(true);
    try {
      await applyMealTemplateForDate(user.id, planId, today, selectedTemplate.id);
      await loadMeals();
    } catch (error) {
      console.error('Failed applying template:', error);
      Alert.alert('Error', 'Could not apply template. Please try again.');
    } finally {
      setIsApplying(false);
    }
  }, [loadMeals, planId, selectedTemplate, today, user.id]);

  // ── Sorted templates ─────────────────────────────────────────────────────

  const sortedTemplates = useMemo(() => {
    return [...templates].sort((a, b) => {
      const aRec = (a.eatingMode ?? '').toLowerCase() === user.eatingMode;
      const bRec = (b.eatingMode ?? '').toLowerCase() === user.eatingMode;
      if (aRec === bRec) return a.title.localeCompare(b.title);
      return bRec ? 1 : -1;
    });
  }, [templates, user.eatingMode]);

  const ringLabel = hasMeals
    ? `${totals.calories} / ${Math.round(calorieGoal)} kcal today`
    : selectedTemplate
      ? `${selectedTemplate.title} — targets`
      : `${Math.round(calorieGoal)} kcal daily target`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#0D1229', '#111633']} style={styles.gradient}>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Page header */}
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Meals</Text>
            <Text style={styles.pageSubtitle}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>
          </View>

          {/* Macro summary card */}
          <View style={styles.summaryCard}>
            <View style={styles.ringsRow}>
              {rings.map((ring) => (
                <MacroRing
                  key={ring.label}
                  size={72}
                  strokeWidth={7}
                  progress={ring.progress}
                  color={ring.color}
                  label={ring.label}
                  value={ring.value}
                  unit={ring.unit}
                  muted={isMuted}
                />
              ))}
            </View>
            <Text style={[styles.ringLabel, isMuted ? styles.ringLabelMuted : styles.ringLabelActive]}>
              {ringLabel}
            </Text>
          </View>

          {/* Loading */}
          {isLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={C.textMuted} />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          )}

          {/* Today's meals */}
          {!isLoading && hasMeals && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>TODAY</Text>
                {appliedTemplateId && (
                  <Text style={styles.sectionBadge}>
                    {templates.find((t) => t.id === appliedTemplateId)?.title ?? ''}
                  </Text>
                )}
              </View>
              {sortedSlots(mealsByType).map(([slotName, entries]) => (
                <MealSlotCard key={slotName} title={slotName} entries={entries} />
              ))}
            </View>
          )}

          {/* Templates */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MEAL TEMPLATES</Text>

            {isLoading && !templates.length && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={C.textMuted} />
                <Text style={styles.loadingText}>Loading templates…</Text>
              </View>
            )}

            {!isLoading && !templates.length && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>🍽️</Text>
                <Text style={styles.emptyTitle}>No templates yet</Text>
                <Text style={styles.emptyText}>Meal templates will appear here once added.</Text>
              </View>
            )}

            {sortedTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                active={template.id === selectedTemplateId}
                recommended={(template.eatingMode ?? '').toLowerCase() === user.eatingMode}
                calorieTarget={calorieGoal}
                onPress={() => setSelectedTemplateId(template.id)}
              />
            ))}
          </View>

          <View style={{ height: isPendingApply ? 100 : 60 }} />
        </ScrollView>

        {/* Sticky apply footer */}
        {isPendingApply && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.applyBtn, isApplying && styles.applyBtnDisabled]}
              onPress={handleApply}
              disabled={isApplying}
              activeOpacity={0.8}
            >
              {isApplying ? (
                <ActivityIndicator size="small" color={BG} />
              ) : (
                <Text style={styles.applyBtnText}>
                  {appliedTemplateId
                    ? `Switch to ${selectedTemplate?.title ?? '…'}`
                    : `Apply ${selectedTemplate?.title ?? '…'}`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

      </LinearGradient>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  gradient: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 60, paddingHorizontal: 16 },

  // Page header
  pageHeader: { marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.6 },
  pageSubtitle: { fontSize: 13, fontWeight: '500', color: C.textMuted, marginTop: 3 },

  // Macro summary
  summaryCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  ringLabel: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    letterSpacing: 0.1,
  },
  ringLabelMuted: { color: C.textMuted, fontStyle: 'italic' },
  ringLabelActive: { color: C.accent },

  // Loading
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, justifyContent: 'center' },
  loadingText: { fontSize: 13, color: C.textMuted },

  // Sections
  section: { marginBottom: 20 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  sectionBadge: { fontSize: 11, fontWeight: '600', color: C.accent },

  // Meal slot card
  slotCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  slotTitle: { fontSize: 13, fontWeight: '800' },
  slotMacroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotKcal: { fontSize: 12, fontWeight: '700', color: C.calories },
  slotProtein: { fontSize: 11, fontWeight: '600', color: C.protein },
  slotEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  slotEntryDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  slotEntryName: { flex: 1, fontSize: 13, fontWeight: '500', color: C.textSec },
  slotEntryQty: { fontSize: 11, color: C.textMuted, fontWeight: '500' },
  slotFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  slotFooterText: { fontSize: 11, fontWeight: '600', color: C.textMuted },

  // Template card
  templateCard: {
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  templateCardActive: {
    borderColor: 'rgba(0,245,160,0.3)',
    backgroundColor: '#0C1A17',
  },
  templateStrip: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    width: 3,
    backgroundColor: C.accent,
  },
  templateInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 10,
  },
  templateBody: { flex: 1 },
  templateTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  templateTitle: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  templateMeta: { fontSize: 12, fontWeight: '500', color: C.textSec },
  templateCheck: {
    width: 28, height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  templateCheckActive: {
    backgroundColor: 'rgba(0,245,160,0.12)',
    borderColor: 'rgba(0,245,160,0.35)',
  },
  templateCheckText: { fontSize: 16, color: C.textMuted, fontWeight: '300' },

  tagRow: { flexDirection: 'row', gap: 5, marginTop: 7, flexWrap: 'wrap' },
  tagChip: {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tagText: { fontSize: 10, fontWeight: '600', color: C.textMuted },
  forYouBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(108,99,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.3)',
  },
  forYouText: { fontSize: 9, fontWeight: '700', color: '#A89FFF', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Empty state
  emptyCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 28,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 32, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 5 },
  emptyText: { fontSize: 13, color: C.textMuted, textAlign: 'center' },

  // Sticky footer
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: 'rgba(10,14,39,0.94)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  applyBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  applyBtnDisabled: { opacity: 0.55 },
  applyBtnText: { fontSize: 15, fontWeight: '800', color: BG, letterSpacing: 0.1 },
});

export default MenuScreen;
