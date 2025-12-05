import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { createStorageAdapter } from './src/storage';
import { AppState, createEmptyAppState } from './src/types/domain';

/**
 * 
 * Testing storage abstraction layer with basic operations
 */
export default function App() {
  const [storage] = useState(() => createStorageAdapter());
  const [appState, setAppState] = useState<AppState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load state on mount
  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      const state = await storage.getAppState();
      if (state) {
        setAppState(state);
        Alert.alert('Success', 'Loaded existing state from storage');
      } else {
        Alert.alert('Info', 'No existing state found (first launch)');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load state');
    } finally {
      setIsLoading(false);
    }
  };

  const createTestState = async () => {
    const newState = createEmptyAppState();
    newState.user = {
      id: 'test-user-123',
      sex: 'male',
      age: 28,
      heightCm: 175,
      experienceLevel: 'beginner',
      createdAt: new Date().toISOString(),
    };

    try {
      await storage.saveAppState(newState);
      setAppState(newState);
      Alert.alert('Success', 'Created and saved test user');
    } catch (error) {
      Alert.alert('Error', 'Failed to save state');
    }
  };

  const clearStorage = async () => {
    try {
      await storage.clearAll();
      setAppState(null);
      Alert.alert('Success', 'Storage cleared');
    } catch (error) {
      Alert.alert('Error', 'Failed to clear storage');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>fitarc</Text>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Storage Status:</Text>
        <Text style={styles.value}>
          {appState ? '✅ Data Exists' : '❌ No Data'}
        </Text>
        
        {appState?.user && (
          <>
            <Text style={styles.label}>User ID:</Text>
            <Text style={styles.value}>{appState.user.id}</Text>
            <Text style={styles.label}>Age:</Text>
            <Text style={styles.value}>{appState.user.age}</Text>
            <Text style={styles.label}>Experience:</Text>
            <Text style={styles.value}>{appState.user.experienceLevel}</Text>
          </>
        )}
      </View>

      <TouchableOpacity style={styles.button} onPress={createTestState}>
        <Text style={styles.buttonText}>Create Test User</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={loadState}>
        <Text style={styles.buttonText}>Reload State</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.button, styles.dangerButton]} 
        onPress={clearStorage}
      >
        <Text style={styles.buttonText}>Clear Storage</Text>
      </TouchableOpacity>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#4CAF50',
    marginBottom: 30,
  },
  infoBox: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 10,
  },
  value: {
    fontSize: 16,
    color: '#333',
    marginTop: 2,
  },
  button: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});