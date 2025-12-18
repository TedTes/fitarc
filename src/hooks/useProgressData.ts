import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProgressData, ProgressData } from '../services/appDataService';

export const useProgressData = (
  userId?: string,
  planId?: string,
  windowDays?: number,
  version = 0
) => {
  const [data, setData] = useState<ProgressData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(userId && planId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !planId) return;
    try {
      setIsLoading(true);
      setError(null);
      const result = await fetchProgressData(userId, planId, windowDays);
      setData(result);
    } catch (err: any) {
      setError(err?.message || 'Unable to load progress data');
    } finally {
      setIsLoading(false);
    }
  }, [userId, planId, windowDays, version]);

  useEffect(() => {
    if (!userId || !planId) {
      setData(null);
      setIsLoading(false);
      return;
    }
    load();
  }, [userId, planId, windowDays, version, load]);

  return useMemo(
    () => ({ data, isLoading, error, refresh: load }),
    [data, isLoading, error, load]
  );
};
