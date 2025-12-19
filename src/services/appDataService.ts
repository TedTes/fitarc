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
import {
  formatDateInTimeZone,
  getAppTimeZone,
  startOfDayISO,
  startOfNextDayISO,
} from '../utils/time';
import { formatLocalDateYMD } from '../utils/date';

const WORKOUT_LOOKBACK_DAYS = 14;
const PROGRESS_DEFAULT_WINDOW_DAYS = 90;

const extractBodyParts = (exerciseRow: any): MuscleGroup[] => {
  const links = Array.isArray(exerciseRow)
    ? exerciseRow
    : exerciseRow?.exercise?.muscle_links || [];

  return Array.from(
    new Set(
      links
        .map((link: any) => mapMuscleNameToGroup(link?.muscle?.name))
        .filter((m: MuscleGroup | null | undefined): m is MuscleGroup => !!m)
    )
  );
};

  export const mapSessionRow = (
    session: any,
    phasePlanId: string | undefined,
    timeZone: string
  ): WorkoutSessionEntry => {
    const sessionExercises = session.session_exercises || [];
    const performedAtDate = session.performed_at ? new Date(session.performed_at) : null;
    
    return {
      id: session.id,
      phasePlanId: phasePlanId ?? session.plan_id,
      date: performedAtDate ? formatLocalDateYMD(performedAtDate) : formatLocalDateYMD(new Date()),
      exercises: sessionExercises.map((se: any) => ({
        id: se.id,  // CRITICAL: session_exercise_id for updates
        exerciseId: se.exercise?.id,
        name: se.exercise?.name || 'Unknown',
        bodyParts: extractBodyParts(se.exercise?.muscle_links || []),
        sets: 4,
        reps: '8-12',
        completed: se.complete || false,  // ← READ FROM DB
        displayOrder: se.display_order,
        notes: se.notes,
        setDetails: (se.sets || []).map((s: any) => ({
          setNumber: s.set_number,
          reps: s.reps,
          weight: s.weight,
          rpe: s.rpe,
          restSeconds: s.rest_seconds,
        })),
      })),
      notes: session.notes,
      completed: session.complete || false,  // ← SESSION COMPLETE FROM DB
    };
  };

