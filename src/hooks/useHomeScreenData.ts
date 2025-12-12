import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchHomeData, HomeScreenData } from '../services/appDataService';

const cache = new Map<string, HomeScreenData>();

export const useHomeScreenData = (userId?: string) => {
  const [data, setData] = useState<HomeScreenData | null>(userId ? cache.get(userId) ?? null : null);
  const [isLoading, setIsLoading] = useState<boolean>(!userId || !cache.has(userId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setIsLoading(true);
      setError(null);
      const result = await fetchHomeData(userId);
      cache.set(userId, result);
      setData(result);
    } catch (err: any) {
      setError(err?.message || 'Unable to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (cache.has(userId)) {
      setData(cache.get(userId)!);
      setIsLoading(false);
      return;
    }
    load();
  }, [userId, load]);

  return useMemo(
    () => ({
      data,
      isLoading,
      error,
      refresh: load,
    }),
    [data, isLoading, error, load]
  );
};
