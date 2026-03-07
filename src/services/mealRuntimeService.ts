import { supabase } from '../lib/supabaseClient';
import type { EatingMode } from '../types/domain';

type MealTemplateEntryRow = {
  id: string;
  template_id: string;
  meal_slot: string;
  display_order: number;
  food_id: string | null;
  food_name: string;
  quantity: number | null;
  unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  notes: string | null;
};

type MealTemplateRow = {
  id: string;
  title: string;
  description: string | null;
  difficulty: string | null;
  eating_mode: string | null;
  goal_tags: string[] | null;
  estimated_calories: number | null;
  estimated_protein_g: number | null;
  estimated_carbs_g: number | null;
  estimated_fats_g: number | null;
  created_by: string | null;
  is_public: boolean;
  is_deprecated: boolean;
  entries: MealTemplateEntryRow[];
};

type MealOverrideRow = {
  id: string;
  user_id: string;
  plan_id: string;
  day_date: string;
  template_entry_id: string | null;
  action_type: 'add' | 'remove' | 'replace';
  meal_slot: string | null;
  food_id: string | null;
  food_name: string | null;
  quantity: number | null;
  unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  display_order: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

type PlanMealTemplateMap = Record<string, string>;

export type RuntimeMealTemplate = {
  id: string;
  title: string;
  description?: string;
  difficulty?: string;
  eatingMode?: string;
  goalTags: string[];
  estimatedCalories?: number;
  estimatedProtein?: number;
  estimatedCarbs?: number;
  estimatedFats?: number;
  entries: RuntimeMealEntry[];
};

export type RuntimeMealEntry = {
  id: string;
  templateEntryId?: string | null;
  mealType: string;
  foodId?: string | null;
  foodName: string;
  quantity?: number | null;
  unit?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
  displayOrder?: number | null;
  notes?: string | null;
};

export type RuntimeMealsByType = Record<string, RuntimeMealEntry[]>;
export type RuntimeDailyNutritionTotals = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

export type RecommendedMealTemplate = {
  id: string;
  title: string;
  eatingMode?: string;
  goalTags: string[];
  estimatedCalories?: number;
  reason: string[];
  score: number;
};

export type MealSwapReplacementInput = {
  mealType?: string | null;
  foodId?: string | null;
  foodName: string;
  quantity?: number | null;
  unit?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
  displayOrder?: number | null;
  notes?: string | null;
};

export type SwapMealEntryForDateInput = {
  userId: string;
  planId: string;
  date: string;
  eatingMode: EatingMode;
  targetEntryId: string;
  replacement: MealSwapReplacementInput;
  reason?: string;
  enforceGuardrails?: boolean;
};

const normalizeKey = (value?: string | null): string =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, '_');

const normalizeMealType = (value?: string | null): string => {
  const key = normalizeKey(value);
  if (!key) return 'Meal';
  if (key === 'breakfast') return 'Breakfast';
  if (key === 'lunch') return 'Lunch';
  if (key === 'dinner') return 'Dinner';
  if (key === 'snack') return 'Snack';
  return value ?? 'Meal';
};

const mergeReasonIntoNotes = (notes?: string | null, reason?: string): string | null => {
  const normalizedNotes = (notes ?? '').trim();
  const normalizedReason = (reason ?? '').trim();
  if (!normalizedReason) return normalizedNotes || null;
  if (!normalizedNotes) return `Swap reason: ${normalizedReason}`;
  return `${normalizedNotes}\nSwap reason: ${normalizedReason}`;
};

const withinRatio = (
  base: number | null | undefined,
  next: number | null | undefined,
  minRatio: number,
  maxRatio: number
): boolean => {
  if (base == null || next == null || base <= 0) return true;
  const ratio = next / base;
  return ratio >= minRatio && ratio <= maxRatio;
};

const toRuntimeEntry = (row: MealTemplateEntryRow): RuntimeMealEntry => ({
  id: `tpl:${row.id}`,
  templateEntryId: row.id,
  mealType: normalizeMealType(row.meal_slot),
  foodId: row.food_id,
  foodName: row.food_name,
  quantity: row.quantity,
  unit: row.unit,
  calories: row.calories,
  protein: row.protein_g,
  carbs: row.carbs_g,
  fats: row.fats_g,
  displayOrder: row.display_order,
  notes: row.notes,
});

const groupByMealType = (entries: RuntimeMealEntry[]): RuntimeMealsByType =>
  entries.reduce<RuntimeMealsByType>((acc, entry) => {
    const key = normalizeMealType(entry.mealType);
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

const parsePlanMealTemplateMap = (raw: unknown): PlanMealTemplateMap | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([k, v]) => [normalizeKey(k), typeof v === 'string' ? v : null] as const)
    .filter(([, v]) => Boolean(v));
  if (!entries.length) return null;
  return Object.fromEntries(entries) as PlanMealTemplateMap;
};

