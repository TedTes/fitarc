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

export type WorkoutSessionExercise = {
  name: string;
  bodyParts: MuscleGroup[];
  completed: boolean;
  sets: number;
  reps: string;
};

export type WorkoutSessionEntry = {
  id: string;
  date: string;
  phasePlanId: string;
  exercises: WorkoutSessionExercise[];
  completedAt?: string;
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
  
  startDate: string;
  expectedEndDate: string;
  expectedWeeks: number;
  
  status: PhasePlanStatus;
  createdAt: string;
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
  lift: LiftId;
  date: string;
  weight: number;
  reps: number;
};

export type HabitLog = {
  id: string;
  date: string;
  phasePlanId: string;
  habits: Record<HabitType, boolean>;
};

export type AppState = {
  user: User | null;
  currentPhase: PhasePlan | null;
  dailyConsistency: DailyConsistencyLog[];
  photoCheckins: PhotoCheckin[];
  progressEstimate: ProgressEstimate | null;
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
  workoutSessions: WorkoutSessionEntry[];
  mealPlans: DailyMealPlan[];
  habitLogs: HabitLog[];
  nextPhotoReminder: string | null;
  version: number;
  lastModified: string;
};

export const createEmptyAppState = (): AppState => ({
  user: null,
  currentPhase: null,
  dailyConsistency: [],
  photoCheckins: [],
  progressEstimate: null,
  workoutLogs: [],
  strengthSnapshots: [],
  workoutSessions: [],
  mealPlans: [],
  habitLogs: [],
  nextPhotoReminder: null,
  version: 1,
  lastModified: new Date().toISOString(),
});
