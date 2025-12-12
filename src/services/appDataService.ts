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
  MovementPattern,
  LiftId,
} from '../types/domain';

const WORKOUT_LOOKBACK_DAYS = 14;
const PROGRESS_DEFAULT_WINDOW_DAYS = 90;

const mapMuscle = (name?: string | null): MuscleGroup | null => {
  if (!name) return null;
  const normalized = name.toLowerCase();
  if (['quads', 'hamstrings', 'glutes', 'calves', 'legs'].includes(normalized)) {
    return 'legs';
  }
  if (['chest'].includes(normalized)) return 'chest';
  if (['back', 'lats'].includes(normalized)) return 'back';
  if (['shoulders', 'delts', 'rear delts'].includes(normalized)) return 'shoulders';
  if (['arms', 'triceps', 'biceps', 'forearms'].includes(normalized)) return 'arms';
  if (['core', 'abs', 'obliques', 'hip flexors'].includes(normalized)) return 'core';
  return null;
};

const movementPatternMatchers: { pattern: MovementPattern; keywords: RegExp }[] = [
  { pattern: 'squat', keywords: /squat|lunge|leg press/i },
  { pattern: 'hinge', keywords: /deadlift|hip thrust|rdl|good morning/i },
  { pattern: 'horizontal_push', keywords: /bench|push-up|press|dip/i },
  { pattern: 'vertical_push', keywords: /overhead|military|shoulder press/i },
  { pattern: 'horizontal_pull', keywords: /row|pullover/i },
  { pattern: 'vertical_pull', keywords: /pull-up|pulldown|chin-up/i },
];

const liftMatchers: { lift: LiftId; keywords: RegExp }[] = [
  { lift: 'bench_press', keywords: /bench/i },
  { lift: 'squat', keywords: /squat/i },
  { lift: 'deadlift', keywords: /deadlift|hip thrust/i },
];

const createZeroMuscleVolume = (): Record<MuscleGroup, number> => ({
  chest: 0,
  back: 0,
  legs: 0,
  shoulders: 0,
  arms: 0,
  core: 0,
});

const createZeroMovementVolume = (): Record<MovementPattern, number> => ({
  squat: 0,
  hinge: 0,
  horizontal_push: 0,
  vertical_push: 0,
  horizontal_pull: 0,
  vertical_pull: 0,
});

const inferMovementPattern = (name?: string | null): MovementPattern | null => {
  if (!name) return null;
  const matcher = movementPatternMatchers.find((entry) => entry.keywords.test(name));
  return matcher ? matcher.pattern : null;
};

const inferLiftId = (name?: string | null): LiftId | null => {
  if (!name) return null;
  const matcher = liftMatchers.find((entry) => entry.keywords.test(name));
  return matcher ? matcher.lift : null;
};

const extractBodyParts = (exerciseRow: any): MuscleGroup[] =>
  Array.from(
    new Set(
      (exerciseRow.exercise?.muscle_links || [])
        .map((link: any) => mapMuscle(link.muscle?.name))
        .filter((m: MuscleGroup | null | undefined): m is MuscleGroup => !!m)
    )
  );

type RawExerciseSet = {
  weight?: number | null;
  reps?: number | null;
};

const normalizeSets = (exercise: any): RawExerciseSet[] =>
  Array.isArray(exercise.sets) ? (exercise.sets as RawExerciseSet[]) : [];

