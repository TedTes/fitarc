import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Animated,
  Modal,
  Pressable,
  Alert,
  Linking,
  AppState,
} from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppState } from './src/hooks';
import { FabActionConfig, FabActionProvider, useFabAction } from './src/contexts/FabActionContext';
import { 
  CurrentPhysiqueSelectionScreen,
  TargetPhysiqueSelectionScreen,
  DashboardScreen,
  ProgressScreen, 
  MenuScreen,
  PhotoCaptureScreen,
  ProfileScreen,
  ProfileSetupScreen,
  AuthNavigator,
} from './src/screens';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  PhotoCheckin,
  TrackingPreferences,
  User,
  WorkoutSessionEntry,
} from './src/types/domain';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { fetchUserProfile, saveUserProfile, updateTrackingPreferences, getSignedAvatarUrl } from './src/services/userProfileService';
import { fetchHomeData } from './src/services/dashboardService';
import { formatLocalDateYMD } from './src/utils/date';
import { 
  createPhaseWithWorkouts,
  completePhase as completeRemotePhase 
} from './src/services/phaseService';
import { fetchWorkoutSessionEntries } from './src/services/workoutService';
import { supabase } from './src/lib/supabaseClient';
import { deleteAccount as deleteAccountService } from './src/services/accountService';

type RootTabParamList = {
  Home: undefined;
  Menu: undefined;
  Progress: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

type IoniconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<keyof RootTabParamList, { default: IoniconName; active: IoniconName }> = {
  Home: { default: 'barbell-outline', active: 'barbell' },
  Menu: { default: 'fast-food-outline', active: 'fast-food' },
  Progress: { default: 'stats-chart-outline', active: 'stats-chart' },
};

const linking = {
  prefixes: ['fitarc://'],
  config: {
    screens: {
      Home: 'home',
      Menu: 'menu',
      Progress: 'progress',
    },
  },
};

type OnboardingStep = 'profile' | 'current_physique' | 'target_physique' | 'complete';

const TabPlaceholder: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <View style={styles.container}>
    <View style={styles.placeholderCard}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSubtitle}>{subtitle}</Text>
    </View>
  </View>
);

