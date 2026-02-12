export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type TrainingSplit =
  | 'full_body'
  | 'upper_lower'
  | 'push_pull_legs'
  | 'bro_split'
  | 'custom';

export type EatingMode = 'mild_deficit' | 'recomp' | 'lean_bulk' | 'maintenance';
export type PrimaryGoal =
  | 'build_muscle'
  | 'get_stronger'
  | 'lose_fat'
  | 'endurance'
  | 'general_fitness';
export type EquipmentLevel = 'bodyweight' | 'dumbbells' | 'full_gym';

export type PlanPreferences = {
  primaryGoal?: PrimaryGoal;
  daysPerWeek?: 3 | 4 | 5 | 6;
  equipmentLevel?: EquipmentLevel;
  injuries?: string[];
};

export type MuscleGroup = string;

export type MovementPattern = string;

export type LiftId = string;
export type HabitType = 'steps' | 'sleep' | 'hydration';

export type TrackingPreferences = {
  lifts?: Record<string, string>;
  movements?: Record<string, string>;
  muscles?: Record<string, string>;
};

export type MealPreferences = {
  cuisine: string;
  dietary_tags: string[];
  excluded_ingredients: string[];
  max_ready_time_minutes: number;
};

export type WorkoutSetEntry = {
  setNumber?: number | null;
  weight?: number | null;
  reps?: number | null;
  rpe?: number | null;
  restSeconds?: number | null;
};

export type WorkoutSessionExercise = {
  id?: string;  
  exerciseId?: string;
  name: string;
  bodyParts: MuscleGroup[];
  movementPattern?: MovementPattern;
  sets?: number;
  reps?: string;
  completed?: boolean; 
  displayOrder?: number;
  notes?: string;
  setDetails?: WorkoutSetEntry[];
};

export type WorkoutSessionEntry = {
  id: string;
  phasePlanId: string;
  date: string;
  exercises: WorkoutSessionExercise[];
  notes?: string;
  completed?: boolean; 
};

export type PlanWorkoutExercise = {
  id: string;
  planWorkoutId: string;
  exerciseId: string;
  name: string;
  bodyParts: MuscleGroup[];
  movementPattern?: MovementPattern;
  sets?: number;
  reps?: string;
  displayOrder?: number;
  notes?: string;
  sourceTemplateExerciseId?: string | null;
};

export type PlanWorkout = {
  id: string;
  planDayId: string;
  title?: string | null;
  sourceTemplateId?: string | null;
  sourceType?: string | null;
  exercises: PlanWorkoutExercise[];
};

export type PlanDay = {
  id: string;
  planId: string;
  userId: string;
  date: string;
  workout: PlanWorkout | null;
};

export type MealPlanMeal = {
  title: string;
  items: string[];
  completed: boolean;
};

export type DailyMealPlan = {
  id: string;
  date: string;
  phasePlanId: string;
  meals: MealPlanMeal[];
  completed: boolean;
};

export type User = {
  id: string;
  name?: string;
  sex: 'male' | 'female' | 'other';
  age: number;
  heightCm: number;
  weightKg?: number | null;
  experienceLevel: ExperienceLevel;
  currentPhysiqueLevel: number;
  trainingSplit: TrainingSplit;
  eatingMode: EatingMode;
  avatarUrl?: string;
  avatarPath?: string;
  trackingPreferences?: TrackingPreferences;
  mealPreferences?: MealPreferences;
  planPreferences?: PlanPreferences;
  createdAt: string;
};


export type PhasePlanStatus = 'active' | 'completed';

export type PhasePlan = {
  id: string;
  currentLevelId: number;
  targetLevelId: number;
  name?: string;
  goalType?: string;
  startDate: string;
  expectedEndDate: string;
  expectedWeeks: number;
  status: PhasePlanStatus;
  createdAt: string;
  updatedAt?: string;
};

export type DailyConsistencyLog = {
  id: string;
  date: string; // "YYYY-MM-DD"
  phasePlanId: string;
  isConsistent: boolean; // Did user mark day as consistent?
  createdAt: string;
};

export type PhotoCheckin = {
  id: string;
  date: string;
  phasePlanId: string;
  frontUri: string;
  sideUri?: string;
  note?: string;
  createdAt: string;
};

export type ProgressEstimate = {
  phasePlanId: string;
  lastUpdated: string;
  progressPercent: number;
  daysActive: number;
  daysLogged: number;
};

export type WorkoutLog = {
  id: string;
  date: string;
  phasePlanId: string;
  sessionId?: string;
  isCompleted?: boolean;
  totalSets?: number;
  totalVolume?: number;
  musclesHit?: MuscleGroup[];
  movementPatternsHit?: MovementPattern[];
  muscleVolume: Record<MuscleGroup, number>;
  movementPatterns: Record<MovementPattern, number>;
  lifts: {
    lift: LiftId;
    weight: number;
    reps: number;
  }[];
};

export type StrengthSnapshot = {
  id: string;
  phasePlanId: string;
  exerciseId?: string;
  exerciseName?: string;
  lift?: LiftId;
  date: string;
  weight: number;
  reps: number;
  totalSets?: number;
  totalReps?: number;
  estimated1RM?: number;
};

export type HabitLog = {
  id: string;
  date: string;
  phasePlanId: string;
  habits: Record<HabitType, boolean>;
};

export const APP_STATE_VERSION = 3;

export type AppState = {
  user: User | null;
  currentPhase: PhasePlan | null;
  photoCheckins: PhotoCheckin[];
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
  workoutSessions: WorkoutSessionEntry[];
  plannedWorkouts: PlanDay[];
  mealPlans: DailyMealPlan[];
  nextPhotoReminder: string | null;
  progressEstimate: ProgressEstimate | null;
  workoutDataVersion: number;
  version: number;
  lastModified: string;
};

export const createEmptyAppState = (): AppState => ({
  user: null,
  currentPhase: null,
  photoCheckins: [],
  workoutLogs: [],
  strengthSnapshots: [],
  workoutSessions: [],
  plannedWorkouts: [],
  mealPlans: [],
  nextPhotoReminder: null,
  progressEstimate: null,
  workoutDataVersion: 0,
  version: APP_STATE_VERSION,
  lastModified: new Date().toISOString(),
});
