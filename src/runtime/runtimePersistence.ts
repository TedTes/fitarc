import type { RuntimeState, TrainingBlock } from './types';

export const emptyRuntimeState = (): RuntimeState => ({
  updatedAt: new Date(0).toISOString(), source: null, block: null, activeSession: null,
  sessions: [], setResults: [], workingSets: {}, decisions: [], committedSessionIds: [], lastBlockDiff: [],
  blockHistory: [],
});
export type CloudStatus = 'synced' | 'unavailable' | 'conflict';
export type RemoteSnapshot = { revision: number; mutationId: string | null; state: RuntimeState | null };
export type DeviceSnapshot = { revision: number; state: RuntimeState; pendingId: string | null; pendingState?: RuntimeState };
export type PersistenceDependencies = {
  readLocal: () => Promise<DeviceSnapshot | null>;
  writeLocal: (value: DeviceSnapshot) => Promise<void>;
  readRemote: () => Promise<RemoteSnapshot>;
  writeRemote: (state: RuntimeState, revision: number, mutationId: string) => Promise<{ revision: number; conflict: boolean }>;
  backup: (value: DeviceSnapshot) => Promise<void>;
  createId: () => string;
};

/** Preserve configuration and block versions even when several are created while offline. */
export function retainTrainingHistory(previous: RuntimeState, next: RuntimeState): RuntimeState {
  const versions = <T extends TrainingBlock>(items: Array<T | null | undefined>) =>
    [...new Map(items.filter((item): item is T => Boolean(item)).map((item) => [`${item.id}:${item.version}`, item])).values()];
  return { ...next,
    blockHistory: versions([...(previous.blockHistory ?? []), previous.block, ...(next.blockHistory ?? []), next.block]),
  };
}

/** A serialized local outbox with server revision checks. Device timestamps never decide ownership. */
export function createRuntimePersistence(deps: PersistenceDependencies) {
  let deviceQueue: Promise<unknown> = Promise.resolve();
  const device = <T>(action: () => Promise<T>): Promise<T> => {
    const next = deviceQueue.catch(() => undefined).then(action);
    deviceQueue = next;
    return next;
  };
  const stage = (state: RuntimeState) => device(async () => {
    const local = await deps.readLocal();
    const nextState = retainTrainingHistory(local?.state ?? emptyRuntimeState(), state);
    await deps.writeLocal({ revision: local?.revision ?? 0, state: nextState,
      pendingId: local?.pendingId ?? deps.createId(),
      pendingState: local?.pendingId ? local.pendingState ?? local.state : nextState });
  });
  const sync = async (local: DeviceSnapshot): Promise<{ snapshot: DeviceSnapshot; cloud: CloudStatus }> => {
    let remote: RemoteSnapshot;
    try { remote = await deps.readRemote(); } catch { return { snapshot: local, cloud: 'unavailable' }; }
    const acknowledge = async (revision: number) => {
      const acknowledged = await device(async () => {
        const latest = await deps.readLocal() ?? local;
        const newer = JSON.stringify(latest.state) !== JSON.stringify(local.pendingState ?? local.state);
        const saved: DeviceSnapshot = { revision, state: latest.state,
          pendingId: newer ? deps.createId() : null, ...(newer ? { pendingState: latest.state } : {}) };
        await deps.writeLocal(saved);
        return saved;
      });
      return acknowledged.pendingId ? sync(acknowledged) : { snapshot: acknowledged, cloud: 'synced' as const };
    };
    // A response can be lost after the database committed. Its mutation receipt acknowledges that write.
    if (local.pendingId && remote.mutationId === local.pendingId) return acknowledge(remote.revision);
    if (remote.revision !== local.revision) return { snapshot: local, cloud: 'conflict' };
    if (!local.pendingId) return { snapshot: local, cloud: 'synced' };
    let response: { revision: number; conflict: boolean };
    try { response = await deps.writeRemote(local.pendingState ?? local.state, local.revision, local.pendingId); }
    catch { return { snapshot: local, cloud: 'unavailable' }; }
    if (response.conflict) return { snapshot: local, cloud: 'conflict' };
    return acknowledge(response.revision);
  };
  let cloudQueue: Promise<unknown> = Promise.resolve();
  const flush = (): Promise<{ cloud: CloudStatus }> => {
    const next = cloudQueue.catch(() => undefined).then(async () => {
      const local = await device(() => deps.readLocal());
      if (!local) return { cloud: 'synced' as const };
      const result = await sync(local);
      return { cloud: result.cloud };
    });
    cloudQueue = next;
    return next;
  };
  return {
    stage, flush,
    async load(): Promise<{ state: RuntimeState; cloud: CloudStatus }> {
      const local = await deps.readLocal(); // Corrupt local data must surface instead of being silently discarded.
      if (local?.pendingId) {
        const result = await sync(local);
        return { state: result.snapshot.state, cloud: result.cloud };
      }
      let remote: RemoteSnapshot;
      try { remote = await deps.readRemote(); }
      catch { return { state: local?.state ?? emptyRuntimeState(), cloud: 'unavailable' }; }
      const state = remote.state ?? local?.state ?? emptyRuntimeState();
      await deps.writeLocal({ state, revision: remote.revision, pendingId: null });
      return { state, cloud: 'synced' };
    },
    async save(state: RuntimeState): Promise<{ cloud: CloudStatus }> {
      await stage(state);
      return flush();
    },
    async useCloud(): Promise<void> {
      const remote = await deps.readRemote();
      if (!remote.state) throw new Error('No cloud training data is available.');
      const local = await deps.readLocal();
      if (local) await deps.backup(local);
      await deps.writeLocal({ state: remote.state, revision: remote.revision, pendingId: null });
    },
  };
}
