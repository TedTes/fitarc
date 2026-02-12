import { supabase } from '../lib/supabaseClient';
import { MuscleGroup, PlanDay, PlanWorkout, PlanWorkoutExercise } from '../types/domain';
import { formatLocalDateYMD } from '../utils/date';

type PlanDayRow = {
  id: string;
  plan_id: string;
  user_id: string;
  day_date: string;
  workout?:
    | {
    id: string;
    title: string | null;
    source_template_id: string | null;
    source_type: string | null;
    exercises?: Array<{
      id: string;
      exercise_id: string | null;
      exercise_name: string;
      movement_pattern: string | null;
      body_parts: string[] | null;
      sets: number | null;
      reps: string | null;
      display_order: number | null;
      notes: string | null;
    }>;
  }
    | {
    id: string;
    title: string | null;
    source_template_id: string | null;
    source_type: string | null;
    exercises?: Array<{
      id: string;
      exercise_id: string | null;
      exercise_name: string;
      movement_pattern: string | null;
      body_parts: string[] | null;
      sets: number | null;
      reps: string | null;
      display_order: number | null;
      notes: string | null;
    }>;
  }[]
    | null;
};

type PlanWorkoutRow = {
  id: string;
  title: string | null;
  source_template_id: string | null;
  source_type: string | null;
  exercises?: PlanWorkoutExerciseRow[];
};

type PlanWorkoutExerciseRow = {
  id: string;
  exercise_id: string | null;
  exercise_name: string;
  movement_pattern: string | null;
  body_parts: string[] | null;
  sets: number | null;
  reps: string | null;
  display_order: number | null;
  notes: string | null;
};

export type PlanExerciseInput = {
  exerciseId: string;
  name: string;
  bodyParts?: MuscleGroup[];
  movementPattern?: string | null;
  sets?: number | null;
  reps?: string | null;
  displayOrder?: number | null;
  notes?: string | null;
  sourceTemplateExerciseId?: string | null;
};

const mapPlanExerciseRow = (
  row: PlanWorkoutExerciseRow,
  planWorkoutId: string
): PlanWorkoutExercise => ({
  id: row.id,
  planWorkoutId,
  exerciseId: row.exercise_id!,
  name: row.exercise_name,
  bodyParts: (row.body_parts ?? []) as MuscleGroup[],
  movementPattern: row.movement_pattern ?? undefined,
  sets: row.sets ?? undefined,
  reps: row.reps ?? undefined,
  displayOrder: row.display_order ?? undefined,
  notes: row.notes ?? undefined,
});

const mapPlanDayRow = (row: PlanDayRow): PlanDay => {
  const rawWorkout = (Array.isArray(row.workout) ? row.workout[0] ?? null : row.workout) as PlanWorkoutRow | null;
  const workout = rawWorkout
    ? (() => {
        const exercises = (rawWorkout.exercises ?? []).filter((exercise) => {
          if (exercise.exercise_id) return true;
          console.warn(
            '[planSnapshotService] Dropping plan exercise without exercise_id:',
            exercise.id
          );
          return false;
        });

        return {
          id: rawWorkout.id,
          planDayId: row.id,
          title: rawWorkout.title,
          sourceTemplateId: rawWorkout.source_template_id,
          sourceType: rawWorkout.source_type,
          exercises: exercises.map((exercise) => mapPlanExerciseRow(exercise, rawWorkout.id)),
        };
      })()
    : null;

  return {
    id: row.id,
    planId: row.plan_id,
    userId: row.user_id,
    date: row.day_date,
    workout,
  };
};

export const fetchPlanWorkoutsForRange = async (
  userId: string,
  planId: string,
  startDate: string,
  endDate: string
): Promise<PlanDay[]> => {
  const { data, error } = await supabase
    .from('fitarc_plan_days')
    .select(
      `
      id,
      plan_id,
      user_id,
      day_date,
      workout:fitarc_plan_workouts (
        id,
        title,
        source_template_id,
        source_type,
        exercises:fitarc_plan_exercises (
          id,
          exercise_id,
          exercise_name,
          movement_pattern,
          body_parts,
          sets,
          reps,
          display_order,
          notes
        )
      )
    `
    )
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .gte('day_date', startDate)
    .lte('day_date', endDate)
    .order('day_date', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: any) => mapPlanDayRow(row as PlanDayRow));
};

export const fetchPlanWorkoutForDate = async (
  userId: string,
  planId: string,
  date: string
): Promise<PlanDay | null> => {
  const { data, error } = await supabase
    .from('fitarc_plan_days')
    .select(
      `
      id,
      plan_id,
      user_id,
      day_date,
      workout:fitarc_plan_workouts (
        id,
        title,
        source_template_id,
        source_type,
        exercises:fitarc_plan_exercises (
          id,
          exercise_id,
          exercise_name,
          movement_pattern,
          body_parts,
          sets,
          reps,
          display_order,
          notes
        )
      )
    `
    )
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('day_date', date)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPlanDayRow(data as unknown as PlanDayRow) : null;
};

