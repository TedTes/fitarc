import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/** Flush pending edits before leaving a screen or suspending the app. */
export function useFlushOnLeave(flush: () => unknown, active = true) {
  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => {
    if (!active) latest.current();
  }, [active]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active') latest.current();
    });
    return () => { subscription.remove(); latest.current(); };
  }, []);
}
