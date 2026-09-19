import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient';
import { compileBlock } from './blockCompiler';
import { RULE_VERSION } from './trainingPolicy';
import type { RuntimeState, TrainingBlock, TrainingSource } from './types';

export { applySetResult } from './runtimeReducers';

const STORAGE_KEY_PREFIX = 'fitarc:training-runtime:v1';

export const emptyRuntimeState = (): RuntimeState => ({
  updatedAt: new Date(0).toISOString(),
  source: null, block: null, activeSession: null, sessions: [], setResults: [],
  workingSets: {}, decisions: [], committedSessionIds: [], lastBlockDiff: [],
});

export const loadRuntimeState = async (userId: string): Promise<RuntimeState> => {
  const raw = await AsyncStorage.getItem(`${STORAGE_KEY_PREFIX}:${userId}`);
  let localState: RuntimeState | null = null;
  if (raw) {
    try {
      localState = { ...emptyRuntimeState(), ...(JSON.parse(raw) as RuntimeState) };
    } catch {
      localState = null;
    }
  }
  let remoteState: RuntimeState | null = null;
  try {
    const { data, error } = await supabase
      .from('fitarc_runtime_state')
      .select('state')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data?.state) remoteState = data.state as RuntimeState;
  } catch {
    remoteState = null;
  }
  const resolvedRemote = remoteState ? { ...emptyRuntimeState(), ...remoteState } : null;
  const resolved = resolvedRemote && (!localState || resolvedRemote.updatedAt >= localState.updatedAt)
    ? resolvedRemote
    : localState;
  if (resolved) {
    const needsBlockUpgrade = Boolean(
      resolved.source && resolved.block
      && (resolved.block.ruleVersion !== RULE_VERSION || !resolved.block.weeklySetBudget || resolved.block.slots.some((slot) => !slot.plannedExercises || !slot.muscleSetBudget))
    );
    const compatible = needsBlockUpgrade && resolved.source && resolved.block
      ? {
          ...resolved,
          block: compileBlock(resolved.source, resolved.block, resolved.workingSets),
          activeSession: null,
          sessions: resolved.sessions.filter((session) => session.status === 'committed'),
          lastBlockDiff: ['Runtime rules upgraded to unified weekly hard-set budgets.'],
        }
      : resolved;
    await AsyncStorage.setItem(`${STORAGE_KEY_PREFIX}:${userId}`, JSON.stringify(compatible));
    return compatible;
  }
  return emptyRuntimeState();
};

export type SaveOutcome = {
  /** The device copy is always written first; a failure there rejects instead of returning. */
  cloud: 'synced' | 'unavailable';
};

export const saveRuntimeState = async (userId: string, state: RuntimeState): Promise<SaveOutcome> => {
  await AsyncStorage.setItem(`${STORAGE_KEY_PREFIX}:${userId}`, JSON.stringify(state));
  try {
    const { error } = await supabase.from('fitarc_runtime_state').upsert({
      user_id: userId,
      state,
      updated_at: new Date().toISOString(),
    });
    if (!error) return { cloud: 'synced' };
    if (!['42P01', 'PGRST205'].includes((error as { code?: string }).code ?? '')) {
      console.warn('Runtime cloud sync failed; local state is preserved.', error.message);
    }
    return { cloud: 'unavailable' };
  } catch {
    // Local persistence is authoritative while offline.
    return { cloud: 'unavailable' };
  }
};

export const withSourceAndBlock = (
  state: RuntimeState,
  source: TrainingSource,
  block: TrainingBlock
): RuntimeState => ({ ...state, source, block, activeSession: null });
