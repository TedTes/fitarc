import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TodayMealsResult,
  MealsByType,
  MealEntry,
  getTodayMeals,
  ensureDailyMealForDate,
  createMealEntry,
  updateMealEntry,
  deleteMealEntry,
  setDailyMealsCompleted,
} from '../services/supabaseMealService';
import { formatLocalDateYMD } from '../utils/date';

type AddEntryPayload = {
  mealType: string;
  foodName: string;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
};

type EditEntryPayload = {
  entryId: string;
  mealType?: string;
  foodName?: string;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
};

const cache = new Map<string, TodayMealsResult>();

const emptyMealsState = (): TodayMealsResult => ({
  dailyMeal: null,
  mealsByType: {},
});

const addEntryToMap = (map: MealsByType, entry: MealEntry): MealsByType => {
  const key = entry.mealType;
  const nextEntries = [...(map[key] || []), entry];
  nextEntries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    ...map,
    [key]: nextEntries,
  };
};

const updateEntryInMap = (
  map: MealsByType,
  entryId: string,
  updatedEntry: MealEntry
): MealsByType => {
  const currentType = Object.keys(map).find((type) =>
    map[type].some((entry) => entry.id === entryId)
  );
  if (!currentType) {
    return addEntryToMap(map, updatedEntry);
  }

  const withoutEntry = map[currentType].filter((entry) => entry.id !== entryId);
  const nextMap = { ...map };
  if (withoutEntry.length) {
    nextMap[currentType] = withoutEntry;
  } else {
    delete nextMap[currentType];
  }
  return addEntryToMap(nextMap, updatedEntry);
};

const removeEntryFromMap = (map: MealsByType, entryId: string): MealsByType => {
  const typeKey = Object.keys(map).find((type) =>
    map[type].some((entry) => entry.id === entryId)
  );
  if (!typeKey) return map;
  const remaining = map[typeKey].filter((entry) => entry.id !== entryId);
  const nextMap = { ...map };
  if (remaining.length) {
    nextMap[typeKey] = remaining;
  } else {
    delete nextMap[typeKey];
  }
  return nextMap;
};

export const useTodayMeals = (userId?: string, date?: Date, enabled = true) => {
  const dateKey = date ? formatLocalDateYMD(date) : undefined;
  const cacheKey = enabled && userId && dateKey ? `${userId}:${dateKey}` : undefined;

  const [mealsState, setMealsState] = useState<TodayMealsResult>(() =>
    cacheKey && cache.has(cacheKey) ? cache.get(cacheKey)! : emptyMealsState()
  );
  const [isLoading, setIsLoading] = useState<boolean>(!!cacheKey && !cache.has(cacheKey));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMeals = useCallback(async () => {
    if (!enabled || !userId || !dateKey) return;
    setIsLoading(true);
    setError(null);
    try {
      const latest = await getTodayMeals(userId, dateKey);
      if (cacheKey) cache.set(cacheKey, latest);
      setMealsState(latest);
    } catch (err: any) {
      console.error('Failed to fetch today meals', err);
      setError(err?.message || 'Unable to load meals');
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, dateKey, enabled, userId]);

  useEffect(() => {
    if (!cacheKey) return;
    if (cache.has(cacheKey)) {
      setMealsState(cache.get(cacheKey)!);
      setIsLoading(false);
      return;
    }
    loadMeals();
  }, [cacheKey, loadMeals]);

  const ensureDailyMeal = useCallback(async () => {
    if (!userId || !dateKey) {
      throw new Error('Missing user or date');
    }
    if (mealsState.dailyMeal) return mealsState.dailyMeal;
    const created = await ensureDailyMealForDate(userId, dateKey);
    setMealsState((prev) => ({
      dailyMeal: created,
      mealsByType: prev.mealsByType,
    }));
    return created;
  }, [dateKey, mealsState.dailyMeal, userId]);

  const addEntry = useCallback(
    async ({ mealType, foodName, calories, protein, carbs, fats }: AddEntryPayload) => {
      if (!userId || !dateKey) {
        throw new Error('Missing user or date');
      }
      setIsMutating(true);
      try {
        const dailyMeal = await ensureDailyMeal();
        const created = await createMealEntry({
          dailyMealId: dailyMeal.id,
          mealType,
          foodName,
          calories,
          protein,
          carbs,
          fats,
        });
        setMealsState((prev) => ({
          dailyMeal,
          mealsByType: addEntryToMap(prev.mealsByType, created),
        }));
      } catch (err) {
        console.error('Failed to add meal entry', err);
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [dateKey, ensureDailyMeal, userId]
  );

  const editEntry = useCallback(
    async ({ entryId, mealType, foodName, calories, protein, carbs, fats }: EditEntryPayload) => {
      if (!entryId) throw new Error('Missing entry id');
      setIsMutating(true);
      try {
        const updated = await updateMealEntry(entryId, {
          mealType,
          foodName,
          calories,
          protein,
          carbs,
          fats,
        });
        setMealsState((prev) => ({
          dailyMeal: prev.dailyMeal,
          mealsByType: updateEntryInMap(prev.mealsByType, entryId, updated),
        }));
      } catch (err) {
        console.error('Failed to edit meal entry', err);
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    []
  );

  const removeEntry = useCallback(async (entryId: string) => {
    setIsMutating(true);
    try {
      await deleteMealEntry(entryId);
      setMealsState((prev) => ({
        dailyMeal: prev.dailyMeal,
        mealsByType: removeEntryFromMap(prev.mealsByType, entryId),
      }));
    } catch (err) {
      console.error('Failed to delete meal entry', err);
      throw err;
    } finally {
      setIsMutating(false);
    }
  }, []);

  const toggleDayCompleted = useCallback(
    async (completed: boolean) => {
      if (!userId || !dateKey) throw new Error('Missing user or date');
      setIsMutating(true);
      try {
        const dailyMeal = await ensureDailyMeal();
        const updated = await setDailyMealsCompleted(dailyMeal.id, completed);
        setMealsState((prev) => ({
          dailyMeal: updated,
          mealsByType: prev.mealsByType,
        }));
      } catch (err) {
        console.error('Failed to toggle meal completion', err);
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [dateKey, ensureDailyMeal, userId]
  );

  const mealsByType = useMemo(() => mealsState.mealsByType, [mealsState.mealsByType]);

  return {
    dailyMeal: mealsState.dailyMeal,
    mealsByType,
    isLoading,
    isMutating,
    error,
    refetch: loadMeals,
    addEntry,
    editEntry,
    removeEntry,
    toggleDayCompleted,
  };
};
