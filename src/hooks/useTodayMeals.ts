import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  setDailyMealEntriesDone,
  setMealTypeEntriesDone,
} from '../services/mealService';
import { addMealEntryFromFood, FoodItem } from '../services/mealService';
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

export const DUPLICATE_MEAL_ENTRY_ERROR = 'DUPLICATE_MEAL_ENTRY';

const cache = new Map<string, TodayMealsResult>();
const listeners = new Map<string, Map<symbol, (state: TodayMealsResult) => void>>();

const notifyListeners = (key: string, state: TodayMealsResult, originId?: symbol | null) => {
  const map = listeners.get(key);
  if (!map) return;
  map.forEach((listener, id) => {
    if (originId && id === originId) return;
    listener(state);
  });
};

const subscribeToMealsState = (
  key: string,
  subscriberId: symbol,
  listener: (state: TodayMealsResult) => void
) => {
  if (!listeners.has(key)) {
    listeners.set(key, new Map());
  }
  listeners.get(key)!.set(subscriberId, listener);
  return () => {
    const map = listeners.get(key);
    if (!map) return;
    map.delete(subscriberId);
    if (map.size === 0) {
      listeners.delete(key);
    }
  };
};

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

const updateEntriesCompletion = (map: MealsByType, completed: boolean): MealsByType => {
  const next: MealsByType = {};
  Object.keys(map).forEach((key) => {
    next[key] = map[key].map((entry) => ({
      ...entry,
      isDone: completed,
    }));
  });
  return next;
};

