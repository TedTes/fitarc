import { supabase } from '../lib/supabaseClient';
import { MuscleGroup, WorkoutSessionEntry } from '../types/domain';

export type SupabaseWorkoutSession = {
  id: string;
  user_id: string;
  performed_at: string;
  mood: string | null;
  perceived_exertion: number | null;
  notes: string | null;
};

export type SupabaseWorkoutSessionExercise = {
  id: string;
  session_id: string;
  exercise_id: string | null;
  user_exercise_id: string | null;
  display_order: number;
  notes: string | null;
};

export type SupabaseWorkoutSet = {
  id: string;
  session_exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  rest_seconds: number | null;
};

/**
 * Basic insert helpers
 */

type CreateSessionInput = {
  userId: string;
  performedAt: string; // ISO string
  mood?: string;
  perceivedExertion?: number;
  notes?: string;
};

export const createWorkoutSession = async ({
  userId,
  performedAt,
  mood,
  perceivedExertion,
  notes,
}: CreateSessionInput): Promise<SupabaseWorkoutSession> => {
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .insert({
      user_id: userId,
      performed_at: performedAt,
      mood: mood ?? null,
      perceived_exertion: perceivedExertion ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as SupabaseWorkoutSession;
};

type LogWorkoutSetInput = {
  sessionExerciseId: string;
  setNumber: number;
  weight?: number;
  reps?: number;
  rpe?: number;
  restSeconds?: number;
};

export const logWorkoutSet = async ({
  sessionExerciseId,
  setNumber,
  weight,
  reps,
  rpe,
  restSeconds,
}: LogWorkoutSetInput): Promise<SupabaseWorkoutSet> => {
  const { data, error } = await supabase
    .from('fitarc_workout_sets')
    .insert({
      session_exercise_id: sessionExerciseId,
      set_number: setNumber,
      weight: weight ?? null,
      reps: reps ?? null,
      rpe: rpe ?? null,
      rest_seconds: restSeconds ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as SupabaseWorkoutSet;
};

/**
 * Shape of a row coming back from the nested select.
 */
type SupabaseSessionRow = SupabaseWorkoutSession & {
  session_exercises: {
    id: string;
    display_order: number | null;
    notes: string | null;
    exercise: {
      name: string | null;
      muscle_links: {
        role: string | null;
        muscle: { name: string | null } | null;
      }[];
    } | null;
    sets: {
      set_number: number | null;
      reps: number | null;
    }[];
  }[];
};

/**
 * Map raw muscle names to your compact MuscleGroup enum.
 */
const MUSCLE_REMAPPINGS: Record<string, MuscleGroup> = {
  chest: 'chest',
  back: 'back',
  legs: 'legs',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  shoulders: 'shoulders',
  'rear delts': 'shoulders',
  delts: 'shoulders',
  arms: 'arms',
  triceps: 'arms',
  biceps: 'arms',
  forearms: 'arms',
  core: 'core',
  abs: 'core',
  obliques: 'core',
  'hip flexors': 'core',
};

const mapMuscleGroup = (name?: string | null): MuscleGroup | null => {
  if (!name) return null;
  const key = name.toLowerCase();
  return MUSCLE_REMAPPINGS[key] || null;
};

/**
 * Main query: fetch sessions + nested exercises/sets from Supabase,
 * then map into WorkoutSessionEntry[] for DashboardScreen + PlansScreen.
 *
 * phasePlanId is purely a tag for the in-memory arc; the DB currently
 * doesn’t store phase_plan_id, so we just attach what caller passes.
 */
export const fetchWorkoutSessionEntries = async (
  userId: string,
  phasePlanId?: string
): Promise<WorkoutSessionEntry[]> => {
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .select(`
      id,
      user_id,
      performed_at,
      notes,
      session_exercises:fitarc_workout_session_exercises (
        id,
        display_order,
        notes,
        exercise:fitarc_exercises (
          name,
          muscle_links:fitarc_exercise_muscle_groups (
            role,
            muscle:fitarc_muscle_groups (
              name
            )
          )
        ),
        sets:fitarc_workout_sets (
          set_number,
          reps
        )
      )
    `)
    .eq('user_id', userId)
    .order('performed_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data as SupabaseSessionRow[]) || [];

  return rows.map((session) => {
    const exercises = (session.session_exercises || [])
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
      .map((exerciseRow) => {
        // Unique muscle groups for this exercise
        const uniqueMuscles = Array.from(
          new Set(
            (exerciseRow.exercise?.muscle_links || [])
              .map((link) => mapMuscleGroup(link.muscle?.name))
              .filter((value): value is MuscleGroup => !!value)
          )
        );

        // Sort sets by set_number so reps are in order
        const sortedSets = [...(exerciseRow.sets || [])].sort(
          (a, b) => (a.set_number || 0) - (b.set_number || 0)
        );

        const firstReps = sortedSets[0]?.reps;

        return {
          name: exerciseRow.exercise?.name || 'Exercise',
          bodyParts: uniqueMuscles,
          completed: false, // toggled in UI layer, not persisted yet
          sets: sortedSets.length || 3,
          reps: firstReps ? `${firstReps}` : '8-12',
        };
      });

    return {
      id: session.id,
      // UI expects YYYY-MM-DD
      date: session.performed_at?.split('T')[0] || session.performed_at,
      phasePlanId: phasePlanId || 'supabase-phase', // tag so PlansScreen can filter by current arc
      exercises,
    };
  });
};
