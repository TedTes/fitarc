import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { createStorageAdapter } from './src/storage';
import { useAppState } from './src/hooks';
import { 
  ProfileSetupScreen,
  CurrentPhysiqueSelectionScreen,
  TargetPhysiqueSelectionScreen,
  DashboardScreen,
  PlansScreen,
  ProgressScreen, 
  PhotoCaptureScreen,
  PhaseCompleteScreen,
  ProfileScreen
} from './src/screens';
import { generatePhase,  isPhaseComplete } from './src/utils';
import { useEffect, useState } from 'react';
import { PhotoCheckin, User } from './src/types/domain';

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, { default: string; active: string }> = {
  Home: { default: 'home-outline', active: 'home' },
  Plans: { default: 'calendar-outline', active: 'calendar' },
  Progress: { default: 'stats-chart-outline', active: 'stats-chart' },
};

type OnboardingStep = 'profile' | 'current_physique' | 'target_physique' | 'complete';

export default function App() {
  const storage = createStorageAdapter();
  const { state, isLoading, updateUser, addPhotoCheckin, startPhase, markDayConsistent, recalculateProgress, completePhase, seedPerformanceData, toggleWorkoutExercise, toggleMealCompletion, reorderWorkoutExercise, regenerateWorkoutPlan, regenerateMealPlan, loadWeeklyTemplate } = useAppState(storage);
  const [isPhotoCaptureVisible, setPhotoCaptureVisible] = useState(false);
  const [photoCapturePhaseId, setPhotoCapturePhaseId] = useState<string | null>(null);
  const [photoCaptureOptional, setPhotoCaptureOptional] = useState(false);
  const [isProfileVisible, setProfileVisible] = useState(false);
  
  // Onboarding state
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('profile');
  const [tempProfileData, setTempProfileData] = useState<any>(null);
  const [tempCurrentLevel, setTempCurrentLevel] = useState<number | null>(null);

  const handleProfileComplete = (data: {
    sex: 'male' | 'female' | 'other';
    age: number;
    heightCm: number;
    experienceLevel: 'beginner' | 'intermediate' | 'advanced';
    trainingSplit: 'full_body' | 'upper_lower' | 'push_pull_legs' | 'bro_split' | 'custom';
    eatingMode: 'mild_deficit' | 'recomp' | 'lean_bulk' | 'maintenance';
  }) => {
    setTempProfileData(data);
    setOnboardingStep('current_physique');
  };

  const handleCurrentPhysiqueSelect = (levelId: number) => {
    setTempCurrentLevel(levelId);
    setOnboardingStep('target_physique');
  };

  const handleTargetPhysiqueSelect = async (targetLevelId: number) => {
    if (!tempCurrentLevel) return;

    const existingUser = state?.user;
    const user: User = {
      id: existingUser?.id || `user_${Date.now()}`,
      sex: tempProfileData.sex,
      age: tempProfileData.age,
      heightCm: tempProfileData.heightCm,
      experienceLevel: tempProfileData.experienceLevel,
      currentPhysiqueLevel: tempCurrentLevel,
      trainingSplit: tempProfileData.trainingSplit || 'full_body',
      eatingMode: tempProfileData.eatingMode || 'maintenance',
      createdAt: new Date().toISOString(),
    };

    await updateUser(user);

    // Generate and start phase
    const phase = generatePhase(user, tempCurrentLevel, targetLevelId);
    await startPhase(phase);
    await seedPerformanceData(phase, user);
    
    // Open photo capture for baseline photo
    setOnboardingStep('complete');
    openPhotoCapture('baseline');
  };

  useEffect(() => {
    if (state?.currentPhase && state.dailyConsistency.length > 0) {
      recalculateProgress();
    }
  }, [state?.dailyConsistency?.length]);

  const handleStartPhaseFromDashboard = () => {
    if (!state?.user) {
      setOnboardingStep('profile');
      return;
    }

    setTempProfileData({
      sex: state.user.sex,
      age: state.user.age,
      heightCm: state.user.heightCm,
      experienceLevel: state.user.experienceLevel,
      trainingSplit: state.user.trainingSplit,
      eatingMode: state.user.eatingMode,
    });
    setTempCurrentLevel(state.user.currentPhysiqueLevel);
    setOnboardingStep('current_physique');
  };

  const openPhotoCapture = (phaseId: string, options?: { optional?: boolean }) => {
    setPhotoCapturePhaseId(phaseId);
    setPhotoCaptureOptional(!!options?.optional);
    setPhotoCaptureVisible(true);
  };

  const closePhotoCapture = () => {
    setPhotoCaptureVisible(false);
    setPhotoCapturePhaseId(null);
    setPhotoCaptureOptional(false);
  };

  const handlePhotoCaptured = async (photo: PhotoCheckin) => {
    await addPhotoCheckin(photo);
    closePhotoCapture();
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  const shouldShowOnboarding =
    !state?.user || (onboardingStep !== 'complete' && onboardingStep !== null);

  // Onboarding flow
  if (shouldShowOnboarding) {
    // if (onboardingStep === 'profile') {
    //   return (
    //     <View style={styles.container}>
    //       <ProfileSetupScreen onComplete={handleProfileComplete} />
    //       <StatusBar style="light" />
    //     </View>
    //   );
    // }

    if (onboardingStep === 'current_physique' && tempProfileData) {
      return (
        <View style={styles.container}>
          <CurrentPhysiqueSelectionScreen 
            sex={tempProfileData.sex}
            onSelectLevel={handleCurrentPhysiqueSelect}
          />
          <StatusBar style="light" />
        </View>
      );
    }

    if (onboardingStep === 'target_physique' && tempCurrentLevel && tempProfileData) {
      return (
        <View style={styles.container}>
          <TargetPhysiqueSelectionScreen 
            sex={tempProfileData.sex}
            currentLevelId={tempCurrentLevel}
            onSelectTarget={handleTargetPhysiqueSelect}
          />
          <StatusBar style="light" />
        </View>
      );
    }
  }

  if (isProfileVisible && state?.user) {
    return (
      <View style={styles.container}>
        <ProfileScreen 
          user={state.user}
          onSave={updateUser}
          onClose={() => setProfileVisible(false)}
          onChangeCurrentLevel={() => {
            setProfileVisible(false);
            setTempProfileData({
              sex: state.user!.sex,
              age: state.user!.age,
              heightCm: state.user!.heightCm,
              experienceLevel: state.user!.experienceLevel,
              trainingSplit: state.user!.trainingSplit,
              eatingMode: state.user!.eatingMode,
            });
            setOnboardingStep('current_physique');
          }}
          onChangeTargetLevel={() => {
            setProfileVisible(false);
            setTempProfileData({
              sex: state.user!.sex,
              age: state.user!.age,
              heightCm: state.user!.heightCm,
              experienceLevel: state.user!.experienceLevel,
              trainingSplit: state.user!.trainingSplit,
              eatingMode: state.user!.eatingMode,
            });
            setTempCurrentLevel(state.user!.currentPhysiqueLevel);
            setOnboardingStep('target_physique');
          }}
        />
        <StatusBar style="light" />
      </View>
    );
  }

  if (isPhotoCaptureVisible && photoCapturePhaseId) {
    return (
      <View style={styles.container}>
        <PhotoCaptureScreen 
          phasePlanId={photoCapturePhaseId}
          onComplete={handlePhotoCaptured}
          onSkip={photoCaptureOptional ? closePhotoCapture : undefined}
          isOptional={photoCaptureOptional}
        />
        <StatusBar style="light" />
      </View>
    );
  }

  const phaseComplete = state?.currentPhase ? isPhaseComplete(state.currentPhase, state.progressEstimate) : false;

  // if (phaseComplete && state?.currentPhase) {
  //   const baselinePhoto = state.photoCheckins.find(p => p.phasePlanId === 'baseline');
  //   const phasePhotos = state.photoCheckins.filter(p => p.phasePlanId === state.currentPhase?.id);
  //   const latestPhoto = phasePhotos.length > 0 ? phasePhotos[phasePhotos.length - 1] : null;

  //   return (
  //     <View style={styles.container}>
  //       <PhaseCompleteScreen 
  //         phase={state.currentPhase}
  //         beforePhoto={baselinePhoto || null}
  //         afterPhoto={latestPhoto}
  //         progressPercent={state.progressEstimate?.progressPercent || 0}
  //         onStartNextPhase={completePhase}
  //       />
  //       <StatusBar style="light" />
  //     </View>
  //   );
  // }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => {
          const icon = TAB_ICONS[route.name] || TAB_ICONS.Home;
          return {
            headerShown: false,
            tabBarActiveTintColor: '#6C63FF',
            tabBarInactiveTintColor: '#A0A3BD',
            tabBarStyle: {
              paddingBottom: 6,
              paddingTop: 10,
              height: 72,
              backgroundColor: '#0A0E27',
              borderTopColor: '#2A2F4F',
            },
            tabBarLabelStyle: {
              fontSize: 12,
              marginBottom: 4,
            },
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? icon.active : icon.default}
                size={28}
                color={color}
              />
            ),
          };
        }}
      >
        <Tab.Screen 
          name="Home" 
          options={{ tabBarLabel: 'Home' }}
        >
          {() => (
           state &&  <DashboardScreen 
              user={state.user!}
              phase={state.currentPhase}
              onMarkConsistent={markDayConsistent}
              workoutLogs={state.workoutLogs}
              workoutSessions={state.workoutSessions}
              mealPlans={state.mealPlans}
              strengthSnapshots={state.strengthSnapshots}
              progressEstimate={state.progressEstimate}
              onProfilePress={() => setProfileVisible(true)}
              onStartPhase={handleStartPhaseFromDashboard}
              onToggleWorkoutExercise={toggleWorkoutExercise}
              onToggleMeal={toggleMealCompletion}
              onRegenerateWorkoutPlan={regenerateWorkoutPlan}
              onRegenerateMealPlan={regenerateMealPlan}
            />
          )}
        </Tab.Screen>
        <Tab.Screen 
          name="Plans"
          options={{ tabBarLabel: 'Plans' }}
        >
          {() => (
            state && <PlansScreen
              user={state.user!}
              phase={state.currentPhase}
              workoutSessions={state.workoutSessions}
              mealPlans={state.mealPlans}
              onRegenerateWorkoutPlan={regenerateWorkoutPlan}
              onRegenerateMealPlan={regenerateMealPlan}
              onLoadTemplate={loadWeeklyTemplate}
            />
          )}
        </Tab.Screen>
        <Tab.Screen 
          name="Progress"
          options={{ tabBarLabel: 'Progress' }}
        >
          {() => (
           state &&  <ProgressScreen 
              phase={state.currentPhase!}
              photoCheckins={state.photoCheckins}
              progressEstimate={state.progressEstimate}
              dailyConsistency={state.dailyConsistency}
              workoutLogs={state.workoutLogs}
              mealPlans={state.mealPlans}
              strengthSnapshots={state.strengthSnapshots}
              onTakePhoto={() => state.currentPhase && openPhotoCapture(state.currentPhase.id, { optional: true })}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0E27',
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
});
