import { LayoutAnimation, Platform, UIManager } from 'react-native';

type LayoutConfig = Parameters<typeof LayoutAnimation.configureNext>[0];

let didEnableAndroid = false;

export const runLayoutAnimation = (config?: LayoutConfig) => {
  try {
    if (Platform.OS === 'android' && !didEnableAndroid) {
      if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
      didEnableAndroid = true;
    }
    if (LayoutAnimation?.configureNext) {
      LayoutAnimation.configureNext(config ?? LayoutAnimation.Presets.easeInEaseOut);
    }
  } catch {
    // LayoutAnimation isn't available in some runtimes (e.g., web)
  }
};
