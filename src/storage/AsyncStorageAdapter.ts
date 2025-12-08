import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppState,
  DailyConsistencyLog,
  HabitLog,
  PhasePlan,
  WorkoutLog,
  StrengthSnapshot,
  MuscleGroup,
  MovementPattern,
  WorkoutSessionEntry,
  DailyMealPlan,
} from '../types/domain';
import { StorageAdapter } from './StorageAdapter';

const STORAGE_KEY = '@fitarc:app_state_v1';

const sanitizeDailyConsistencyLog = (log: any): DailyConsistencyLog => {
  return {
    ...log,
    isConsistent: log.isConsistent === true || log.isConsistent === 'true',
  };
};

const emptyMuscleVolume: Record<MuscleGroup, number> = {
  chest: 0,
  back: 0,
  legs: 0,
  shoulders: 0,
  arms: 0,
  core: 0,
};

const emptyMovementVolume: Record<MovementPattern, number> = {
  squat: 0,
  hinge: 0,
  horizontal_push: 0,
  vertical_push: 0,
  horizontal_pull: 0,
  vertical_pull: 0,
};

const sanitizeWorkoutLog = (log: any): WorkoutLog => ({
  id: log.id || `workout_${Date.now()}`,
  date: log.date || new Date().toISOString(),
  phasePlanId: log.phasePlanId || 'unknown',
  muscleVolume: {
    ...emptyMuscleVolume,
    ...(log.muscleVolume || {}),
  },
  movementPatterns: {
    ...emptyMovementVolume,
    ...(log.movementPatterns || {}),
  },
  lifts: Array.isArray(log.lifts)
    ? log.lifts.map((lift: any) => ({
        lift: lift.lift || 'bench_press',
        weight: Number(lift.weight) || 0,
        reps: Number(lift.reps) || 0,
      }))
    : [],
});

const sanitizeStrengthSnapshot = (snapshot: any): StrengthSnapshot => ({
  id: snapshot.id || `strength_${Date.now()}`,
  phasePlanId: snapshot.phasePlanId || 'unknown',
  lift: snapshot.lift || 'bench_press',
  date: snapshot.date || new Date().toISOString(),
  weight: Number(snapshot.weight) || 0,
  reps: Number(snapshot.reps) || 0,
});

const sanitizeWorkoutSession = (session: any): WorkoutSessionEntry => ({
  id: session.id || `session_${Date.now()}`,
  date: session.date || new Date().toISOString(),
  phasePlanId: session.phasePlanId || 'unknown',
  exercises: Array.isArray(session.exercises)
    ? session.exercises
        .filter((exercise: any) => !!exercise)
        .map((exercise: any) => ({
          name: exercise.name || 'Exercise',
          bodyParts: Array.isArray(exercise.bodyParts) ? exercise.bodyParts : [],
          completed: !!exercise.completed,
          sets: Number(exercise.sets) || 4,
          reps: typeof exercise.reps === 'string' ? exercise.reps : '8-10',
        }))
    : [],
  completedAt: session.completedAt || undefined,
});

const sanitizeMealPlan = (plan: any): DailyMealPlan => ({
  id: plan.id || `meal_${Date.now()}`,
  date: plan.date || new Date().toISOString(),
  phasePlanId: plan.phasePlanId || 'unknown',
  meals: Array.isArray(plan.meals)
    ? plan.meals.map((meal: any) => ({
        title: meal.title || 'Meal',
        items: Array.isArray(meal.items) ? meal.items.map((item: any) => String(item)) : [],
        completed: !!meal.completed,
      }))
    : [],
});

const sanitizeHabitLog = (log: any): HabitLog => ({
  id: log.id || `habit_${Date.now()}`,
  date: log.date || new Date().toISOString(),
  phasePlanId: log.phasePlanId || 'unknown',
  habits: {
    steps: log.habits?.steps === true,
    sleep: log.habits?.sleep === true,
    hydration: log.habits?.hydration === true,
  },
});

const sanitizePhasePlan = (phase: any): PhasePlan | null => {
  if (!phase) return null;
  
  return {
    ...phase,
    currentLevelId: Number(phase.currentLevelId) || 0,
    targetLevelId: Number(phase.targetLevelId) || 0,
    expectedWeeks: Number(phase.expectedWeeks) || 0,
  };
};

const sanitizeState = (state: any): AppState => {
  return {
    ...state,
    user: state.user ? {
      ...state.user,
      age: Number(state.user.age) || 0,
      heightCm: Number(state.user.heightCm) || 0,
      currentPhysiqueLevel: Number(state.user.currentPhysiqueLevel) || 1,
      trainingSplit: state.user.trainingSplit || 'full_body',
      eatingMode: state.user.eatingMode || 'maintenance',
    } : null,
    currentPhase: sanitizePhasePlan(state.currentPhase),
    dailyConsistency: (state.dailyConsistency || []).map(sanitizeDailyConsistencyLog),
    photoCheckins: state.photoCheckins || [],
    progressEstimate: state.progressEstimate ? {
      ...state.progressEstimate,
      progressPercent: Number(state.progressEstimate.progressPercent) || 0,
      daysActive: Number(state.progressEstimate.daysActive) || 0,
      daysLogged: Number(state.progressEstimate.daysLogged) || 0,
    } : null,
    workoutLogs: (state.workoutLogs || []).map(sanitizeWorkoutLog),
    strengthSnapshots: (state.strengthSnapshots || []).map(sanitizeStrengthSnapshot),
    workoutSessions: (state.workoutSessions || []).map(sanitizeWorkoutSession),
    mealPlans: (state.mealPlans || []).map(sanitizeMealPlan),
    habitLogs: (state.habitLogs || []).map(sanitizeHabitLog),
    nextPhotoReminder: state.nextPhotoReminder || null,
    version: Number(state.version) || 1,
  };
};

export class AsyncStorageAdapter implements StorageAdapter {
  async getAppState(): Promise<AppState | null> {
    try {
      const jsonString = await AsyncStorage.getItem(STORAGE_KEY);
      
      if (!jsonString) {
        return null;
      }

      const state: AppState = JSON.parse(jsonString);
      
      if (!state.version) {
        console.warn('Invalid state structure, returning null');
        return null;
      }

      return sanitizeState(state);
    } catch (error) {
      console.error('Error loading app state from AsyncStorage:', error);
      return null;
    }
  }

  async saveAppState(state: AppState): Promise<void> {
    try {
      const sanitized = sanitizeState(state);
      const stateWithTimestamp: AppState = {
        ...sanitized,
        lastModified: new Date().toISOString(),
      };

      const jsonString = JSON.stringify(stateWithTimestamp);
      await AsyncStorage.setItem(STORAGE_KEY, jsonString);
    } catch (error) {
      console.error('Error saving app state to AsyncStorage:', error);
      throw new Error('Failed to save app state');
    }
  }

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing AsyncStorage:', error);
      throw new Error('Failed to clear storage');
    }
  }

  getStorageKey(): string {
    return STORAGE_KEY;
  }
}