// Custom animated tab bar button
const AnimatedTabButton: React.FC<{
  focused: boolean;
  icon: IoniconName;
  activeIcon: IoniconName;
  onPress: () => void;
}> = ({ focused, icon, activeIcon, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const indicatorScale = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const popAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }),
      Animated.spring(indicatorScale, {
        toValue: focused ? 1 : 0,
        useNativeDriver: true,
        friction: 6,
        tension: 80,
      }),
    ]).start();
  }, [focused]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.85,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handlePress = () => {
    popAnim.setValue(0);
    Animated.sequence([
      Animated.spring(popAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
        tension: 120,
      }),
      Animated.spring(popAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 7,
        tension: 110,
      }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      style={styles.tabButton}
    >
      <Animated.View
        style={[
          styles.tabButtonInner,
          {
            transform: [
              {
                scale: Animated.multiply(
                  scaleAnim,
                  popAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.08],
                  })
                ),
              },
            ],
          },
        ]}
      >
        <View>
          <Ionicons
            name={focused ? activeIcon : icon}
            size={40}
            color="rgba(255,255,255,0.6)"
          />
        </View>

        {/* Round indicator dot below icon */}
        <Animated.View
          style={[
            styles.activeIndicatorDot,
            {
              transform: [{ scale: indicatorScale }],
              opacity: indicatorScale,
            },
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

// Animated FAB component
const AnimatedFAB: React.FC<{
  config: FabActionConfig | null;
  popAnim: Animated.Value;
}> = ({ config, popAnim }) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (config) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 7,
          tension: 100,
        }),
        Animated.spring(rotateAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
          tension: 80,
        }),
      ]).start();
    } else {
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [config]);

  if (!config) return null;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.88,
      useNativeDriver: true,
      friction: 6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.fabContainer,
        {
          transform: [
            {
              scale: Animated.multiply(
                scaleAnim,
                popAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.08],
                })
              ),
            },
            {
              rotate: rotateAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['180deg', '0deg'],
              }),
            },
          ],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.fabButton}
        onPress={config.onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <LinearGradient
          colors={config.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Text style={[styles.fabIcon, { color: config.iconColor }]}>
            {config.icon}
          </Text>
        </LinearGradient>
        
        {/* Glow ring */}
        <View style={styles.fabGlowRing} />
      </TouchableOpacity>
      
      <Animated.Text
        style={[
          styles.fabLabel,
          {
            color: config.labelColor,
            transform: [
              {
                scale: popAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.06],
                }),
              },
            ],
          },
        ]}
      >
        {config.label}
      </Animated.Text>
    </Animated.View>
  );
};

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
    clearAllData,
    resetWorkoutData,
    loadWorkoutSessionsFromSupabase,
    hydrateFromRemote,
    loadMealPlansFromSupabase,
  } = useAppState();
  
  const [isPhotoCaptureVisible, setPhotoCaptureVisible] = useState(false);
  const [photoCapturePhaseId, setPhotoCapturePhaseId] = useState<string | null>(null);
  const [photoCaptureOptional, setPhotoCaptureOptional] = useState(false);
  const [isProfileVisible, setProfileVisible] = useState(false);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState<keyof RootTabParamList | null>(null);
  const { getFabAction, setFabAction } = useFabAction();
  const tabFabPop = useRef(new Animated.Value(0)).current;
  const showPlanTabs = Boolean(state?.user);
  const [bootstrapComplete, setBootstrapComplete] = useState(false);

  const handleAddProgress = useCallback(() => {
    if (!state?.currentPhase) return;
    setPhotoCapturePhaseId(state.currentPhase.id);
    setPhotoCaptureOptional(true);
    setPhotoCaptureVisible(true);
  }, [state?.currentPhase]);

  const handleUpdateTrackingPreferences = useCallback(
    async (preferences: TrackingPreferences) => {
      if (!state?.user) return;
      const nextUser: User = {
        ...state.user,
        trackingPreferences: preferences,
      };
      updateUser(nextUser);
      try {
        await updateTrackingPreferences(nextUser.id, preferences);
      } catch (err) {
        console.error('Failed to persist tracking preferences', err);
      }
    },
    [state?.user, updateUser, updateTrackingPreferences]
  );

  const fabConfig = getFabAction(currentRouteName);
  const triggerTabFabPop = useCallback(() => {
    tabFabPop.setValue(0);
    Animated.sequence([
      Animated.spring(tabFabPop, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
        tension: 120,
      }),
      Animated.spring(tabFabPop, {
        toValue: 0,
        useNativeDriver: true,
        friction: 7,
        tension: 110,
      }),
    ]).start();
  }, [tabFabPop]);

  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('complete');
  const [tempProfileData, setTempProfileData] = useState<any>(null);
  const [tempCurrentLevel, setTempCurrentLevel] = useState<number | null>(null);
  const [startPlanConfirmVisible, setStartPlanConfirmVisible] = useState(false);
  const previousPhaseIdRef = useRef<string | null>(null);

  const closeProfileSheet = () => {
    setProfileVisible(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate('Home');
    }
  };

  const openStartPlanConfirm = () => {
    setStartPlanConfirmVisible(true);
  };

  const closeStartPlanConfirm = () => {
    setStartPlanConfirmVisible(false);
  };

  const confirmStartNewPlan = () => {
    if (!state?.user) return;
    closeStartPlanConfirm();
    closeProfileSheet();
    setTempProfileData({
      sex: state.user.sex,
      age: state.user.age,
      heightCm: state.user.heightCm,
      experienceLevel: state.user.experienceLevel,
      trainingSplit: state.user.trainingSplit,
      eatingMode: state.user.eatingMode,
    });
    setOnboardingStep('current_physique');
  };


  useEffect(() => {
    if (!navigationRef.isReady()) return;
    if (showPlanTabs) return;
    if (currentRouteName === 'Menu') {
      navigationRef.navigate('Home');
    }
  }, [currentRouteName, navigationRef, showPlanTabs]);

  useEffect(() => {
    const refreshAvatar = async () => {
      if (!state?.user?.avatarPath) return;
      const signedUrl = await getSignedAvatarUrl(state.user.avatarPath);
      if (!signedUrl) return;
      updateUser({ ...state.user, avatarUrl: signedUrl });
    };

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshAvatar();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [state?.user, updateUser]);

  useEffect(() => {
    const handleDeepLink = async (url: string | null) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      const code = parsed.queryParams?.code as string | undefined;
      const accessToken = parsed.queryParams?.access_token as string | undefined;
      const refreshToken = parsed.queryParams?.refresh_token as string | undefined;

      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      } catch (error) {
        Alert.alert(
          'Authentication failed',
          'We could not complete sign-in from the confirmation link.'
        );
      }
    };

    Linking.getInitialURL().then((url) => {
      void handleDeepLink(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

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
    if (state?.user) {
      const updatedUser = { ...state.user, currentPhysiqueLevel: levelId };
      updateUser(updatedUser);
      saveUserProfile(updatedUser).catch((err) =>
        console.error('Failed to persist current physique level', err)
      );
    }
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

  const handleStartNewArc = async (targetLevelId: number, goalType?: string) => {
    if (!authUser || !state?.user) return;
    const currentLevel = tempCurrentLevel ?? state.user.currentPhysiqueLevel ?? 1;

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
          goalType: goalType ?? 'general',
          startDate: formatLocalDateYMD(new Date()),
          currentLevelId: currentLevel,
          targetLevelId,
        }
      );

      console.log('✅ Plan created:', remotePhase.id);

      await startPhase(remotePhase);
      resetWorkoutData();
      const seededSessions = await waitForInitialSessions(authUser.id, remotePhase.id);
      if (seededSessions.length) {
        await hydrateFromRemote({ workoutSessions: seededSessions });
      }
      // Meal entries are generated on demand via the generate-meals edge function.
      await loadWorkoutSessionsFromSupabase(authUser.id, remotePhase.id);
      await loadMealPlansFromSupabase(authUser.id, remotePhase.id);
      
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

  const handleTargetPhysiqueSelect = async (targetLevelId: number) => {
    await handleStartNewArc(targetLevelId);
  };

  const handleProfileSetupComplete = async (profileData: {
    name: string;
    sex: 'male' | 'female' | 'other';
    age: number;
    heightCm: number;
    weightKg: number;
    experienceLevel: 'beginner' | 'intermediate' | 'advanced';
    trainingSplit: 'full_body' | 'upper_lower' | 'push_pull_legs' | 'bro_split' | 'custom';
    eatingMode: 'mild_deficit' | 'recomp' | 'lean_bulk' | 'maintenance';
  }) => {
    if (!authUser) {
      Alert.alert('Error', 'Unable to complete setup. Please sign in again.');
      return;
    }

    const newUser: User = {
      id: authUser.id,
      name: profileData.name,
      sex: profileData.sex,
      age: profileData.age,
      heightCm: profileData.heightCm,
      weightKg: profileData.weightKg,
      experienceLevel: profileData.experienceLevel,
      trainingSplit: profileData.trainingSplit,
      eatingMode: profileData.eatingMode,
      currentPhysiqueLevel: 1,
      createdAt: new Date().toISOString(),
    };

    try {
      await saveUserProfile(newUser);
    } catch (error) {
      Alert.alert(
        'Profile save failed',
        'We could not save your profile. Please try again.'
      );
      return;
    }

    updateUser(newUser);
    setTempProfileData(profileData);
    setOnboardingStep('current_physique');
  };

  useEffect(() => {
    if (!authUser) return;
    if (!state) return;
    if (state.currentPhase) {
      setBootstrapComplete(true);
      setOnboardingStep('complete');
      return;
    }
    let cancelled = false;
    setBootstrapComplete(false);
    setOnboardingStep('complete');

    const bootstrapUser = async () => {
      try {
        const remoteProfile = await fetchUserProfile(authUser.id);
        if (cancelled) return;

        if (remoteProfile) {
          await updateUser(remoteProfile);
          
          const homeData = await fetchHomeData(authUser.id);
          if (cancelled) return;

          await hydrateFromRemote({
            phase: homeData.phase ?? null,
            workoutSessions: homeData.recentSessions,
            mealPlans: homeData.todayMealPlan ? [homeData.todayMealPlan] : undefined,
          });
          resetWorkoutData();

          if (homeData.phase?.id) {
            await loadWorkoutSessionsFromSupabase(authUser.id, homeData.phase.id);
            await loadMealPlansFromSupabase(authUser.id, homeData.phase.id);
          }
          setOnboardingStep('complete');
        } else {
          setOnboardingStep('profile');
        }
      } catch (err) {
        console.error('Failed to bootstrap user', err);
        Alert.alert(
          'Profile load failed',
          'We could not load your profile. Please check your connection and try again.'
        );
      } finally {
        if (!cancelled) {
          setBootstrapComplete(true);
        }
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
    loadMealPlansFromSupabase,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !bootstrapComplete) return;
    if (!state?.user || state.currentPhase) return;
    if (onboardingStep !== 'complete') return;
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
  }, [bootstrapComplete, isAuthenticated, onboardingStep, state?.currentPhase, state?.user]);

  const handleStartPhaseFromDashboard = useCallback(() => {
    console.log('🎯 Create Plan clicked!');
    
    if (!state?.user) {
      console.log('❌ No user found, showing profile setup');
      setOnboardingStep('profile');
      return;
    }

    console.log('✅ User found, preparing physique selection');
    
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
    
    console.log('✅ Onboarding step set to: current_physique');
  }, [state?.user]);

  useEffect(() => {
    if (!state?.user) return;
    const phaseId = state.currentPhase?.id ?? null;
    const hadPhase = previousPhaseIdRef.current;

    if (phaseId) {
      if (!hadPhase) {
        setFabAction('Menu', null);
        setFabAction('Progress', null);
      }
    } else {
      const createPlanAction = {
        label: 'Create Plan',
        icon: '+',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: handleStartPhaseFromDashboard,
      };
      setFabAction('Menu', createPlanAction);
      setFabAction('Progress', createPlanAction);
    }

    previousPhaseIdRef.current = phaseId;
  }, [handleStartPhaseFromDashboard, setFabAction, state?.currentPhase?.id, state?.user]);

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

  const handleDeleteAccount = async () => {
    try {
      await deleteAccountService();
    } catch (error: any) {
      Alert.alert(
        'Delete failed',
        error?.message || 'Unable to delete your account. Please try again.'
      );
      return;
    }

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

  if (isAuthLoading || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  if (isAuthenticated && !bootstrapComplete) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

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

  const shouldShowOnboarding =
    onboardingStep === 'profile' ||
    onboardingStep === 'current_physique' ||
    onboardingStep === 'target_physique';

  if (shouldShowOnboarding) {
    if (onboardingStep === 'profile' || !state?.user) {
      return (
        <View style={styles.container}>
          <ProfileSetupScreen onComplete={handleProfileSetupComplete} />
          <StatusBar style="light" />
        </View>
      );
    }

    if (onboardingStep === 'current_physique' && tempProfileData) {
      const canCancel = Boolean(state?.currentPhase);
      return (
        <View style={styles.container}>
          <CurrentPhysiqueSelectionScreen 
            sex={tempProfileData.sex}
            currentLevelId={state.user?.currentPhysiqueLevel ?? 1}
            onSelectLevel={handleCurrentPhysiqueSelect}
            onCancel={
              canCancel
                ? () => setOnboardingStep('complete')
                : () => setOnboardingStep('profile')
            }
          />
          <StatusBar style="light" />
        </View>
      );
    }

    if (onboardingStep === 'target_physique' && tempCurrentLevel && tempProfileData) {
      const canCancel = Boolean(state?.currentPhase);
      return (
        <View style={styles.container}>
          <TargetPhysiqueSelectionScreen 
            sex={tempProfileData.sex}
            currentLevelId={tempCurrentLevel}
            onSelectTarget={handleTargetPhysiqueSelect}
            onCancel={() => setOnboardingStep('current_physique')}
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
        />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.appShell}>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        onReady={() => setCurrentRouteName(navigationRef.getCurrentRoute()?.name ?? null)}
        onStateChange={() => setCurrentRouteName(navigationRef.getCurrentRoute()?.name ?? null)}
      >
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            lazy: false,
            tabBarStyle: {
              display: 'none',
              backgroundColor: '#1E2340',
              borderTopColor: '#2A2F4F',
              borderTopWidth: 1,
            },
          }}
        >
          <Tab.Screen name="Home">
            {() =>
              state?.user ? (
                <DashboardScreen 
                  user={state.user}
                  phase={state.currentPhase}
                  workoutSessions={state.workoutSessions}
                  onProfilePress={() => setProfileVisible(true)}
                  onStartPhase={handleStartPhaseFromDashboard}
                  onToggleWorkoutExercise={toggleWorkoutExercise}
                  onCreateSession={createWorkoutSession}
                />
              ) : (
                <TabPlaceholder
                  title="Welcome to FitArc"
                  subtitle="Complete onboarding to unlock your dashboard."
                />
              )
            }
          </Tab.Screen>
          <Tab.Screen name="Menu">
            {() =>
              state?.user && state.currentPhase ? (
                <MenuScreen
                  user={state.user}
                  phase={state.currentPhase}
                />
              ) : (
                <TabPlaceholder
                  title="No active plan"
                  subtitle="Create a plan to generate meals."
                />
              )
            }
          </Tab.Screen>
          <Tab.Screen name="Progress">
            {() =>
              state?.currentPhase && state?.user ? (
                <ProgressScreen 
                  user={state.user}
                  phase={state.currentPhase}
                  workoutDataVersion={state.workoutDataVersion}
                  workoutSessions={state.workoutSessions}
                  workoutLogs={state.workoutLogs}
                  strengthSnapshots={state.strengthSnapshots}
                  onAddProgress={handleAddProgress}
                  onUpdateTrackingPreferences={handleUpdateTrackingPreferences}
                />
              ) : (
                <TabPlaceholder
                  title="Track progress"
                  subtitle="Create plan to unlock progress tracking."
                />
              )
            }
          </Tab.Screen>
        </Tab.Navigator>

        {/* Custom Animated Tab Bar */}
        <View style={styles.customTabBar} pointerEvents="box-none">
          <View style={styles.tabBarBackground} pointerEvents="none">
            <LinearGradient
              colors={['rgba(10, 14, 39, 0.96)', 'rgba(5, 7, 20, 0.99)']}
              style={styles.tabBarGradient}
            />
            <View style={styles.tabBarTopBorder} />
          </View>
          
          <View style={styles.tabBarContent} pointerEvents="box-none">
            <AnimatedTabButton
              focused={currentRouteName === 'Home'}
              icon={TAB_ICONS.Home.default}
              activeIcon={TAB_ICONS.Home.active}
              onPress={() => {
                setProfileVisible(false);
                triggerTabFabPop();
                navigationRef.navigate('Home');
              }}
            />
            {showPlanTabs && (
              <AnimatedTabButton
                focused={currentRouteName === 'Menu'}
                icon={TAB_ICONS.Menu.default}
                activeIcon={TAB_ICONS.Menu.active}
                onPress={() => {
                  setProfileVisible(false);
                  triggerTabFabPop();
                  navigationRef.navigate('Menu');
                }}
              />
            )}
            <AnimatedTabButton
              focused={currentRouteName === 'Progress'}
              icon={TAB_ICONS.Progress.default}
              activeIcon={TAB_ICONS.Progress.active}
              onPress={() => {
                setProfileVisible(false);
                triggerTabFabPop();
                navigationRef.navigate('Progress');
              }}
            />
            
            {/* Spacer for FAB */}
            <View style={styles.fabSpacer} />
          </View>
          
          {/* Animated FAB inside tab bar */}
          <AnimatedFAB config={fabConfig} popAnim={tabFabPop} />
        </View>
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
              onDeleteAccount={handleDeleteAccount}
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
                openStartPlanConfirm();
              }}
            />
          </View>
        </View>
      )}

      <Modal
        transparent
        animationType="fade"
        visible={startPlanConfirmVisible}
        onRequestClose={closeStartPlanConfirm}
      >
        <Pressable style={styles.confirmOverlay} onPress={closeStartPlanConfirm}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitle}>Start a new plan?</Text>
            <Text style={styles.confirmBody}>
              This will end your current plan and create a new one.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} onPress={closeStartPlanConfirm}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmPrimary} onPress={confirmStartNewPlan}>
                <Text style={styles.confirmPrimaryText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <StatusBar style="light" />
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FabActionProvider>
        <AppContent />
      </FabActionProvider>
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
    bottom: 88,
    backgroundColor: '#050714',
    zIndex: 0,
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
  customTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 104,
    zIndex: 10,
  },
  tabBarBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  tabBarGradient: {
    flex: 1,
  },
  tabBarTopBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
  },
  tabBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 26,
    paddingTop: 12,
    paddingLeft: 12,
    paddingRight: 12,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  tabButtonInner: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingVertical: 4,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  activeIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6C63FF',
    marginTop: 6,
  },
  fabSpacer: {
    width: 92,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    alignItems: 'center',
    gap: 6,
  },
  fabButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    position: 'relative',
  },
  fabGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00F5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  fabGlowRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(0, 245, 160, 0.2)',
    top: -4,
    left: -4,
  },
  fabIcon: {
    fontSize: 36,
    fontWeight: '300',
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 36,
    includeFontPadding: false,
  },
  fabLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8,10,22,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#151932',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    padding: 20,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  confirmBody: {
    fontSize: 14,
    color: '#A0A3BD',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  confirmCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#101427',
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A0A3BD',
  },
  confirmPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#00F5A0',
    alignItems: 'center',
  },
  confirmPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0E27',
  },
});
