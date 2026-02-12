import { useCallback, useEffect, useState } from 'react';
import { MuscleGroup } from '../types/domain';
import { fetchWorkoutTemplates } from '../services/workoutService';

export type WorkoutTemplateExercise = {
  id: string;
  exerciseId: string;
  name: string;
  movementPattern?: string | null;
  bodyParts: MuscleGroup[];
  sets?: number | null;
  reps?: string | null;
  displayOrder?: number | null;
  notes?: string | null;
};

export type WorkoutTemplate = {
  id: string;
  title: string;
  description?: string | null;
  difficulty?: string | null;
  estimatedTimeMinutes?: number | null;
  goalTags: string[];
  createdBy?: string | null;
  isPublic: boolean;
  isDeprecated: boolean;
  exercises: WorkoutTemplateExercise[];
};

export const useWorkoutTemplates = (userId?: string | null) => {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const rows = await fetchWorkoutTemplates(userId);
      const mapped: WorkoutTemplate[] = rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        difficulty: row.difficulty,
        estimatedTimeMinutes: row.estimated_time_minutes,
        goalTags: (row.goal_tags ?? []).map((tag) => tag.toLowerCase()),
        createdBy: row.created_by,
        isPublic: row.is_public,
        isDeprecated: row.is_deprecated,
        exercises: (row.exercises ?? [])
          .filter((exercise) => !!exercise.exercise_id)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
          .map((exercise) => ({
            id: exercise.id,
            exerciseId: exercise.exercise_id!,
            name: exercise.exercise_name,
            movementPattern: exercise.movement_pattern,
            bodyParts: (exercise.body_parts ?? []) as MuscleGroup[],
            sets: exercise.sets,
            reps: exercise.reps,
            displayOrder: exercise.display_order,
            notes: exercise.notes,
          })),
      }));
      setTemplates(mapped);
    } catch (err) {
      console.error('Failed to load workout templates:', err);
      setError('Failed to load templates');
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { templates, isLoading, error, reload: load };
};
