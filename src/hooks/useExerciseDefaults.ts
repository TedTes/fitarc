import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExerciseDefault,
  UpsertExerciseDefaultInput,
  deleteExerciseDefault,
  fetchExerciseDefaults,
  upsertExerciseDefault,
} from '../services/exerciseDefaultsService';

export type UseExerciseDefaultsResult = {
  defaults: ExerciseDefault[];
  isLoading: boolean;
  error: string | null;
  upsertDefault: (input: Omit<UpsertExerciseDefaultInput, 'userId'> & { userId: string }) => Promise<void>;
  removeDefault: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
};

export const useExerciseDefaults = (userId?: string | null): UseExerciseDefaultsResult => {
  const [defaults, setDefaults] = useState<ExerciseDefault[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDefaults = useCallback(async () => {
    if (!userId) {
      setDefaults([]);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const rows = await fetchExerciseDefaults(userId);
      setDefaults(rows);
    } catch (err: any) {
      console.error('Failed to load exercise defaults', err);
      setError(err?.message || 'Unable to load exercise defaults');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadDefaults();
  }, [loadDefaults]);

  const upsertDefault = useCallback(
    async (input: Omit<UpsertExerciseDefaultInput, 'userId'> & { userId: string }) => {
      try {
        const saved = await upsertExerciseDefault(input);
        setDefaults((prev) => {
          const existingIndex = prev.findIndex((item) => item.id === saved.id);
          if (existingIndex >= 0) {
            const next = [...prev];
            next[existingIndex] = saved;
            return next;
          }
          return [saved, ...prev];
        });
      } catch (err) {
        console.error('Failed to upsert exercise default', err);
        throw err;
      }
    },
    []
  );

  const removeDefault = useCallback(async (id: string) => {
    try {
      await deleteExerciseDefault(id);
      setDefaults((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('Failed to delete exercise default', err);
      throw err;
    }
  }, []);

  return useMemo(
    () => ({
      defaults,
      isLoading,
      error,
      upsertDefault,
      removeDefault,
      refetch: loadDefaults,
    }),
    [defaults, isLoading, error, upsertDefault, removeDefault, loadDefaults]
  );
};
