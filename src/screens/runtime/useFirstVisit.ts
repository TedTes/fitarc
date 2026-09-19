import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * True the first time a surface is ever opened on this device, so its plain-language meaning
 * shows once and then stays out of the way. Storage failures simply hide the line.
 */
export const useFirstVisit = (key: string): boolean => {
  const [first, setFirst] = useState(false);
  useEffect(() => {
    let alive = true;
    const storageKey = `fitarc:runtime:seen:${key}`;
    AsyncStorage.getItem(storageKey).then((seen) => {
      if (!alive || seen) return;
      setFirst(true);
      AsyncStorage.setItem(storageKey, '1').catch(() => undefined);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [key]);
  return first;
};
