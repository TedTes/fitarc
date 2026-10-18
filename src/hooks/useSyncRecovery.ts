import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/** Retry transient failures while foregrounded, never resolve conflicts automatically. */
export function useSyncRecovery(status: string, ready: boolean, retry: () => void) {
  const latest = useRef({ status, ready, retry });
  latest.current = { status, ready, retry };
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => { clearTimeout(timer.current); timer.current = undefined; };
  const eligible = () => latest.current.ready && ['device', 'failed'].includes(latest.current.status);
  useEffect(() => {
    clear();
    if (status === 'synced') attempt.current = 0;
    const schedule = () => {
      if (!eligible() || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      const delays = [2000, 5000, 15000, 30000, 60000];
      timer.current = setTimeout(() => {
        timer.current = undefined;
        if (!eligible()) return;
        attempt.current += 1;
        latest.current.retry();
      }, delays[Math.min(attempt.current, delays.length - 1)]);
    };
    schedule();
    const subscription = AppState.addEventListener('change', next => {
      clear();
      if (next === 'active' && eligible()) latest.current.retry();
    });
    return () => { clear(); subscription.remove(); };
  }, [status, ready]);
}
