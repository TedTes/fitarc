import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStorageAdapter } from './src/storage';
import { useAppState } from './src/hooks';
import { OnboardingScreen, PhotoCaptureScreen, HomeScreen, TodayScreen, ProgressScreen } from './src/screens';
import { generateMockPhase } from './src/utils';
import { useEffect } from 'react';

const Tab = createBottomTabNavigator();

function MainTabs({ state, logAdherence, addPhotoCheckin, recalculateProgress }: any) {
  const getTodayLog = () => {
    if (!state?.currentPhase) return null;
    const today = new Date().toISOString().split('T')[0];
    return state.adherenceLogs.find(
      (log: any) => log.date === today && log.phasePlanId === state.currentPhase?.id
    ) || null;
  };

  useEffect(() => {
    if (state?.currentPhase && state.adherenceLogs.length > 0) {
      recalculateProgress();
    }
  }, [state?.adherenceLogs.length]);

  return (
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
            phase={state.currentPhase}
            onLogAdherence={logAdherence}
            todayLog={getTodayLog()}
          />
        )}
      </Tab.Screen>
      <Tab.Screen 
        name="Progress"
        options={{ tabBarLabel: 'Progress' }}
      >
        {() => (
          <ProgressScreen 
            phase={state.currentPhase}
            photoCheckins={state.photoCheckins}
            progressEstimate={state.progressEstimate}
            onTakePhoto={() => addPhotoCheckin}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const storage = createStorageAdapter();
  const { state, isLoading, updateUser, addPhotoCheckin, startPhase, logAdherence, recalculateProgress } = useAppState(storage);

  const handleStartPhase = async () => {
    if (!state?.user) return;
    const phase = generateMockPhase(state.user);
    await startPhase(phase);
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
    <NavigationContainer>
      <MainTabs 
        state={state}
        logAdherence={logAdherence}
        addPhotoCheckin={addPhotoCheckin}
        recalculateProgress={recalculateProgress}
      />
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