import { supabase } from '../lib/supabaseClient';

const {
  EXPO_PUBLIC_SUPABASE_EXERCISES_TABLE,
  EXPO_PUBLIC_SUPABASE_EXERCISE_MUSCLES_TABLE,
  EXPO_PUBLIC_SUPABASE_MUSCLE_GROUPS_TABLE,
} = process.env;

const EXERCISES_TABLE =
  EXPO_PUBLIC_SUPABASE_EXERCISES_TABLE || 'fitarc_exercises';
const EXERCISE_MUSCLES_TABLE =
  EXPO_PUBLIC_SUPABASE_EXERCISE_MUSCLES_TABLE || 'fitarc_exercise_muscle_groups';
const MUSCLE_GROUPS_TABLE =
  EXPO_PUBLIC_SUPABASE_MUSCLE_GROUPS_TABLE || 'fitarc_muscle_groups';

export type SupabaseExercise = {
  id: string;
  name: string;
  movement_pattern: string | null;
  equipment: string | null;
  description: string | null;
  exercise_muscle_groups: {
    role: string | null;
    muscle_groups: {
      name: string | null;
    } | null;
  }[];
};

export type ExerciseCatalogEntry = {
  id: string;
  name: string;
  movementPattern?: string | null;
  equipment?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
};

export const fetchExerciseCatalog = async (): Promise<ExerciseCatalogEntry[]> => {
  const relation = `${EXERCISE_MUSCLES_TABLE}(
    role,
    muscle_groups:${MUSCLE_GROUPS_TABLE}(name)
  )`;

  const { data, error } = await supabase
    .from(EXERCISES_TABLE)
    .select(
      `
      id,
      name,
      movement_pattern,
      equipment,
      description,
      exercise_muscle_groups:${relation}
    `
    )
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data as SupabaseExercise[]) || [];

  return rows.map((exercise) => {
    const primary: string[] = [];
    const secondary: string[] = [];

    exercise.exercise_muscle_groups?.forEach((entry) => {
      const muscleName = entry.muscle_groups?.name;
      if (!muscleName) return;

      if ((entry.role || '').toLowerCase() === 'secondary') {
        secondary.push(muscleName);
      } else {
        primary.push(muscleName);
      }
    });

    return {
      id: exercise.id,
      name: exercise.name,
      movementPattern: exercise.movement_pattern,
      equipment: exercise.equipment,
      primaryMuscles: Array.from(new Set(primary)),
      secondaryMuscles: Array.from(new Set(secondary)),
    };
  });
};
