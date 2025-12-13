import { supabase } from '../lib/supabaseClient';

export type ExerciseDefaultRecord = {
  id: string;
  user_id: string;
  exercise_id: string | null;
  user_exercise_id: string | null;
  default_weight: number | null;
  default_reps: number | null;
  default_sets: number | null;
  default_rest_seconds: number | null;
  notes: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type ExerciseDefault = {
  id: string;
  exerciseId?: string | null;
  userExerciseId?: string | null;
  defaultWeight?: number | null;
  defaultReps?: number | null;
  defaultSets?: number | null;
  defaultRestSeconds?: number | null;
  notes?: string | null;
  updatedAt?: string;
};

const mapRecord = (record: ExerciseDefaultRecord): ExerciseDefault => ({
  id: record.id,
  exerciseId: record.exercise_id,
  userExerciseId: record.user_exercise_id,
  defaultWeight: record.default_weight,
  defaultReps: record.default_reps,
  defaultSets: record.default_sets,
  defaultRestSeconds: record.default_rest_seconds,
  notes: record.notes ?? undefined,
  updatedAt: record.updated_at,
});

export const fetchExerciseDefaults = async (userId: string): Promise<ExerciseDefault[]> => {
  const { data, error } = await supabase
    .from('fitarc_user_exercise_defaults')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRecord);
};

export type UpsertExerciseDefaultInput = {
  id?: string;
  userId: string;
  exerciseId?: string | null;
  userExerciseId?: string | null;
  defaultWeight?: number | null;
  defaultReps?: number | null;
  defaultSets?: number | null;
  defaultRestSeconds?: number | null;
  notes?: string | null;
};

export const upsertExerciseDefault = async (
  input: UpsertExerciseDefaultInput
): Promise<ExerciseDefault> => {
  const {
    id,
    userId,
    exerciseId = null,
    userExerciseId = null,
    defaultWeight = null,
    defaultReps = null,
    defaultSets = null,
    defaultRestSeconds = null,
    notes = null,
  } = input;

  if (!exerciseId && !userExerciseId) {
    throw new Error('exerciseId or userExerciseId must be provided');
  }

  const payload = {
    id,
    user_id: userId,
    exercise_id: exerciseId,
    user_exercise_id: userExerciseId,
    default_weight: defaultWeight,
    default_reps: defaultReps,
    default_sets: defaultSets,
    default_rest_seconds: defaultRestSeconds,
    notes,
  };

  const { data, error } = await supabase
    .from('fitarc_user_exercise_defaults')
    .upsert(payload, { onConflict: 'user_id,exercise_id,user_exercise_id' })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapRecord(data as ExerciseDefaultRecord);
};

export const deleteExerciseDefault = async (id: string) => {
  const { error } = await supabase.from('fitarc_user_exercise_defaults').delete().eq('id', id);
  if (error) {
    throw error;
  }
};
