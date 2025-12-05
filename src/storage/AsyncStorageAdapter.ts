import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from '../types/domain';
import { StorageAdapter } from './StorageAdapter';

const STORAGE_KEY = '@physique_ladder:app_state_v1';

const sanitizeState = (state: any): AppState => {
  return {
    ...state,
    currentPhase: state.currentPhase ? {
      ...state.currentPhase,
      habitTargets: {
        minStepsPerDay: state.currentPhase.habitTargets?.minStepsPerDay ? Number(state.currentPhase.habitTargets.minStepsPerDay) : undefined,
        minSleepHours: state.currentPhase.habitTargets?.minSleepHours ? Number(state.currentPhase.habitTargets.minSleepHours) : undefined,
      },
    } : null,
    adherenceLogs: state.adherenceLogs?.map((log: any) => ({
      ...log,
      workoutDone: Boolean(log.workoutDone),
      dietFollowed: Boolean(log.dietFollowed),
      habits: {
        stepsTargetMet: log.habits?.stepsTargetMet !== undefined ? Boolean(log.habits.stepsTargetMet) : undefined,
        sleepTargetMet: log.habits?.sleepTargetMet !== undefined ? Boolean(log.habits.sleepTargetMet) : undefined,
      },
    })) || [],
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