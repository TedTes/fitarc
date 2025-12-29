import { useContext, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

type ScreenAnimationOptions = {
  headerDuration?: number;
  contentDuration?: number;
};

export const useScreenAnimation = (options: ScreenAnimationOptions = {}) => {
  const headerDuration = options.headerDuration ?? 220;
  const contentDuration = options.contentDuration ?? 200;
  const navigation = useContext(NavigationContext);
  const [isFocused, setIsFocused] = useState(() =>
    navigation ? navigation.isFocused() : true
  );
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(-20)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!navigation) return;
    const focusSub = navigation.addListener('focus', () => setIsFocused(true));
    const blurSub = navigation.addListener('blur', () => setIsFocused(false));
    return () => {
      focusSub();
      blurSub();
    };
  }, [navigation]);

  useEffect(() => {
    if (!isFocused) return;
    headerOpacity.setValue(0);
    headerTranslateY.setValue(-20);
    contentOpacity.setValue(0);
    contentTranslateY.setValue(20);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: headerDuration,
          useNativeDriver: true,
        }),
        Animated.timing(headerTranslateY, {
          toValue: 0,
          duration: headerDuration,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: contentDuration,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration: contentDuration,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [
    contentDuration,
    contentOpacity,
    contentTranslateY,
    headerDuration,
    headerOpacity,
    headerTranslateY,
    isFocused,
  ]);

  return {
    headerStyle: {
      opacity: headerOpacity,
      transform: [{ translateY: headerTranslateY }],
    },
    contentStyle: {
      opacity: contentOpacity,
      transform: [{ translateY: contentTranslateY }],
    },
  };
};
