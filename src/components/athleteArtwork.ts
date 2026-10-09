import type { ImageSourcePropType } from 'react-native';

/** One source for the registered artwork used by auth, loading and muscle maps. */
export const ATHLETE_ARTWORK: Record<'front', ImageSourcePropType> = {
  front: require('../../assets/images/muscle-map/athlete-front-v2.png'),
};

/** The muscle-map renders. Must stay pixel-aligned with the shapes in screens/runtime/muscleMasks.ts. */
export const MUSCLE_MAP_ARTWORK: Record<'front' | 'back', ImageSourcePropType> = {
  front: require('../../assets/images/muscle-map/athlete-front-v4.jpg'),
  back: require('../../assets/images/muscle-map/athlete-back-v7.png'),
};