const fetchPlanMealTemplateMap = async (planId: string): Promise<PlanMealTemplateMap | null> => {
  const { data, error } = await supabase
    .from('fitarc_workout_plans')
    .select('meal_template_map')
    .eq('id', planId)
    .maybeSingle();
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42703') return null;
    throw error;
  }
  return parsePlanMealTemplateMap((data as { meal_template_map?: unknown } | null)?.meal_template_map);
};

const pickTemplate = (
  templates: RuntimeMealTemplate[],
  planMap: PlanMealTemplateMap | null,
  eatingMode: EatingMode
): RuntimeMealTemplate | null => {
  if (!templates.length) return null;
  const mappedId = planMap?.training_day ?? planMap?.default;
  if (mappedId) {
    const mapped = templates.find((t) => t.id === mappedId);
    if (mapped) return mapped;
  }
  const modeMatch = templates.find((t) => normalizeKey(t.eatingMode) === normalizeKey(eatingMode));
  return modeMatch ?? templates[0];
};

const fetchMealOverridesForDate = async (
  userId: string,
  planId: string,
  date: string
): Promise<MealOverrideRow[]> => {
  const { data, error } = await supabase
    .from('fitarc_meal_overrides')
    .select(
      `
      id,
      user_id,
      plan_id,
      day_date,
      template_entry_id,
      action_type,
      meal_slot,
      food_id,
      food_name,
      quantity,
      unit,
      calories,
      protein_g,
      carbs_g,
      fats_g,
      display_order,
      notes,
      is_active,
      created_at
    `
    )
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('day_date', date)
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MealOverrideRow[];
};

const fetchMealOverridesForDates = async (
  userId: string,
  planId: string,
  dates: string[]
): Promise<MealOverrideRow[]> => {
  if (!dates.length) return [];
  const { data, error } = await supabase
    .from('fitarc_meal_overrides')
    .select(
      `
      id,
      user_id,
      plan_id,
      day_date,
      template_entry_id,
      action_type,
      meal_slot,
      food_id,
      food_name,
      quantity,
      unit,
      calories,
      protein_g,
      carbs_g,
      fats_g,
      display_order,
      notes,
      is_active,
      created_at
    `
    )
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .in('day_date', dates)
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MealOverrideRow[];
};

const applyOverrides = (baseEntries: RuntimeMealEntry[], overrides: MealOverrideRow[]): RuntimeMealEntry[] => {
  const overrideByTemplateEntry = new Map<string, MealOverrideRow>();
  const additions: MealOverrideRow[] = [];

  overrides.forEach((override) => {
    if (override.template_entry_id) {
      overrideByTemplateEntry.set(override.template_entry_id, override);
    } else if (override.action_type === 'add') {
      additions.push(override);
    }
  });

  const resolvedBase = baseEntries
    .map((base) => {
      const templateEntryId = base.templateEntryId;
      if (!templateEntryId) return base;
      const override = overrideByTemplateEntry.get(templateEntryId);
      if (!override) return base;
      if (override.action_type === 'remove') return null;
      return {
        ...base,
        id: `tpl:${templateEntryId}`,
        mealType: normalizeMealType(override.meal_slot ?? base.mealType),
        foodId: override.food_id ?? base.foodId ?? null,
        foodName: override.food_name ?? base.foodName,
        quantity: override.quantity ?? base.quantity ?? null,
        unit: override.unit ?? base.unit ?? null,
        calories: override.calories ?? base.calories ?? null,
        protein: override.protein_g ?? base.protein ?? null,
        carbs: override.carbs_g ?? base.carbs ?? null,
        fats: override.fats_g ?? base.fats ?? null,
        displayOrder: override.display_order ?? base.displayOrder ?? null,
        notes: override.notes ?? base.notes ?? null,
      } as RuntimeMealEntry;
    })
    .filter((entry): entry is RuntimeMealEntry => Boolean(entry));

  const resolvedAdds = additions.map((row) => ({
    id: `ovr:${row.id}`,
    templateEntryId: null,
    mealType: normalizeMealType(row.meal_slot),
    foodId: row.food_id,
    foodName: row.food_name ?? 'Meal Item',
    quantity: row.quantity,
    unit: row.unit,
    calories: row.calories,
    protein: row.protein_g,
    carbs: row.carbs_g,
    fats: row.fats_g,
    displayOrder: row.display_order,
    notes: row.notes,
  }));

  return [...resolvedBase, ...resolvedAdds].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
  );
};

