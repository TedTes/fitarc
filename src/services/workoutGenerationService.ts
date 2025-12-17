import { User } from '../types/domain';
import { ExerciseCatalogEntry } from './exerciseCatalogService';
import { supabase } from '../lib/supabaseClient';
import { formatLocalDateYMD } from '../utils/date';

type DayBlueprint = {
  key: string;
  title: string;
  primaryMuscles: string[];
  accessoryMuscles?: string[];
  secondaryFocus?: string[];
  targetExercises?: number;
  splitDayId?: string | null;
};

/**
 * Fetches exercise catalog from database
 */
const fetchExerciseCatalog = async (): Promise<ExerciseCatalogEntry[]> => {
  const { data, error } = await supabase
    .from('fitarc_exercises')
    .select(`
      id,
      name,
      movement_pattern,
      muscle_links:fitarc_exercise_muscle_groups (
        role,
        muscle:fitarc_muscle_groups ( name )
      )
    `)
    .order('name');

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    movementPattern: row.movement_pattern,
    primaryMuscles: row.muscle_links
      ?.filter((link: any) => link.role === 'primary')
      .map((link: any) => link.muscle?.name)
      .filter(Boolean) || [],
    secondaryMuscles: row.muscle_links
      ?.filter((link: any) => link.role === 'secondary')
      .map((link: any) => link.muscle?.name)
      .filter(Boolean) || [],
  }));
};

type SplitDayRow = {
  id: string;
  day_index: number;
  day_key: string;
  title: string;
  target_exercises: number | null;
  muscles: {
    role: string | null;
    sort_order: number | null;
    muscle: { name: string | null } | null;
  }[];
};

const fetchSplitBlueprints = async (
  splitKey: User['trainingSplit']
): Promise<DayBlueprint[]> => {
  const { data, error } = await supabase
    .from('fitarc_training_splits')
    .select(
      `
      id,
      split_days:fitarc_split_days (
        id,
        day_index,
        day_key,
        title,
        target_exercises,
        muscles:fitarc_split_day_muscles (
          role,
          sort_order,
          muscle:fitarc_muscle_groups ( name )
        )
      )
    `
    )
    .eq('split_key', splitKey)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to load split blueprint:', error);
    return [];
  }

  const days = ((data?.split_days as SplitDayRow[]) || []).sort(
    (a, b) => (a.day_index ?? 0) - (b.day_index ?? 0)
  );

  return days.map((day) => {
    const primary: string[] = [];
    const accessory: string[] = [];

    (day.muscles || [])
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .forEach((link) => {
        const name = link.muscle?.name;
        if (!name) return;
        if ((link.role || '').toLowerCase() === 'primary') {
          primary.push(name);
        } else {
          accessory.push(name);
        }
      });

    return {
      key: day.day_key,
      title: day.title,
      primaryMuscles: primary,
      accessoryMuscles: accessory,
      targetExercises: day.target_exercises ?? undefined,
      splitDayId: day.id,
    };
  });
};

const normalizeMuscle = (name?: string | null) =>
  (name || '').toLowerCase().trim();

type MuscleIndex = Record<string, ExerciseCatalogEntry[]>;

const buildMuscleIndex = (catalog: ExerciseCatalogEntry[]): MuscleIndex => {
  const index: MuscleIndex = {};
  catalog.forEach((exercise) => {
    exercise.primaryMuscles.forEach((muscle) => {
      const key = normalizeMuscle(muscle);
      if (!key) return;
      if (!index[key]) {
        index[key] = [];
      }
      index[key].push(exercise);
    });
  });
  Object.keys(index).forEach((key) => {
    index[key].sort((a, b) => a.name.localeCompare(b.name));
  });
  return index;
};

const selectFromBucket = (
  bucket: ExerciseCatalogEntry[],
  usedIds: Set<string>,
  seed: number
): ExerciseCatalogEntry | null => {
  if (!bucket.length) return null;
  for (let i = 0; i < bucket.length; i++) {
    const candidate = bucket[(i + seed) % bucket.length];
    if (!usedIds.has(candidate.id)) {
      usedIds.add(candidate.id);
      return candidate;
    }
  }
  return null;
};

const pickExercisesForBlueprint = (
  blueprint: DayBlueprint,
  muscleIndex: MuscleIndex,
  catalog: ExerciseCatalogEntry[],
  daySeed: number
): ExerciseCatalogEntry[] => {
  const target = blueprint.targetExercises ?? 5;
  const selection: ExerciseCatalogEntry[] = [];
  const usedIds = new Set<string>();
  const catalogSorted = [...catalog].sort((a, b) => a.name.localeCompare(b.name));

  const pickMuscles = (muscles?: string[]) => {
    if (!muscles) return;
    muscles.forEach((muscle) => {
      if (selection.length >= target) return;
      const bucket = muscleIndex[normalizeMuscle(muscle)] || [];
      const pick = selectFromBucket(bucket, usedIds, daySeed + selection.length);
      if (pick) {
        selection.push(pick);
      }
    });
  };

  pickMuscles(blueprint.primaryMuscles);
  if (selection.length < target) {
    pickMuscles(blueprint.accessoryMuscles);
  }
  if (selection.length < target) {
    pickMuscles(blueprint.secondaryFocus);
  }

  if (selection.length < target) {
    for (let i = 0; i < catalogSorted.length && selection.length < target; i++) {
      const candidate = catalogSorted[(i + daySeed) % catalogSorted.length];
      if (!usedIds.has(candidate.id)) {
        usedIds.add(candidate.id);
        selection.push(candidate);
      }
    }
  }

  return selection;
};