const ensurePlanWorkout = async (
  userId: string,
  planId: string,
  date: string
): Promise<PlanWorkout> => {
  const { data: existingDay, error: existingDayError } = await supabase
    .from('fitarc_plan_days')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('day_date', date)
    .maybeSingle();
  if (existingDayError) throw existingDayError;

  let dayId = existingDay?.id ?? null;
  if (!dayId) {
    const { data: dayRow, error: dayError } = await supabase
      .from('fitarc_plan_days')
      .insert({
        user_id: userId,
        plan_id: planId,
        day_date: date,
        source_type: 'generated',
      })
      .select('id')
      .single();
    if (dayError) throw dayError;
    dayId = dayRow?.id ?? null;
  }
  if (!dayId) {
    throw new Error('plan_day_insert_failed');
  }

  const { data: existingWorkout, error: existingWorkoutError } = await supabase
    .from('fitarc_plan_workouts')
    .select('id, title, source_template_id, source_type')
    .eq('plan_day_id', dayId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingWorkoutError) throw existingWorkoutError;

  let workoutRow = existingWorkout ?? null;
  if (!workoutRow?.id) {
    const { data: newWorkout, error: workoutError } = await supabase
      .from('fitarc_plan_workouts')
      .insert({
        plan_day_id: dayId,
        title: 'Workout',
        source_type: 'generated',
      })
      .select('id, title, source_template_id, source_type')
      .single();
    if (workoutError) throw workoutError;
    workoutRow = newWorkout ?? null;
  }
  if (!workoutRow?.id) {
    throw new Error('plan_workout_insert_failed');
  }

  return {
    id: workoutRow.id,
    planDayId: dayId,
    title: workoutRow.title,
    sourceTemplateId: workoutRow.source_template_id,
    sourceType: workoutRow.source_type,
    exercises: [],
  };
};

const insertPlanExercises = async (
  planWorkoutId: string,
  exercises: PlanExerciseInput[],
  startOrder = 1
) => {
  const missing = exercises.filter((exercise) => !exercise.exerciseId);
  if (missing.length) {
    throw new Error('plan_exercise_missing_exercise_id');
  }

  const payload = exercises.map((exercise, index) => ({
    plan_workout_id: planWorkoutId,
    exercise_id: exercise.exerciseId,
    exercise_name: exercise.name,
    movement_pattern: exercise.movementPattern ?? null,
    body_parts: exercise.bodyParts ?? [],
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    display_order: exercise.displayOrder ?? startOrder + index,
    notes: exercise.notes ?? null,
  }));
  if (!payload.length) return;

  const { error } = await supabase.from('fitarc_plan_exercises').insert(payload);
  if (error) throw error;
};

export const replacePlanExercisesForDate = async (
  userId: string,
  planId: string,
  date: string,
  exercises: PlanExerciseInput[],
  sourceTemplateId?: string | null,
  title?: string | null
) => {
  const workout = await ensurePlanWorkout(userId, planId, date);
  let planWorkoutId: string | null = workout.id;
  if (!planWorkoutId) {
    const fallback = await fetchPlanWorkoutForDate(userId, planId, date);
    planWorkoutId = fallback?.workout?.id ?? null;
  }
  if (!planWorkoutId) {
    throw new Error('plan_workout_id_missing');
  }

  await supabase
    .from('fitarc_plan_exercises')
    .delete()
    .eq('plan_workout_id', planWorkoutId);

  await insertPlanExercises(planWorkoutId, exercises, 1);

  await supabase
    .from('fitarc_plan_workouts')
    .update({
      source_template_id: sourceTemplateId ?? null,
      source_type: sourceTemplateId ? 'template' : 'manual',
      title: title ?? workout.title ?? 'Workout',
    })
    .eq('id', planWorkoutId);
};

export const appendPlanExercisesForDate = async (
  userId: string,
  planId: string,
  date: string,
  exercises: PlanExerciseInput[],
  sourceTemplateId?: string | null,
  title?: string | null
) => {
  const workout = await ensurePlanWorkout(userId, planId, date);
  let planWorkoutId: string | null = workout.id;
  if (!planWorkoutId) {
    const fallback = await fetchPlanWorkoutForDate(userId, planId, date);
    planWorkoutId = fallback?.workout?.id ?? null;
  }
  if (!planWorkoutId) {
    throw new Error('plan_workout_id_missing');
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('fitarc_plan_exercises')
    .select('display_order')
    .eq('plan_workout_id', planWorkoutId)
    .order('display_order', { ascending: false })
    .limit(1);
  if (existingError) throw existingError;

  const startOrder = (existingRows?.[0]?.display_order ?? 0) + 1;
  await insertPlanExercises(planWorkoutId, exercises, startOrder);

  if (sourceTemplateId) {
    await supabase
      .from('fitarc_plan_workouts')
      .update({
        source_template_id: sourceTemplateId,
        source_type: 'template',
        title: title ?? workout.title ?? 'Workout',
      })
      .eq('id', planWorkoutId);
  }
};

export const deletePlanExercise = async (planExerciseId: string) => {
  const { error } = await supabase
    .from('fitarc_plan_exercises')
    .delete()
    .eq('id', planExerciseId);
  if (error) throw error;
};

export const ensurePlanWorkoutForToday = async (
  userId: string,
  planId: string
): Promise<PlanWorkout> => {
  const today = formatLocalDateYMD(new Date());
  return ensurePlanWorkout(userId, planId, today);
};

export const ensurePlanWorkoutForDate = async (
  userId: string,
  planId: string,
  date: string
): Promise<PlanWorkout> => ensurePlanWorkout(userId, planId, date);