export const fetchMealTemplates = async (userId: string): Promise<RuntimeMealTemplate[]> => {
  const { data, error } = await supabase
    .from('fitarc_meal_templates')
    .select(
      `
      id,
      title,
      description,
      difficulty,
      eating_mode,
      goal_tags,
      estimated_calories,
      estimated_protein_g,
      estimated_carbs_g,
      estimated_fats_g,
      created_by,
      is_public,
      is_deprecated,
      entries:fitarc_meal_template_entries (
        id,
        template_id,
        meal_slot,
        display_order,
        food_id,
        food_name,
        quantity,
        unit,
        calories,
        protein_g,
        carbs_g,
        fats_g,
        notes
      )
    `
    )
    .eq('is_deprecated', false)
    .or(`is_public.eq.true,created_by.eq.${userId}`);
  if (error) throw error;

  return ((data ?? []) as MealTemplateRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    difficulty: row.difficulty ?? undefined,
    eatingMode: row.eating_mode ?? undefined,
    goalTags: (row.goal_tags ?? []).map((tag) => normalizeKey(tag)),
    estimatedCalories: row.estimated_calories ?? undefined,
    estimatedProtein: row.estimated_protein_g ?? undefined,
    estimatedCarbs: row.estimated_carbs_g ?? undefined,
    estimatedFats: row.estimated_fats_g ?? undefined,
    entries: (row.entries ?? [])
      .sort((a, b) => a.display_order - b.display_order)
      .map(toRuntimeEntry),
  }));
};

