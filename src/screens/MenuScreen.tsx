import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
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
  fetchRecommendedMealTemplates,
  fetchMealTemplates,
  fetchResolvedMealsForDate,
  RecommendedMealTemplate,
  RuntimeMealEntry,
  RuntimeMealTemplate,
  RuntimeMealsByType,
  swapMealEntryForDate,
} from '../services/mealRuntimeService';
import { formatLocalDateYMD } from '../utils/date';
import {
  buildStructuredMealSwapReason,
  findMealEntry,
  sortedSlots,
  sumMacro,
  SWAP_REASONS,
  type SwapReasonKey,
} from './menuUtils';
import { uiCopy } from '../content/uiCopy';

// ─── Types ────────────────────────────────────────────────────────────────────

type MenuScreenProps = {
  user: User;
  phase: PhasePlan | null;
};

type LastMealSwap = {
  previous: RuntimeMealEntry;
  current: {
    id?: string;
    mealType: string;
    foodName: string;
    displayOrder?: number | null;
  };
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

const CARD_WIDTH = Dimensions.get('window').width - 56;

const MACRO_SPLIT = { protein: 0.3, carbs: 0.4, fats: 0.3 };

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

const MealSlotCard: React.FC<{
  title: string;
  entries: RuntimeMealEntry[];
  onEntryLongPress?: (entry: RuntimeMealEntry) => void;
}> = ({ title, entries, onEntryLongPress }) => {
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
        <TouchableOpacity
          key={entry.id}
          activeOpacity={0.8}
          style={[styles.slotEntry, i < entries.length - 1 && styles.slotEntryDivider]}
          onLongPress={() => onEntryLongPress?.(entry)}
          delayLongPress={250}
        >
          <Text style={styles.slotEntryName} numberOfLines={1}>{entry.foodName}</Text>
          {entry.quantity != null && (
            <Text style={styles.slotEntryQty}>
              {entry.quantity}{entry.unit ? ` ${entry.unit}` : ''}
            </Text>
          )}
        </TouchableOpacity>
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
  applying: boolean;
  recommended: boolean;
  recommendationReason?: string | null;
  calorieTarget: number;
  onPress: () => void;
}> = ({ template, active, applying, recommended, recommendationReason, calorieTarget, onPress }) => {
  const mealSlots = useMemo(() => {
    const slots = new Set(template.entries.map((e) => e.mealType));
    return slots.size || 3;
  }, [template.entries]);

  const displayKcal = template.estimatedCalories ?? calorieTarget;

  return (
    <TouchableOpacity
      style={[styles.carouselCard, active && styles.carouselCardActive]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={[styles.carouselThumb, active && styles.carouselThumbActive]}>
        {applying ? (
          <ActivityIndicator size="small" color={C.accent} />
        ) : (
          <Text style={styles.carouselEmoji}>🍽️</Text>
        )}
      </View>
      <View style={styles.carouselCardBody}>
        <Text style={[styles.carouselCardTitle, active && { color: C.accent }]} numberOfLines={1}>
          {template.title}
        </Text>
        <Text style={styles.carouselCardMeta} numberOfLines={1}>
          {displayKcal.toLocaleString()} kcal · {mealSlots} meals
        </Text>
        {recommended && (
          <View style={[styles.forYouBadge, { marginTop: 4 }]}>
            <Text style={styles.forYouText}>{uiCopy.menu.forYouBadge}</Text>
          </View>
        )}
        {recommendationReason ? (
          <Text style={styles.recommendationText} numberOfLines={1}>
            {uiCopy.menu.recommendationPrefix} {recommendationReason}
          </Text>
        ) : null}
      </View>
      {active && <View style={styles.carouselActiveBar} />}
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
  const [isSwapping, setIsSwapping] = useState(false);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const [recommendedTemplates, setRecommendedTemplates] = useState<RecommendedMealTemplate[]>([]);
  const [swapEntry, setSwapEntry] = useState<RuntimeMealEntry | null>(null);
  const [swapReason, setSwapReason] = useState<SwapReasonKey>('preference');
  const [lastSwap, setLastSwap] = useState<LastMealSwap | null>(null);

  const handleCarouselScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + 12));
      setActiveCarouselIndex(idx);
    },
    [],
  );

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

  const swapCandidates = useMemo(() => {
    if (!swapEntry) return [];
    const targetSlot = swapEntry.mealType;
    const targetName = swapEntry.foodName.trim().toLowerCase();
    const seen = new Set<string>();
    const candidates = templates
      .flatMap((template) =>
        template.entries
          .filter((entry) => entry.mealType === targetSlot)
          .map((entry) => ({ templateTitle: template.title, entry }))
      )
      .filter(({ entry }) => entry.foodName.trim().toLowerCase() !== targetName)
      .filter(({ entry }) => {
        const key = `${entry.mealType}:${entry.foodName.trim().toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return candidates.slice(0, 12);
  }, [swapEntry, templates]);

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
      { label: uiCopy.menu.macroLabels.calories, value: Math.round(base.cal), unit: 'kcal', color: C.calories, progress: base.cal / calorieGoal },
      { label: uiCopy.menu.macroLabels.protein, value: Math.round(base.prot), unit: 'g', color: C.protein, progress: base.prot / macroTargets.protein },
      { label: uiCopy.menu.macroLabels.carbs, value: Math.round(base.carb), unit: 'g', color: C.carbs, progress: base.carb / macroTargets.carbs },
      { label: uiCopy.menu.macroLabels.fats, value: Math.round(base.fat), unit: 'g', color: C.fats, progress: base.fat / macroTargets.fats },
    ];
  }, [hasMeals, totals, selectedTemplate, calorieGoal, macroTargets]);

  const isMuted = !hasMeals && !selectedTemplate;

  // ── Data loading ─────────────────────────────────────────────────────────

  const refreshResolvedMeals = useCallback(async () => {
    const resolved = await fetchResolvedMealsForDate(user.id, planId, today, user.eatingMode);
    setMealsByType(resolved.mealsByType);
    setAppliedTemplateId(resolved.template?.id ?? null);
  }, [planId, today, user.eatingMode, user.id]);

  const loadMeals = useCallback(async () => {
    setIsLoading(true);
    try {
      const [templateRows, resolved, recommendedRows] = await Promise.all([
        fetchMealTemplates(user.id),
        fetchResolvedMealsForDate(user.id, planId, today, user.eatingMode),
        fetchRecommendedMealTemplates(user.id, user.eatingMode, 6),
      ]);
      setTemplates(templateRows);
      setMealsByType(resolved.mealsByType);
      setRecommendedTemplates(recommendedRows);
      setLastSwap(null);

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

  const handleSelectTemplate = useCallback(async (templateId: string) => {
    if (templateId === appliedTemplateId) {
      setSelectedTemplateId(templateId);
      return;
    }
    if (!planId) {
      Alert.alert(uiCopy.menu.noActivePlanTitle, uiCopy.menu.noActivePlanApplyTemplate);
      return;
    }
    setSelectedTemplateId(templateId);
    setIsApplying(true);
    try {
      await applyMealTemplateForDate(user.id, planId, today, templateId);
      await refreshResolvedMeals();
    } catch (error) {
      console.error('Failed applying template:', error);
      Alert.alert(uiCopy.menu.genericErrorTitle, uiCopy.menu.applyTemplateFailed);
    } finally {
      setIsApplying(false);
    }
  }, [appliedTemplateId, planId, refreshResolvedMeals, today, user.id]);

  const handleEntryLongPress = useCallback((entry: RuntimeMealEntry) => {
    if (!planId) {
      Alert.alert(uiCopy.menu.noActivePlanTitle, uiCopy.menu.noActivePlanSwapMeal);
      return;
    }
    setSwapReason('preference');
    setSwapEntry(entry);
  }, [planId]);

  const handleSwapMealEntry = useCallback(
    async (candidate: { templateTitle: string; entry: RuntimeMealEntry }) => {
      if (!swapEntry || !planId) return;
      setIsSwapping(true);
      try {
        const resolved = await swapMealEntryForDate({
          userId: user.id,
          planId,
          date: today,
          eatingMode: user.eatingMode,
          targetEntryId: swapEntry.id,
          replacement: {
            mealType: candidate.entry.mealType,
            foodId: candidate.entry.foodId ?? null,
            foodName: candidate.entry.foodName,
            quantity: candidate.entry.quantity ?? null,
            unit: candidate.entry.unit ?? null,
            calories: candidate.entry.calories ?? null,
            protein: candidate.entry.protein ?? null,
            carbs: candidate.entry.carbs ?? null,
            fats: candidate.entry.fats ?? null,
            displayOrder: swapEntry.displayOrder ?? candidate.entry.displayOrder ?? null,
            notes: candidate.entry.notes ?? null,
          },
          reason: buildStructuredMealSwapReason({
            userReason: swapReason,
            from: swapEntry,
            to: candidate.entry,
          }),
          enforceGuardrails: true,
        });
        setMealsByType(resolved.mealsByType);
        const swappedTo = findMealEntry(resolved.mealsByType, {
          mealType: candidate.entry.mealType,
          foodName: candidate.entry.foodName,
          displayOrder: swapEntry.displayOrder ?? candidate.entry.displayOrder ?? null,
        });
        setLastSwap({
          previous: swapEntry,
          current: {
            id: swappedTo?.id,
            mealType: candidate.entry.mealType,
            foodName: candidate.entry.foodName,
            displayOrder: swapEntry.displayOrder ?? candidate.entry.displayOrder ?? null,
          },
        });
        setSwapEntry(null);
      } catch (err) {
        console.error('Failed to swap meal entry:', err);
        const message = err instanceof Error ? err.message : '';
        const guardrailMessages = uiCopy.menu.swapGuardrailMessages;
        Alert.alert(
          message in guardrailMessages ? uiCopy.menu.swapBlockedTitle : uiCopy.menu.swapFailedTitle,
          guardrailMessages[message] ?? uiCopy.menu.swapFailedMessage
        );
      } finally {
        setIsSwapping(false);
      }
    },
    [swapEntry, planId, swapReason, user.id, user.eatingMode, today]
  );

  const handleUndoLastSwap = useCallback(async () => {
    if (!lastSwap || !planId) return;
    const target = findMealEntry(mealsByType, lastSwap.current);
    if (!target) {
      Alert.alert(uiCopy.menu.undoUnavailableTitle, uiCopy.menu.undoUnavailableMessage);
      return;
    }
    setIsSwapping(true);
    try {
      const resolved = await swapMealEntryForDate({
        userId: user.id,
        planId,
        date: today,
        eatingMode: user.eatingMode,
        targetEntryId: target.id,
        replacement: {
          mealType: lastSwap.previous.mealType,
          foodId: lastSwap.previous.foodId ?? null,
          foodName: lastSwap.previous.foodName,
          quantity: lastSwap.previous.quantity ?? null,
          unit: lastSwap.previous.unit ?? null,
          calories: lastSwap.previous.calories ?? null,
          protein: lastSwap.previous.protein ?? null,
          carbs: lastSwap.previous.carbs ?? null,
          fats: lastSwap.previous.fats ?? null,
          displayOrder: lastSwap.previous.displayOrder ?? null,
          notes: lastSwap.previous.notes ?? null,
        },
        reason: 'swap_reason:undo_last_swap',
        enforceGuardrails: false,
      });
      setMealsByType(resolved.mealsByType);
      setLastSwap(null);
    } catch (err) {
      console.error('Failed to undo meal swap:', err);
      Alert.alert(uiCopy.menu.undoFailedTitle, uiCopy.menu.undoFailedMessage);
    } finally {
      setIsSwapping(false);
    }
  }, [lastSwap, mealsByType, planId, today, user.eatingMode, user.id]);

  // ── Sorted templates ─────────────────────────────────────────────────────

  const sortedTemplates = useMemo(() => {
    const recommendationById = new Map(
      recommendedTemplates.map((row) => [row.id, row] as const)
    );
    return [...templates].sort((a, b) => {
      const aScore = recommendationById.get(a.id)?.score ?? 0;
      const bScore = recommendationById.get(b.id)?.score ?? 0;
      if (aScore !== bScore) return bScore - aScore;
      return a.title.localeCompare(b.title);
    });
  }, [templates, recommendedTemplates]);

  const recommendationByTemplateId = useMemo(
    () => new Map(recommendedTemplates.map((row) => [row.id, row] as const)),
    [recommendedTemplates]
  );

  const isOverCalories = hasMeals && totals.calories > calorieGoal;
  const ringLabel = hasMeals
    ? uiCopy.menu.ringLabelWithMeals(totals.calories, Math.round(calorieGoal))
    : selectedTemplate
      ? uiCopy.menu.ringLabelWithTemplate(selectedTemplate.title)
      : uiCopy.menu.ringLabelNoTemplate(Math.round(calorieGoal));

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
            <Text style={styles.pageTitle}>{uiCopy.menu.pageTitle}</Text>
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
            <Text style={[styles.ringLabel, isMuted ? styles.ringLabelMuted : isOverCalories ? styles.ringLabelOver : styles.ringLabelActive]}>
              {ringLabel}
            </Text>
          </View>

          {/* Loading */}
          {isLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={C.textMuted} />
              <Text style={styles.loadingText}>{uiCopy.menu.loading}</Text>
            </View>
          )}

          {/* Today's meals */}
          {!isLoading && hasMeals && (
            <View style={styles.section}>
              <View style={styles.todayCard}>
                <View style={styles.todayHeader}>
                  <Text style={styles.todayLabel}>{uiCopy.menu.todayMeals}</Text>
                  <View style={styles.todayHeaderActions}>
                    {lastSwap && (
                      <TouchableOpacity onPress={handleUndoLastSwap} disabled={isSwapping}>
                        <Text style={styles.undoSwapText}>{uiCopy.menu.undoSwap}</Text>
                      </TouchableOpacity>
                    )}
                    {appliedTemplateId && (
                      <Text style={styles.todayBadge}>
                        {templates.find((t) => t.id === appliedTemplateId)?.title ?? ''}
                      </Text>
                    )}
                  </View>
                </View>
                <Text style={styles.todayHint}>{uiCopy.menu.longPressHint}</Text>
                {sortedSlots(mealsByType).map(([slotName, entries], idx) => (
                  <React.Fragment key={slotName}>
                    {idx > 0 && <View style={styles.slotDivider} />}
                    <MealSlotCard
                      title={slotName}
                      entries={entries}
                      onEntryLongPress={handleEntryLongPress}
                    />
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}

          {/* Template carousel */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{uiCopy.menu.templatesTitle}</Text>

            {isLoading && !templates.length ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={C.textMuted} />
                <Text style={styles.loadingText}>{uiCopy.menu.loading}</Text>
              </View>
            ) : !templates.length ? (
              <Text style={styles.carouselEmpty}>{uiCopy.menu.noTemplates}</Text>
            ) : (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={CARD_WIDTH + 12}
                  decelerationRate="fast"
                  contentContainerStyle={styles.carouselScroll}
                  onScroll={handleCarouselScroll}
                  scrollEventThrottle={64}
                >
                  {sortedTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      active={template.id === selectedTemplateId}
                      applying={isApplying && template.id === selectedTemplateId}
                      recommended={recommendationByTemplateId.has(template.id)}
                      recommendationReason={recommendationByTemplateId.get(template.id)?.reason?.join(' + ') ?? null}
                      calorieTarget={calorieGoal}
                      onPress={() => handleSelectTemplate(template.id)}
                    />
                  ))}
                </ScrollView>
                {sortedTemplates.length > 1 && (
                  <View style={styles.carouselDots}>
                    {sortedTemplates.map((t, i) => (
                      <View
                        key={t.id}
                        style={[styles.carouselDot, i === activeCarouselIndex && styles.carouselDotActive]}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>

        <Modal
          transparent
          animationType="fade"
          visible={swapEntry !== null}
          onRequestClose={() => setSwapEntry(null)}
        >
          <View style={styles.swapModalOverlay}>
            <Pressable style={styles.swapModalBackdrop} onPress={() => setSwapEntry(null)} />
            <View style={styles.swapModalSheet}>
            <View style={styles.swapHeaderRow}>
              <Text style={styles.swapTitle}>{uiCopy.menu.swapModalTitle}</Text>
              <TouchableOpacity onPress={() => setSwapEntry(null)}>
                <Text style={styles.swapClose}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.swapSubtitle} numberOfLines={1}>
              {swapEntry?.foodName ?? uiCopy.menu.swapModalSelectReplacement}
            </Text>
            <View style={styles.reasonRow}>
              {SWAP_REASONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.reasonChip,
                    swapReason === option.key && styles.reasonChipActive,
                  ]}
                  onPress={() => setSwapReason(option.key)}
                >
                  <Text
                    style={[
                      styles.reasonChipText,
                      swapReason === option.key && styles.reasonChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {isSwapping ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={C.accent} />
                <Text style={styles.loadingText}>{uiCopy.menu.swapApplying}</Text>
              </View>
              ) : swapCandidates.length === 0 ? (
                <Text style={styles.swapEmpty}>
                  {uiCopy.menu.swapEmpty}
                </Text>
              ) : (
                <ScrollView style={styles.swapList} showsVerticalScrollIndicator={false}>
                  {swapCandidates.map((candidate, index) => (
                    <TouchableOpacity
                      key={`${candidate.entry.id}-${index}`}
                      style={styles.swapItem}
                      onPress={() => handleSwapMealEntry(candidate)}
                    >
                      <View style={styles.swapItemTextWrap}>
                        <Text style={styles.swapItemTitle} numberOfLines={1}>
                          {candidate.entry.foodName}
                        </Text>
                        <Text style={styles.swapItemMeta} numberOfLines={1}>
                          {candidate.templateTitle} · {Math.round(candidate.entry.calories ?? 0)} kcal
                        </Text>
                      </View>
                      <Text style={styles.swapItemArrow}>›</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

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
  ringLabelOver: { color: '#FF6B6B' },

  // Loading
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, justifyContent: 'center' },
  loadingText: { fontSize: 13, color: C.textMuted },

  // Sections
  section: { marginBottom: 20 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 },
  sectionBadge: { fontSize: 11, fontWeight: '600', color: C.accent },

  // Today card container
  todayCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  todayHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  todayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  todayBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: C.accent,
  },
  undoSwapText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.protein,
  },
  todayHint: {
    fontSize: 11,
    color: C.textMuted,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },

  // Meal slot (row within todayCard)
  slotCard: {
    borderLeftWidth: 3,
  },
  slotDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: 17,
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

  // Template carousel
  carouselScroll: {
    paddingHorizontal: 16,
  },
  carouselDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  carouselDotActive: {
    backgroundColor: C.accent,
    width: 18,
  },
  carouselEmpty: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  carouselCard: {
    width: CARD_WIDTH,
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    marginRight: 12,
  },
  carouselCardActive: {
    borderColor: 'rgba(0,245,160,0.35)',
  },
  carouselThumb: {
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselThumbActive: {
    backgroundColor: 'rgba(0,245,160,0.06)',
  },
  carouselEmoji: {
    fontSize: 40,
  },
  carouselCardBody: {
    padding: 16,
    gap: 4,
  },
  carouselCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.3,
  },
  carouselCardMeta: {
    fontSize: 14,
    fontWeight: '500',
    color: C.textSec,
  },
  carouselActiveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: C.accent,
  },
  forYouBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(108,99,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.3)',
    alignSelf: 'flex-start',
  },
  forYouText: { fontSize: 10, fontWeight: '700', color: '#A89FFF', textTransform: 'uppercase', letterSpacing: 0.3 },
  recommendationText: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginTop: 4 },

  // Swap modal
  swapModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  swapModalBackdrop: { flex: 1 },
  swapModalSheet: {
    backgroundColor: '#101427',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    maxHeight: '65%',
  },
  swapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  swapTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
  },
  swapClose: {
    fontSize: 24,
    color: C.textMuted,
    lineHeight: 24,
  },
  swapSubtitle: {
    marginTop: 6,
    marginBottom: 12,
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },
  swapList: { maxHeight: 320 },
  reasonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  reasonChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  reasonChipActive: {
    backgroundColor: 'rgba(108,99,255,0.22)',
    borderColor: 'rgba(108,99,255,0.45)',
  },
  reasonChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
  },
  reasonChipTextActive: {
    color: '#A89FFF',
  },
  swapItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  swapItemTextWrap: { flex: 1, marginRight: 8 },
  swapItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  swapItemMeta: {
    marginTop: 2,
    fontSize: 11,
    color: C.textMuted,
  },
  swapItemArrow: {
    fontSize: 20,
    color: C.textMuted,
  },
  swapEmpty: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});

export default MenuScreen;
