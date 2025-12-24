import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMealPlansForRange } from '../services/mealService';
import {
  hasDailyMealsInRange,
  createMealPlanWithSeed,
} from '../services/mealService';
import { DailyMealPlan } from '../types/domain';

const cache = new Map<string, DailyMealPlan[]>();

const buildKey = (userId?: string, from?: string, to?: string, planId?: string | null) =>
  userId && from && to ? `${userId}:${from}:${to}:${planId ?? 'none'}` : undefined;

export const useMealPlans = (
  userId?: string,
  from?: string,
  to?: string,
  planId?: string | null
) => {
  const cacheKey = buildKey(userId, from, to, planId);
  const [plans, setPlans] = useState<DailyMealPlan[]>(
    cacheKey && cache.has(cacheKey) ? cache.get(cacheKey)! : []
  );
  const [isLoading, setIsLoading] = useState<boolean>(!!cacheKey && !cache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !from || !to || !planId) return;
    try {
      setIsLoading(true);
      setError(null);
      const hasMeals = await hasDailyMealsInRange(userId, from, to, planId ?? null);
      if (!hasMeals) {
        await createMealPlanWithSeed({
          userId,
          startDate: from,
          planId: planId ?? null,
        });
        const keyToInvalidate = buildKey(userId, from, to, planId);
        if (keyToInvalidate) {
          cache.delete(keyToInvalidate);
        }
      }
      const data = await fetchMealPlansForRange(userId, from, to, planId ?? undefined);
      const key = buildKey(userId, from, to, planId);
      cache.set(key, data);
      setPlans(data);
    } catch (err: any) {
      setError(err?.message || 'Unable to load meal plans');
    } finally {
      setIsLoading(false);
    }
  }, [from, planId, to, userId]);

  useEffect(() => {
    if (!cacheKey) return;
    if (cache.has(cacheKey)) {
      setPlans(cache.get(cacheKey)!);
      setIsLoading(false);
      return;
    }
    load();
  }, [cacheKey, load]);

  const mealPlansByDate = useMemo(() => {
    return plans.reduce<Record<string, DailyMealPlan>>((acc, plan) => {
      acc[plan.date] = plan;
      return acc;
    }, {});
  }, [plans]);

  const getPlanForDate = useCallback(
    (date: string) => mealPlansByDate[date] ?? null,
    [mealPlansByDate]
  );

  return {
    mealPlans: plans,
    mealPlansByDate,
    getPlanForDate,
    isLoading,
    error,
    refresh: load,
  };
};
