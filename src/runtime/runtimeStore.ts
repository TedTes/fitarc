import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient';
import { loadExerciseCatalog } from '../services/exerciseCatalogService';
import { toStoredTraining, fromStoredTraining } from './trainingState';
import { createRuntimeId } from './id';
import { createRuntimePersistence } from './runtimePersistence';
import type { DeviceSnapshot, RemoteSnapshot } from './runtimePersistence';
import type { RuntimeState, TrainingBlock, TrainingSource } from './types';

export { emptyRuntimeState } from './runtimePersistence';
export { applySetResult } from './runtimeReducers';
const keyFor = (userId: string) => `fitarc:training-runtime:v3:${userId}`;
const stores = new Map<string, ReturnType<typeof createRuntimePersistence>>();
const persistence = (userId: string) => {
  const existing = stores.get(userId);
  if (existing) return existing;
  const store = createRuntimePersistence({
    createId: createRuntimeId,
    readLocal: async () => {
      const raw = await AsyncStorage.getItem(keyFor(userId));
      if (!raw) return null;
      const value = JSON.parse(raw) as DeviceSnapshot;
      if (!value.state || !Number.isInteger(value.revision) || value.revision < 0
        || !Array.isArray(value.state.sessions)) throw new Error('Invalid device training data.');
      return { ...value, state: fromStoredTraining(value.state as unknown as import('./dataModel').StoredTrainingState), pendingState: value.pendingState ? fromStoredTraining(value.pendingState as unknown as import('./dataModel').StoredTrainingState) : undefined };
    },
    writeLocal: async (value) => AsyncStorage.setItem(keyFor(userId), JSON.stringify({ ...value, state: toStoredTraining(value.state), pendingState: value.pendingState ? toStoredTraining(value.pendingState) : undefined })),
    backup: async (value) => AsyncStorage.setItem(`${keyFor(userId)}:conflict:${createRuntimeId()}`, JSON.stringify({ ...value, state: toStoredTraining(value.state), pendingState: value.pendingState ? toStoredTraining(value.pendingState) : undefined })),
    readRemote: async () => {
      const { data, error } = await supabase.rpc('fitarc_read_training');
      if (error) throw error;
      if (data?.userId !== userId) throw new Error('Signed-in account changed.');
      return { ...data, state: data.state ? fromStoredTraining(data.state) : null } as RemoteSnapshot;
    },
    writeRemote: async (state, revision, mutationId) => {
      const payload = toStoredTraining(state);
      const { data, error } = await supabase.rpc('fitarc_save_training', {
        p_state: payload, p_expected_revision: revision, p_mutation_id: mutationId,
      });
      if (error) throw error;
      return data as { revision: number; conflict: boolean };
    },
  });
  stores.set(userId, store);
  return store;
};

export async function loadRuntimeState(userId: string) {
  const [loaded, catalog] = await Promise.all([persistence(userId).load(), loadExerciseCatalog()]);
  return { ...loaded, state: { ...loaded.state, catalog } };
}
export const saveRuntimeState = (userId: string, state: RuntimeState) => persistence(userId).save(state);
export const useCloudRuntimeState = (userId: string) => persistence(userId).useCloud();
export const withSourceAndBlock = (state: RuntimeState, source: TrainingSource, block: TrainingBlock): RuntimeState =>
  ({ ...state, source, block, activeSession: null });

export const stageRuntimeState = (userId: string, state: RuntimeState) => persistence(userId).stage(state);
export const flushRuntimeState = (userId: string) => persistence(userId).flush();
