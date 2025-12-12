import { supabase } from '../lib/supabaseClient';
import {
  DailyMealPlan,
  MealPlanMeal,
  PhotoCheckin,
  PhasePlan,
  WorkoutSessionEntry,
  MuscleGroup,
  WorkoutLog,
  StrengthSnapshot,
  WorkoutSetEntry,
} from '../types/domain';
import {
  buildWorkoutAnalytics,
  inferMovementPatternFromName,
  mapMuscleNameToGroup,
} from '../utils/workoutAnalytics';
import { mapPhaseRow } from './phaseService';

const WORKOUT_LOOKBACK_DAYS = 14;
const PROGRESS_DEFAULT_WINDOW_DAYS = 90;

const extractBodyParts = (exerciseRow: any): MuscleGroup[] =>
  Array.from(
    new Set(
      (exerciseRow.exercise?.muscle_links || [])
        .map((link: any) => mapMuscleNameToGroup(link.muscle?.name))
        .filter((m: MuscleGroup | null | undefined): m is MuscleGroup => !!m)
    )
  );

export const mapSessionRow = (row: any, fallbackPhaseId?: string): WorkoutSessionEntry => {
  const exercises = (row.session_exercises || [])
    .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
    .map((exercise: any) => {
      const muscles = extractBodyParts(exercise);
      const sortedSets: WorkoutSetEntry[] = (exercise.sets || [])
        .map((set: any): WorkoutSetEntry => ({
          setNumber: typeof set.set_number === 'number' ? set.set_number : undefined,
          weight:
            typeof set.weight === 'number'
              ? set.weight
              : set.weight !== undefined
              ? Number(set.weight)
              : undefined,
          reps:
            typeof set.reps === 'number'
              ? set.reps
              : set.reps !== undefined
              ? Number(set.reps)
              : undefined,
          rpe:
            typeof set.rpe === 'number'
              ? set.rpe
              : set.rpe !== undefined
              ? Number(set.rpe)
              : undefined,
          restSeconds:
            typeof set.rest_seconds === 'number'
              ? set.rest_seconds
              : set.rest_seconds !== undefined
              ? Number(set.rest_seconds)
              : undefined,
        }))
        .sort(
          (a: WorkoutSetEntry, b: WorkoutSetEntry) =>
            (a.setNumber || 0) - (b.setNumber || 0)
        );
      const setCount = sortedSets.length;
      const firstReps = sortedSets[0]?.reps;
      const movementPattern =
        exercise.exercise?.movement_pattern ||
        inferMovementPatternFromName(exercise.exercise?.name);

      return {
        name: exercise.exercise?.name || 'Exercise',
        bodyParts: muscles,
        completed: setCount > 0,
        sets: setCount || 3,
        reps: firstReps ? `${firstReps}` : '8-12',
        setDetails: sortedSets,
        exerciseId: exercise.exercise?.id || undefined,
        movementPattern,
      };
    });

  return {
    id: row.id,
    date: row.performed_at?.split('T')[0] || row.performed_at,
    phasePlanId: row.phase_id || fallbackPhaseId || 'phase',
    exercises,
  };
};

const mapMealPlanRow = (row: any, phasePlanId?: string): DailyMealPlan => {
  const meals: MealPlanMeal[] = (row.meals || []).map((meal: any) => ({
    title: meal.title,
    items: meal.items || [],
    completed: meal.completed ?? false,
  }));
  return {
    id: row.id,
    date: row.date,
    phasePlanId: phasePlanId || row.phase_id || 'phase',
    meals,
  };
};

const buildConsistencySummary = (sessions: WorkoutSessionEntry[]) => {
  const dates = new Set(sessions.map((s) => s.date));
  const streak = (() => {
    let currentStreak = 0;
    const today = new Date();
    for (let i = 0; i < 14; i += 1) {
      const check = new Date(today);
      check.setDate(today.getDate() - i);
      const key = check.toISOString().split('T')[0];
      if (dates.has(key)) {
        currentStreak += 1;
      } else {
        break;
      }
    }
    return currentStreak;
  })();

  const adherencePercent = sessions.length ? Math.min(100, (dates.size / 14) * 100) : 0;

  return {
    streak,
    adherencePercent,
  };
};

export type HomeScreenData = {
  phase: PhasePlan | null;
  recentSessions: WorkoutSessionEntry[];
  todaySession: WorkoutSessionEntry | null;
  todayMealPlan: DailyMealPlan | null;
  lastPhotoCheckin: PhotoCheckin | null;
  consistencySummary: {
    streak: number;
    adherencePercent: number;
  };
};

