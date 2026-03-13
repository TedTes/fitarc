import { supabase } from '../lib/supabaseClient';

export type ExerciseRow = {
  id: string;
  name: string;
  movement_pattern: string | null;
  equipment: string | null;
  description: string | null;
  exercise_muscle_groups?: {
    role: string | null;
    muscle_groups: {
      name: string | null;
    } | null;
  }[];
  body_parts?: string[] | null;
  muscle_groups?: string[] | null;
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

    const relationshipQuery = await supabase
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

    let rows: ExerciseRow[] = [];

    if (!relationshipQuery.error) {
      rows = (relationshipQuery.data as unknown as ExerciseRow[]) ?? [];
    } else {
      const relErrorCode = (relationshipQuery.error as { code?: string } | null)?.code;
      const canFallbackToFlatShape =
        relErrorCode === 'PGRST200' || relErrorCode === '42P01' || relErrorCode === '42703';

      if (!canFallbackToFlatShape) {
        throw relationshipQuery.error;
      }

      const flatQuery = await supabase
        .from('fitarc_exercises')
        .select(
          `
          id,
          name,
          movement_pattern,
          equipment,
          body_parts,
          muscle_groups
        `
        )
        .order('name', { ascending: true });

      if (!flatQuery.error) {
        rows = (flatQuery.data as unknown as ExerciseRow[]) ?? [];
      } else {
        const flatErrorCode = (flatQuery.error as { code?: string } | null)?.code;
        if (flatErrorCode !== '42703') {
          throw flatQuery.error;
        }

        const minimalQuery = await supabase
          .from('fitarc_exercises')
          .select('id, name, movement_pattern')
          .order('name', { ascending: true });

        if (minimalQuery.error) {
          throw minimalQuery.error;
        }

        rows = ((minimalQuery.data as unknown as ExerciseRow[]) ?? []).map((row) => ({
          ...row,
          equipment: null,
          description: null,
          body_parts: [],
          muscle_groups: [],
        }));
      }
    }

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

      if (primary.length === 0 && secondary.length === 0) {
        const flatMuscles = [
          ...(exercise.body_parts ?? []),
          ...(exercise.muscle_groups ?? []),
        ];
        primary.push(...flatMuscles.filter(Boolean));
      }

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
