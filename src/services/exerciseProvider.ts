import { supabase } from '../lib/supabaseClient';

export type ExerciseRow = {
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

export type ExerciseProvider = {
  fetchCatalog: () => Promise<ExerciseCatalogEntry[]>;
};

const supabaseExerciseProvider: ExerciseProvider = {
  fetchCatalog: async () => {
    const relation = `fitarc_exercise_muscle_groups(
      role,
      muscle_groups:fitarc_muscle_groups(name)
    )`;

    const { data, error } = await supabase
      .from('fitarc_exercises')
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

    const rows = (data as unknown as ExerciseRow[]) || [];

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
  },
};

let exerciseProvider: ExerciseProvider = supabaseExerciseProvider;

export const setExerciseProvider = (provider: ExerciseProvider) => {
  exerciseProvider = provider;
};

export const fetchExerciseCatalog = async (): Promise<ExerciseCatalogEntry[]> =>
  exerciseProvider.fetchCatalog();