const formatMealTypeLabel = (raw?: string | null) => {
  if (!raw) return 'Meal';
  const normalized = raw.replace(/_/g, ' ').trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const normalizeDateString = (value?: string | null): string =>
  value?.includes('T') ? value.split('T')[0] : value || '';

const mapMealPlanRow = (row: any, phasePlanId?: string): DailyMealPlan => {
  if (row.meal_date) {
    const normalizedDate = normalizeDateString(row.meal_date);
    const dayCompleted = Boolean(row.completed);
    const grouped: Record<string, MealPlanMeal> = {};
    (row.meal_entries || []).forEach((entry: any) => {
      const key = entry.meal_type || 'meal';
      if (!grouped[key]) {
        grouped[key] = {
          title: formatMealTypeLabel(entry.meal_type),
          items: [],
          completed: dayCompleted,
        };
      }
      const macros: string[] = [];
      if (typeof entry.calories === 'number') macros.push(`${entry.calories} kcal`);
      if (typeof entry.protein_g === 'number') macros.push(`P${entry.protein_g}g`);
      if (typeof entry.carbs_g === 'number') macros.push(`C${entry.carbs_g}g`);
      if (typeof entry.fat_g === 'number') macros.push(`F${entry.fat_g}g`);
      const detail = macros.length ? ` (${macros.join(' • ')})` : '';
      grouped[key].items.push(`${entry.food_name || 'Food'}${detail}`);
    });
    const meals = Object.values(grouped);
    return {
      id: row.id,
      date: normalizedDate,
      phasePlanId: phasePlanId || row.plan_id || 'phase',
      meals,
      completed: dayCompleted,
    };
  }

  const fallbackCompleted = typeof row.completed === 'boolean' ? row.completed : false;
  const meals: MealPlanMeal[] = (row.meals || []).map((meal: any) => ({
    title: meal.title,
    items: meal.items || [],
    completed: typeof meal.completed === 'boolean' ? meal.completed : fallbackCompleted,
  }));
  return {
    id: row.id,
    date: normalizeDateString(row.date),
    phasePlanId: phasePlanId || row.plan_id || 'phase',
    meals,
    completed:
      typeof row.completed === 'boolean'
        ? row.completed
        : meals.every((meal) => meal.completed),
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

export const fetchHomeData = async (
  userId: string,
  options?: { timeZone?: string }
): Promise<HomeScreenData> => {
  const timeZone = options?.timeZone ?? getAppTimeZone();
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - (WORKOUT_LOOKBACK_DAYS - 1));
  const todayKey = formatDateInTimeZone(today, timeZone);
  const fromStartIso = startOfDayISO(fromDate, timeZone);
  const tomorrowStartIso = startOfNextDayISO(today, timeZone);

  const phaseRes = await supabase
    .from('fitarc_workout_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (phaseRes.error) throw phaseRes.error;
  const phase = phaseRes.data ? mapPhaseRow(phaseRes.data) : null;
  const planId = phase?.id;

  const sessionsQuery = supabase
    .from('fitarc_workout_sessions')
    .select(
      `
      id,
      user_id,
      plan_id,
      performed_at,
      notes,
      complete,
      session_exercises:fitarc_workout_session_exercises (
        id,
        display_order,
        notes,
        complete,
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
    .gte('performed_at', fromStartIso)
    .lt('performed_at', tomorrowStartIso);

  if (planId) {
    sessionsQuery.eq('plan_id', planId);
  }


  const [sessionsRes] = await Promise.all([
    sessionsQuery.order('performed_at', { ascending: false }),
  ]);
  if (sessionsRes.error) throw sessionsRes.error;

  const recentSessions = (sessionsRes.data || []).map((row: any) => {
   return  mapSessionRow(row, phase?.id, timeZone)
  });

  const todaySession = recentSessions.find((session) => session.date === todayKey) || null;
  const todayMealPlan = null;
  const lastPhotoCheckin = null;

  if (__DEV__) {
    console.log('[fetchHomeData]', {
      timeZone,
      todayKey,
      fromStartIso,
      tomorrowStartIso,
      sessionCount: recentSessions.length,
    });
  }

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
  planId: string,
  lookbackDays = 84,
  timeZone: string = getAppTimeZone()
): Promise<WorkoutSessionEntry[]> => {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - lookbackDays);
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .select(
      `
      id,
      user_id,
      plan_id,
      performed_at,
      notes,
      complete,
      session_exercises:fitarc_workout_session_exercises (
        id,
        display_order,
        notes,
        complete,
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
    .eq('plan_id', planId)
    .gte('performed_at', fromDate.toISOString().split('T')[0])
    .order('performed_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row: any) => mapSessionRow(row, planId, timeZone));
};

export const fetchMealPlansForRange = async (
  userId: string,
  fromDate: string,
  toDate: string,
  planId?: string
): Promise<DailyMealPlan[]> => {
  let query = supabase
    .from('fitarc_daily_meals')
    .select(
      `
      id,
      user_id,
      plan_id,
      meal_plan_id,
      meal_date,
      completed,
      notes,
      meal_entries:fitarc_meal_entries (
        id,
        meal_type,
        food_name,
        calories,
        protein_g,
        carbs_g,
        fat_g
      )
    `
    )
    .eq('user_id', userId)
    .gte('meal_date', fromDate)
    .lte('meal_date', toDate)
    .order('meal_date', { ascending: true });

  if (planId) {
    query = query.eq('plan_id', planId);
  }

  const { data, error } = await query;

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
  planId: string,
  windowDays = PROGRESS_DEFAULT_WINDOW_DAYS
): Promise<ProgressData> => {
  const timeZone = getAppTimeZone();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - windowDays);
  const fromIso = fromDate.toISOString().split('T')[0];
  const toIso = new Date().toISOString().split('T')[0];

  const [phaseRes, sessionsRes, mealsRes, photosRes] = await Promise.all([
    supabase
      .from('fitarc_workout_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('id', planId)
      .single(),
    supabase
      .from('fitarc_workout_sessions')
      .select(
        `
        id,
        user_id,
        plan_id,
        performed_at,
        notes,
        complete,
        session_exercises:fitarc_workout_session_exercises (
          id,
          display_order,
          notes,
          complete,
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
      .eq('plan_id', planId)
      .gte('performed_at', fromIso)
      .order('performed_at', { ascending: false }),
    (() => {
      let query = supabase
      .from('fitarc_daily_meals')
      .select(
        `
        id,
        user_id,
        plan_id,
        meal_plan_id,
        meal_date,
        completed,
        notes,
        meal_entries:fitarc_meal_entries (
          id,
          meal_type,
          food_name,
          calories,
          protein_g,
          carbs_g,
          fat_g
        )
      `
      )
      .eq('user_id', userId)
      .gte('meal_date', fromIso)
      .lte('meal_date', toIso)
      .order('meal_date', { ascending: true });
    if (planId) {
      query = query.or(`plan_id.eq.${planId},plan_id.is.null`);
    }
    return query;
    })(),
    supabase
      .from('fitarc_photo_checkins')
      .select('*')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .order('date', { ascending: false }),
  ]);

  if (phaseRes.error) throw phaseRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (mealsRes.error) throw mealsRes.error;
  if (photosRes.error) throw photosRes.error;

  const sessionRows = sessionsRes.data || [];
  const mealRows = mealsRes.data || [];

  const sessionEntries = sessionRows.map((row: any) => mapSessionRow(row, planId, timeZone));
  const analytics = buildWorkoutAnalytics(sessionEntries);

  return {
    phase: phaseRes.data ? mapPhaseRow(phaseRes.data) : null,
    sessions: sessionEntries,
    mealPlans: mealRows.map((row: any) => mapMealPlanRow(row, planId)),
    photos: (photosRes.data as PhotoCheckin[]) || [],
    workoutLogs: analytics.workoutLogs,
    strengthSnapshots: analytics.strengthSnapshots,
  };
};