export const fetchHomeData = async (userId: string): Promise<HomeScreenData> => {
  const today = new Date();
  const fromDate = new Date();
  fromDate.setDate(today.getDate() - (WORKOUT_LOOKBACK_DAYS - 1));
  const fromIso = fromDate.toISOString().split('T')[0];
  const todayIso = today.toISOString().split('T')[0];

  const phaseRes = await supabase
    .from('fitarc_phases')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (phaseRes.error) throw phaseRes.error;
  const phase = phaseRes.data ? mapPhaseRow(phaseRes.data) : null;
  const phaseId = phase?.id;

  const sessionsQuery = supabase
    .from('fitarc_workout_sessions')
    .select(
      `
      id,
      user_id,
      phase_id,
      performed_at,
      notes,
      session_exercises:fitarc_workout_session_exercises (
        id,
        display_order,
        notes,
        exercise:fitarc_exercises (
          id,
          name,
          movement_pattern,
          muscle_links:fitarc_exercise_muscle_groups (
            role,
            muscle:fitarc_muscle_groups ( name )
          )
        ),
        sets:fitarc_workout_sets (
          set_number,
          reps,
          weight,
          rpe,
          rest_seconds
        )
      )
    `
    )
    .eq('user_id', userId)
    .gte('performed_at', fromIso);

  if (phaseId) {
    sessionsQuery.eq('phase_id', phaseId);
  }

  const photoQuery = supabase
    .from('fitarc_photo_checkins')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1);

  if (phaseId) {
    photoQuery.eq('phase_id', phaseId);
  }

  const [sessionsRes, photoRes] = await Promise.all([
    sessionsQuery.order('performed_at', { ascending: false }),
    photoQuery.maybeSingle(),
  ]);

  if (sessionsRes.error) throw sessionsRes.error;
  if (photoRes.error) throw photoRes.error;

  const recentSessions = (sessionsRes.data || []).map((row: any) => mapSessionRow(row, phase?.id));
  const todaySession = recentSessions.find((session) => session.date === todayIso) || null;
  const todayMealPlan = null;
  const lastPhotoCheckin = photoRes.data as PhotoCheckin | null;

  return {
    phase,
    recentSessions,
    todaySession,
    todayMealPlan,
    lastPhotoCheckin,
    consistencySummary: buildConsistencySummary(recentSessions),
  };
};

export const fetchPhaseWorkoutSessions = async (
  userId: string,
  phaseId: string,
  lookbackDays = 84
): Promise<WorkoutSessionEntry[]> => {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - lookbackDays);
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .select(
      `
      id,
      user_id,
      phase_id,
      performed_at,
      notes,
      session_exercises:fitarc_workout_session_exercises (
        id,
        display_order,
        notes,
        exercise:fitarc_exercises (
          id,
          name,
          movement_pattern,
          muscle_links:fitarc_exercise_muscle_groups (
            role,
            muscle:fitarc_muscle_groups ( name )
          )
        ),
        sets:fitarc_workout_sets (
          set_number,
          reps,
          weight,
          rpe,
          rest_seconds
        )
      )
    `
    )
    .eq('user_id', userId)
    .eq('phase_id', phaseId)
    .gte('performed_at', fromDate.toISOString().split('T')[0])
    .order('performed_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row: any) => mapSessionRow(row, phaseId));
};

export const fetchMealPlansForRange = async (
  userId: string,
  fromDate: string,
  toDate: string
): Promise<DailyMealPlan[]> => {
  const { data, error } = await supabase
    .from('fitarc_meal_plans')
    .select(
      `
      id,
      date,
      phase_id,
      meals:fitarc_meals (
        id,
        title,
        items,
        completed
      )
    `
    )
    .eq('user_id', userId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: true });

  if (error) throw error;
  return (data || []).map((row: any) => mapMealPlanRow(row));
};

export type ProgressData = {
  phase: PhasePlan | null;
  sessions: WorkoutSessionEntry[];
  mealPlans: DailyMealPlan[];
  photos: PhotoCheckin[];
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
};

export const fetchProgressData = async (
  userId: string,
  phaseId: string,
  windowDays = PROGRESS_DEFAULT_WINDOW_DAYS
): Promise<ProgressData> => {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - windowDays);
  const fromIso = fromDate.toISOString().split('T')[0];

  const [phaseRes, sessionsRes, photosRes] = await Promise.all([
    supabase
      .from('fitarc_phases')
      .select('*')
      .eq('user_id', userId)
      .eq('id', phaseId)
      .single(),
    supabase
      .from('fitarc_workout_sessions')
      .select(
        `
        id,
        user_id,
        phase_id,
        performed_at,
        notes,
        session_exercises:fitarc_workout_session_exercises (
          id,
          display_order,
          notes,
          exercise:fitarc_exercises (
            id,
            name,
            movement_pattern,
            muscle_links:fitarc_exercise_muscle_groups (
              role,
              muscle:fitarc_muscle_groups ( name )
            )
          ),
          sets:fitarc_workout_sets (
            set_number,
            reps,
            weight,
            rpe,
            rest_seconds
          )
        )
      `
      )
      .eq('user_id', userId)
      .eq('phase_id', phaseId)
      .gte('performed_at', fromIso)
      .order('performed_at', { ascending: false }),
    supabase
      .from('fitarc_photo_checkins')
      .select('*')
      .eq('user_id', userId)
      .eq('phase_id', phaseId)
      .order('date', { ascending: false }),
  ]);

  if (phaseRes.error) throw phaseRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (photosRes.error) throw photosRes.error;

  const sessionRows = sessionsRes.data || [];

  const sessionEntries = sessionRows.map((row: any) => mapSessionRow(row, phaseId));
  const analytics = buildWorkoutAnalytics(sessionEntries);

  return {
    phase: phaseRes.data ? mapPhaseRow(phaseRes.data) : null,
    sessions: sessionEntries,
    mealPlans: [],
    photos: (photosRes.data as PhotoCheckin[]) || [],
    workoutLogs: analytics.workoutLogs,
    strengthSnapshots: analytics.strengthSnapshots,
  };
};
