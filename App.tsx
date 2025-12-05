import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { createStorageAdapter } from './src/storage';
import { useAppState } from './src/hooks';
import { OnboardingScreen, PhotoCaptureScreen, HomeScreen, TodayScreen } from './src/screens';
import { generateMockPhase } from './src/utils';

export default function App() {
  const storage = createStorageAdapter();
  const { state, isLoading, updateUser, addPhotoCheckin, startPhase, logAdherence } = useAppState(storage);

  const handleStartPhase = async () => {
    if (!state?.user) return;
    const phase = generateMockPhase(state.user);
    await startPhase(phase);
  };

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

  if (!state.currentPhase) {
    return (
      <View style={styles.container}>
        <HomeScreen 
          user={state.user}
          phase={state.currentPhase}
          onStartPhase={handleStartPhase}
        />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TodayScreen 
        phase={state.currentPhase}
        onLogAdherence={logAdherence}
        todayLog={getTodayLog()}
      />
      <StatusBar style="auto" />
    </View>
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