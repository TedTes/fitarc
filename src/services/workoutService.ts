import { supabase } from '../lib/supabaseClient';
import { WorkoutSessionEntry, WorkoutSessionExercise, WorkoutSetEntry } from '../types/domain';
import { mapSessionRow } from '../utils/workoutSessionMapper';
import { getAppTimeZone } from '../utils/time';
import { formatLocalDateYMD } from '../utils/date';
export { fetchExerciseCatalog, type ExerciseCatalogEntry } from './exerciseProvider';

const SESSION_BASE_SELECT =
  'id, user_id, plan_id, performed_at, notes, mood, perceived_exertion, complete';
const SESSION_CREATE_SELECT = 'id, user_id, plan_id, performed_at, notes, complete';
const SESSION_EXERCISE_RICH_SELECT =
  'id, session_id, exercise_id, exercise_name, movement_pattern, body_parts, display_order, notes, complete';
const SESSION_EXERCISE_LEAN_SELECT =
  'id, session_id, exercise_id, display_order, notes, complete';
const WORKOUT_SET_SELECT =
  'session_exercise_id, set_number, reps, weight, rpe, rest_seconds';
const SESSION_WITH_EXERCISES_SELECT = `
      id,
      user_id,
      plan_id,
      performed_at,
      notes,
      complete,
      session_exercises:fitarc_workout_session_exercises (
        id,
        exercise_id,
        display_order,
        complete,
        sets:fitarc_workout_sets (
          set_number,
          reps,
          weight,
          rpe,
          rest_seconds
        )
      )
    `;

// ── Templates ────────────────────────────────────────────────────────────────