const mapSessionRow = (row: any, fallbackPhaseId?: string): WorkoutSessionEntry => {
  const exercises = (row.session_exercises || [])
    .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
    .map((exercise: any) => {
      const muscles = extractBodyParts(exercise);

      return {
        name: exercise.exercise?.name || 'Exercise',
        bodyParts: muscles,
        completed: false,
        sets: (exercise.sets || []).length || 3,
        reps: exercise.sets?.[0]?.reps ? `${exercise.sets[0].reps}` : '8-12',
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

const buildWorkoutLogFromRow = (row: any): WorkoutLog => {
  const muscleVolume = createZeroMuscleVolume();
  const movementPatterns = createZeroMovementVolume();
  const lifts: WorkoutLog['lifts'] = [];

  (row.session_exercises || []).forEach((exercise: any) => {
    const sets = normalizeSets(exercise);
    const setCount = sets.length || 1;
    const parts = extractBodyParts(exercise);
    parts.forEach((part) => {
      muscleVolume[part] += setCount;
    });

    const pattern = inferMovementPattern(exercise.exercise?.name);
    if (pattern) {
      movementPatterns[pattern] += setCount;
    }

    const lift = inferLiftId(exercise.exercise?.name);
    if (lift) {
      const heaviestSet = sets.reduce<RawExerciseSet | null>((best, current) => {
        const weight = Number(current?.weight ?? 0);
        if (!best || weight > Number(best.weight ?? 0)) {
          return { weight, reps: Number(current?.reps ?? 0) };
        }
        return best;
      }, null);

      if (heaviestSet) {
        lifts.push({
          lift,
          weight: Number(heaviestSet.weight ?? 0),
          reps: Number(heaviestSet.reps ?? 0),
        });
      }
    }
  });

  return {
    id: row.id,
    date: row.performed_at?.split('T')[0] || row.performed_at,
    phasePlanId: row.phase_id || 'phase',
    muscleVolume,
    movementPatterns,
    lifts,
  };
};

const buildStrengthSnapshotsFromRow = (row: any): StrengthSnapshot[] => {
  const date = row.performed_at?.split('T')[0] || row.performed_at;
  const phasePlanId = row.phase_id || 'phase';
  const snapshots: StrengthSnapshot[] = [];

  (row.session_exercises || []).forEach((exercise: any, index: number) => {
    const lift = inferLiftId(exercise.exercise?.name);
    if (!lift) return;

    const sets = normalizeSets(exercise);
    const bestSet = sets.reduce<RawExerciseSet | null>((best, current) => {
      const weight = Number(current?.weight ?? 0);
      if (!best || weight > Number(best.weight ?? 0)) {
        return { weight, reps: Number(current?.reps ?? 0) };
      }
      return best;
    }, null);

    if (bestSet) {
      snapshots.push({
        id: `${row.id}-${exercise.id || index}-${lift}`,
        phasePlanId,
        lift,
        date,
        weight: Number(bestSet.weight ?? 0),
        reps: Number(bestSet.reps ?? 0),
      });
    }
  });

  return snapshots;
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

  const phasePromise = supabase
    .from('fitarc_phases')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sessionsPromise = supabase
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
          name,
          muscle_links:fitarc_exercise_muscle_groups (
            role,
            muscle:fitarc_muscle_groups ( name )
          )
        ),
        sets:fitarc_workout_sets (
          set_number,
          reps,
          weight,
          rpe
        )
      )
    `
    )
    .eq('user_id', userId)
    .gte('performed_at', fromIso)
    .order('performed_at', { ascending: false });

  const mealPromise = supabase
    .from('fitarc_meal_plans')
    .select(
      `
      id,
      date,
      phase_id,
      meals:fitarc_meals ( id, title, items, completed )
    `
    )
    .eq('user_id', userId)
    .eq('date', todayIso)
    .maybeSingle();

  const photoPromise = supabase
    .from('fitarc_photo_checkins')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const [phaseRes, sessionsRes, mealRes, photoRes] = await Promise.all([
    phasePromise,
    sessionsPromise,
    mealPromise,
    photoPromise,
  ]);

  if (phaseRes.error) throw phaseRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (mealRes.error) throw mealRes.error;
  if (photoRes.error) throw photoRes.error;

  const phase = (phaseRes.data as PhasePlan) || null;
  const recentSessions = (sessionsRes.data || []).map((row: any) => mapSessionRow(row, phase?.id));
  const todaySession = recentSessions.find((session) => session.date === todayIso) || null;
  const todayMealPlan = mealRes.data ? mapMealPlanRow(mealRes.data, phase?.id) : null;
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
          name,
          muscle_links:fitarc_exercise_muscle_groups (
            role,
            muscle:fitarc_muscle_groups ( name )
          )
        ),
        sets:fitarc_workout_sets (
          set_number,
          reps,
          weight,
          rpe
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

  const [phaseRes, sessionsRes, mealsRes, photosRes] = await Promise.all([
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
            name,
            muscle_links:fitarc_exercise_muscle_groups (
              role,
              muscle:fitarc_muscle_groups ( name )
            )
          ),
          sets:fitarc_workout_sets (
            set_number,
            reps,
            weight,
            rpe
          )
        )
      `
      )
      .eq('user_id', userId)
      .eq('phase_id', phaseId)
      .gte('performed_at', fromIso)
      .order('performed_at', { ascending: false }),
    supabase
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
      .eq('phase_id', phaseId)
      .gte('date', fromIso)
      .order('date', { ascending: false }),
    supabase
      .from('fitarc_photo_checkins')
      .select('*')
      .eq('user_id', userId)
      .eq('phase_id', phaseId)
      .order('date', { ascending: false }),
  ]);

  if (phaseRes.error) throw phaseRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (mealsRes.error) throw mealsRes.error;
  if (photosRes.error) throw photosRes.error;

  const sessionRows = sessionsRes.data || [];

  return {
    phase: (phaseRes.data as PhasePlan) || null,
    sessions: sessionRows.map((row: any) => mapSessionRow(row, phaseId)),
    mealPlans: (mealsRes.data || []).map((row: any) => mapMealPlanRow(row, phaseId)),
    photos: (photosRes.data as PhotoCheckin[]) || [],
    workoutLogs: sessionRows.map((row: any) => buildWorkoutLogFromRow(row)),
    strengthSnapshots: sessionRows.flatMap((row: any) => buildStrengthSnapshotsFromRow(row)),
  };
};
