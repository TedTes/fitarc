import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SocialAuthButtons } from '../components/SocialAuthButtons';

type RegisterScreenProps = {
  onNavigateToLogin: () => void;
};

const SCREEN_GRADIENT = ['#0A0E27', '#151932', '#1E2340'] as const;

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  onNavigateToLogin,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <View style={styles.container}>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.content}>
              <View style={styles.header}>
                <Text style={styles.logo}>↗</Text>
                <Text style={styles.title}>Create account</Text>
                <Text style={styles.subtitle}>
                  Use Google or Apple so your identity is verified before profile setup.
                </Text>
              </View>

              <SocialAuthButtons
                disabled={isLoading}
                onLoadingChange={setIsLoading}
              />

              <Text style={styles.disclosure}>
                Fitarc receives your verified email and basic account identity. Your workout data
                stays attached to that account.
              </Text>

              <TouchableOpacity
                style={styles.loginLink}
                onPress={onNavigateToLogin}
                disabled={isLoading}
              >
                <Text style={styles.loginLinkText}>
                  Existing password account?{' '}
                  <Text style={styles.loginLinkHighlight}>Sign in</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  gradient: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    color: '#6C63FF',
    fontSize: 58,
    fontWeight: '300',
    lineHeight: 64,
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  subtitle: {
    maxWidth: 340,
    fontSize: 16,
    lineHeight: 23,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  disclosure: {
    marginTop: 20,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 32,
    paddingVertical: 12,
  },
  loginLinkText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  loginLinkHighlight: {
    color: '#6C63FF',
    fontWeight: '700',
  },
});
