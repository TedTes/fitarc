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

/**
 * Search for foods by name in the catalog
 * Searches both global foods and user-specific foods
 * Results are sorted to prioritize exact/prefix matches
 */
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

    // Sort results: exact matches first, then prefix matches, then others
    return rows.sort((a, b) => {
      const aNameLower = a.name.toLowerCase();
      const bNameLower = b.name.toLowerCase();

      // Exact match
      if (aNameLower === lower && bNameLower !== lower) return -1;
      if (bNameLower === lower && aNameLower !== lower) return 1;

      // Prefix match
      const aStarts = aNameLower.startsWith(lower);
      const bStarts = bNameLower.startsWith(lower);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      // User's own foods come before global foods
      if (a.userId && !b.userId) return -1;
      if (!a.userId && b.userId) return 1;

      // Alphabetical
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.error('Failed to search foods:', err);
    throw err;
  }
};

/**
 * Create a new user-specific food in the catalog
 */
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

/**
 * Fetch stored foods (both global and user-specific)
 * User foods are prioritized in the results
 */
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

    // Sort to prioritize user's own foods
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

/**
 * Fetch recently used foods by the user
 * Gets unique foods from recent meal entries
 */
export const fetchRecentlyUsedFoods = async (
  userId: string,
  limit = 10
): Promise<FoodItem[]> => {
  try {
    // Get recent meal entries with food_id
    const { data: entries, error: entriesError } = await supabase
      .from('fitarc_meal_entries')
      .select('food_id')
      .eq('user_id', userId)
      .not('food_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50); // Get more entries to ensure we have enough unique foods

    if (entriesError) throw entriesError;

    if (!entries || entries.length === 0) {
      return [];
    }

    // Get unique food IDs
    const uniqueFoodIds = Array.from(new Set(entries.map((e) => e.food_id).filter(Boolean)));
    const foodIds = uniqueFoodIds.slice(0, limit);

    // Fetch the actual food items
    const { data: foods, error: foodsError } = await supabase
      .from('fitarc_foods')
      .select(FOOD_FIELDS)
      .in('id', foodIds);

    if (foodsError) throw foodsError;

    return (foods || []).map(mapFoodRow);
  } catch (err) {
    console.error('Failed to fetch recently used foods:', err);
    return []; // Return empty array on error to not break UI
  }
};

/**
 * Build a display name for a food item
 */
const buildFoodDisplayName = (food: FoodItem): string =>
  food.brand ? `${food.name} (${food.brand})` : food.name;

/**
 * Add a meal entry from an existing food item
 */
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

/**
 * Add a manual meal entry without linking to a food item
 */
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

/**
 * Get a single food item by ID
 */
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

/**
 * Update an existing user food
 */
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
      .eq('user_id', userId) // Only allow updating own foods
      .select(FOOD_FIELDS)
      .single();

    if (error) throw error;
    return mapFoodRow(data);
  } catch (err) {
    console.error('Failed to update user food:', err);
    throw err;
  }
};

/**
 * Delete a user-created food
 */
export const deleteUserFood = async (
  foodId: string,
  userId: string
): Promise<void> => {
  try {
    const { error } = await supabase
      .from('fitarc_foods')
      .delete()
      .eq('id', foodId)
      .eq('user_id', userId); // Only allow deleting own foods

    if (error) throw error;
  } catch (err) {
    console.error('Failed to delete user food:', err);
    throw err;
  }
};