import { useEffect, useState, useCallback } from 'react';
import {
  ExerciseCatalogEntry,
  fetchExerciseCatalog,
} from '../services/exerciseCatalogService';

type UseSupabaseExercisesResult = {
  exercises: ExerciseCatalogEntry[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export const useSupabaseExercises = (): UseSupabaseExercisesResult => {
  const [exercises, setExercises] = useState<ExerciseCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadExercises = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const catalog = await fetchExerciseCatalog();
      setExercises(catalog);
    } catch (err: any) {
      console.error('Failed to load exercises from Supabase', err);
      setError(err?.message || 'Unable to load exercises');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  return {
    exercises,
    isLoading,
    error,
    refetch: loadExercises,
  };
};
