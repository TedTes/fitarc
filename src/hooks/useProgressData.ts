import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProgressData, ProgressData } from '../services/appDataService';

const cache = new Map<string, ProgressData>();

export const useProgressData = (
  userId?: string,
  planId?: string,
  windowDays?: number,
  version = 0
) => {
  const cacheKey =
    userId && planId ? `${userId}:${planId}:${windowDays ?? ''}:${version}` : undefined;
  const [data, setData] = useState<ProgressData | null>(
    cacheKey && cache.has(cacheKey) ? cache.get(cacheKey)! : null
  );
  const [isLoading, setIsLoading] = useState<boolean>(!!cacheKey && !cache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !planId) return;
    try {
      setIsLoading(true);
      setError(null);
      const result = await fetchProgressData(userId, planId, windowDays);
      const key = `${userId}:${planId}:${windowDays ?? ''}:${version}`;
      cache.set(key, result);
      setData(result);
    } catch (err: any) {
      setError(err?.message || 'Unable to load progress data');
    } finally {
      setIsLoading(false);
    }
  }, [userId, planId, windowDays, version]);

  useEffect(() => {
    if (!cacheKey) return;
    if (cache.has(cacheKey)) {
      setData(cache.get(cacheKey)!);
      setIsLoading(false);
      return;
    }
    load();
  }, [cacheKey, load]);

  return useMemo(
    () => ({ data, isLoading, error, refresh: load }),
    [data, isLoading, error, load]
  );
};
