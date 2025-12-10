import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { createStorageAdapter } from './src/storage';
import { useAppState } from './src/hooks';
import { 
  CurrentPhysiqueSelectionScreen,
  TargetPhysiqueSelectionScreen,
  DashboardScreen,
  PlansScreen,
  ProgressScreen, 
  MenuScreen,
  PhotoCaptureScreen,
  ProfileScreen
} from './src/screens';
import { generatePhase } from './src/utils';
import { useEffect, useState } from 'react';
import { PhotoCheckin, User } from './src/types/domain';

type RootTabParamList = {
  Home: undefined;
  Workouts: undefined;
  Menu: undefined;
  Progress: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

type IoniconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<keyof RootTabParamList, { default: IoniconName; active: IoniconName }> = {
  Home: { default: 'home-outline', active: 'home' },
  Workouts: { default: 'barbell-outline', active: 'barbell' },
  Menu: { default: 'fast-food-outline', active: 'fast-food' },
  Progress: { default: 'stats-chart-outline', active: 'stats-chart' },
  More: { default: 'menu-outline', active: 'menu' },
};

type OnboardingStep = 'profile' | 'current_physique' | 'target_physique' | 'complete';

const EmptyScreen = () => null;

export default function App() {
  const storage = createStorageAdapter();
  const navigationRef = useNavigationContainerRef<RootTabParamList>();
  const {
    state,
    isLoading,
    updateUser,
    addPhotoCheckin,
    startPhase,
    markDayConsistent,
    recalculateProgress,
    seedPerformanceData,
    toggleWorkoutExercise,
    toggleMealCompletion,
    regenerateWorkoutPlan,
    regenerateMealPlan,
    loadWeeklyTemplate,
  } = useAppState(storage);
  const [isPhotoCaptureVisible, setPhotoCaptureVisible] = useState(false);
  const [photoCapturePhaseId, setPhotoCapturePhaseId] = useState<string | null>(null);
  const [photoCaptureOptional, setPhotoCaptureOptional] = useState(false);
  const [isProfileVisible, setProfileVisible] = useState(false);

  const closeProfileSheet = () => {
    setProfileVisible(false);
    if (navigationRef.getCurrentRoute()?.name === 'More') {
      navigationRef.navigate('Home');
    }
  };
  
  // Onboarding state
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('profile');
  const [tempProfileData, setTempProfileData] = useState<any>(null);
  const [tempCurrentLevel, setTempCurrentLevel] = useState<number | null>(null);

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

  return (
    <View style={styles.appShell}>
      <NavigationContainer ref={navigationRef}>
        <Tab.Navigator
          screenListeners={({ route }) => ({
            tabPress: () => {
              if (route.name !== 'More' && isProfileVisible) {
                setProfileVisible(false);
              }
            },
          })}
          screenOptions={({ route }) => {
            const icon = TAB_ICONS[route.name as keyof typeof TAB_ICONS] || TAB_ICONS.Home;
            const isMoreRoute = route.name === 'More';
            const forcedActive = isMoreRoute && isProfileVisible;
            return {
              headerShown: false,
              tabBarActiveTintColor: '#6C63FF',
              tabBarInactiveTintColor: '#A0A3BD',
              tabBarStyle: {
                paddingBottom: 4,
                paddingTop: 6,
                height: 64,
                backgroundColor: '#0A0E27',
                borderTopColor: '#2A2F4F',
              },
              tabBarLabelStyle: {
                fontSize: 12,
                marginBottom: 2,
              },
              tabBarIcon: ({ color, focused }) => {
                const isActive = focused || forcedActive;
                const tint = forcedActive ? '#6C63FF' : color;
                if (isMoreRoute) {
                  return (
                    <View style={styles.menuIconStack}>
                      {[0, 1, 2, 3].map((idx) => (
                        <View
                          key={idx}
                          style={[styles.menuIconBar, { backgroundColor: tint }]}
                        />
                      ))}
                    </View>
                  );
                }
                return (
                  <Ionicons
                    name={isActive ? icon.active : icon.default}
                    size={28}
                    color={tint}
                  />
                );
              },
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
          name="Workouts"
          options={{ tabBarLabel: 'Workouts' }}
        >
          {() => (
            state && <PlansScreen
              user={state.user!}
              phase={state.currentPhase}
              workoutSessions={state.workoutSessions}
              onRegenerateWorkoutPlan={regenerateWorkoutPlan}
              onLoadTemplate={loadWeeklyTemplate}
            />
          )}
        </Tab.Screen>
        <Tab.Screen 
          name="Menu"
          options={{ tabBarLabel: 'Menu' }}
        >
          {() => (
            state && <MenuScreen
              user={state.user!}
              phase={state.currentPhase}
              mealPlans={state.mealPlans}
              onRegenerateMealPlan={regenerateMealPlan}
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
        <Tab.Screen
          name="More"
          component={EmptyScreen}
          options={{
            tabBarLabel: 'More', 
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.menuIconContainer}>
                <View style={styles.menuIconStack}>
                  {[0, 1, 2].map((idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.menuIconBar, 
                        { backgroundColor: color },
                        focused && styles.menuIconBarActive
                      ]}
                    />
                  ))}
                </View>
              </View>
            ),
          }}
          listeners={{
            tabPress: () => {
              setProfileVisible(true);
            },
          }}
        />
      </Tab.Navigator>
      </NavigationContainer>
      {isProfileVisible && state?.user && (
        <View style={styles.profileSheet} pointerEvents="box-none">
          <View style={styles.profileSheetHandle} />
          <View style={styles.profileSheetContent}>
            <ProfileScreen 
              user={state.user}
              onSave={updateUser}
              onClose={closeProfileSheet}
              onChangeCurrentLevel={() => {
                closeProfileSheet();
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
                closeProfileSheet();
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
          </View>
        </View>
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
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
  profileSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 64,
    backgroundColor: '#050714',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingTop: 24,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  profileSheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 12,
  },
  profileSheetContent: {
    flex: 1,
  },
  menuIconContainer: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIconStack: {
    width: 24,
    height: 18,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuIconBar: {
    width: 24,
    height: 3, 
    borderRadius: 2,
  },
  menuIconBarActive: {
    height: 3.5,
  },
});
