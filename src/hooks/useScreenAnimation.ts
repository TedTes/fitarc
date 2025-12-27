import { useContext, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

export const useScreenAnimation = () => {
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
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(headerTranslateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [contentOpacity, contentTranslateY, headerOpacity, headerTranslateY, isFocused]);

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
