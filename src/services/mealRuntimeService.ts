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

