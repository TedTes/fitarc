import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyRuntimeState, loadRuntimeState, stageRuntimeState, flushRuntimeState, useCloudRuntimeState } from '../../runtime';
import { retainTrainingHistory } from '../../runtime/runtimePersistence';
import type { RuntimeState } from '../../runtime';

/**
 * saving  – a write is in flight
 * synced  – saved on this device and in the cloud
 * device  – saved on this device only; the cloud copy is behind and catches up on the next save or retry
 * conflict – another device advanced the cloud revision; local changes are preserved
 * failed  – the device write failed; changes exist only on screen
 */
export type SyncStatus = 'saving' | 'synced' | 'device' | 'failed' | 'conflict';
export type ApplyResult = { ok: true; state: RuntimeState } | { ok: false; error: unknown };

/**
 * Owns the runtime state. Every change goes through `apply`, which reads the latest state
 * (never a stale closure), captures engine errors instead of throwing into render, and queues
 * persistence so writes land in order.
 */
export const useRuntimeController = (userId: string) => {
  const [state, setState] = useState<RuntimeState>(emptyRuntimeState());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>('synced');
  const latest = useRef(state);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const generation = useRef(0);
  const restoringCloud = useRef(false);
  const deviceQueue = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    loadRuntimeState(userId)
      .then((loaded) => { latest.current = loaded.state; setState(loaded.state); setSync(loaded.cloud === 'unavailable' ? 'device' : loaded.cloud); })
      .catch(() => setLoadError('Saved runtime state could not be read from this device.'))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(load, [load]);

  const persist = useCallback((next: RuntimeState) => {
    const mine = ++generation.current;
    setSync('saving');
    deviceQueue.current = deviceQueue.current.catch(() => undefined).then(() => stageRuntimeState(userId, next));
    const staged = deviceQueue.current;
    queue.current = staged
      .then(() => flushRuntimeState(userId))
      .then((outcome) => { if (mine === generation.current) setSync(outcome.cloud === 'unavailable' ? 'device' : outcome.cloud); })
      .catch(() => { if (mine === generation.current) setSync('failed'); });
  }, [userId]);

  const apply = useCallback((transform: (current: RuntimeState) => RuntimeState): ApplyResult => {
    try {
      if (restoringCloud.current) throw new Error('Wait until cloud restoration finishes.');
      const next = retainTrainingHistory(latest.current, { ...transform(latest.current), updatedAt: new Date().toISOString() });
      latest.current = next;
      setState(next);
      persist(next);
      return { ok: true, state: next };
    } catch (error) {
      return { ok: false, error };
    }
  }, [persist]);

  /** Writes the current state again, e.g. after a failed or device-only save. */
  const retrySync = useCallback(() => persist(latest.current), [persist]);

  const restoreCloud = useCallback(async () => {
    restoringCloud.current = true;
    setLoading(true);
    try {
      await deviceQueue.current;
      await queue.current;
      await useCloudRuntimeState(userId);
      load();
    } catch (error) {
      setLoading(false);
      throw error;
    } finally { restoringCloud.current = false; }
  }, [load, userId]);

  return { restoreCloud, state, loading, loadError, reload: load, sync, apply, retrySync };
};