export const fetchRecommendedMealTemplates = async (
  userId: string,
  eatingMode: EatingMode,
  limit = 6
): Promise<RecommendedMealTemplate[]> => {
  const templates = await fetchMealTemplates(userId);
  const normalizedMode = normalizeKey(eatingMode);
  const preferredGoalHints: string[] =
    normalizedMode === 'lean_bulk'
      ? ['hypertrophy', 'build_muscle', 'strength']
      : normalizedMode === 'mild_deficit'
        ? ['fat_loss', 'conditioning', 'general_fitness']
        : ['general', 'general_fitness'];

  return templates
    .map((template) => {
      let score = 0;
      const reason: string[] = [];
      const templateMode = normalizeKey(template.eatingMode);
      const tags = (template.goalTags ?? []).map(normalizeKey);

      if (templateMode && templateMode === normalizedMode) {
        score += 4;
        reason.push('matches your eating mode');
      }
      if (tags.some((tag) => preferredGoalHints.includes(tag))) {
        score += 2;
        reason.push('matches your goal focus');
      }
      if ((template.entries ?? []).length >= 3) {
        score += 1;
      }

      return {
        id: template.id,
        title: template.title,
        eatingMode: template.eatingMode,
        goalTags: tags,
        estimatedCalories: template.estimatedCalories,
        reason: reason.slice(0, 2),
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
};

export const fetchResolvedMealsForDate = async (
  userId: string,
  planId: string | null,
  date: string,
  eatingMode: EatingMode
): Promise<{ template: RuntimeMealTemplate | null; mealsByType: RuntimeMealsByType }> => {
  const templates = await fetchMealTemplates(userId);
  if (!templates.length) {
    return { template: null, mealsByType: {} };
  }

  const planMap = planId ? await fetchPlanMealTemplateMap(planId) : null;
  const template = pickTemplate(templates, planMap, eatingMode);
  if (!template) {
    return { template: null, mealsByType: {} };
  }

  const baseEntries = template.entries.map((entry) => ({ ...entry }));
  if (!planId) {
    return { template, mealsByType: groupByMealType(baseEntries) };
  }

  const overrides = await fetchMealOverridesForDate(userId, planId, date);
  const resolved = applyOverrides(baseEntries, overrides);
  return {
    template,
    mealsByType: groupByMealType(resolved),
  };
};

export const fetchNutritionTotalsForDates = async (
  userId: string,
  planId: string | null,
  dates: string[],
  eatingMode: EatingMode
): Promise<RuntimeDailyNutritionTotals[]> => {
  const normalizedDates = Array.from(new Set(dates.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
  if (!normalizedDates.length) return [];

  const templates = await fetchMealTemplates(userId);
  if (!templates.length) {
    return normalizedDates.map((date) => ({
      date,
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
    }));
  }

  const planMap = planId ? await fetchPlanMealTemplateMap(planId) : null;
  const template = pickTemplate(templates, planMap, eatingMode);
  if (!template) {
    return normalizedDates.map((date) => ({
      date,
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
    }));
  }

  const overrides = planId
    ? await fetchMealOverridesForDates(userId, planId, normalizedDates)
    : [];
  const overridesByDate = overrides.reduce<Record<string, MealOverrideRow[]>>((acc, row) => {
    if (!acc[row.day_date]) acc[row.day_date] = [];
    acc[row.day_date].push(row);
    return acc;
  }, {});

  const baseEntries = template.entries.map((entry) => ({ ...entry }));
  return normalizedDates.map((date) => {
    const entries = planId
      ? applyOverrides(baseEntries, overridesByDate[date] ?? [])
      : baseEntries;
    const totals = entries.reduce(
      (sum, entry) => ({
        calories: sum.calories + Number(entry.calories ?? 0),
        protein: sum.protein + Number(entry.protein ?? 0),
        carbs: sum.carbs + Number(entry.carbs ?? 0),
        fats: sum.fats + Number(entry.fats ?? 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
    return {
      date,
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein),
      carbs: Math.round(totals.carbs),
      fats: Math.round(totals.fats),
    };
  });
};

export const applyMealTemplateForDate = async (
  userId: string,
  planId: string | null,
  date: string,
  templateId: string
): Promise<void> => {
  if (!planId) return;

  const existingMap = (await fetchPlanMealTemplateMap(planId)) ?? {};
  const nextMap = {
    ...existingMap,
    default: templateId,
    training_day: templateId,
  };

  const { error: planError } = await supabase
    .from('fitarc_workout_plans')
    .update({ meal_template_map: nextMap })
    .eq('id', planId)
    .eq('user_id', userId);
  if (planError) throw planError;

  // Reset day-level overrides when fully applying a template.
  const { error: clearError } = await supabase
    .from('fitarc_meal_overrides')
    .delete()
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('day_date', date);
  if (clearError) throw clearError;
};

export const swapMealEntryForDate = async ({
  userId,
  planId,
  date,
  eatingMode,
  targetEntryId,
  replacement,
  reason,
  enforceGuardrails = true,
}: SwapMealEntryForDateInput): Promise<{ template: RuntimeMealTemplate | null; mealsByType: RuntimeMealsByType }> => {
  const resolved = await fetchResolvedMealsForDate(userId, planId, date, eatingMode);
  const allEntries = Object.values(resolved.mealsByType).flat();
  const target = allEntries.find((entry) => entry.id === targetEntryId);
  if (!target) {
    throw new Error('target_meal_entry_not_found');
  }

  if (enforceGuardrails) {
    if (!withinRatio(target.calories, replacement.calories, 0.7, 1.3)) {
      throw new Error('swap_guardrail_failed_calorie_range');
    }
    if (!withinRatio(target.protein, replacement.protein, 0.5, 1.5)) {
      throw new Error('swap_guardrail_failed_protein_range');
    }
    if (!withinRatio(target.carbs, replacement.carbs, 0.5, 1.5)) {
      throw new Error('swap_guardrail_failed_carbs_range');
    }
    if (!withinRatio(target.fats, replacement.fats, 0.5, 1.5)) {
      throw new Error('swap_guardrail_failed_fats_range');
    }
  }

  const payload = {
    user_id: userId,
    plan_id: planId,
    day_date: date,
    template_entry_id: target.templateEntryId ?? null,
    action_type: target.templateEntryId ? 'replace' : 'add',
    meal_slot: normalizeMealType(replacement.mealType ?? target.mealType),
    food_id: replacement.foodId ?? target.foodId ?? null,
    food_name: replacement.foodName,
    quantity: replacement.quantity ?? target.quantity ?? null,
    unit: replacement.unit ?? target.unit ?? null,
    calories: replacement.calories ?? target.calories ?? null,
    protein_g: replacement.protein ?? target.protein ?? null,
    carbs_g: replacement.carbs ?? target.carbs ?? null,
    fats_g: replacement.fats ?? target.fats ?? null,
    display_order: replacement.displayOrder ?? target.displayOrder ?? null,
    notes: mergeReasonIntoNotes(replacement.notes ?? target.notes, reason),
    is_active: true,
  };

  if (target.id.startsWith('ovr:')) {
    const overrideId = target.id.slice(4);
    const { error: deactivateError } = await supabase
      .from('fitarc_meal_overrides')
      .update({ is_active: false })
      .eq('id', overrideId)
      .eq('user_id', userId)
      .eq('plan_id', planId);
    if (deactivateError) throw deactivateError;
  } else if (target.templateEntryId) {
    const { error: deactivateError } = await supabase
      .from('fitarc_meal_overrides')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .eq('day_date', date)
      .eq('template_entry_id', target.templateEntryId)
      .eq('is_active', true);
    if (deactivateError) throw deactivateError;
  }

  const { error: insertError } = await supabase.from('fitarc_meal_overrides').insert(payload);
  if (insertError) throw insertError;

  return fetchResolvedMealsForDate(userId, planId, date, eatingMode);
};
