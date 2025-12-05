import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { createStorageAdapter } from './src/storage';
import { useAppState } from './src/hooks';
import { OnboardingScreen, PhotoCaptureScreen } from './src/screens';

export default function App() {
  const storage = createStorageAdapter();
  const { state, isLoading, updateUser, addPhotoCheckin } = useAppState(storage);

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

  return (
    <View style={styles.container}>
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