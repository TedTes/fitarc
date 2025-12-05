import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from '../types/domain';
import { StorageAdapter } from './StorageAdapter';

/**
 * AsyncStorage Implementation of StorageAdapter
 * 
 * Stores entire AppState as a single JSON blob under one key.
 * Simple, suitable for MVP with local-only data.
 * 
 * Future: Can be replaced with Supabase, SQLite, or REST API
 * without changing any code that depends on StorageAdapter interface.
 */

const STORAGE_KEY = '@physique_ladder:app_state_v1';

export class AsyncStorageAdapter implements StorageAdapter {
  /**
   * Load app state from AsyncStorage
   */
  async getAppState(): Promise<AppState | null> {
    try {
      const jsonString = await AsyncStorage.getItem(STORAGE_KEY);
      
      if (!jsonString) {
        // First time user - no data yet
        return null;
      }

      const state: AppState = JSON.parse(jsonString);
      
      // Basic validation
      if (!state.version) {
        console.warn('Invalid state structure, returning null');
        return null;
      }

      return state;
    } catch (error) {
      console.error('Error loading app state from AsyncStorage:', error);
      return null;
    }
  }

  /**
   * Save app state to AsyncStorage
   * Updates lastModified timestamp automatically
   */
  async saveAppState(state: AppState): Promise<void> {
    try {
      const stateWithTimestamp: AppState = {
        ...state,
        lastModified: new Date().toISOString(),
      };

      const jsonString = JSON.stringify(stateWithTimestamp);
      await AsyncStorage.setItem(STORAGE_KEY, jsonString);
    } catch (error) {
      console.error('Error saving app state to AsyncStorage:', error);
      throw new Error('Failed to save app state');
    }
  }

  /**
   * Clear all app data from storage
   */
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing AsyncStorage:', error);
      throw new Error('Failed to clear storage');
    }
  }

  /**
   * Get storage key (useful for debugging)
   */
  getStorageKey(): string {
    return STORAGE_KEY;
  }
}