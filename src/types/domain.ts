/**
 * Core Domain Types for Physique Ladder MVP
 * 
 * These types represent the business domain and should remain
 * independent of any storage mechanism (AsyncStorage, Supabase, etc.)
 */

// ============================================================================
// USER
// ============================================================================

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type User = {
  id: string; // UUID, generated locally for now
  sex: 'male' | 'female' | 'other';
  age: number;
  heightCm: number;
  experienceLevel: ExperienceLevel;
  createdAt: string; // ISO date string
};

// ============================================================================
// WORKOUT
// ============================================================================

export type WorkoutExercise = {
  name: string;
  sets: number;
  repsRange: string; // e.g. "8-12", "10-15"
  notes?: string;
};

export type WorkoutSession = {
  id: string; // UUID
  name: string; // e.g. "Upper A", "Lower B", "Full Body"
  dayHint?: string; // e.g. "Mon/Thu", "Tue/Fri" - suggested training days
  exercises: WorkoutExercise[];
};

// ============================================================================
// DIET
// ============================================================================

export type DietModeType = 'mild_deficit' | 'recomp' | 'lean_bulk';

export type DietMode = {
  modeType: DietModeType;
  description: string; // Brief explanation of the diet approach
  rules: string[]; // Simple daily behaviors, e.g. ["2+ palm-sized protein meals", "No sugary drinks"]
};

// ============================================================================
// HABITS
// ============================================================================

export type HabitTargets = {
  minStepsPerDay?: number;
  minSleepHours?: number;
};

// ============================================================================
// PHASE PLAN
// ============================================================================

export type PhaseType = 'cut' | 'lean_bulk' | 'recomp' | 'base_strength';
export type PhasePlanStatus = 'active' | 'completed' | 'abandoned';

export type PhasePlan = {
  id: string; // UUID
  currentLevelId: number; // e.g. 2 (where user started)
  targetLevelId: number; // e.g. 3 (where user is aiming)
  targetCardId: string; // Reference to specific visual target (for later use)
  
  startDate: string; // ISO date string
  expectedEndDate: string; // ISO date string - calculated from expectedWeeks
  expectedWeeks: number; // e.g. 8 - system-determined duration
  
  phaseType: PhaseType;
  workoutSessions: WorkoutSession[]; // Array of workout templates
  dietMode: DietMode;
  habitTargets: HabitTargets;
  
  status: PhasePlanStatus;
  createdAt: string; // ISO date string
};

// ============================================================================
// DAILY ADHERENCE
// ============================================================================

export type DailyAdherenceLog = {
  id: string; // UUID
  date: string; // "YYYY-MM-DD" format
  phasePlanId: string;
  
  workoutDone: boolean;
  dietFollowed: boolean; // Simple yes/no for MVP
  
  habits: {
    stepsTargetMet?: boolean;
    sleepTargetMet?: boolean;
  };
  
  adherenceScore: number; // 0-100, calculated as: workout(40) + diet(40) + habits(20)
  
  createdAt: string; // ISO timestamp
};

// ============================================================================
// PHOTO CHECK-IN
// ============================================================================

export type PhotoCheckin = {
  id: string; // UUID
  date: string; // ISO date string
  phasePlanId: string; // 'baseline' for initial photos, otherwise phase ID
  
  frontUri: string; // Local file URI (file:// or content://)
  sideUri?: string;
  backUri?: string;
  
  note?: string; // Optional user note
  
  createdAt: string; // ISO timestamp
};

// ============================================================================
// PROGRESS ESTIMATE
// ============================================================================

export type ProgressEstimate = {
  phasePlanId: string;
  lastUpdated: string; // ISO timestamp
  progressPercent: number; // 0-100
  
  // Metadata for debugging/transparency
  averageAdherence?: number; // Average adherence score over evaluation period
  weeksElapsed?: number;
};

// ============================================================================
// APP STATE (Root State Object)
// ============================================================================

/**
 * Single source of truth for the entire app state.
 * This is persisted as a single JSON blob in local storage.
 */
export type AppState = {
  user: User | null;
  currentPhase: PhasePlan | null; // Only one active phase at a time in MVP
  
  adherenceLogs: DailyAdherenceLog[];
  photoCheckins: PhotoCheckin[];
  progressEstimate: ProgressEstimate | null;
  
  // Metadata
  version: number; // For migration support later
  lastModified: string; // ISO timestamp
};

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Initial empty state
 */
export const createEmptyAppState = (): AppState => ({
  user: null,
  currentPhase: null,
  adherenceLogs: [],
  photoCheckins: [],
  progressEstimate: null,
  version: 1,
  lastModified: new Date().toISOString(),
});