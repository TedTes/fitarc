import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { createStorageAdapter } from './src/storage';
import { useAppState } from './src/hooks';

export default function App() {
  const storage = createStorageAdapter();
  const {
    state,
    isLoading,
    error,
    updateUser,
    clearAllData,
  } = useAppState(storage);

  const handleCreateTestUser = async () => {
    try {
      await updateUser({
        id: `user_${Date.now()}`,
        sex: 'male',
        age: 28,
        heightCm: 175,
        experienceLevel: 'beginner',
        createdAt: new Date().toISOString(),
      });
      Alert.alert('Success', 'User created and saved');
    } catch (err) {
      Alert.alert('Error', 'Failed to create user');
    }
  };

  const handleClearData = async () => {
    Alert.alert(
      'Clear All Data',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllData();
              Alert.alert('Success', 'All data cleared');
            } catch (err) {
              Alert.alert('Error', 'Failed to clear data');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>fitarc</Text>
     

      <View style={styles.stateBox}>
        <Text style={styles.sectionTitle}>App State</Text>
        
        <View style={styles.stateRow}>
          <Text style={styles.label}>User:</Text>
          <Text style={styles.value}>
            {state?.user ? '✅ Exists' : '❌ Not Set'}
          </Text>
        </View>

        {state?.user && (
          <>
            <View style={styles.stateRow}>
              <Text style={styles.label}>ID:</Text>
              <Text style={styles.value}>{state.user.id.substring(0, 16)}...</Text>
            </View>
            <View style={styles.stateRow}>
              <Text style={styles.label}>Age:</Text>
              <Text style={styles.value}>{state.user.age} years</Text>
            </View>
            <View style={styles.stateRow}>
              <Text style={styles.label}>Height:</Text>
              <Text style={styles.value}>{state.user.heightCm} cm</Text>
            </View>
            <View style={styles.stateRow}>
              <Text style={styles.label}>Experience:</Text>
              <Text style={styles.value}>{state.user.experienceLevel}</Text>
            </View>
          </>
        )}

        <View style={styles.stateRow}>
          <Text style={styles.label}>Phase:</Text>
          <Text style={styles.value}>
            {state?.currentPhase ? '✅ Active' : '❌ None'}
          </Text>
        </View>

        <View style={styles.stateRow}>
          <Text style={styles.label}>Logs:</Text>
          <Text style={styles.value}>{state?.adherenceLogs.length || 0}</Text>
        </View>

        <View style={styles.stateRow}>
          <Text style={styles.label}>Photos:</Text>
          <Text style={styles.value}>{state?.photoCheckins.length || 0}</Text>
        </View>
      </View>

      <TouchableOpacity 
        style={styles.button} 
        onPress={handleCreateTestUser}
      >
        <Text style={styles.buttonText}>Create Test User</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.button, styles.dangerButton]} 
        onPress={handleClearData}
      >
        <Text style={styles.buttonText}>Clear All Data</Text>
      </TouchableOpacity>

      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#4CAF50',
    marginBottom: 30,
  },
  stateBox: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 15,
    color: '#333',
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  value: {
    fontSize: 14,
    color: '#333',
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
  errorText: {
    color: '#f44336',
    fontSize: 16,
  },
});