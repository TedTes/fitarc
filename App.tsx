import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAppState } from './src/hooks';
import { 
  CurrentPhysiqueSelectionScreen,
  TargetPhysiqueSelectionScreen,
  DashboardScreen,
  PlansScreen,
  ProgressScreen, 
  MenuScreen,
  PhotoCaptureScreen,
  ProfileScreen,
  ProfileSetupScreen,
  AuthNavigator,
} from './src/screens';
import { generatePhase } from './src/utils';
import { useEffect, useState, useCallback } from 'react';
import { PhotoCheckin, User, WorkoutSessionEntry } from './src/types/domain';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { fetchUserProfile, saveUserProfile } from './src/services/userProfileService';
import { fetchHomeData } from './src/services/appDataService';
import { 
  createPhaseWithWorkouts,
  completePhase as completeRemotePhase 
} from './src/services/phaseService';
import { fetchWorkoutSessionEntries } from './src/services/supabaseWorkoutService';

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

const TabPlaceholder: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <View style={styles.container}>
    <View style={styles.placeholderCard}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSubtitle}>{subtitle}</Text>
    </View>
  </View>
);

function AppContent() {
  const navigationRef = useNavigationContainerRef<RootTabParamList>();
  const { user: authUser, isLoading: isAuthLoading, isAuthenticated, signOut: signOutAuth } = useAuth();
  
  const {
    state,
    isLoading,
    updateUser,
    addPhotoCheckin,
    startPhase,
    toggleWorkoutExercise,
    createWorkoutSession,
    saveCustomWorkoutSession,
    deleteWorkoutSession,
    markAllWorkoutsComplete,
    clearAllData,
    loadWorkoutSessionsFromSupabase,
    hydrateFromRemote,
  } = useAppState();
  
  const [isPhotoCaptureVisible, setPhotoCaptureVisible] = useState(false);
  const [photoCapturePhaseId, setPhotoCapturePhaseId] = useState<string | null>(null);
  const [photoCaptureOptional, setPhotoCaptureOptional] = useState(false);
  const [isProfileVisible, setProfileVisible] = useState(false);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  // Onboarding state - Start with 'complete' instead of 'profile'
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('complete');
  const [tempProfileData, setTempProfileData] = useState<any>(null);
  const [tempCurrentLevel, setTempCurrentLevel] = useState<number | null>(null);

  const closeProfileSheet = () => {
    setProfileVisible(false);
    if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name === 'More') {
      navigationRef.navigate('Home');
    }
  };

  const waitForInitialSessions = useCallback(async (
    userId: string,
    planId: string
  ): Promise<WorkoutSessionEntry[]> => {
    const maxAttempts = 10;
    const delayMs = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const sessions = await fetchWorkoutSessionEntries(userId, planId);
        if (sessions.length > 0) {
          return sessions;
        }
      } catch (error) {
        console.warn('Workout session poll failed', error);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return [];
  }, []);

  const handleCurrentPhysiqueSelect = (levelId: number) => {
    setTempCurrentLevel(levelId);
    setOnboardingStep('target_physique');
  };

  const handleProfileSave = async (profile: User) => {
    await updateUser(profile);
    try {
      await saveUserProfile(profile);
    } catch (err) {
      console.error('Failed to persist profile', err);
    }
  };

  const handleTargetPhysiqueSelect = async (targetLevelId: number) => {
    if (!tempCurrentLevel || !authUser || !state?.user) return;

    setIsCreatingPlan(true);

    try {
      console.log('🎯 Creating plan with workouts...');
      
      if (state.currentPhase) {
        await completeRemotePhase(state.currentPhase.id);
      }
      
      const remotePhase = await createPhaseWithWorkouts(
        authUser.id,
        state.user.trainingSplit,
        {
          name: `Arc ${new Date().getFullYear()}`,
          goalType: 'general',
          startDate: new Date().toISOString().split('T')[0],
          currentLevelId: tempCurrentLevel,
          targetLevelId,
        }
      );

      console.log('✅ Plan created:', remotePhase.id);

      await startPhase(remotePhase);
      const seededSessions = await waitForInitialSessions(authUser.id, remotePhase.id);
      if (seededSessions.length) {
        await hydrateFromRemote({ workoutSessions: seededSessions });
      }
      await loadWorkoutSessionsFromSupabase(authUser.id, remotePhase.id);
      
      console.log('✅ Sessions loaded successfully');
      
      setOnboardingStep('complete');
      setPhotoCaptureVisible(false);
    } catch (error) {
      console.error('❌ Failed to create plan:', error);
      alert('Failed to create plan. Please try again.');
    } finally {
      setIsCreatingPlan(false);
    }
  };

  const handleProfileSetupComplete = (profileData: {
    sex: 'male' | 'female' | 'other';
    age: number;
    heightCm: number;
    experienceLevel: 'beginner' | 'intermediate' | 'advanced';
    trainingSplit: 'full_body' | 'upper_lower' | 'push_pull_legs' | 'bro_split' | 'custom';
    eatingMode: 'mild_deficit' | 'recomp' | 'lean_bulk' | 'maintenance';
  }) => {
    setTempProfileData(profileData);
    setOnboardingStep('current_physique');
  };

  useEffect(() => {
    if (!authUser) return;
    if (!state) return;
    if (state.currentPhase) return;
    let cancelled = false;

    const bootstrapUser = async () => {
      try {
        const remoteProfile = await fetchUserProfile(authUser.id);
        if (cancelled) return;

        if (remoteProfile) {
          await updateUser(remoteProfile);
          
          // Fetch home data (includes existing phase if any)
          const homeData = await fetchHomeData(authUser.id);
          if (cancelled) return;

          // Only hydrate with existing phase, don't create new one
          await hydrateFromRemote({
            phase: homeData.phase ?? null,
            workoutSessions: homeData.recentSessions,
            mealPlans: homeData.todayMealPlan ? [homeData.todayMealPlan] : undefined,
          });

          // Load workout sessions if there's an active phase
          if (homeData.phase?.id) {
            await loadWorkoutSessionsFromSupabase(authUser.id, homeData.phase.id);
          }
          setOnboardingStep('complete');
        } else {
          // No profile exists - show profile setup
          setOnboardingStep('profile');
        }
      } catch (err) {
        console.error('Failed to bootstrap user', err);
      }
    };

    bootstrapUser();

    return () => {
      cancelled = true;
    };
  }, [
    authUser?.id,
    state?.currentPhase,
    updateUser,
    hydrateFromRemote,
    loadWorkoutSessionsFromSupabase,
  ]);

  const handleStartPhaseFromDashboard = () => {
    console.log('🎯 Create Plan clicked!');
    
    if (!state?.user) {
      console.log('❌ No user found, showing profile setup');
      setOnboardingStep('profile');
      return;
    }

    console.log('✅ User found, preparing physique selection');
    
    // Prepare data for physique selection
    setTempProfileData({
      sex: state.user.sex,
      age: state.user.age,
      heightCm: state.user.heightCm,
      experienceLevel: state.user.experienceLevel,
      trainingSplit: state.user.trainingSplit,
      eatingMode: state.user.eatingMode,
    });
    setTempCurrentLevel(state.user.currentPhysiqueLevel);
    
    // Trigger physique selection flow
    setOnboardingStep('current_physique');
    
    console.log('✅ Onboarding step set to: current_physique');
  };

  const handleLogout = async () => {
    try {
      await signOutAuth();
    } catch (error) {
      console.error('Sign out failed', error);
    }
    try {
      await clearAllData();
    } catch (error) {
      console.error('Failed to clear local data', error);
    }
    setProfileVisible(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate('Home');
    }
    setOnboardingStep('profile');
  };

  const closePhotoCapture = () => {
    setPhotoCaptureVisible(false);
    setPhotoCapturePhaseId(null);
    setPhotoCaptureOptional(false);
  };

  const handlePhotoCaptured = async (photo: PhotoCheckin) => {
    await addPhotoCheckin(photo);
    closePhotoCapture();
    setOnboardingStep('complete');
  };

  // Show loading while checking auth or loading app state
  if (isAuthLoading || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  // Show auth screens if not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <AuthNavigator />
        <StatusBar style="light" />
      </View>
    );
  }

  if (isCreatingPlan) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={styles.loadingText}>Building your plan…</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  //Show onboarding based on step, allowing "Create Plan" to trigger physique selection
  const shouldShowOnboarding = 
    !state?.user || 
    onboardingStep === 'current_physique' || 
    onboardingStep === 'target_physique';

  // Onboarding flow
  if (shouldShowOnboarding) {
    // Profile setup - only if no user exists
    if (onboardingStep === 'profile' || !state?.user) {
      return (
        <View style={styles.container}>
          <ProfileSetupScreen onComplete={handleProfileSetupComplete} />
          <StatusBar style="light" />
        </View>
      );
    }

    // Current physique selection - can be triggered by "Create Plan" button
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

    // Target physique selection
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

  // Photo capture overlay
  if (isPhotoCaptureVisible && photoCapturePhaseId) {
    return (
      <View style={styles.container}>
        <PhotoCaptureScreen 
          phasePlanId={photoCapturePhaseId}
          onComplete={handlePhotoCaptured}
          onSkip={photoCaptureOptional ? closePhotoCapture : undefined}
        />
        <StatusBar style="light" />
      </View>
    );
  }

  // Main app
  return (
    <View style={styles.appShell}>
      <NavigationContainer ref={navigationRef}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#0A0E27',
              borderTopColor: 'rgba(255,255,255,0.1)',
              height: 64,
              paddingBottom: 8,
              paddingTop: 8,
            },
            tabBarActiveTintColor: '#6C63FF',
            tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
            tabBarIcon: ({ focused, color }) => {
              const icon = TAB_ICONS[route.name];
              if (!icon) return null;
              
              if (route.name === 'More') {
                return (
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
                );
              }
              
              return (
                <Ionicons
                  name={focused ? icon.active : icon.default}
                  size={28}
                  color={color}
                />
              );
            },
          })}
        >
          <Tab.Screen 
            name="Home" 
            options={{ tabBarLabel: 'Home' }}
            listeners={{
              tabPress: () => setProfileVisible(false),
            }}
          >
            {() =>
              state?.user ? (
                <DashboardScreen 
                  user={state.user}
                  phase={state.currentPhase}
                  workoutSessions={state.workoutSessions}
                  onProfilePress={() => setProfileVisible(true)}
                  onStartPhase={handleStartPhaseFromDashboard}
                  onToggleWorkoutExercise={toggleWorkoutExercise}
                  onMarkAllWorkoutsComplete={markAllWorkoutsComplete}
                />
              ) : (
                <TabPlaceholder
                  title="Welcome to FitArc"
                  subtitle="Complete onboarding to unlock your dashboard."
                />
              )
            }
          </Tab.Screen>
          <Tab.Screen 
            name="Workouts"
            options={{ tabBarLabel: 'Workouts' }}
            listeners={{
              tabPress: () => setProfileVisible(false),
            }}
          >
            {() =>
              state?.user ? (
                <PlansScreen
                  user={state.user}
                  phase={state.currentPhase}
                  workoutSessions={state.workoutSessions}
                  workoutDataVersion={state.workoutDataVersion}
                  onSaveCustomSession={saveCustomWorkoutSession}
                  onDeleteSession={deleteWorkoutSession}
                  onToggleExercise={toggleWorkoutExercise}
                />
              ) : (
                <TabPlaceholder
                  title="Workouts loading"
                  subtitle="Finish onboarding to sync your workouts."
                />
              )
            }
          </Tab.Screen>
          <Tab.Screen 
            name="Menu"
            options={{ tabBarLabel: 'Menu' }}
            listeners={{
              tabPress: () => setProfileVisible(false),
            }}
          >
            {() =>
              state?.user ? (
                <MenuScreen
                  user={state.user}
                  phase={state.currentPhase}
                  mealPlans={state.mealPlans}
                />
              ) : (
                <TabPlaceholder
                  title="Nutrition coming soon"
                  subtitle="Complete onboarding to generate meal plans."
                />
              )
            }
          </Tab.Screen>
          <Tab.Screen 
            name="Progress"
            options={{ tabBarLabel: 'Progress' }}
            listeners={{
              tabPress: () => setProfileVisible(false),
            }}
          >
            {() =>
              state?.currentPhase && state?.user ? (
                <ProgressScreen 
                  user={state.user}
                  phase={state.currentPhase}
                  workoutDataVersion={state.workoutDataVersion}
                  workoutSessions={state.workoutSessions}
                  mealPlans={state.mealPlans}
                  workoutLogs={state.workoutLogs}
                  strengthSnapshots={state.strengthSnapshots}
                />
              ) : (
                <TabPlaceholder
                  title="Track progress"
                  subtitle="Start an arc to unlock progress tracking."
                />
              )
            }
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
              onSave={handleProfileSave}
              onClose={closeProfileSheet}
              onLogout={handleLogout}
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

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
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
  loadingText: {
    marginTop: 16,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
  placeholderCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#0A0E27',
  },
  placeholderTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  placeholderSubtitle: {
    color: '#A0A3BD',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
