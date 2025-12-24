import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPhaseWorkoutSessions } from '../services/workoutService';
import { WorkoutSessionEntry } from '../types/domain';

const sessionCache = new Map<string, WorkoutSessionEntry[]>();

export const useWorkoutSessions = (userId?: string, planId?: string) => {
  const cacheKey = userId && planId ? `${userId}:${planId}` : undefined;
  const [sessions, setSessions] = useState<WorkoutSessionEntry[]>(
    cacheKey && sessionCache.has(cacheKey) ? sessionCache.get(cacheKey)! : []
  );
  const [isLoading, setIsLoading] = useState<boolean>(!!cacheKey && !sessionCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !planId) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchPhaseWorkoutSessions(userId, planId);

      const key = `${userId}:${planId}`;
      sessionCache.set(key, data);
      setSessions(data);
    } catch (err: any) {
      setError(err?.message || 'Unable to load sessions');
    } finally {
      setIsLoading(false);
    }
  }, [userId, planId]);

  useEffect(() => {
    if (!cacheKey) return;
    if (sessionCache.has(cacheKey)) {
      setSessions(sessionCache.get(cacheKey)!);
      setIsLoading(false);
      return;
    }
    load();
  }, [cacheKey, load]);

  const getSessionForDate = useCallback(
    (date: string) => sessions.find((session) => session.date === date) ?? null,
    [sessions]
  );

  return useMemo(
    () => ({
      sessions,
      isLoading,
      error,
      refresh: load,
      getSessionForDate,
    }),
    [sessions, isLoading, error, load, getSessionForDate]
  );
};
