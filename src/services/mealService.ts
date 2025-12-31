import { supabase } from '../lib/supabaseClient';
import { addDays, formatLocalDateYMD, parseYMDToDate } from '../utils/date';
import { DailyMealPlan } from '../types/domain';
import { mapMealPlanRow as mapDailyMealPlanRow } from '../utils/mealPlanMapper';

export type MealEntryRecord = {
  id: string;
  daily_meal_id: string;
  meal_type: string;
  food_name: string;
  food_id: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  created_at: string;
  is_done: boolean | null;
};

export type SeedMealPlanParams = {
  userId: string;
  startDate: string;
  days?: number;
  planId?: string | null;
  includeSnack?: boolean;
  eatingMode?: string;
};

export type MealEntry = {
  id: string;
  dailyMealId: string;
  mealType: string;
  foodName: string;
  foodId: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  createdAt: string;
  isDone: boolean;
};

export type MealsByType = Record<string, MealEntry[]>;

export type DailyMealRecord = {
  id: string;
  user_id: string;
  plan_id: string | null;
  meal_plan_id: string | null;
  meal_date: string;
  completed: boolean;
};

export type MealPlanRecord = {
  id: string;
  user_id: string;
  plan_id: string | null;
  name: string | null;
  eating_mode: string | null;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};

export type TodayMealsResult = {
  dailyMeal: DailyMealRecord | null;
  mealsByType: MealsByType;
};

export type CreateMealEntryInput = {
  dailyMealId: string;
  mealType: string;
  foodName: string;
  foodId?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
};

export type UpdateMealEntryInput = Partial<{
  mealType: string;
  foodName: string;
  foodId: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
}>;

const normalizeMealType = (value?: string | null): string => {
  if (!value) return 'Meal';
  return value.trim() || 'Meal';
};