const buildGenericBlueprints = (catalog: ExerciseCatalogEntry[]): DayBlueprint[] => {
  const muscleSet = new Set<string>();
  catalog.forEach((exercise) => {
    exercise.primaryMuscles.forEach((m) => {
      const key = normalizeMuscle(m);
      if (key) {
        muscleSet.add(key);
      }
    });
  });

  const muscles = Array.from(muscleSet);
  if (!muscles.length) {
    return [];
  }

  const chunkSize = Math.max(3, Math.floor(muscles.length / 3));
  const chunks: string[][] = [];
  for (let i = 0; i < muscles.length; i += chunkSize) {
    chunks.push(muscles.slice(i, i + chunkSize));
  }

  return chunks.slice(0, 4).map((group, idx) => ({
    key: `auto_${idx + 1}`,
    title: `Session ${idx + 1}`,
    primaryMuscles: group,
    targetExercises: 5,
  }));
};

/**
 * Auto-generates 7 days of workout sessions for a new plan
 * This is called once when a plan is created
 */
export const generateWeekWorkouts = async (
  userId: string,
  phaseId: string,
  trainingSplit: User['trainingSplit'],
  startDate: Date = new Date()
): Promise<void> => {
  try {
    console.log(`🏋️ Generating workouts for phase ${phaseId}, split: ${trainingSplit}`);
    
    // Fetch exercise catalog from database
    const exerciseCatalog = await fetchExerciseCatalog();
    
    if (exerciseCatalog.length === 0) {
      console.warn('⚠️ Exercise catalog is empty - cannot generate workouts');
      return;
    }
    
    let blueprints = await fetchSplitBlueprints(trainingSplit);
    if (!blueprints.length) {
      console.warn(`⚠️ No DB blueprint for ${trainingSplit}, using fallback.`);
      blueprints = buildGenericBlueprints(exerciseCatalog);
    }
    if (!blueprints.length) {
      console.warn('⚠️ No blueprint available - cannot create workouts');
      return;
    }
    const muscleIndex = buildMuscleIndex(exerciseCatalog);
    
    // Generate 7 days of workouts
    const sessionsToCreate: Array<{
      date: string;
      exercises: ExerciseCatalogEntry[];
      title: string;
      splitDayId?: string | null;
    }> = [];
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const workoutDate = new Date(startDate);
      workoutDate.setDate(startDate.getDate() + dayOffset);
      const dateStr = formatLocalDateYMD(workoutDate);
      
      const blueprint = blueprints[dayOffset % blueprints.length];
      const exercises = pickExercisesForBlueprint(
        blueprint,
        muscleIndex,
        exerciseCatalog,
        dayOffset
      );

      if (!exercises.length) {
        console.warn(`⚠️ No exercises found for blueprint ${blueprint.title}`);
        continue;
      }
      
      sessionsToCreate.push({
        date: dateStr,
        exercises,
        title: blueprint.title,
        splitDayId: blueprint.splitDayId ?? null,
      });
    }
    
    if (sessionsToCreate.length === 0) {
      console.warn('⚠️ No sessions to create');
      return;
    }
    
    // Create all sessions in database
    let successCount = 0;
    for (const session of sessionsToCreate) {
      try {
        await createWorkoutSessionInDB(
          userId,
          phaseId,
          session.date,
          session.exercises,
          session.splitDayId ?? undefined
        );
        successCount++;
        console.log(`✅ Created ${session.title} for ${session.date}`);
      } catch (err) {
        console.error(`❌ Failed to create session for ${session.date}:`, err);
      }
    }
    
    console.log(`🎉 Successfully generated ${successCount}/${sessionsToCreate.length} workout sessions`);
  } catch (error) {
    console.error('❌ Failed to generate week workouts:', error);
    throw error;
  }
};

/**
 * Creates a workout session with exercises in the database
 */
const createWorkoutSessionInDB = async (
  userId: string,
  phaseId: string,
  date: string,
  exercises: ExerciseCatalogEntry[],
  splitDayId?: string
): Promise<void> => {
  // 1. Create workout session
  const { data: session, error: sessionError } = await supabase
    .from('fitarc_workout_sessions')
    .insert({
      user_id: userId,
      plan_id: phaseId,
      performed_at: date,
      split_day_id: splitDayId ?? null,
    })
    .select('id')
    .single();

  if (sessionError) {
    console.error('Session creation error:', sessionError);
    throw sessionError;
  }
  
  if (!session) {
    throw new Error('Failed to create session - no data returned');
  }

  // 2. Create session exercises (links to exercise catalog)
  const sessionExercises = exercises.map((exercise, index) => ({
    session_id: session.id,
    exercise_id: exercise.id,
    display_order: index + 1,
  }));

  const { error: exercisesError } = await supabase
    .from('fitarc_workout_session_exercises')
    .insert(sessionExercises);

  if (exercisesError) {
    console.error('Session exercises creation error:', exercisesError);
    throw exercisesError;
  }
};

/**
 * Check if workouts already exist for a phase
 * Prevents duplicate generation
 */
export const hasExistingWorkouts = async (
  userId: string,
  phaseId: string
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('fitarc_workout_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', phaseId)
    .limit(1);

  if (error) {
    console.error('Error checking existing workouts:', error);
    return false;
  }

  return (data?.length ?? 0) > 0;
};
