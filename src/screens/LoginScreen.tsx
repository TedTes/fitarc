import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { CompilerGlyphs, Scanlines } from '../components/AuthRuntimeVisual';
import { SocialAuthButtons } from '../components/SocialAuthButtons';
import { resendVerificationEmail, signIn } from '../services/authService';
import { monoFace, useMonoFonts } from './runtime/fonts';
import { colors, mono } from './runtime/theme';

type LoginScreenProps = {
  onNavigateToForgotPassword: () => void;
};

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onNavigateToForgotPassword,
}) => {
  const { height } = useWindowDimensions();
  const fontsReady = useMonoFonts();
  const monoRegular = fontsReady ? monoFace('400') ?? mono : mono;
  const monoSemiBold = fontsReady ? monoFace('600') ?? mono : mono;
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const compact = height < 760;
  const meshHeight = useMemo(
    () => Math.max(compact ? 120 : 150, Math.min(260, height * 0.26)),
    [compact, height]
  );

  const isUnverifiedEmailError = (error: any) => {
    const code = String(error?.code ?? '').toLowerCase();
    const message = String(error?.message ?? '').toLowerCase();
    return code === 'email_not_verified' || message.includes('email not confirmed');
  };

  const offerVerificationResend = () => {
    const normalizedEmail = email.trim().toLowerCase();
    Alert.alert(
      'Confirm your email',
      `Open the confirmation link sent to ${normalizedEmail} before signing in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resend email',
          onPress: () => {
            void resendVerificationEmail(normalizedEmail)
              .then(() => Alert.alert('Email sent', 'Check your inbox and spam folder.'))
              .catch(() => Alert.alert('Unable to resend', 'Please wait a moment and try again.'));
          },
        },
      ]
    );
  };

  const loginErrorMessage = (error: any) => {
    const rawMessage = String(error?.message ?? '');
    const message = rawMessage.toLowerCase();
    if (message.includes('invalid login credentials')) return 'Incorrect email or password.';
    if (message.includes('network') || message.includes('timeout')) {
      return 'Check your connection and try again.';
    }
    return rawMessage || 'Unable to sign in. Please try again.';
  };

  const handleEmailLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !password) {
      Alert.alert('Check credentials', 'Enter a valid email and password.');
      return;
    }
    setIsLoading(true);
    try {
      await signIn({ email: normalizedEmail, password });
    } catch (error: any) {
      if (isUnverifiedEmailError(error)) {
        offerVerificationResend();
      } else {
        Alert.alert('Sign-in failed', loginErrorMessage(error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Image
        accessibilityIgnoresInvertColors
        accessible={false}
        fadeDuration={0}
        resizeMode="contain"
        source={require('../../assets/images/login-athlete.png')}
        style={[styles.athleteBackground, compact && styles.athleteBackgroundCompact]}
      />
      <Scanlines />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.shell}>
              <View style={[styles.terminal, compact && styles.terminalCompact]}>
                <Text style={[styles.runtimeBrand, { fontFamily: monoSemiBold }]}>training.runtime</Text>
                <Text style={[styles.command, { fontFamily: monoRegular }]}>
                  <Text style={styles.commandPrompt}>$ </Text>auth --login
                </Text>
                <View style={styles.compilerRow}>
                  <Text style={[styles.compilerText, { fontFamily: monoRegular }]}>compiling block</Text>
                  <CompilerGlyphs active={isLoading} />
                  <Text style={[styles.compilerText, { fontFamily: monoRegular }]}>athlete.mesh</Text>
                </View>
              </View>

              <View style={[styles.heroSpacer, { minHeight: meshHeight }]} pointerEvents="none" />

              <View style={styles.authPanel}>
                <Text style={[styles.title, compact && styles.titleCompact]}>
                  {'Compile your\nnext block.'}
                </Text>
                <Text style={styles.subtitle}>Sign in once. The runtime handles the rest.</Text>

                {emailMode ? (
                  <View style={styles.emailForm}>
                    <TextInput
                      accessibilityLabel="Email"
                      style={[styles.input, { fontFamily: monoRegular }]}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="email"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                    />
                    <TextInput
                      accessibilityLabel="Password"
                      style={[styles.input, { fontFamily: monoRegular }]}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="password"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      editable={!isLoading}
                      onSubmitEditing={() => void handleEmailLogin()}
                    />
                    <Pressable
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.emailSubmit, pressed && styles.pressed]}
                      onPress={() => void handleEmailLogin()}
                      disabled={isLoading}
                    >
                      <Text style={[styles.emailSubmitText, { fontFamily: monoSemiBold }]}>
                        {isLoading ? 'authenticating...' : 'sign in →'}
                      </Text>
                    </Pressable>
                    <View style={styles.emailLinks}>
                      <Pressable onPress={() => setEmailMode(false)} disabled={isLoading}>
                        <Text style={[styles.textLink, { fontFamily: monoRegular }]}>← oauth</Text>
                      </Pressable>
                      <Pressable onPress={onNavigateToForgotPassword} disabled={isLoading}>
                        <Text style={[styles.textLink, { fontFamily: monoRegular }]}>reset password</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <SocialAuthButtons
                      disabled={isLoading}
                      onLoadingChange={setIsLoading}
                    />
                    <Pressable
                      accessibilityRole="button"
                      style={styles.passwordEntry}
                      onPress={() => setEmailMode(true)}
                      disabled={isLoading}
                    >
                      <Text style={[styles.passwordEntryText, { fontFamily: monoRegular }]}>
                        // existing password account
                      </Text>
                    </Pressable>
                  </>
                )}

                <Text style={[styles.legal, { fontFamily: monoRegular }]}>
                  // agree to terms & privacy by continuing
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050606',
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  scrollContentCompact: {
    paddingVertical: 12,
  },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
  },
  athleteBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.11,
    transform: [{ scale: 1.035 }],
  },
  athleteBackgroundCompact: {
    opacity: 0.085,
    transform: [{ scale: 1.01 }],
  },
  heroSpacer: {
    flex: 1,
    marginTop: 8,
    marginBottom: 0,
  },
  terminal: {
    gap: 12,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  terminalCompact: {
    gap: 7,
  },
  runtimeBrand: {
    color: '#739B52',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  command: {
    color: colors.text,
    fontSize: 15,
  },
  commandPrompt: {
    color: '#88B75E',
  },
  compilerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 9,
  },
  compilerText: {
    color: '#739B52',
    fontSize: 13,
  },
  authPanel: {
    gap: 14,
  },
  title: {
    color: colors.text,
    width: '100%',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.45,
  },
  titleCompact: {
    fontSize: 22,
    lineHeight: 26,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  passwordEntry: {
    alignSelf: 'center',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  passwordEntryText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  legal: {
    color: '#737A83',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  emailForm: {
    gap: 10,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
  },
  emailSubmit: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailSubmitText: {
    color: colors.accentText,
    fontSize: 14,
  },
  emailLinks: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textLink: {
    color: colors.textMuted,
    fontSize: 12,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.72,
  },
});