const normalizeFoodName = (value: string): string =>
  value
    ?.replace(/\(.*?\)/g, '')
    .replace(/•/g, '')
    .replace(/\b\d+(?:\.\d+)?\s*(?:kcal|cal|g|grams?|protein|carbs?|fat|fats?|p|c|f)\b/gi, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase() || '';

const getEntriesForMealType = (map: MealsByType, mealType: string): MealEntry[] => {
  if (map[mealType]) return map[mealType];
  const normalizedType = mealType.trim().toLowerCase();
  const matchingKey = Object.keys(map).find(
    (type) => type.trim().toLowerCase() === normalizedType
  );
  return matchingKey ? map[matchingKey] : [];
};

const resolveMealTypeKey = (map: MealsByType, mealType: string): string | null => {
  if (map[mealType]) return mealType;
  const normalizedType = mealType.trim().toLowerCase();
  return (
    Object.keys(map).find((type) => type.trim().toLowerCase() === normalizedType) || null
  );
};

const updateEntriesCompletionForType = (
  map: MealsByType,
  mealType: string,
  completed: boolean
): MealsByType => {
  const key = resolveMealTypeKey(map, mealType);
  if (!key) return map;
  return {
    ...map,
    [key]: map[key].map((entry) => ({
      ...entry,
      isDone: completed,
    })),
  };
};

const getFoodDisplayName = (food: FoodItem): string =>
  food.brand ? `${food.name} (${food.brand})` : food.name;

const hasDuplicateEntry = (map: MealsByType, mealType: string, foodName: string) => {
  const normalizedName = normalizeFoodName(foodName);
  if (!normalizedName) return false;
  return getEntriesForMealType(map, mealType).some(
    (entry) => normalizeFoodName(entry.foodName) === normalizedName
  );
};

export const useTodayMeals = (
  userId?: string,
  date?: Date,
  enabled: boolean = true,
  planId?: string | null
) => {
  const dateKey = date ? formatLocalDateYMD(date) : undefined;
  const cacheKey =
    enabled && userId && dateKey ? `${userId}:${dateKey}:${planId ?? 'none'}` : undefined;
  const subscriberIdRef = useRef<symbol | null>(null);

  const [mealsState, setMealsState] = useState<TodayMealsResult>(() =>
    cacheKey && cache.has(cacheKey) ? cache.get(cacheKey)! : emptyMealsState()
  );
  const [isLoading, setIsLoading] = useState<boolean>(!!cacheKey && !cache.has(cacheKey));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateMealsState = useCallback(
    (
      updater:
        | TodayMealsResult
        | ((prev: TodayMealsResult) => TodayMealsResult)
    ) => {
      setMealsState((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (p: TodayMealsResult) => TodayMealsResult)(prev)
            : updater;
        if (cacheKey) {
          cache.set(cacheKey, next);
          notifyListeners(cacheKey, next, subscriberIdRef.current ?? undefined);
        }
        return next;
      });
    },
    [cacheKey]
  );

  const loadMeals = useCallback(async () => {
    if (!enabled || !userId || !dateKey) return;
    setIsLoading(true);
    setError(null);
    try {
      const latest = await getTodayMeals(userId, dateKey, planId ?? null);
      if (cacheKey) cache.set(cacheKey, latest);
      updateMealsState(latest);
    } catch (err: any) {
      console.error('Failed to fetch today meals', err);
      setError(err?.message || 'Unable to load meals');
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, dateKey, enabled, planId, updateMealsState, userId]);

  useEffect(() => {
    if (!cacheKey) return;
    if (cache.has(cacheKey)) {
      setMealsState(cache.get(cacheKey)!);
      setIsLoading(false);
    } else {
      loadMeals();
    }
    if (!cacheKey) return;
    if (!subscriberIdRef.current) {
      subscriberIdRef.current = Symbol('meals-subscriber');
    }
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToMealsState(cacheKey, subscriberIdRef.current, (state) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        setMealsState(state);
      }, 0);
    });
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      unsubscribe();
    };
  }, [cacheKey, loadMeals]);

  const ensureDailyMeal = useCallback(async () => {
    if (!userId || !dateKey) {
      throw new Error('Missing user or date');
    }
    if (mealsState.dailyMeal) return mealsState.dailyMeal;
    const created = await ensureDailyMealForDate(userId, dateKey, planId ?? null);
    updateMealsState((prev) => ({
      dailyMeal: created,
      mealsByType: prev.mealsByType,
    }));
    return created;
  }, [dateKey, mealsState.dailyMeal, planId, updateMealsState, userId]);


  const addEntry = useCallback(
    async ({ mealType, foodName, calories, protein, carbs, fats }: AddEntryPayload) => {
      if (!userId || !dateKey) {
        throw new Error('Missing user or date');
      }
      if (hasDuplicateEntry(mealsState.mealsByType, mealType, foodName)) {
        throw new Error(DUPLICATE_MEAL_ENTRY_ERROR);
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
        updateMealsState((prev) => ({
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
    [dateKey, ensureDailyMeal, mealsState.mealsByType, userId]
  );

  const addEntryFromFood = useCallback(
    async (mealType: string, food: FoodItem) => {
      if (!userId || !dateKey) {
        throw new Error('Missing user or date');
      }
      const displayName = getFoodDisplayName(food);
      if (hasDuplicateEntry(mealsState.mealsByType, mealType, displayName)) {
        throw new Error(DUPLICATE_MEAL_ENTRY_ERROR);
      }
      setIsMutating(true);
      try {
        const dailyMeal = await ensureDailyMeal();
        const created = await addMealEntryFromFood(dailyMeal.id, mealType, food);
        updateMealsState((prev) => ({
          dailyMeal,
          mealsByType: addEntryToMap(prev.mealsByType, created),
        }));
      } catch (err) {
        console.error('Failed to add food entry', err);
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [dateKey, ensureDailyMeal, mealsState.mealsByType, userId]
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
        updateMealsState((prev) => ({
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
      updateMealsState((prev) => ({
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
        await setDailyMealEntriesDone(dailyMeal.id, completed);
        updateMealsState((prev) => ({
          dailyMeal: updated,
          mealsByType: updateEntriesCompletion(prev.mealsByType, completed),
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

  const toggleMealTypeCompleted = useCallback(
    async (mealType: string, completed: boolean) => {
      if (!userId || !dateKey) throw new Error('Missing user or date');
      setIsMutating(true);
      try {
        const dailyMeal = await ensureDailyMeal();
        await setMealTypeEntriesDone(dailyMeal.id, mealType, completed);
        updateMealsState((prev) => ({
          dailyMeal: prev.dailyMeal,
          mealsByType: updateEntriesCompletionForType(prev.mealsByType, mealType, completed),
        }));
      } catch (err) {
        console.error('Failed to toggle meal type completion', err);
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
    addEntryFromFood,
    editEntry,
    removeEntry,
    toggleDayCompleted,
    toggleMealTypeCompleted,
  };
};
