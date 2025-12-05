import { AppState } from '../types/domain';

/**
 * Storage Adapter Interface
 * 
 * This abstraction allows us to swap storage implementations
 * (AsyncStorage, Supabase, REST API, etc.) without changing
 * any business logic or UI code.
 * 
 * The app depends on this interface, not on concrete implementations.
 */
export interface StorageAdapter {
  /**
   * Load the entire app state from storage
   * Returns null if no state exists (first time user)
   */
  getAppState(): Promise<AppState | null>;

  /**
   * Save the entire app state to storage
   * Overwrites existing state completely
   */
  saveAppState(state: AppState): Promise<void>;

  /**
   * Clear all stored data
   * Used for testing, logout, or reset functionality
   */
  clearAll(): Promise<void>;
}