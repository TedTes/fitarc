import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { AthleteLoadingScreen } from './src/components/AthleteBackdrop';
import { AuthNavigator } from './src/screens/AuthNavigator';
import { ProfileSetupScreen, type ProfileSetupData } from './src/screens/ProfileSetupScreen';
import { TrainingRuntimeScreen } from './src/screens/TrainingRuntimeScreen';
import { fetchUserProfile, saveUserProfile, getSignedAvatarUrl } from './src/services/userProfileService';
import { completeAuthRedirect } from './src/services/authService';
import { deleteAccount } from './src/services/accountService';
import { hasRequiredPlanInputs } from './src/utils/planReadiness';
import type { User } from './src/types/domain';

function AppContent() {
  const { user: account, isAuthenticated, isLoading, signOut } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState(false);
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
    setError(false);
    if (!isAuthenticated || !account) { setRestoring(false); return; }
    setRestoring(true);
    void fetchUserProfile(account.id)
      .then((value) => { if (!cancelled) setProfile(value); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, [account?.id, isAuthenticated, attempt]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !profile?.avatarPath) return;
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
      await saveProfile({
        ...profile, id: account.id, name: data.name, sex: data.sex, age: data.age,
        heightCm: data.heightCm, weightKg: data.weightKg, experienceLevel: data.experienceLevel,
        trainingSplit: data.trainingSplit, eatingMode: data.eatingMode,
        currentPhysiqueLevel: 1, createdAt: profile?.createdAt ?? new Date().toISOString(),
        planPreferences: { primaryGoal: data.primaryGoal, daysPerWeek: data.daysPerWeek,
          sessionMinutes: data.sessionMinutes, equipmentLevel: data.equipmentLevel, injuries: data.injuries },
      });
    } catch { Alert.alert('Profile save failed', 'Please check your connection and try again.'); }
  };
  if (isLoading || (isAuthenticated && restoring)) return <AthleteLoadingScreen message="Restoring your training…" />;
  if (!isAuthenticated) return <AuthNavigator />;
  if (error) return <View style={{ flex: 1, justifyContent: 'center', padding: 32, gap: 24 }}>
    <Text style={{ color: 'white' }}>Your profile could not be loaded.</Text>
    <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)}><Text style={{ color: '#00F5A0' }}>Try again</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => void signOut()}><Text style={{ color: 'white' }}>Sign out</Text></Pressable>
  </View>;
  if (!profile || !hasRequiredPlanInputs(profile)) return <ProfileSetupScreen
    initialName={String(account?.user_metadata?.full_name ?? account?.user_metadata?.name ?? '')}
    onComplete={(data) => void setup(data)} />;
  return <TrainingRuntimeScreen key={profile.id} user={profile} onSaveProfile={saveProfile}
    onLogout={signOut} onDeleteAccount={async () => { await deleteAccount(); await signOut(); }} />;
}

export default function App() {
  return <SafeAreaProvider><AuthProvider><View style={{ flex: 1, backgroundColor: '#080A0D' }}>
    <AppContent /><StatusBar style="light" />
  </View></AuthProvider></SafeAreaProvider>;
}
