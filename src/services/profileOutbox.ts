/** Durable, per-account profile edits. A late upload cannot clear a newer edit. */
export function createProfileOutbox<T>(deps: {
  read: () => Promise<{ id: string; value: T } | null>;
  write: (pending: { id: string; value: T }) => Promise<void>;
  clear: () => Promise<void>;
  upload: (value: T) => Promise<void>;
  cache: (value: T) => Promise<void>;
  createId: () => string;
}) {
  let localQueue: Promise<unknown> = Promise.resolve();
  const local = <R>(action: () => Promise<R>) => {
    const next = localQueue.catch(() => undefined).then(action);
    localQueue = next;
    return next;
  };
  let remoteQueue: Promise<unknown> = Promise.resolve();
  const flush = (): Promise<void> => {
    const next = remoteQueue.catch(() => undefined).then(async () => {
      let pending = await local(deps.read);
      while (pending) {
        const sent = pending;
        await deps.upload(sent.value);
        pending = await local(async () => {
          const latest = await deps.read();
          if (latest?.id !== sent.id) return latest;
          await deps.cache(sent.value);
          await deps.clear();
          return null;
        });
      }
    });
    remoteQueue = next;
    return next;
  };
  return {
    stage: (value: T) => local(() => deps.write({ id: deps.createId(), value })),
    pending: () => local(deps.read),
    flush,
  };
}
