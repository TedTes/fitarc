import { supabase } from '../lib/supabaseClient';
import { addDays, formatLocalDateYMD, getWeekStartDate, parseYMDToDate } from '../utils/date';

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

const mapMealPlanRow = (row: any): MealPlanRecord => ({
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
      return mapMealPlanRow(updated);
    }
    return mapMealPlanRow(existing);
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
  return mapMealPlanRow(inserted);
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
    if (match) return match;
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
    if (planId && existing.plan_id !== planId) {
      const { data, error } = await supabase
        .from('fitarc_daily_meals')
        .update({ plan_id: planId })
        .eq('id', existing.id)
        .select('id, user_id, plan_id, meal_plan_id, meal_date, completed')
        .single();
      if (error) throw error;
      return data as DailyMealRecord;
    }
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
