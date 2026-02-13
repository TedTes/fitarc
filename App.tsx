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
import * as ExpoLinking from 'expo-linking';
import { useAppState } from './src/hooks';
import { FabActionConfig, FabActionProvider, useFabAction } from './src/contexts/FabActionContext';
import { 
  WelcomeScreen,
  MainFocusScreen,
  QuickPlanSetupScreen,
  CurrentPhysiqueSelectionScreen,
  TargetPhysiqueSelectionScreen,
  DashboardScreen,
  ProgressScreen,
  MenuScreen,
  LibraryScreen,
  PhotoCaptureScreen,
  ProfileScreen,
  ProfileSetupScreen,
  AuthNavigator,
} from './src/screens';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  PlanPreferences,
  PrimaryGoal,
  PhotoCheckin,
  TrackingPreferences,
  User,
} from './src/types/domain';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { fetchUserProfile, saveUserProfile, updateTrackingPreferences, getSignedAvatarUrl } from './src/services/userProfileService';
import { fetchHomeData } from './src/services/dashboardService';
import { formatLocalDateYMD } from './src/utils/date';
import { hasRequiredPlanInputs } from './src/utils/planReadiness';
import { 
  createPhase,
  completePhase as completeRemotePhase 
} from './src/services/phaseService';
import { linkPlanToMatchedTemplates } from './src/services/planRuntimeService';
import { supabase } from './src/lib/supabaseClient';
import { deleteAccount as deleteAccountService } from './src/services/accountService';

type RootTabParamList = {
  Today: undefined;
  Workouts: undefined;
  Meals: undefined;
  Progress: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

type IoniconName = keyof typeof Ionicons.glyphMap;

type TabConfig = {
  icon: IoniconName;
  activeIcon: IoniconName;
  label: string;
};

const TAB_CONFIG: Record<keyof RootTabParamList, TabConfig> = {
  Today:    { icon: 'today-outline',       activeIcon: 'today',        label: 'Today'    },
  Workouts: { icon: 'barbell-outline',     activeIcon: 'barbell',      label: 'Workouts' },
  Meals:    { icon: 'restaurant-outline',  activeIcon: 'restaurant',   label: 'Meals'    },
  Progress: { icon: 'trending-up-outline', activeIcon: 'trending-up',  label: 'Progress' },
};

const linking = {
  prefixes: ['fitarc://'],
  config: {
    screens: {
      Today: 'today',
      Workouts: 'workouts',
      Meals: 'meals',
      Progress: 'progress',
    },
  },
};

type OnboardingStep =
  | 'profile'
  | 'main_focus'
  | 'quick_plan'
  | 'current_physique'
  | 'target_physique'
  | 'complete';

const mapDaysPerWeekToSplit = (daysPerWeek: number): User['trainingSplit'] => {
  if (daysPerWeek >= 6) return 'upper_lower';
  if (daysPerWeek >= 5) return 'push_pull_legs';
  if (daysPerWeek >= 4) return 'upper_lower';
  return 'full_body';
};

const mapGoalToPhaseGoalType = (goal?: PrimaryGoal): string => {
  switch (goal) {
    case 'build_muscle':
      return 'hypertrophy';
    case 'get_stronger':
      return 'strength';
    case 'lose_fat':
      return 'fat_loss';
    case 'endurance':
      return 'endurance';
    case 'general_fitness':
    default:
      return 'general';
  }
};

const TabPlaceholder: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <View style={styles.container}>
    <View style={styles.placeholderCard}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSubtitle}>{subtitle}</Text>
    </View>
  </View>
);

