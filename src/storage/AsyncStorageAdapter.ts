import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, DailyLog, PhasePlan } from '../types/domain';
import { StorageAdapter } from './StorageAdapter';

const STORAGE_KEY = '@fitarc:app_state_v1';

const sanitizeDailyLog = (log: any): DailyLog => {
  return {
    ...log,
    loggedActivity: log.loggedActivity === true || log.loggedActivity === 'true',
  };
};

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
    } : null,
    currentPhase: sanitizePhasePlan(state.currentPhase),
    dailyLogs: (state.dailyLogs || []).map(sanitizeDailyLog),
    photoCheckins: state.photoCheckins || [],
    progressEstimate: state.progressEstimate ? {
      ...state.progressEstimate,
      progressPercent: Number(state.progressEstimate.progressPercent) || 0,
      daysActive: Number(state.progressEstimate.daysActive) || 0,
      daysLogged: Number(state.progressEstimate.daysLogged) || 0,
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