import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStorageAdapter } from './src/storage';
import { useAppState } from './src/hooks';
import { 
  OnboardingScreen, 
  PhotoCaptureScreen, 
  HomeScreen, 
  TodayScreen, 
  ProgressScreen, 
  PhotoCheckinPromptScreen,
  PhaseCompleteScreen 
} from './src/screens';
import { generateMockPhase, shouldPromptPhotoCheckin, isPhaseComplete } from './src/utils';
import { useEffect, useState } from 'react';

const Tab = createBottomTabNavigator();

export default function App() {
  const storage = createStorageAdapter();
  const { state, isLoading, updateUser, addPhotoCheckin, startPhase, logAdherence, recalculateProgress, completePhase } = useAppState(storage);
  const [showPhotoPrompt, setShowPhotoPrompt] = useState(false);

  const handleStartPhase = async () => {
    if (!state?.user) return;
    const phase = generateMockPhase(state.user);
    await startPhase(phase);
  };

  const handleStartNextPhase = async () => {
    await completePhase();
  };

  useEffect(() => {
    if (state?.currentPhase && state.adherenceLogs.length > 0) {
      recalculateProgress();
    }
  }, [state?.adherenceLogs?.length]);

  useEffect(() => {
    if (state?.currentPhase) {
      const shouldPrompt = shouldPromptPhotoCheckin(state.currentPhase, state.photoCheckins);
      setShowPhotoPrompt(shouldPrompt);
    }
  }, [state?.currentPhase, state?.photoCheckins]);

  const getTodayLog = () => {
    if (!state?.currentPhase) return null;
    const today = new Date().toISOString().split('T')[0];
    return state.adherenceLogs.find(
      log => log.date === today && log.phasePlanId === state.currentPhase?.id
    ) || null;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!state?.user) {
    return (
      <View style={styles.container}>
        <OnboardingScreen onComplete={updateUser} />
        <StatusBar style="auto" />
      </View>
    );
  }

  const hasBaselinePhoto = state.photoCheckins.some(p => p.phasePlanId === 'baseline');

  if (!hasBaselinePhoto) {
    return (
      <View style={styles.container}>
        <PhotoCaptureScreen 
          onComplete={addPhotoCheckin} 
          phasePlanId="baseline"
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!state.currentPhase || state.currentPhase.status === 'completed') {
    return (
      <View style={styles.container}>
        <HomeScreen 
          user={state.user}
          phase={null}
          onStartPhase={handleStartPhase}
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  const phaseComplete = isPhaseComplete(state.currentPhase, state.progressEstimate);

  if (phaseComplete) {
    const baselinePhoto = state.photoCheckins.find(p => p.phasePlanId === 'baseline');
    const phasePhotos = state.photoCheckins.filter(p => p.phasePlanId === state.currentPhase?.id);
    const latestPhoto = phasePhotos.length > 0 ? phasePhotos[phasePhotos.length - 1] : null;

    return (
      <View style={styles.container}>
        <PhaseCompleteScreen 
          phase={state.currentPhase}
          beforePhoto={baselinePhoto || null}
          afterPhoto={latestPhoto}
          progressPercent={state.progressEstimate?.progressPercent || 0}
          onStartNextPhase={handleStartNextPhase}
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (showPhotoPrompt) {
    const phasePhotos = state.photoCheckins.filter(p => p.phasePlanId === state.currentPhase?.id);
    const lastPhoto = phasePhotos.length > 0 ? phasePhotos[phasePhotos.length - 1] : null;

    return (
      <View style={styles.container}>
        <PhotoCheckinPromptScreen 
          phase={state.currentPhase}
          lastPhoto={lastPhoto}
          onTakePhoto={() => setShowPhotoPrompt(false)}
          onSkip={() => setShowPhotoPrompt(false)}
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  const todayLog = getTodayLog();

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#2196F3',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: { paddingBottom: 8, paddingTop: 8, height: 60 },
        }}
      >
        <Tab.Screen 
          name="Today" 
          options={{ tabBarLabel: 'Today' }}
        >
          {() => (
            <TodayScreen 
              phase={state.currentPhase!}
              onLogAdherence={logAdherence}
              todayLog={todayLog}
            />
          )}
        </Tab.Screen>
        <Tab.Screen 
          name="Progress"
          options={{ tabBarLabel: 'Progress' }}
        >
          {() => (
            <ProgressScreen 
              phase={state.currentPhase!}
              photoCheckins={state.photoCheckins}
              progressEstimate={state.progressEstimate}
              onTakePhoto={() => addPhotoCheckin}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});