const mapMealPlanRecordRow = (row: any): MealPlanRecord => ({
  id: row.id,
  user_id: row.user_id,
  plan_id: row.plan_id,
  name: row.name ?? null,
  eating_mode: row.eating_mode ?? null,
  start_date: row.start_date,
  end_date: row.end_date ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapMealEntryRow = (row: MealEntryRecord): MealEntry => ({
  id: row.id,
  dailyMealId: row.daily_meal_id,
  mealType: normalizeMealType(row.meal_type),
  foodName: row.food_name,
  foodId: row.food_id,
  calories: row.calories,
  protein: row.protein_g,
  carbs: row.carbs_g,
  fats: row.fat_g,
  createdAt: row.created_at,
  isDone: Boolean(row.is_done),
});

const groupEntriesByMealType = (entries: MealEntry[]): MealsByType => {
  return entries.reduce<MealsByType>((acc, entry) => {
    const key = entry.mealType;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key] = [...acc[key], entry];
    return acc;
  }, {});
};

export const ensureMealPlanWeek = async (
  userId: string,
  planId: string | null,
  weekStartDate: string,
  eatingMode?: string | null
): Promise<MealPlanRecord> => {
  const { data, error } = await supabase
    .from('fitarc_meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('start_date', weekStartDate);

  if (error) throw error;
  const existing = (data as MealPlanRecord[])[0];
  if (existing) {
    if (planId && existing.plan_id !== planId) {
      const { data: updated, error: updateError } = await supabase
        .from('fitarc_meal_plans')
        .update({ plan_id: planId })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      return mapMealPlanRecordRow(updated);
    }
    return mapMealPlanRecordRow(existing);
  }

  const startDateObj = parseYMDToDate(weekStartDate);
  const endDateStr = formatLocalDateYMD(addDays(startDateObj, 6));
  const { data: inserted, error: insertError } = await supabase
    .from('fitarc_meal_plans')
    .insert({
      user_id: userId,
      plan_id: planId ?? null,
      start_date: weekStartDate,
      end_date: endDateStr,
      eating_mode: eatingMode || 'general',
      name: `Week of ${weekStartDate}`,
    })
    .select('*')
    .single();

  if (insertError) throw insertError;
  return mapMealPlanRecordRow(inserted);
};

export const ensureDailyMealsForWeek = async (
  userId: string,
  planId: string | null,
  mealPlanId: string,
  weekStartDate: string
): Promise<DailyMealRecord[]> => {
  const records: DailyMealRecord[] = [];
  const startDateObj = parseYMDToDate(weekStartDate);
  for (let i = 0; i < 7; i += 1) {
    const targetDate = addDays(startDateObj, i);
    const targetKey = formatLocalDateYMD(targetDate);
    const record = await ensureDailyMealForDate(userId, targetKey, planId, mealPlanId);
    records.push(record);
  }
  return records;
};

export const hasDailyMealsInRange = async (
  userId: string,
  fromDate: string,
  toDate: string,
  planId?: string | null
): Promise<boolean> => {
  const query = supabase
    .from('fitarc_daily_meals')
    .select('id', { head: true, count: 'exact' })
    .eq('user_id', userId)
    .gte('meal_date', fromDate)
    .lte('meal_date', toDate)
    .limit(1);
  if (planId) {
    query.eq('plan_id', planId);
  }
  const { count, error } = await query;
  if (error) throw error;
  return Boolean(count && count > 0);
};

export const createMealPlanWithSeed = async ({
  userId,
  startDate,
  days = 7,
  planId,
  includeSnack = false,
  eatingMode = 'balanced',
}: SeedMealPlanParams): Promise<string> => {
  const { data, error } = await supabase.rpc('fitarc_create_meal_plan_with_seed', {
    p_user_id: userId,
    p_start_date: startDate,
    p_days: days,
    p_name: null,
    p_eating_mode: eatingMode,
    p_plan_id: planId ?? null,
    p_include_snack: includeSnack,
  });
  if (error) throw error;
  return (data as string) ?? '';
};

export const fetchMealPlansForRange = async (
  userId: string,
  fromDate: string,
  toDate: string,
  planId?: string
): Promise<DailyMealPlan[]> => {
  let query = supabase
    .from('fitarc_daily_meals')
    .select(
      `
      id,
      user_id,
      plan_id,
      meal_plan_id,
      meal_date,
      completed,
      notes,
      meal_entries:fitarc_meal_entries (
        id,
        meal_type,
        food_name,
        calories,
        protein_g,
        carbs_g,
        fat_g
      )
    `
    )
    .eq('user_id', userId)
    .gte('meal_date', fromDate)
    .lte('meal_date', toDate)
    .order('meal_date', { ascending: true });

  if (planId) {
    query = query.eq('plan_id', planId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []).map((row: any) => mapDailyMealPlanRow(row));
};

export const getDailyMealForDate = async (
  userId: string,
  mealDate: string,
  planId?: string | null
): Promise<DailyMealRecord | null> => {
  const { data, error } = await supabase
    .from('fitarc_daily_meals')
    .select('id, user_id, plan_id, meal_plan_id, meal_date, completed')
    .eq('user_id', userId)
    .eq('meal_date', mealDate);

  if (error) throw error;
  const rows = (data as DailyMealRecord[]) || [];
  if (!rows.length) return null;
  if (planId) {
    const match = rows.find((row) => row.plan_id === planId);
    return match ?? null;
  }
  return rows[0];
};

export const ensureDailyMealForDate = async (
  userId: string,
  mealDate: string,
  planId?: string | null,
  mealPlanId?: string | null
): Promise<DailyMealRecord> => {
  const existing = await getDailyMealForDate(userId, mealDate, planId);
  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from('fitarc_daily_meals')
    .insert({
      user_id: userId,
      plan_id: planId ?? null,
      meal_date: mealDate,
      meal_plan_id: mealPlanId ?? null,
      completed: false,
    })
    .select('id, user_id, plan_id, meal_plan_id, meal_date, completed')
    .single();

  if (error) throw error;
  return data as DailyMealRecord;
};

export const fetchMealEntries = async (dailyMealId: string): Promise<MealEntry[]> => {
  const { data, error } = await supabase
    .from('fitarc_meal_entries')
    .select(
      `
      id,
      daily_meal_id,
      meal_type,
      food_name,
      food_id,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      created_at,
      is_done
    `
    )
    .eq('daily_meal_id', dailyMealId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapMealEntryRow);
};

export const getTodayMeals = async (
  userId: string,
  mealDate: string,
  planId?: string | null
): Promise<TodayMealsResult> => {
  const dailyMeal = await getDailyMealForDate(userId, mealDate, planId);
  if (!dailyMeal) {
    return { dailyMeal: null, mealsByType: {} };
  }
  const entries = await fetchMealEntries(dailyMeal.id);
  return {
    dailyMeal,
    mealsByType: groupEntriesByMealType(entries),
  };
};

const buildEntryPayload = (input: CreateMealEntryInput | UpdateMealEntryInput) => {
  const payload: any = {};
  if ('mealType' in input && input.mealType !== undefined) {
    payload.meal_type = normalizeMealType(input.mealType);
  }
  if ('foodName' in input && input.foodName !== undefined) {
    payload.food_name = input.foodName.trim();
  }
  if ('foodId' in input && input.foodId !== undefined) {
    payload.food_id = input.foodId ?? null;
  }
  if ('calories' in input) payload.calories = input.calories ?? null;
  if ('protein' in input) payload.protein_g = input.protein ?? null;
  if ('carbs' in input) payload.carbs_g = input.carbs ?? null;
  if ('fats' in input) payload.fat_g = input.fats ?? null;
  return payload;
};

export const createMealEntry = async (
  input: CreateMealEntryInput
): Promise<MealEntry> => {
  const payload = {
    daily_meal_id: input.dailyMealId,
    ...buildEntryPayload(input),
  };
  const { data, error } = await supabase
    .from('fitarc_meal_entries')
    .insert(payload)
    .select(
      `
      id,
      daily_meal_id,
      meal_type,
      food_name,
      food_id,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      created_at,
      is_done
    `
    )
    .single();

  if (error) throw error;
  return mapMealEntryRow(data as MealEntryRecord);
};

export const updateMealEntry = async (
  entryId: string,
  patch: UpdateMealEntryInput
): Promise<MealEntry> => {
  const payload = buildEntryPayload(patch);
  if (!Object.keys(payload).length) {
    const { data, error } = await supabase
      .from('fitarc_meal_entries')
      .select(
        `
        id,
        daily_meal_id,
        meal_type,
        food_name,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        created_at,
        is_done
      `
      )
      .eq('id', entryId)
      .single();

    if (error) throw error;
    return mapMealEntryRow(data as MealEntryRecord);
  }

  const { data, error } = await supabase
    .from('fitarc_meal_entries')
    .update(payload)
    .eq('id', entryId)
    .select(
      `
      id,
      daily_meal_id,
      meal_type,
      food_name,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      created_at,
      is_done
    `
    )
    .single();

  if (error) throw error;
  return mapMealEntryRow(data as MealEntryRecord);
};

export const deleteMealEntry = async (entryId: string): Promise<void> => {
  const { error } = await supabase
    .from('fitarc_meal_entries')
    .delete()
    .eq('id', entryId);

  if (error) throw error;
};

export const setDailyMealsCompleted = async (
  dailyMealId: string,
  completed: boolean
): Promise<DailyMealRecord> => {
  const { data, error } = await supabase
    .from('fitarc_daily_meals')
    .update({ completed })
    .eq('id', dailyMealId)
    .select('id, user_id, plan_id, meal_plan_id, meal_date, completed')
    .single();

  if (error) throw error;
  return data as DailyMealRecord;
};

export const setDailyMealEntriesDone = async (
  dailyMealId: string,
  isDone: boolean
): Promise<void> => {
  const { error } = await supabase
    .from('fitarc_meal_entries')
    .update({ is_done: isDone })
    .eq('daily_meal_id', dailyMealId);
  if (error) throw error;
};

export const setMealTypeEntriesDone = async (
  dailyMealId: string,
  mealType: string,
  isDone: boolean
): Promise<void> => {
  const { error } = await supabase
    .from('fitarc_meal_entries')
    .update({ is_done: isDone })
    .eq('daily_meal_id', dailyMealId)
    .eq('meal_type', normalizeMealType(mealType));
  if (error) throw error;
};

export type FoodItem = {
  id: string;
  userId: string | null;
  name: string;
  brand: string | null;
  servingLabel: string | null;
  servingGrams: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  nutrients: Record<string, any> | null;
  tags: string[] | null;
};

export type FoodDraft = {
  name: string;
  brand?: string;
  servingLabel?: string;
  servingGrams?: number | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
};

const mapFoodRow = (row: any): FoodItem => ({
  id: row.id,
  userId: row.user_id ?? null,
  name: row.name,
  brand: row.brand ?? null,
  servingLabel: row.serving_label ?? null,
  servingGrams: row.serving_grams ?? null,
  calories: row.calories ?? null,
  protein: row.protein_g ?? null,
  carbs: row.carbs_g ?? null,
  fats: row.fat_g ?? null,
  nutrients: row.nutrients ?? null,
  tags: row.tags ?? null,
});

const FOOD_FIELDS = `
  id,
  user_id,
  name,
  brand,
  serving_label,
  serving_grams,
  calories,
  protein_g,
  carbs_g,
  fat_g,
  nutrients,
  tags
`;

export const searchFoods = async (
  query: string,
  userId: string,
  limit = 15
): Promise<FoodItem[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const { data, error } = await supabase
      .from('fitarc_foods')
      .select(FOOD_FIELDS)
      .ilike('name', `%${trimmed}%`)
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order('name', { ascending: true })
      .limit(limit);

    if (error) throw error;

    const rows = (data || []).map(mapFoodRow);
    const lower = trimmed.toLowerCase();

    return rows.sort((a, b) => {
      const aNameLower = a.name.toLowerCase();
      const bNameLower = b.name.toLowerCase();

      if (aNameLower === lower && bNameLower !== lower) return -1;
      if (bNameLower === lower && aNameLower !== lower) return 1;

      const aStarts = aNameLower.startsWith(lower);
      const bStarts = bNameLower.startsWith(lower);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      if (a.userId && !b.userId) return -1;
      if (!a.userId && b.userId) return 1;

      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.error('Failed to search foods:', err);
    throw err;
  }
};

export const createUserFood = async (
  userId: string,
  draft: FoodDraft
): Promise<FoodItem> => {
  const payload = {
    user_id: userId,
    name: draft.name.trim(),
    brand: draft.brand ? draft.brand.trim() : null,
    serving_label: draft.servingLabel ? draft.servingLabel.trim() : null,
    serving_grams: draft.servingGrams ?? null,
    calories: draft.calories ?? null,
    protein_g: draft.protein ?? null,
    carbs_g: draft.carbs ?? null,
    fat_g: draft.fats ?? null,
  };

  try {
    const { data, error } = await supabase
      .from('fitarc_foods')
      .insert(payload)
      .select(FOOD_FIELDS)
      .single();

    if (error) throw error;
    return mapFoodRow(data);
  } catch (err) {
    console.error('Failed to create user food:', err);
    throw err;
  }
};

export const fetchStoredFoods = async (
  userId: string,
  limit = 20
): Promise<FoodItem[]> => {
  try {
    const { data, error } = await supabase
      .from('fitarc_foods')
      .select(FOOD_FIELDS)
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order('name', { ascending: true })
      .limit(limit);

    if (error) throw error;

    const rows = (data || []).map(mapFoodRow);

    return rows.sort((a, b) => {
      if (a.userId && !b.userId) return -1;
      if (!a.userId && b.userId) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.error('Failed to fetch stored foods:', err);
    throw err;
  }
};

export const fetchRecentlyUsedFoods = async (
  userId: string,
  limit = 10
): Promise<FoodItem[]> => {
  try {
    const { data: entries, error: entriesError } = await supabase
      .from('fitarc_meal_entries')
      .select('food_id')
      .eq('user_id', userId)
      .not('food_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (entriesError) throw entriesError;

    if (!entries || entries.length === 0) {
      return [];
    }

    const uniqueFoodIds = Array.from(new Set(entries.map((e) => e.food_id).filter(Boolean)));
    const foodIds = uniqueFoodIds.slice(0, limit);

    const { data: foods, error: foodsError } = await supabase
      .from('fitarc_foods')
      .select(FOOD_FIELDS)
      .in('id', foodIds);

    if (foodsError) throw foodsError;

    return (foods || []).map(mapFoodRow);
  } catch (err) {
    console.error('Failed to fetch recently used foods:', err);
    return [];
  }
};

const buildFoodDisplayName = (food: FoodItem): string =>
  food.brand ? `${food.name} (${food.brand})` : food.name;

export const addMealEntryFromFood = async (
  dailyMealId: string,
  mealType: string,
  food: FoodItem
): Promise<MealEntry> => {
  return createMealEntry({
    dailyMealId,
    mealType,
    foodName: buildFoodDisplayName(food),
    foodId: food.id,
    calories: food.calories ?? null,
    protein: food.protein ?? null,
    carbs: food.carbs ?? null,
    fats: food.fats ?? null,
  });
};

export const addManualMealEntry = async (
  dailyMealId: string,
  mealType: string,
  foodName: string,
  macros?: {
    calories?: number | null;
    protein?: number | null;
    carbs?: number | null;
    fats?: number | null;
  }
): Promise<MealEntry> => {
  return createMealEntry({
    dailyMealId,
    mealType,
    foodName,
    foodId: null,
    calories: macros?.calories ?? null,
    protein: macros?.protein ?? null,
    carbs: macros?.carbs ?? null,
    fats: macros?.fats ?? null,
  });
};

export const getFoodById = async (foodId: string): Promise<FoodItem | null> => {
  try {
    const { data, error } = await supabase
      .from('fitarc_foods')
      .select(FOOD_FIELDS)
      .eq('id', foodId)
      .single();

    if (error) throw error;
    return data ? mapFoodRow(data) : null;
  } catch (err) {
    console.error('Failed to fetch food by ID:', err);
    return null;
  }
};

export const updateUserFood = async (
  foodId: string,
  userId: string,
  updates: Partial<FoodDraft>
): Promise<FoodItem> => {
  const payload: any = {};

  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.brand !== undefined) payload.brand = updates.brand ? updates.brand.trim() : null;
  if (updates.servingLabel !== undefined) {
    payload.serving_label = updates.servingLabel ? updates.servingLabel.trim() : null;
  }
  if (updates.servingGrams !== undefined) payload.serving_grams = updates.servingGrams ?? null;
  if (updates.calories !== undefined) payload.calories = updates.calories ?? null;
  if (updates.protein !== undefined) payload.protein_g = updates.protein ?? null;
  if (updates.carbs !== undefined) payload.carbs_g = updates.carbs ?? null;
  if (updates.fats !== undefined) payload.fat_g = updates.fats ?? null;

  try {
    const { data, error } = await supabase
      .from('fitarc_foods')
      .update(payload)
      .eq('id', foodId)
      .eq('user_id', userId)
      .select(FOOD_FIELDS)
      .single();

    if (error) throw error;
    return mapFoodRow(data);
  } catch (err) {
    console.error('Failed to update user food:', err);
    throw err;
  }
};

export const deleteUserFood = async (
  foodId: string,
  userId: string
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('fitarc_foods')
      .delete()
      .eq('id', foodId)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (err) {
    console.error('Failed to delete user food:', err);
    throw err;
  }
};
