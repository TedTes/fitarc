import { useEffect, useState } from 'react';
import { AccessibilityInfo, LayoutAnimation } from 'react-native';
import { planTokens } from './theme';

/** Animate user-triggered layout changes, never timers or background updates. */
export const useLayoutMotion = () => {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    const update = (value: boolean) => { if (mounted) setReduced(value); };
    void AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => update(true));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return {
    reduced,
    animate: () => {
      if (reduced) return;
      LayoutAnimation.configureNext({
        duration: planTokens.duration,
        create: { type: 'easeInEaseOut', property: 'opacity' },
        update: { type: 'easeInEaseOut' },
        delete: { type: 'easeInEaseOut', property: 'opacity' },
      });
    },
  };
};
