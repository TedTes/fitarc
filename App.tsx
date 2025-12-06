import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStorageAdapter } from './src/storage';
import { useAppState } from './src/hooks';
import { 
  ProfileSetupScreen,
  CurrentPhysiqueSelectionScreen,
  TargetPhysiqueSelectionScreen,
  HomeScreen, 
  TodayScreen, 
  ProgressScreen, 
  PhotoCheckinPromptScreen,
  PhotoCaptureScreen,
  PhaseCompleteScreen 
} from './src/screens';
import { generatePhase, shouldPromptPhotoCheckin, isPhaseComplete } from './src/utils';
import { useEffect, useState } from 'react';
import { PhotoCheckin, User } from './src/types/domain';

const Tab = createBottomTabNavigator();

type OnboardingStep = 'profile' | 'current_physique' | 'target_physique' | 'complete';

export default function App() {
  const storage = createStorageAdapter();
  const { state, isLoading, updateUser, addPhotoCheckin, startPhase, logDay, recalculateProgress, completePhase } = useAppState(storage);
  const [showPhotoPrompt, setShowPhotoPrompt] = useState(false);
  const [isPhotoCaptureVisible, setPhotoCaptureVisible] = useState(false);
  const [photoCapturePhaseId, setPhotoCapturePhaseId] = useState<string | null>(null);
  const [photoCaptureOptional, setPhotoCaptureOptional] = useState(false);
  
  // Onboarding state
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('profile');
  const [tempProfileData, setTempProfileData] = useState<any>(null);
  const [tempCurrentLevel, setTempCurrentLevel] = useState<number | null>(null);
  const [tempCurrentPhotoUri, setTempCurrentPhotoUri] = useState<string | null>(null);

  const handleProfileComplete = (data: {
    sex: 'male' | 'female' | 'other';
    age: number;
    heightCm: number;
    experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  }) => {
    setTempProfileData(data);
    setOnboardingStep('current_physique');
  };

  const handleCurrentPhysiqueSelect = (levelId: number) => {
    setTempCurrentLevel(levelId);
    setOnboardingStep('target_physique');
  };

  const handleCurrentPhotoUpload = (photoUri: string) => {
    setTempCurrentPhotoUri(photoUri);
    setTempCurrentLevel(1); // Default to level 1 if photo uploaded
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
      currentPhotoUri: tempCurrentPhotoUri || undefined,
      createdAt: new Date().toISOString(),
    };

    await updateUser(user);

    // Create baseline photo if user uploaded one
    if (tempCurrentPhotoUri) {
      const baselinePhoto = {
        id: `photo_${Date.now()}`,
        date: new Date().toISOString(),
        phasePlanId: 'baseline',
        frontUri: tempCurrentPhotoUri,
        createdAt: new Date().toISOString(),
      };
      await addPhotoCheckin(baselinePhoto);
    }

    // Generate and start phase
    const phase = generatePhase(user, tempCurrentLevel, targetLevelId);
    await startPhase(phase);
    
    setOnboardingStep('complete');
  };

  useEffect(() => {
    if (state?.currentPhase && state.dailyLogs.length > 0) {
      recalculateProgress();
    }
  }, [state?.dailyLogs?.length]);

  useEffect(() => {
    if (state?.currentPhase) {
      const shouldPrompt = shouldPromptPhotoCheckin(state.currentPhase, state.photoCheckins);
      setShowPhotoPrompt(shouldPrompt);
    }
  }, [state?.currentPhase, state?.photoCheckins]);

  const getTodayLog = () => {
    if (!state?.currentPhase) return null;
    const today = new Date().toISOString().split('T')[0];
    return state.dailyLogs.find(
      log => log.date === today && log.phasePlanId === state.currentPhase?.id
    ) || null;
  };

  const handleStartPhaseFromHome = () => {
    if (!state?.user) {
      setOnboardingStep('profile');
      return;
    }

    setTempProfileData({
      sex: state.user.sex,
      age: state.user.age,
      heightCm: state.user.heightCm,
      experienceLevel: state.user.experienceLevel,
    });
    setTempCurrentLevel(state.user.currentPhysiqueLevel);
    setTempCurrentPhotoUri(state.user.currentPhotoUri || null);
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
    if (onboardingStep === 'profile') {
      return (
        <View style={styles.container}>
          <ProfileSetupScreen onComplete={handleProfileComplete} />
          <StatusBar style="light" />
        </View>
      );
    }

    if (onboardingStep === 'current_physique' && tempProfileData) {
      return (
        <View style={styles.container}>
          <CurrentPhysiqueSelectionScreen 
            sex={tempProfileData.sex}
            onSelectLevel={handleCurrentPhysiqueSelect}
            onUploadPhoto={handleCurrentPhotoUpload}
          />
          <StatusBar style="light" />
        </View>
      );
    }

    if (onboardingStep === 'current_physique' && tempProfileData) {
      return (
        <View style={styles.container}>
          <CurrentPhysiqueSelectionScreen 
            sex={tempProfileData.sex}
            onSelectLevel={handleCurrentPhysiqueSelect}
            onUploadPhoto={handleCurrentPhotoUpload}
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

  if (!state?.currentPhase || state.currentPhase.status === 'completed') {
    return (
      <View style={styles.container}>
        {state && <HomeScreen 
          user={state.user!}
          phase={null}
          onStartPhase={handleStartPhaseFromHome}
        />} 
        <StatusBar style="light" />
      </View>
    );
  }

  const phaseComplete = isPhaseComplete(state.currentPhase, state.progressEstimate);

  if (phaseComplete) {
    const baselinePhoto = state.photoCheckins.find(p => p.phasePlanId === 'baseline');
    const phasePhotos = state.photoCheckins.filter(p => p.phasePlanId === state.currentPhase?.id);
    const latestPhoto = phasePhotos.length > 0 ? phasePhotos[phasePhotos.length - 1] : null;

    return (
      <View style={styles.container}>
        <PhaseCompleteScreen 
          phase={state.currentPhase}
          beforePhoto={baselinePhoto || null}
          afterPhoto={latestPhoto}
          progressPercent={state.progressEstimate?.progressPercent || 0}
          onStartNextPhase={completePhase}
        />
        <StatusBar style="light" />
      </View>
    );
  }

  if (showPhotoPrompt) {
    const phasePhotos = state.photoCheckins.filter(p => p.phasePlanId === state.currentPhase?.id);
    const lastPhoto = phasePhotos.length > 0 ? phasePhotos[phasePhotos.length - 1] : null;

    const handlePromptTakePhoto = () => {
      if (!state?.currentPhase) return;
      setShowPhotoPrompt(false);
      openPhotoCapture(state.currentPhase.id);
    };

    return (
      <View style={styles.container}>
        <PhotoCheckinPromptScreen 
          phase={state.currentPhase}
          lastPhoto={lastPhoto}
          onTakePhoto={handlePromptTakePhoto}
          onSkip={() => setShowPhotoPrompt(false)}
        />
        <StatusBar style="light" />
      </View>
    );
  }

  const todayLog = getTodayLog();

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#6C63FF',
          tabBarInactiveTintColor: '#A0A3BD',
          tabBarStyle: { 
            paddingBottom: 8, 
            paddingTop: 8, 
            height: 60,
            backgroundColor: '#0A0E27',
            borderTopColor: '#2A2F4F',
          },
        }}
      >
        <Tab.Screen 
          name="Today" 
          options={{ tabBarLabel: 'Today' }}
        >
          {() => (
            <TodayScreen 
              phase={state.currentPhase!}
              onLogDay={logDay}
              todayLog={todayLog}
            />
          )}
        </Tab.Screen>
        <Tab.Screen 
          name="Progress"
          options={{ tabBarLabel: 'Progress' }}
        >
          {() => (
            <ProgressScreen 
              phase={state.currentPhase!}
              photoCheckins={state.photoCheckins}
              progressEstimate={state.progressEstimate}
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
