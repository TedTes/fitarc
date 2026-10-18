/** Bound requests so the local outbox can recover from a stalled connection. */
export async function withNetworkTimeout<T>(request: (signal: AbortSignal) => PromiseLike<T>, milliseconds = 15000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), milliseconds);
  try { return await request(controller.signal); }
  finally { clearTimeout(timeout); }
}
