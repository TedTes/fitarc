/**
 * Storage module exports
 * 
 * Provides a clean API for importing storage-related functionality
 */

import type { StorageAdapter } from './StorageAdapter';
import { AsyncStorageAdapter } from './AsyncStorageAdapter';

// Re-export types and classes
export type { StorageAdapter } from './StorageAdapter';
export { AsyncStorageAdapter } from './AsyncStorageAdapter';

/**
 * Factory function to create default storage adapter
 * 
 * This makes it easy to swap implementations later:
 * - For MVP: returns AsyncStorageAdapter
 * - Later: could return SupabaseAdapter, SQLiteAdapter, etc.
 */
export const createStorageAdapter = (): StorageAdapter => {
  return new AsyncStorageAdapter();
};