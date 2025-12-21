import { supabase } from '../lib/supabaseClient';
import { createMealEntry, MealEntry } from './supabaseMealService';

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
  limit = 10
): Promise<FoodItem[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];
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
    const aStarts = a.name.toLowerCase().startsWith(lower);
    const bStarts = b.name.toLowerCase().startsWith(lower);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.name.localeCompare(b.name);
  });
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
  const { data, error } = await supabase
    .from('fitarc_foods')
    .insert(payload)
    .select(FOOD_FIELDS)
    .single();
  if (error) throw error;
  return mapFoodRow(data);
};

export const fetchStoredFoods = async (
  userId: string,
  limit = 20
): Promise<FoodItem[]> => {
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
};

const buildFoodDisplayName = (food: FoodItem) =>
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