// Custom animated tab bar button with label
const AnimatedTabButton: React.FC<{
  focused: boolean;
  icon: IoniconName;
  activeIcon: IoniconName;
  label: string;
  onPress: () => void;
}> = ({ focused, icon, activeIcon, label, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pillAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const popAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 100 }),
      Animated.spring(pillAnim, { toValue: focused ? 1 : 0, useNativeDriver: false, friction: 6, tension: 80 }),
    ]).start();
  }, [focused]);

  const handlePressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.88, useNativeDriver: true, friction: 8 }).start();

  const handlePressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();

  const handlePress = () => {
    popAnim.setValue(0);
    Animated.sequence([
      Animated.spring(popAnim, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 }),
      Animated.spring(popAnim, { toValue: 0, useNativeDriver: true, friction: 7, tension: 110 }),
    ]).start();
    onPress();
  };

  const pillBg = pillAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(108,99,255,0)', 'rgba(108,99,255,0.18)'] });

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
          { transform: [{ scale: Animated.multiply(scaleAnim, popAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })) }] },
        ]}
      >
        <Animated.View style={[styles.tabPill, { backgroundColor: pillBg }]}>
          <Ionicons
            name={focused ? activeIcon : icon}
            size={22}
            color={focused ? '#6C63FF' : 'rgba(255,255,255,0.45)'}
          />
          <Text style={[styles.tabLabel, focused && styles.tabLabelActive]} numberOfLines={1}>{label}</Text>
        </Animated.View>
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
    clearAllData,
    resetWorkoutData,
    loadWorkoutSessionsFromSupabase,
    loadPlannedWorkoutsFromSupabase,
    hydrateFromRemote,
    loadMealPlansFromSupabase,
    saveCustomWorkoutSession,
    addWorkoutExercise,
    deleteWorkoutExercise,
    replaceSessionWithTemplate,
    appendExercisesToSession,
  } = useAppState();
  
  const [isPhotoCaptureVisible, setPhotoCaptureVisible] = useState(false);
  const [photoCapturePhaseId, setPhotoCapturePhaseId] = useState<string | null>(null);
  const [photoCaptureOptional, setPhotoCaptureOptional] = useState(false);
  const [isProfileVisible, setProfileVisible] = useState(false);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState<keyof RootTabParamList | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
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
  const [tempPlanPreferences, setTempPlanPreferences] = useState<PlanPreferences | null>(null);
  const [tempPrimaryGoal, setTempPrimaryGoal] = useState<PrimaryGoal>('general_fitness');
  const [startPlanConfirmVisible, setStartPlanConfirmVisible] = useState(false);
  const previousPhaseIdRef = useRef<string | null>(null);

  const closeProfileSheet = () => {
    setProfileVisible(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate('Today');
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
    if (currentRouteName === 'Meals' || currentRouteName === 'Workouts') {
      navigationRef.navigate('Today');
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
      const parsed = ExpoLinking.parse(url);
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

  const handleQuickPlanComplete = useCallback(
    async (input: {
      daysPerWeek: 3 | 4 | 5 | 6;
      equipmentLevel: 'bodyweight' | 'dumbbells' | 'full_gym';
      injuries: string[];
    }) => {
      if (!state?.user) return;
      const inferredSplit = mapDaysPerWeekToSplit(input.daysPerWeek);
      const nextPreferences: PlanPreferences = {
        primaryGoal: tempPrimaryGoal,
        daysPerWeek: input.daysPerWeek,
        equipmentLevel: input.equipmentLevel,
        injuries: input.injuries,
      };
      const nextUser: User = {
        ...state.user,
        trainingSplit: inferredSplit,
        planPreferences: nextPreferences,
      };
      setTempPlanPreferences(nextPreferences);
      await updateUser(nextUser);
      try {
        await saveUserProfile(nextUser);
      } catch (err) {
        console.error('Failed to persist quick plan setup', err);
      }
      setOnboardingStep('current_physique');
    },
    [state?.user, tempPrimaryGoal, updateUser]
  );

  const handleQuickPlanSkip = useCallback(() => {
    if (state?.user?.planPreferences) {
      setTempPlanPreferences(state.user.planPreferences);
    } else {
      setTempPlanPreferences({
        primaryGoal: tempPrimaryGoal,
        daysPerWeek: 4,
        equipmentLevel: 'full_gym',
        injuries: [],
      });
    }
    setOnboardingStep('current_physique');
  }, [state?.user, tempPrimaryGoal]);

  const handleMainFocusSelect = useCallback((goal: PrimaryGoal) => {
    setTempPrimaryGoal(goal);
    setOnboardingStep('quick_plan');
  }, []);

  const handleMainFocusSkip = useCallback(() => {
    setTempPrimaryGoal('general_fitness');
    setOnboardingStep('quick_plan');
  }, []);

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
    if (!hasRequiredPlanInputs(state.user)) {
      Alert.alert(
        'Profile required',
        'Please complete your profile inputs first to generate a personalized plan.'
      );
      setOnboardingStep('profile');
      return;
    }
    const currentLevel = tempCurrentLevel ?? state.user.currentPhysiqueLevel ?? 1;

    setIsCreatingPlan(true);

    try {
      console.log('🎯 Creating plan...');
      
      if (state.currentPhase) {
        await completeRemotePhase(state.currentPhase.id);
      }
      
      const selectedGoal =
        goalType ??
        mapGoalToPhaseGoalType(tempPlanPreferences?.primaryGoal ?? state.user.planPreferences?.primaryGoal);
      const remotePhase = await createPhase(authUser.id, {
        name: `Arc ${new Date().getFullYear()}`,
        goalType: selectedGoal,
        startDate: formatLocalDateYMD(new Date()),
        currentLevelId: currentLevel,
        targetLevelId,
      });
      try {
        await linkPlanToMatchedTemplates(authUser.id, remotePhase.id);
      } catch (linkError) {
        console.warn('Unable to persist plan template map (fallback matching will be used):', linkError);
      }

      console.log('✅ Plan created:', remotePhase.id);

      await startPhase(remotePhase);
      resetWorkoutData();
      // Load runtime data in parallel; sessions can legitimately be empty until user starts training.
      await Promise.all([
        loadWorkoutSessionsFromSupabase(authUser.id, remotePhase.id),
        loadPlannedWorkoutsFromSupabase(authUser.id, remotePhase.id),
        loadMealPlansFromSupabase(authUser.id, remotePhase.id),
      ]);
      
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
    const goalType = mapGoalToPhaseGoalType(tempPlanPreferences?.primaryGoal);
    await handleStartNewArc(targetLevelId, goalType);
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
    setOnboardingStep('main_focus');
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
          if (!hasRequiredPlanInputs(remoteProfile)) {
            setOnboardingStep('profile');
            return;
          }
          
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
            await loadPlannedWorkoutsFromSupabase(authUser.id, homeData.phase.id);
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
    loadPlannedWorkoutsFromSupabase,
    loadMealPlansFromSupabase,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !bootstrapComplete) return;
    if (!state?.user || state.currentPhase) return;
    if (onboardingStep !== 'complete') return;
    if (!hasRequiredPlanInputs(state.user)) {
      setOnboardingStep('profile');
      return;
    }
    setTempPlanPreferences(
      state.user.planPreferences ?? {
        primaryGoal: 'general_fitness',
        daysPerWeek: 4,
        equipmentLevel: 'full_gym',
        injuries: [],
      }
    );
    setTempPrimaryGoal(state.user.planPreferences?.primaryGoal ?? 'general_fitness');
    setTempProfileData({
      sex: state.user.sex,
      age: state.user.age,
      heightCm: state.user.heightCm,
      experienceLevel: state.user.experienceLevel,
      trainingSplit: state.user.trainingSplit,
      eatingMode: state.user.eatingMode,
    });
    setTempCurrentLevel(state.user.currentPhysiqueLevel);
    setOnboardingStep('main_focus');
  }, [bootstrapComplete, isAuthenticated, onboardingStep, state?.currentPhase, state?.user]);

  const handleStartPhaseFromDashboard = useCallback(() => {
    console.log('🎯 Create Plan clicked!');
    
    if (!state?.user) {
      console.log('❌ No user found, showing profile setup');
      setOnboardingStep('profile');
      return;
    }
    if (!hasRequiredPlanInputs(state.user)) {
      Alert.alert(
        'Profile incomplete',
        'Complete your profile details first so we can generate your plan correctly.'
      );
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
    setTempPlanPreferences(
      state.user.planPreferences ?? {
        primaryGoal: 'general_fitness',
        daysPerWeek: 4,
        equipmentLevel: 'full_gym',
        injuries: [],
      }
    );
    setTempPrimaryGoal(state.user.planPreferences?.primaryGoal ?? 'general_fitness');
    setTempCurrentLevel(state.user.currentPhysiqueLevel);
    setOnboardingStep('main_focus');
    console.log('✅ Onboarding step set to: main_focus');
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
      navigationRef.navigate('Today');
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
      navigationRef.navigate('Today');
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
    if (showWelcome) {
      return (
        <View style={styles.container}>
          <WelcomeScreen onGetStarted={() => setShowWelcome(false)} />
          <StatusBar style="light" />
        </View>
      );
    }
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
        <Text style={styles.loadingText}>Matching your program…</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  const shouldShowOnboarding =
    onboardingStep === 'profile' ||
    onboardingStep === 'main_focus' ||
    onboardingStep === 'quick_plan' ||
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

    if (onboardingStep === 'main_focus') {
      return (
        <View style={styles.container}>
          <MainFocusScreen onSelect={handleMainFocusSelect} onSkip={handleMainFocusSkip} />
          <StatusBar style="light" />
        </View>
      );
    }

    if (onboardingStep === 'quick_plan' && state?.user) {
      return (
        <View style={styles.container}>
          <QuickPlanSetupScreen
            primaryGoal={tempPrimaryGoal}
            onComplete={handleQuickPlanComplete}
            onSkip={handleQuickPlanSkip}
          />
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
                : () => setOnboardingStep('quick_plan')
            }
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
        <Tab.Navigator screenOptions={{ headerShown: false, lazy: false, tabBarStyle: { display: 'none' } }}>
          <Tab.Screen name="Today">
            {() =>
              state?.user ? (
                <DashboardScreen
                  user={state.user}
                  phase={state.currentPhase}
                  workoutSessions={state.workoutSessions}
                  plannedWorkouts={state.plannedWorkouts}
                  onProfilePress={() => setProfileVisible(true)}
                  onStartPhase={handleStartPhaseFromDashboard}
                  onToggleWorkoutExercise={toggleWorkoutExercise}
                  onSaveCustomSession={saveCustomWorkoutSession}
                  onAddExercise={addWorkoutExercise}
                  onDeleteExercise={deleteWorkoutExercise}
                />
              ) : (
                <TabPlaceholder title="Welcome to FitArc" subtitle="Complete onboarding to get started." />
              )
            }
          </Tab.Screen>
          <Tab.Screen name="Workouts">
            {() =>
              state?.user ? (
                <LibraryScreen
                  user={state.user}
                  phase={state.currentPhase}
                  plannedWorkouts={state.plannedWorkouts}
                  workoutSessions={state.workoutSessions}
                  onReplaceSessionWithTemplate={replaceSessionWithTemplate}
                  onAppendExercisesToSession={appendExercisesToSession}
                  onNavigateToToday={() => {
                    setProfileVisible(false);
                    navigationRef.navigate('Today');
                  }}
                />
              ) : (
                <TabPlaceholder title="Workouts" subtitle="Create a plan to explore workout templates." />
              )
            }
          </Tab.Screen>
          <Tab.Screen name="Meals">
            {() =>
              state?.user ? (
                <MenuScreen user={state.user} phase={state.currentPhase} />
              ) : (
                <TabPlaceholder title="Meals" subtitle="Create a plan to unlock your meal guide." />
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
                <TabPlaceholder title="Progress" subtitle="Create a plan to unlock progress tracking." />
              )
            }
          </Tab.Screen>
        </Tab.Navigator>

        {/* Custom Animated Tab Bar */}
        <View style={styles.customTabBar} pointerEvents="box-none">
          <View style={styles.tabBarBackground} pointerEvents="none">
            <LinearGradient
              colors={['rgba(8,11,32,0.97)', 'rgba(4,6,18,0.99)']}
              style={styles.tabBarGradient}
            />
            <View style={styles.tabBarTopBorder} />
          </View>

          <View style={styles.tabBarContent} pointerEvents="box-none">
            {(Object.keys(TAB_CONFIG) as (keyof RootTabParamList)[]).map((name) => {
              if (!showPlanTabs && name !== 'Today') return null;
              const cfg = TAB_CONFIG[name];
              return (
                <AnimatedTabButton
                  key={name}
                  focused={currentRouteName === name}
                  icon={cfg.icon}
                  activeIcon={cfg.activeIcon}
                  label={cfg.label}
                  onPress={() => {
                    setProfileVisible(false);
                    triggerTabFabPop();
                    navigationRef.navigate(name);
                  }}
                />
              );
            })}
          </View>

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
  tabPill: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    minWidth: 64,
    borderRadius: 16,
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: '#6C63FF',
    fontWeight: '700',
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
