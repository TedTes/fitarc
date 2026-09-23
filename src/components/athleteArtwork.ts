import type { ImageSourcePropType } from 'react-native';

/** One source for the registered artwork used by auth, loading and muscle maps. */
export const ATHLETE_ARTWORK: Record<'front' | 'back', ImageSourcePropType> = {
  front: require('../../assets/images/muscle-map/athlete-front-v2.png'),
  back: require('../../assets/images/muscle-map/athlete-back-v2.png'),
};
