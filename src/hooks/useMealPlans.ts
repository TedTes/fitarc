import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMealPlansForRange } from '../services/appDataService';
import { DailyMealPlan } from '../types/domain';

const cache = new Map<string, DailyMealPlan[]>();

const buildKey = (userId?: string, from?: string, to?: string) =>
  userId && from && to ? `${userId}:${from}:${to}` : undefined;

export const useMealPlans = (userId?: string, from?: string, to?: string) => {
  const cacheKey = buildKey(userId, from, to);
  const [plans, setPlans] = useState<DailyMealPlan[]>(
    cacheKey && cache.has(cacheKey) ? cache.get(cacheKey)! : []
  );
  const [isLoading, setIsLoading] = useState<boolean>(!!cacheKey && !cache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !from || !to) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchMealPlansForRange(userId, from, to);
      const key = `${userId}:${from}:${to}`;
      cache.set(key, data);
      setPlans(data);
    } catch (err: any) {
      setError(err?.message || 'Unable to load meal plans');
    } finally {
      setIsLoading(false);
    }
  }, [userId, from, to]);

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
