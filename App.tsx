import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { createStorageAdapter } from './src/storage';
import { useAppState } from './src/hooks';
import { OnboardingScreen } from './src/screens';

export default function App() {
  const storage = createStorageAdapter();
  const { state, isLoading, error, updateUser, clearAllData } = useAppState(storage);

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

  return (
    <View style={styles.container}>
      <Text style={styles.placeholderText}>User Profile Complete</Text>
      <Text style={styles.infoText}>ID: {state.user.id}</Text>
      <Text style={styles.infoText}>Age: {state.user.age}</Text>
      <Text style={styles.infoText}>Height: {state.user.heightCm} cm</Text>
      
      <TouchableOpacity style={styles.resetButton} onPress={clearAllData}>
        <Text style={styles.resetButtonText}>Reset & See Onboarding</Text>
      </TouchableOpacity>
      
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
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  resetButton: {
    backgroundColor: '#f44336',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 40,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});