type WorkoutTemplateExerciseRow = {
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

type WorkoutTemplateRow = {
  id: string;
  title: string;
  description: string | null;
  difficulty: string | null;
  equipment_level: string | null;
  estimated_time_minutes: number | null;
  goal_tags: string[] | null;
  created_by: string | null;
  is_public: boolean;
  is_deprecated: boolean;
  exercises: WorkoutTemplateExerciseRow[];
};

export const fetchWorkoutTemplates = async (
  userId: string
): Promise<WorkoutTemplateRow[]> => {
  const { data, error } = await supabase
    .from('fitarc_workout_templates')
    .select(
      `
      id,
      title,
      description,
      difficulty,
      equipment_level,
      estimated_time_minutes,
      goal_tags,
      created_by,
      is_public,
      is_deprecated,
      exercises:fitarc_workout_template_exercises (
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
    `
    )
    .eq('is_deprecated', false)
    .or(`is_public.eq.true,created_by.eq.${userId}`);

  if (error) throw error;
  return (data ?? []) as WorkoutTemplateRow[];
};

type ExerciseDefaultRecord = {
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

// ── Defaults ─────────────────────────────────────────────────────────────────

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

const mapExerciseDefaultRecord = (record: ExerciseDefaultRecord): ExerciseDefault => ({
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

const isMissingExerciseDefaultsTableError = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return code === '42P01' || (typeof message === 'string' && message.includes('fitarc_user_exercise_defaults'));
};

export const fetchExerciseDefaults = async (userId: string): Promise<ExerciseDefault[]> => {
  const { data, error } = await supabase
    .from('fitarc_user_exercise_defaults')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    if (isMissingExerciseDefaultsTableError(error)) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map((record) => mapExerciseDefaultRecord(record as ExerciseDefaultRecord));
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
    user_id: userId,
    exercise_id: exerciseId,
    user_exercise_id: userExerciseId,
    default_weight: defaultWeight,
    default_reps: defaultReps,
    default_sets: defaultSets,
    default_rest_seconds: defaultRestSeconds,
    notes,
  };

  const query = supabase.from('fitarc_user_exercise_defaults');
  const { data, error } = id
    ? await query.update(payload).eq('id', id).select().single()
    : await query
        .upsert(payload, { onConflict: 'user_id,exercise_id,user_exercise_id' })
        .select()
        .single();

  if (error) {
    if (isMissingExerciseDefaultsTableError(error)) {
      throw new Error('Exercise defaults table is not available in this environment.');
    }
    throw error;
  }

  return mapExerciseDefaultRecord(data as ExerciseDefaultRecord);
};

export const deleteExerciseDefault = async (id: string) => {
  const { error } = await supabase.from('fitarc_user_exercise_defaults').delete().eq('id', id);
  if (error) {
    if (isMissingExerciseDefaultsTableError(error)) {
      return;
    }
    throw error;
  }
};

// ── Sessions ─────────────────────────────────────────────────────────────────

type CreateWorkoutSessionInput = {
  userId: string;
  planId: string;
  date: string;
  splitDayId?: string | null;
};

export const createWorkoutSession = async ({
  userId,
  planId,
  date,
  splitDayId = null,
}: CreateWorkoutSessionInput): Promise<WorkoutSessionEntry> => {
  const data = await createSessionRow(
    buildSessionMutationPayload(userId, planId, date, splitDayId)
  );

  return mapSessionRow(
    {
      ...data,
      session_exercises: [],
    },
    planId,
    getAppTimeZone()
  );
};

type CreateSessionFromPlanInput = {
  userId: string;
  planId: string;
  date: string;
  exercises: WorkoutSessionExercise[];
  splitDayId?: string | null;
};

type SessionMutationPayload = {
  user_id: string;
  plan_id: string;
  performed_at: string;
  planned_date: string;
  split_day_id?: string | null;
};

export const createSessionFromPlanWorkout = async ({
  userId,
  planId,
  date,
  exercises,
  splitDayId = null,
}: CreateSessionFromPlanInput): Promise<string> => {
  const existingSession = await findExistingSessionForDate(userId, planId, date);
  const existingRes = existingSession?.id
    ? await supabase
        .from('fitarc_workout_sessions')
        .select('id, session_exercises:fitarc_workout_session_exercises(id)')
        .eq('id', existingSession.id)
        .maybeSingle()
    : { data: null, error: null };
  if (existingRes.error) throw existingRes.error;
  if (existingRes.data?.id) {
    const sessionId = existingRes.data.id;
    const existingExercises = (existingRes.data as any).session_exercises ?? [];
    // Session exists but has no exercises — populate them now
    if (existingExercises.length === 0 && exercises.length > 0) {
      await addExercisesToSession(sessionId, exercises);
    }
    return sessionId;
  }

  const data = await createSessionRow(
    buildSessionMutationPayload(userId, planId, date, splitDayId)
  );

  await addExercisesToSession(data.id, exercises);

  return data.id;
};

const normalizeDate = (date: string) => {
  if (date.includes('T')) return date.split('T')[0];
  return date;
};

const buildSessionMutationPayload = (
  userId: string,
  planId: string,
  date: string,
  splitDayId?: string | null
): SessionMutationPayload => {
  const normalizedDate = normalizeDate(date);
  return {
    user_id: userId,
    plan_id: planId,
    performed_at: normalizedDate,
    planned_date: normalizedDate,
    split_day_id: splitDayId ?? null,
  };
};

const createSessionRow = async (
  payload: SessionMutationPayload
) => {
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .insert(payload)
    .select(SESSION_CREATE_SELECT)
    .single();

  if (error) throw error;
  return data;
};

const updateSessionRowDates = async (sessionId: string, date: string) => {
  const normalizedDate = normalizeDate(date);
  const { error } = await supabase
    .from('fitarc_workout_sessions')
    .update({
      performed_at: normalizedDate,
      planned_date: normalizedDate,
    })
    .eq('id', sessionId);

  if (error && !isMissingColumnError(error)) throw error;
};

const findExistingSessionForDate = async (
  userId: string,
  planId: string,
  date: string
): Promise<{ id: string } | null> => {
  const normalizedDate = normalizeDate(date);

  const plannedDateRes = await supabase
    .from('fitarc_workout_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('planned_date', normalizedDate)
    .maybeSingle();

  if (plannedDateRes.error && !isMissingColumnError(plannedDateRes.error)) {
    throw plannedDateRes.error;
  }

  if (plannedDateRes.data?.id) {
    return { id: plannedDateRes.data.id };
  }

  const performedAtRes = await supabase
    .from('fitarc_workout_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('performed_at', normalizedDate)
    .maybeSingle();

  if (performedAtRes.error) {
    throw performedAtRes.error;
  }

  return performedAtRes.data?.id ? { id: performedAtRes.data.id } : null;
};

const hydrateSessionsWithExercises = async (
  sessionRows: any[],
  phasePlanId: string | undefined,
  timeZone: string
): Promise<WorkoutSessionEntry[]> => {
  if (!sessionRows.length) {
    return [];
  }

  const sessionIds = sessionRows.map((row) => row.id).filter(Boolean);
  let exerciseRes: { data: any[] | null; error: any } = await supabase
    .from('fitarc_workout_session_exercises')
    .select(SESSION_EXERCISE_RICH_SELECT)
    .in('session_id', sessionIds)
    .order('display_order', { ascending: true });

  if (exerciseRes.error && isMissingColumnError(exerciseRes.error)) {
    exerciseRes = await supabase
      .from('fitarc_workout_session_exercises')
      .select(SESSION_EXERCISE_LEAN_SELECT)
      .in('session_id', sessionIds)
      .order('display_order', { ascending: true });
  }

  const { data: exerciseRows, error: exerciseError } = exerciseRes;

  if (exerciseError) throw exerciseError;

  const sessionExerciseIds = ((exerciseRows as any[]) || []).map((row) => row.id).filter(Boolean);
  const setsByExerciseId = new Map<string, any[]>();

  if (sessionExerciseIds.length) {
    const { data: setRows, error: setError } = await supabase
      .from('fitarc_workout_sets')
      .select(WORKOUT_SET_SELECT)
      .in('session_exercise_id', sessionExerciseIds)
      .order('set_number', { ascending: true });

    if (setError) throw setError;

    ((setRows as any[]) || []).forEach((setRow) => {
      const current = setsByExerciseId.get(setRow.session_exercise_id) ?? [];
      current.push(setRow);
      setsByExerciseId.set(setRow.session_exercise_id, current);
    });
  }

  const exercisesBySessionId = new Map<string, any[]>();
  ((exerciseRows as any[]) || []).forEach((exerciseRow) => {
    const current = exercisesBySessionId.get(exerciseRow.session_id) ?? [];
    current.push({
      ...exerciseRow,
      sets: setsByExerciseId.get(exerciseRow.id) ?? [],
    });
    exercisesBySessionId.set(exerciseRow.session_id, current);
  });

  return sessionRows.map((sessionRow) =>
    mapSessionRow(
      {
        ...sessionRow,
        session_exercises: exercisesBySessionId.get(sessionRow.id) ?? [],
      },
      phasePlanId,
      timeZone
    )
  );
};

const parseRepsValue = (value: string): number | null => {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
};

const isMissingColumnError = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('Could not find') ||
    message.includes('does not exist')
  );
};

const insertSessionExerciseRich = async (
  sessionId: string,
  exercise: WorkoutSessionExercise,
  displayOrder: number
) =>
  supabase
    .from('fitarc_workout_session_exercises')
    .insert({
      session_id: sessionId,
      exercise_id: exercise.exerciseId ?? null,
      exercise_name: exercise.name ?? null,
      movement_pattern: exercise.movementPattern ?? null,
      body_parts: exercise.bodyParts?.length ? exercise.bodyParts : null,
      user_exercise_id: null,
      display_order: displayOrder,
      notes: exercise.reps ?? null,
    })
    .select('id')
    .single();

const insertSessionExerciseLean = async (
  sessionId: string,
  exercise: WorkoutSessionExercise,
  displayOrder: number,
  withUserExerciseId: boolean
) =>
  supabase
    .from('fitarc_workout_session_exercises')
    .insert({
      session_id: sessionId,
      exercise_id: exercise.exerciseId ?? null,
      ...(withUserExerciseId ? { user_exercise_id: null } : {}),
      display_order: displayOrder,
      notes: exercise.reps ?? null,
    })
    .select('id')
    .single();

const insertSessionExerciseRow = async (
  sessionId: string,
  exercise: WorkoutSessionExercise,
  displayOrder: number
): Promise<string> => {
  let insertRes = await insertSessionExerciseRich(sessionId, exercise, displayOrder);

  if (insertRes.error && isMissingColumnError(insertRes.error)) {
    insertRes = await insertSessionExerciseLean(sessionId, exercise, displayOrder, true);
  }

  if (insertRes.error && isMissingColumnError(insertRes.error)) {
    insertRes = await insertSessionExerciseLean(sessionId, exercise, displayOrder, false);
  }

  if (insertRes.error) throw insertRes.error;
  return insertRes.data.id;
};

const parseYMDToDate = (value: string): Date => {
  const [year, month, day] = value.split('-').map((part) => parseInt(part, 10) || 0);
  return new Date(year, Math.max(0, month - 1), day || 1);
};

const buildSetPayloads = (exercise: WorkoutSessionExercise): WorkoutSetEntry[] => {
  if (!exercise.setDetails || !exercise.setDetails.length) {
    return [];
  }
  return exercise.setDetails.map((set, index) => ({
    setNumber: set?.setNumber ?? index + 1,
    weight: set?.weight,
    reps: set?.reps,
    rpe: set?.rpe,
    restSeconds: set?.restSeconds,
  }));
};

const buildDefaultSetPayloads = (
  exercise: WorkoutSessionExercise
): WorkoutSetInsert[] => {
  const setCount = Math.max(1, exercise.sets ?? 3);
  const repsValue = parseRepsValue(exercise.reps ?? '');

  return Array.from({ length: setCount }).map((_, idx) => ({
    session_exercise_id: exercise.id as string,
    set_number: idx + 1,
    weight: null,
    reps: repsValue,
    rpe: null,
    rest_seconds: null,
  }));
};

type WorkoutSetInsert = {
  session_exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  rest_seconds: number | null;
};

const buildDateRange = (start: string, end: string): string[] => {
  const results: string[] = [];
  const startDate = parseYMDToDate(start);
  const endDate = parseYMDToDate(end);
  const cursor = new Date(startDate);
  while (cursor.getTime() <= endDate.getTime()) {
    results.push(formatLocalDateYMD(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
};

const addExercisesToSession = async (
  sessionId: string,
  exercises: WorkoutSessionExercise[]
): Promise<void> => {
  for (let index = 0; index < exercises.length; index += 1) {
    const exercise = exercises[index];
    try {
      await addExerciseToSession({
        sessionId,
        exercise,
        displayOrder: exercise.displayOrder ?? index + 1,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'duplicate_exercise') {
        continue;
      }
      console.error('Failed to add exercise to session', {
        sessionId,
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.name,
        displayOrder: exercise.displayOrder ?? index + 1,
        error: err,
      });
      throw err;
    }
  }
};

const insertWorkoutSets = async (payload: WorkoutSetInsert[]): Promise<void> => {
  if (!payload.length) return;
  const { error } = await supabase.from('fitarc_workout_sets').insert(payload);
  if (error) throw error;
};

const fetchSessionById = async (
  sessionId: string,
  planId: string
): Promise<WorkoutSessionEntry> => {
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .select(SESSION_WITH_EXERCISES_SELECT)
    .eq('id', sessionId)
    .single();

  if (error) throw error;
  return mapSessionRow(data, planId, getAppTimeZone());
};

export const ensureSetsForExercises = async (
  exercises: WorkoutSessionExercise[]
): Promise<void> => {
  if (!exercises.length) return;

  const payload: WorkoutSetInsert[] = [];

  exercises.forEach((exercise) => {
    if (!exercise?.id) return;
    const existingCount = exercise.setDetails?.length ?? 0;
    if (existingCount > 0) return;
    payload.push(...buildDefaultSetPayloads(exercise));
  });

  if (!payload.length) return;

  await insertWorkoutSets(payload);
};

export const fetchWorkoutSessionEntries = async (
  userId: string,
  phasePlanId?: string,
  timeZone: string = getAppTimeZone()
): Promise<WorkoutSessionEntry[]> => {
  let query = supabase
    .from('fitarc_workout_sessions')
    .select(SESSION_BASE_SELECT)
    .eq('user_id', userId);

  if (phasePlanId) {
    query = query.eq('plan_id', phasePlanId);
  }

  const { data, error } = await query.order('performed_at', { ascending: false });

  if (error) {
    throw error;
  }

  const sessionRows = (data as any[]) || [];
  return hydrateSessionsWithExercises(sessionRows, phasePlanId, timeZone);
};

type UpsertWorkoutSessionInput = {
  userId: string;
  planId: string;
  date: string;
  exercises: WorkoutSessionExercise[];
};

const deleteExercisesForSession = async (sessionId: string) => {
  const existingExercisesRes = await supabase
    .from('fitarc_workout_session_exercises')
    .select('id')
    .eq('session_id', sessionId);
  if (existingExercisesRes.error) throw existingExercisesRes.error;
  const sessionExerciseIds = existingExercisesRes.data?.map((row) => row.id) ?? [];
  if (sessionExerciseIds.length) {
    const deleteSetsRes = await supabase
      .from('fitarc_workout_sets')
      .delete()
      .in('session_exercise_id', sessionExerciseIds);
    if (deleteSetsRes.error) throw deleteSetsRes.error;
  }
  const deleteExercisesRes = await supabase
    .from('fitarc_workout_session_exercises')
    .delete()
    .eq('session_id', sessionId);
  if (deleteExercisesRes.error) throw deleteExercisesRes.error;
};

export const upsertWorkoutSessionWithExercises = async ({
  userId,
  planId,
  date,
  exercises,
}: UpsertWorkoutSessionInput): Promise<WorkoutSessionEntry> => {
  const performedAt = normalizeDate(date);

  let sessionId: string;
  const existingSession = await findExistingSessionForDate(userId, planId, performedAt);

  if (existingSession?.id) {
    sessionId = existingSession.id;
    await deleteExercisesForSession(sessionId);
    await updateSessionRowDates(sessionId, performedAt);
  } else {
    const createRes = await createSessionRow(
      buildSessionMutationPayload(userId, planId, performedAt)
    );
    sessionId = createRes.id;
  }

  for (let index = 0; index < exercises.length; index += 1) {
    const exercise = exercises[index];
    const sessionExerciseId = await insertSessionExerciseRow(sessionId, exercise, index + 1);
    const setRows = buildSetPayloads(exercise);
    if (setRows.length) {
      const payload = setRows.map((set, setIdx) => ({
        session_exercise_id: sessionExerciseId,
        set_number: set.setNumber ?? setIdx + 1,
        weight: set.weight ?? null,
        reps: set.reps ?? null,
        rpe: set.rpe ?? null,
        rest_seconds: set.restSeconds ?? null,
      }));
      await insertWorkoutSets(payload);
    }
  }

  return fetchSessionById(sessionId, planId);
};

type AddExerciseToSessionInput = {
  sessionId: string;
  exercise: WorkoutSessionExercise;
  displayOrder: number;
};

export const addExerciseToSession = async ({
  sessionId,
  exercise,
  displayOrder,
}: AddExerciseToSessionInput): Promise<string> => {
  if (exercise.exerciseId) {
    const existingRes = await supabase
      .from('fitarc_workout_session_exercises')
      .select('id')
      .eq('session_id', sessionId)
      .eq('exercise_id', exercise.exerciseId)
      .maybeSingle();
    if (existingRes.error) throw existingRes.error;
    if (existingRes.data?.id) {
      throw new Error('duplicate_exercise');
    }
  }

  const sessionExerciseId = await insertSessionExerciseRow(sessionId, exercise, displayOrder);
  const repsValue = parseRepsValue(exercise.reps ?? '');
  const setCount = Math.max(0, exercise.sets ?? 0);
  if (setCount > 0) {
    const payload = Array.from({ length: setCount }).map((_, setIdx) => ({
      session_exercise_id: sessionExerciseId,
      set_number: setIdx + 1,
      weight: null,
      reps: repsValue,
      rpe: null,
      rest_seconds: null,
    }));
    await insertWorkoutSets(payload);
  }

  return sessionExerciseId;
};

/**
 * Returns true if any set in this session has logged weight or reps data,
 * indicating the user has already started tracking their workout.
 */
export const sessionHasLoggedProgress = async (sessionId: string): Promise<boolean> => {
  const { data: exerciseRows, error: exError } = await supabase
    .from('fitarc_workout_session_exercises')
    .select('id')
    .eq('session_id', sessionId);
  if (exError) {
    console.warn('sessionHasLoggedProgress exercise query error:', exError);
    return false;
  }
  const exerciseIds = (exerciseRows ?? []).map((r) => r.id as string);
  if (!exerciseIds.length) return false;

  const { data: setRows, error: setError } = await supabase
    .from('fitarc_workout_sets')
    .select('id')
    .in('session_exercise_id', exerciseIds)
    .or('weight.not.is.null,reps.not.is.null')
    .limit(1);
  if (setError) {
    console.warn('sessionHasLoggedProgress set query error:', setError);
    return false;
  }
  return (setRows?.length ?? 0) > 0;
};

type DeleteWorkoutSessionInput = {
  userId: string;
  planId: string;
  date: string;
};

export const deleteWorkoutSessionRemote = async ({
  userId,
  planId,
  date,
}: DeleteWorkoutSessionInput) => {
  const performedAt = normalizeDate(date);
  const existingSession = await findExistingSessionForDate(userId, planId, performedAt);
  if (!existingSession?.id) return;
  await deleteExercisesForSession(existingSession.id);
  const deleteSessionRes = await supabase
    .from('fitarc_workout_sessions')
    .delete()
    .eq('id', existingSession.id);
  if (deleteSessionRes.error) throw deleteSessionRes.error;
};

export const fetchWorkoutCompletionMap = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, boolean>> => {
  const rangeDays = buildDateRange(startDate, endDate);
  if (!rangeDays.length) {
    return {};
  }
  const dayMap: Record<string, boolean> = {};
  rangeDays.forEach((day) => {
    dayMap[day] = false;
  });

  const { data: sessionRows, error: sessionError } = await supabase
    .from('fitarc_workout_sessions')
    .select(
      `
      id,
      performed_at,
      complete,
      session_exercises:fitarc_workout_session_exercises (
        id,
        complete
      )
    `
    )
    .eq('user_id', userId)
    .gte('performed_at', startDate)
    .lte('performed_at', endDate);

  if (sessionError) throw sessionError;
  const sessions = sessionRows || [];
  if (!sessions.length) {
    return dayMap;
  }

  const todayKey = formatLocalDateYMD(new Date());

  sessions.forEach((session) => {
    const sessionDate = session.performed_at
      ? formatLocalDateYMD(new Date(session.performed_at))
      : null;
    if (!sessionDate) return;
    if (!(sessionDate in dayMap)) return;
    if (sessionDate > todayKey) return;
    const exercises = (session.session_exercises ?? []) as Array<{ complete?: boolean }>;
    const allExercisesComplete =
      exercises.length > 0 && exercises.every((exercise) => exercise.complete === true);
    if (session.complete === true || allExercisesComplete) {
      dayMap[sessionDate] = true;
    }
  });

  return dayMap;
};

export const toggleExerciseCompletion = async (
  sessionExerciseId: string,
  completed: boolean
): Promise<void> => {
  const { error } = await supabase
    .from('fitarc_workout_session_exercises')
    .update({ complete: completed })
    .eq('id', sessionExerciseId);

  if (error) throw error;
};

export const checkAllExercisesComplete = async (
  sessionId: string
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('fitarc_workout_session_exercises')
    .select('complete')
    .eq('session_id', sessionId);

  if (error) throw error;

  return (data || []).length > 0 && data.every((ex) => ex.complete === true);
};

export const updateSessionCompletion = async (
  sessionId: string,
  completed: boolean
): Promise<void> => {
  const { error } = await supabase
    .from('fitarc_workout_sessions')
    .update({ complete: completed })
    .eq('id', sessionId);

  if (error) throw error;
};

export const markAllExercisesComplete = async (sessionId: string): Promise<void> => {
  const { error: exercisesError } = await supabase
    .from('fitarc_workout_session_exercises')
    .update({ complete: true })
    .eq('session_id', sessionId);

  if (exercisesError) throw exercisesError;

  const { error: sessionError } = await supabase
    .from('fitarc_workout_sessions')
    .update({ complete: true })
    .eq('id', sessionId);

  if (sessionError) throw sessionError;
};

export const toggleExerciseAndCheckSession = async (
  sessionId: string,
  sessionExerciseId: string,
  currentlyCompleted: boolean
): Promise<void> => {
  const newCompleted = !currentlyCompleted;

  await toggleExerciseCompletion(sessionExerciseId, newCompleted);
  const allComplete = await checkAllExercisesComplete(sessionId);
  await updateSessionCompletion(sessionId, allComplete);
};

export const fetchPhaseWorkoutSessions = async (
  userId: string,
  planId: string,
  lookbackDays = 84,
  timeZone: string = getAppTimeZone()
): Promise<WorkoutSessionEntry[]> => {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - lookbackDays);
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .select(SESSION_CREATE_SELECT)
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .gte('performed_at', fromDate.toISOString().split('T')[0])
    .order('performed_at', { ascending: false });

  if (error) throw error;
  return hydrateSessionsWithExercises((data as any[]) || [], planId, timeZone);
};
