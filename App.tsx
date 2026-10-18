import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { AthleteLoadingScreen } from './src/components/AthleteBackdrop';
import { AuthNavigator } from './src/screens/AuthNavigator';
import { ProfileSetupScreen, type ProfileSetupData } from './src/screens/ProfileSetupScreen';
import { prepareOnboardingTraining } from './src/runtime/onboarding';
import { loadRuntimeState, saveRuntimeState } from './src/runtime/runtimeStore';
import { TrainingRuntimeScreen } from './src/screens/TrainingRuntimeScreen';
import { fetchUserProfile, saveUserProfile, getSignedAvatarUrl, flushPendingUserProfile } from './src/services/userProfileService';
import { completeAuthRedirect } from './src/services/authService';
import { deleteAccount } from './src/services/accountService';
import { hasRequiredPlanInputs } from './src/utils/planReadiness';
import { describeProfileLoadError, type ProfileLoadError } from './src/utils/profileLoadError';
import { SUPABASE_PROJECT_HOST } from './src/lib/supabaseClient';
import { TRAINING_SCHEMA } from './src/runtime/dataModel';
import type { User } from './src/types/domain';

function AppContent() {
  const { user: account, isAuthenticated, isLoading, signOut } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<ProfileLoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const complete = (url: string | null) => {
      if (url) void completeAuthRedirect(url).catch(() => Alert.alert('Sign-in failed', 'Please try the confirmation link again.'));
    };
    void Linking.getInitialURL().then(complete);
    const subscription = Linking.addEventListener('url', ({ url }) => complete(url));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError(null);
    if (!isAuthenticated || !account) { setRestoring(false); return; }
    setRestoring(true);
    void fetchUserProfile(account.id)
      .then((value) => { if (!cancelled) setProfile(value); })
      .catch((problem: unknown) => { if (!cancelled) setError(describeProfileLoadError(problem)); })
      .finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, [account?.id, isAuthenticated, attempt]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !profile) return;
      void flushPendingUserProfile(profile.id).catch(() => undefined);
      if (!profile.avatarPath) return;
      const id = profile.id;
      void getSignedAvatarUrl(profile.avatarPath).then((avatarUrl) => {
        if (avatarUrl) setProfile((current) => current?.id === id ? { ...current, avatarUrl } : current);
      }).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [profile?.id, profile?.avatarPath]);
  const saveProfile = async (next: User) => {
    await saveUserProfile(next);
    setProfile(next);
  };
  const setup = async (data: ProfileSetupData) => {
    if (!account) return;
    try {
      const nextProfile: User = {
        ...profile, id: account.id, name: data.name, sex: data.sex, age: data.age,
        heightCm: data.heightCm, weightKg: data.weightKg, experienceLevel: data.experienceLevel,
        trainingSplit: data.trainingSplit, eatingMode: data.eatingMode,
        currentPhysiqueLevel: 1, createdAt: profile?.createdAt ?? new Date().toISOString(),
        planPreferences: { primaryGoal: data.primaryGoal, daysPerWeek: data.daysPerWeek,
          sessionMinutes: data.sessionMinutes, equipmentLevel: data.equipmentLevel, injuries: data.injuries },
      };
      const loaded = await loadRuntimeState(account.id);
      if (loaded.cloud === 'unavailable') throw new Error('Connect to the internet to prepare your first workout.');
      if (loaded.cloud === 'conflict') throw new Error('Resolve the saved-workout conflict before completing setup.');
      const prepared = prepareOnboardingTraining(loaded.state, nextProfile);
      const saved = await saveRuntimeState(account.id, prepared);
      if (saved.cloud !== 'synced') throw new Error('Your workout is saved on this device but has not synced. Check your connection and try again.');
      await saveUserProfile(nextProfile);
      setProfile(nextProfile);
    } catch (error) { Alert.alert('Could not prepare your training', error instanceof Error ? error.message : 'Please check your connection and try again.'); }
  };
  if (isLoading || (isAuthenticated && restoring)) return <AthleteLoadingScreen message="Restoring your training…" />;
  if (!isAuthenticated) return <AuthNavigator />;
  if (error) return <View style={{ flex: 1, justifyContent: 'center', padding: 32, gap: 24 }}>
    <Text style={{ color: 'white' }}>Your profile could not be loaded.</Text>
    <Text style={{ color: '#B8BEC8', lineHeight: 22 }}>{error.message}</Text>
    {__DEV__ ? <Text selectable style={{ color: '#B8BEC8', fontSize: 13, lineHeight: 20 }}>
      {`Error: ${error.code}\nProject: ${SUPABASE_PROJECT_HOST}\nSchema: ${TRAINING_SCHEMA}`}
    </Text> : null}
    <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)}><Text style={{ color: '#00F5A0' }}>Try again</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => void signOut()}><Text style={{ color: 'white' }}>Sign out</Text></Pressable>
  </View>;
  if (!profile || !hasRequiredPlanInputs(profile)) return <ProfileSetupScreen
    initialName={String(account?.user_metadata?.full_name ?? account?.user_metadata?.name ?? '')}
    onComplete={setup} />;
  return <TrainingRuntimeScreen key={profile.id} user={profile} onSaveProfile={saveProfile}
    onLogout={signOut} onDeleteAccount={async () => { await deleteAccount(); await signOut(); }} />;
}

export default function App() {
  return <SafeAreaProvider><AuthProvider><View style={{ flex: 1, backgroundColor: '#080A0D' }}>
    <AppContent /><StatusBar style="light" />
  </View></AuthProvider></SafeAreaProvider>;
}
