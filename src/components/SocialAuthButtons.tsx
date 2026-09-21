import React, { useState } from 'react';
import {
  Animated,
  Alert,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { monoFace } from '../screens/runtime/fonts';
import { mono } from '../screens/runtime/theme';
import {
  signInWithSocialProvider,
  SocialAuthProvider,
} from '../services/authService';

type SocialAuthButtonsProps = {
  disabled?: boolean;
  onLoadingChange?: (loading: boolean) => void;
};

const GoogleG = ({ size = 20 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
    <Path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
  </Svg>
);

const providerName = (provider: SocialAuthProvider) =>
  provider === 'google' ? 'Google' : 'Apple';

export const SocialAuthButtons: React.FC<SocialAuthButtonsProps> = ({
  disabled = false,
  onLoadingChange,
}) => {
  const [activeProvider, setActiveProvider] = useState<SocialAuthProvider | null>(null);
  const glyphMotion = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    glyphMotion.stopAnimation();
    glyphMotion.setValue(0);
    if (!activeProvider) return;
    const animation = Animated.loop(
      Animated.timing(glyphMotion, {
        toValue: 1,
        duration: 760,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [activeProvider, glyphMotion]);

  const handleProvider = async (provider: SocialAuthProvider) => {
    setActiveProvider(provider);
    onLoadingChange?.(true);
    try {
      await signInWithSocialProvider(provider);
    } catch (error: any) {
      if (error?.code === 'oauth_cancelled') return;
      const rawMessage = String(error?.message ?? '');
      const providerLabel = providerName(provider);
      const providerUnavailable = rawMessage.toLowerCase().includes('provider is not enabled')
        || rawMessage.toLowerCase().includes('unsupported provider');
      Alert.alert(
        `${providerLabel} sign-in failed`,
        providerUnavailable
          ? `${providerLabel} sign-in is not configured yet. Use email for now.`
          : rawMessage || `Unable to sign in with ${providerLabel}. Please try again.`
      );
    } finally {
      setActiveProvider(null);
      onLoadingChange?.(false);
    }
  };

  const renderButton = (provider: SocialAuthProvider) => {
    const label = providerName(provider);
    const loading = activeProvider === provider;
    return (
      <TouchableOpacity
        key={provider}
        accessibilityRole="button"
        accessibilityLabel={`Continue with ${label}`}
        style={[
          styles.button,
          provider === 'apple' ? styles.appleButton : styles.googleButton,
          disabled && !loading && styles.disabled,
        ]}
        onPress={() => void handleProvider(provider)}
        disabled={disabled || activeProvider !== null}
      >
        <Animated.View
          style={loading ? {
            transform: [
              {
                rotate: glyphMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
              {
                scale: glyphMotion.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.82, 1.08, 0.82],
                }),
              },
            ],
          } : undefined}
        >
          {provider === 'google'
            ? <GoogleG size={20} />
            : <Ionicons name="logo-apple" size={22} color="#050505" />}
        </Animated.View>
        <Text style={[styles.label, { fontFamily: monoFace('600') ?? mono }, provider === 'apple' && styles.appleLabel]}>
          {loading ? `connecting to ${label}…` : `continue with ${label}`}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' ? renderButton('apple') : null}
      {renderButton('google')}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 12,
  },
  button: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 18,
  },
  appleButton: {
    backgroundColor: '#F4F4F2',
    borderColor: '#F4F4F2',
  },
  googleButton: {
    backgroundColor: '#0B0D10',
    borderColor: '#2A2F36',
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    color: '#F3F5F8',
    fontSize: 15,
  },
  appleLabel: {
    color: '#050505',
  },
});
