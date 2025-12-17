import { User, WorkoutSessionExercise, MuscleGroup } from '../types/domain';
import { ExerciseCatalogEntry } from './exerciseCatalogService';
import { supabase } from '../lib/supabaseClient';
import { formatLocalDateYMD } from '../utils/date';

type WorkoutTemplate = {
  id: string;
  title: string;
  exercises: string[]; // Exercise names from catalog
};

const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'upper_push',
    title: 'Upper Push',
    exercises: [
      'Barbell Bench Press',
      'Incline Dumbbell Press',
      'Cable Flyes',
      'Overhead Barbell Press',
      'Dumbbell Lateral Raise',
    ],
  },
  {
    id: 'upper_pull',
    title: 'Upper Pull',
    exercises: [
      'Bent Over Barbell Row',
      'Seated Cable Row',
      'Lat Pulldown',
      'Pull-Up',
      'Face Pull',
    ],
  },
  {
    id: 'lower_strength',
    title: 'Lower Strength',
    exercises: [
      'Barbell Back Squat',
      'Romanian Deadlift',
      'Leg Press',
      'Barbell Hip Thrust',
      'Walking Lunges',
    ],
  },
  {
    id: 'full_body',
    title: 'Full Body',
    exercises: [
      'Barbell Back Squat',
      'Barbell Bench Press',
      'Bent Over Barbell Row',
      'Overhead Barbell Press',
      'Romanian Deadlift',
    ],
  },
];

const TEMPLATE_SEQUENCE: Record<User['trainingSplit'], WorkoutTemplate['id'][]> = {
  full_body: ['full_body', 'full_body', 'full_body'],
  upper_lower: ['upper_push', 'lower_strength', 'upper_pull', 'lower_strength'],
  push_pull_legs: ['upper_push', 'upper_pull', 'lower_strength', 'upper_push', 'upper_pull', 'lower_strength'],
  bro_split: ['upper_push', 'upper_pull', 'lower_strength', 'upper_push', 'upper_pull'],
  custom: ['upper_push', 'upper_pull', 'lower_strength'],
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
    
    // Get template sequence for user's training split
    const sequence = TEMPLATE_SEQUENCE[trainingSplit] || TEMPLATE_SEQUENCE.custom;
    
    // Generate 7 days of workouts
    const sessionsToCreate: Array<{
      date: string;
      exercises: ExerciseCatalogEntry[];
      templateTitle: string;
    }> = [];
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const workoutDate = new Date(startDate);
      workoutDate.setDate(startDate.getDate() + dayOffset);
      const dateStr = formatLocalDateYMD(workoutDate);
      
      // Get template for this day (cycling through sequence)
      const templateId = sequence[dayOffset % sequence.length];
      const template = WORKOUT_TEMPLATES.find(t => t.id === templateId);
      
      if (!template) {
        console.warn(`⚠️ Template ${templateId} not found`);
        continue;
      }
      
      // Find exercises from catalog by name
      const exercises = template.exercises
        .map(name => exerciseCatalog.find(ex => ex.name === name))
        .filter((ex): ex is ExerciseCatalogEntry => !!ex);
      
      if (exercises.length === 0) {
        console.warn(`⚠️ No exercises found for template ${template.id}`);
        continue;
      }
      
      sessionsToCreate.push({
        date: dateStr,
        exercises,
        templateTitle: template.title,
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
          session.exercises
        );
        successCount++;
        console.log(`✅ Created ${session.templateTitle} for ${session.date}`);
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
  exercises: ExerciseCatalogEntry[]
): Promise<void> => {
  // 1. Create workout session
  const { data: session, error: sessionError } = await supabase
    .from('fitarc_workout_sessions')
    .insert({
      user_id: userId,
      plan_id: phaseId,
      performed_at: date,
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