export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type TrainingSplit =
  | 'full_body'
  | 'upper_lower'
  | 'push_pull_legs'
  | 'bro_split'
  | 'custom';

export type EatingMode = 'mild_deficit' | 'recomp' | 'lean_bulk' | 'maintenance';

export type MuscleGroup = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull';

export type LiftId = 'bench_press' | 'squat' | 'deadlift';
export type HabitType = 'steps' | 'sleep' | 'hydration';

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
  sex: 'male' | 'female' | 'other';
  age: number;
  heightCm: number;
  experienceLevel: ExperienceLevel;
  currentPhysiqueLevel: number;
  trainingSplit: TrainingSplit;
  eatingMode: EatingMode;
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

export const APP_STATE_VERSION = 2;

export type AppState = {
  user: User | null;
  currentPhase: PhasePlan | null;
  photoCheckins: PhotoCheckin[];
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
  workoutSessions: WorkoutSessionEntry[];
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
  mealPlans: [],
  nextPhotoReminder: null,
  progressEstimate: null,
  workoutDataVersion: 0,
  version: APP_STATE_VERSION,
  lastModified: new Date().toISOString(),
});
