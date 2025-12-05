import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, DailyAdherenceLog, PhasePlan } from '../types/domain';
import { StorageAdapter } from './StorageAdapter';

const STORAGE_KEY = '@physique_ladder:app_state_v1';

const sanitizeAdherenceLog = (log: any): DailyAdherenceLog => {
  return {
    ...log,
    workoutDone: log.workoutDone === true || log.workoutDone === 'true',
    dietFollowed: log.dietFollowed === true || log.dietFollowed === 'true',
    adherenceScore: Number(log.adherenceScore) || 0,
    habits: {
      stepsTargetMet: log.habits?.stepsTargetMet === true || log.habits?.stepsTargetMet === 'true' ? true : 
                      log.habits?.stepsTargetMet === false || log.habits?.stepsTargetMet === 'false' ? false : undefined,
      sleepTargetMet: log.habits?.sleepTargetMet === true || log.habits?.sleepTargetMet === 'true' ? true :
                      log.habits?.sleepTargetMet === false || log.habits?.sleepTargetMet === 'false' ? false : undefined,
    },
  };
};

const sanitizePhasePlan = (phase: any): PhasePlan | null => {
  if (!phase) return null;
  
  return {
    ...phase,
    currentLevelId: Number(phase.currentLevelId) || 0,
    targetLevelId: Number(phase.targetLevelId) || 0,
    expectedWeeks: Number(phase.expectedWeeks) || 0,
    habitTargets: {
      minStepsPerDay: phase.habitTargets?.minStepsPerDay ? Number(phase.habitTargets.minStepsPerDay) : undefined,
      minSleepHours: phase.habitTargets?.minSleepHours ? Number(phase.habitTargets.minSleepHours) : undefined,
    },
  };
};

const sanitizeState = (state: any): AppState => {
  return {
    ...state,
    user: state.user ? {
      ...state.user,
      age: Number(state.user.age) || 0,
      heightCm: Number(state.user.heightCm) || 0,
    } : null,
    currentPhase: sanitizePhasePlan(state.currentPhase),
    adherenceLogs: (state.adherenceLogs || []).map(sanitizeAdherenceLog),
    photoCheckins: state.photoCheckins || [],
    progressEstimate: state.progressEstimate ? {
      ...state.progressEstimate,
      progressPercent: Number(state.progressEstimate.progressPercent) || 0,
      averageAdherence: state.progressEstimate.averageAdherence ? Number(state.progressEstimate.averageAdherence) : undefined,
      weeksElapsed: state.progressEstimate.weeksElapsed ? Number(state.progressEstimate.weeksElapsed) : undefined,
    } : null,
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