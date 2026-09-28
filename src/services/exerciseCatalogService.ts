import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient';
import { RUNTIME_EXERCISES } from '../runtime/exerciseCatalog';
import { TRAINING_TABLES } from '../runtime/dataModel';
import { validateCatalog } from '../runtime/catalogValidation';
import type { ExerciseDefinition } from '../runtime/types';

const CACHE_KEY = 'fitarc:exercise-catalog:v2';
/** Fetch all approved exercises, including catalogs larger than PostgREST's default page limit. */
export async function loadExerciseCatalog(): Promise<ExerciseDefinition[]> {
  try {
    const definitions: unknown[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from(TRAINING_TABLES.exercises)
        .select('definition').eq('status', 'approved').order('id').range(offset, offset + 499);
      if (error) throw error;
      definitions.push(...(data ?? []).map((row) => row.definition));
      if (!data || data.length < 500) break;
    }
    const catalog = validateCatalog(definitions);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
    return catalog;
  } catch {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      try { return validateCatalog(JSON.parse(cached)); } catch { /* fall back to bundled seed */ }
    }
    return RUNTIME_EXERCISES;
  }
}
