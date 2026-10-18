import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Use wall time so suspension never slows down or restarts a workout timer. */
export function useForegroundClock(running = true) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => setNow(Date.now());
    const resume = () => { clearInterval(timer); update(); timer = setInterval(update, 1000); };
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') resume();
    const subscription = AppState.addEventListener('change', next => {
      clearInterval(timer);
      if (next === 'active') resume();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [running]);
  return now;
}
