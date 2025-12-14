import { supabase } from '../lib/supabaseClient';

export type MealEntryRecord = {
  id: string;
  daily_meal_id: string;
  meal_type: string;
  food_name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  created_at: string;
};

export type MealEntry = {
  id: string;
  dailyMealId: string;
  mealType: string;
  foodName: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  createdAt: string;
};

export type MealsByType = Record<string, MealEntry[]>;

export type DailyMealRecord = {
  id: string;
  user_id: string;
  phase_id: string | null;
  meal_plan_id: string | null;
  meal_date: string;
  completed: boolean;
};

export type TodayMealsResult = {
  dailyMeal: DailyMealRecord | null;
  mealsByType: MealsByType;
};

export type CreateMealEntryInput = {
  dailyMealId: string;
  mealType: string;
  foodName: string;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
};

export type UpdateMealEntryInput = Partial<{
  mealType: string;
  foodName: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
}>;

const normalizeMealType = (value?: string | null): string => {
  if (!value) return 'Meal';
  return value.trim() || 'Meal';
};

const mapMealEntryRow = (row: MealEntryRecord): MealEntry => ({
  id: row.id,
  dailyMealId: row.daily_meal_id,
  mealType: normalizeMealType(row.meal_type),
  foodName: row.food_name,
  calories: row.calories,
  protein: row.protein_g,
  carbs: row.carbs_g,
  fats: row.fat_g,
  createdAt: row.created_at,
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

export const getDailyMealForDate = async (
  userId: string,
  mealDate: string
): Promise<DailyMealRecord | null> => {
  const { data, error } = await supabase
    .from('fitarc_daily_meals')
    .select('id, user_id, phase_id, meal_plan_id, meal_date, completed')
    .eq('user_id', userId)
    .eq('meal_date', mealDate)
    .maybeSingle();

  if (error) throw error;
  return data as DailyMealRecord | null;
};

export const ensureDailyMealForDate = async (
  userId: string,
  mealDate: string,
  mealPlanId?: string | null
): Promise<DailyMealRecord> => {
  const existing = await getDailyMealForDate(userId, mealDate);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('fitarc_daily_meals')
    .insert({
      user_id: userId,
      meal_date: mealDate,
      meal_plan_id: mealPlanId ?? null,
      completed: false,
    })
    .select('id, user_id, phase_id, meal_plan_id, meal_date, completed')
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
      calories,
      protein_g,
      carbs_g,
      fat_g,
      created_at
    `
    )
    .eq('daily_meal_id', dailyMealId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapMealEntryRow);
};

export const getTodayMeals = async (
  userId: string,
  mealDate: string
): Promise<TodayMealsResult> => {
  const dailyMeal = await getDailyMealForDate(userId, mealDate);
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
      calories,
      protein_g,
      carbs_g,
      fat_g,
      created_at
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
        created_at
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
      created_at
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
    .select('id, user_id, phase_id, meal_plan_id, meal_date, completed')
    .single();

  if (error) throw error;
  return data as DailyMealRecord;
};
