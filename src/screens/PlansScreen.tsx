import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  Pressable,
  AppState,
  Animated,
  Easing,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useFabAction } from '../contexts/FabActionContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useScreenAnimation } from '../hooks/useScreenAnimation';
import {
  User,
  PhasePlan,
  WorkoutSessionEntry,
  WorkoutSessionExercise,
  MuscleGroup,
  PlanDay,
} from '../types/domain';
import { useSupabaseExercises } from '../hooks/useSupabaseExercises';
import { ExerciseCatalogEntry } from '../services/workoutService';
import { mapMuscleNameToGroup } from '../utils/workoutAnalytics';
import { getBodyPartLabel } from '../utils';
import { formatLocalDateYMD } from '../utils/date';
import { fetchWorkoutCompletionMap } from '../services/workoutService';
import { runLayoutAnimation } from '../utils/layoutAnimation';


type PlansScreenProps = {
  user: User;
  phase: PhasePlan | null;
  workoutSessions: WorkoutSessionEntry[];
  plannedWorkouts: PlanDay[];
  onSaveCustomSession?: (date: string, exercises: WorkoutSessionExercise[]) => void;
  onAddExercise?: (planWorkoutId: string, exercise: WorkoutSessionExercise) => Promise<string | void>;
  onDeleteExercise?: (planWorkoutId: string, planExerciseId: string) => Promise<void>;
  onToggleComplete?: (date: string, exerciseName: string, exerciseId?: string, currentExercises?: WorkoutSessionExercise[]) => void | Promise<void>;
  embedded?: boolean;
  openExercisePickerSignal?: number;
  selectedDateOverride?: string;
};

const SCREEN_GRADIENT = ['#0A0E27', '#151932', '#1E2340'] as const;
const COLORS = {
  bgPrimary: '#0A0E27',
  card: '#101427',
  elevated: '#151A2E',
  surface: '#0C1021',
  textPrimary: '#FFFFFF',
  textSecondary: '#A3A7B7',
  textTertiary: '#6B6F7B',
  accent: '#6C63FF',
  accentDim: 'rgba(108,99,255,0.15)',
  accentGlow: 'rgba(108,99,255,0.3)',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  success: '#00F5A0',
};
const MAX_LIBRARY_ITEMS = 30;
const REP_PRESETS = ['5-8', '8-12', '12-15'] as const;

const MUSCLE_FILTERS: (MuscleGroup | 'All')[] = ['All', 'chest', 'back', 'shoulders', 'arms', 'legs', 'core'];
const KNOWN_BODY_PARTS = new Set(['chest', 'back', 'legs', 'shoulders', 'arms', 'core']);

const formatBodyPartList = (parts: MuscleGroup[]): string => {
  if (!parts.length) return 'Full Body';
  return parts
    .map((part) => {
      const key = part.toLowerCase();
      return KNOWN_BODY_PARTS.has(key) ? getBodyPartLabel(key as any) : part;
    })
    .join(' • ');
};

const parseLocalDateFromYMD = (dateStr: string) => {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);
  return new Date(year, month, day);
};

const formatDateLabel = (dateStr: string) => {
  const date = parseLocalDateFromYMD(dateStr);
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
  };
};

const capitalizeLabel = (value?: string) =>
  value
    ? value
        .split(/_|\s/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : undefined;

const getPhaseWeek = (phase: PhasePlan) => {
  const start = new Date(phase.startDate);
  const today = new Date();
  const diffMs = Math.max(0, today.getTime() - start.getTime());
  const diffWeeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
  const week = diffWeeks + 1;
  return Math.max(1, Math.min(phase.expectedWeeks || week, week));
};

export const PlansScreen: React.FC<PlansScreenProps> = ({
  user,
  phase,
  workoutSessions,
  plannedWorkouts,
  onSaveCustomSession,
  onAddExercise,
  onDeleteExercise,
  onToggleComplete,
  embedded = false,
  openExercisePickerSignal,
  selectedDateOverride,
}) => {
  const { setFabAction } = useFabAction();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { headerStyle, contentStyle } = useScreenAnimation({
    headerDuration: 140,
    contentDuration: 140,
  });
  const { exercises: exerciseCatalog, isLoading: catalogLoading } = useSupabaseExercises();
  
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDateYMD(new Date()));
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<(typeof MUSCLE_FILTERS)[number]>('All');
  const [completionMap, setCompletionMap] = useState<Record<string, boolean>>({});
  const [editingExerciseIndex, setEditingExerciseIndex] = useState<number | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastExercisePickerSignalRef = useRef<number | undefined>(openExercisePickerSignal);
  // Animation values
  const weekStripSlide = useRef(new Animated.Value(-100)).current;
  const fabRotation = useRef(new Animated.Value(0)).current;
  const fabScale = useRef(new Animated.Value(0)).current;
  const exerciseCardsAnim = useRef<Map<string, Animated.Value>>(new Map()).current;
  const swipeCardAnims = useRef<Map<string, Animated.Value>>(new Map()).current;
  const modalSlideAnim = useRef(new Animated.Value(300)).current;
  const completionBannerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!selectedDateOverride) return;
    setSelectedDate(selectedDateOverride);
  }, [selectedDateOverride]);

  useEffect(() => {
    if (openExercisePickerSignal === undefined) return;
    if (lastExercisePickerSignalRef.current === openExercisePickerSignal) return;
    lastExercisePickerSignalRef.current = openExercisePickerSignal;
    if (!onAddExercise && !onSaveCustomSession) return;
    if (selectedDateOverride && selectedDateOverride !== selectedDate) {
      setSelectedDate(selectedDateOverride);
    }
    setExerciseModalVisible(true);
  }, [openExercisePickerSignal, onAddExercise, onSaveCustomSession, selectedDateOverride, selectedDate]);

  const handleOpenExerciseModal = useCallback(() => {
    setExerciseModalVisible(true);
  }, []);

  useEffect(() => {
    if (!route.params?.openExerciseModal) return;
    setExerciseModalVisible(true);
    navigation.setParams({ openExerciseModal: false });
  }, [navigation, route.params?.openExerciseModal]);

  useFocusEffect(
    useCallback(() => {
      setFabAction('Workouts', {
        label: 'Workout',
        icon: '+',
        colors: ['#6C63FF', '#4C3BFF'] as const,
        iconColor: '#0A0E27',
        labelColor: '#6C63FF',
        onPress: handleOpenExerciseModal,
      });

      return () => setFabAction('Workouts', null);
    }, [handleOpenExerciseModal, setFabAction])
  );

  const resolvedPlannedWorkouts = useMemo(() => {
    if (!phase?.id) return plannedWorkouts;
    return plannedWorkouts.filter((day) => day.planId === phase.id);
  }, [phase?.id, plannedWorkouts]);

  const convertCatalogExercise = useCallback(
    (entry: ExerciseCatalogEntry): WorkoutSessionExercise => {
      const parts = [...entry.primaryMuscles, ...entry.secondaryMuscles]
        .map((name) => mapMuscleNameToGroup(name))
        .filter((part): part is MuscleGroup => !!part);
      const uniqueParts = parts.length ? Array.from(new Set(parts)) : (['core'] as MuscleGroup[]);
      return {
        name: entry.name,
        bodyParts: uniqueParts,
        completed: false,
        sets: 4,
        reps: '8-12',
        movementPattern: entry.movementPattern ?? undefined,
        exerciseId: entry.id,
      };
    },
    []
  );

  // Build week plans from plan snapshots
  const weekPlans = useMemo(() => {
    if (!phase) return [];
    const anchor = selectedDate ? parseLocalDateFromYMD(selectedDate) : new Date();
    anchor.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(anchor);
    startOfWeek.setDate(anchor.getDate() - anchor.getDay());
    return Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + idx);
      const dateStr = formatLocalDateYMD(date);
      const planDay =
        resolvedPlannedWorkouts.find((entry) => entry.planId === phase.id && entry.date === dateStr) || null;
      return {
        dateStr,
        planDay,
      };
    });
  }, [resolvedPlannedWorkouts, phase?.id, selectedDate]);

  const selectedPlan =
    weekPlans.find((plan) => plan.dateStr === selectedDate) || weekPlans[0];
  const weekStart = weekPlans[0]?.dateStr;
  const weekEnd = weekPlans[weekPlans.length - 1]?.dateStr;
  const todayKey = formatLocalDateYMD(new Date());

  const [editingExercises, setEditingExercises] = useState<WorkoutSessionExercise[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const editingExercisesRef = useRef<WorkoutSessionExercise[]>([]);
  const lastExerciseCountRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSyncedKeyRef = useRef<string | null>(null);
  const localEditsDateRef = useRef<string | null>(null);
  const isDeletingRef = useRef(false);
  const planFingerprint =
    selectedPlan?.planDay?.workout?.exercises
      ?.map(
        (exercise) =>
          `${exercise.name}:${exercise.sets ?? ''}:${exercise.reps ?? ''}:${exercise.displayOrder ?? ''}`
      )
      .join('|') ?? '';

  // Include session completion fingerprint so we re-hydrate when sessions load.
  // Use 'dirty' when user has unsaved edits to avoid overwriting in-progress changes.
  const sessionForPlanDate = selectedPlan
    ? workoutSessions.find((s) => s.date === selectedPlan.dateStr && s.phasePlanId === phase?.id)
    : undefined;
  const sessionCompletionFingerprint = isDirty
    ? 'dirty'
    : (sessionForPlanDate?.exercises.map((ex) => `${ex.name}:${ex.completed ?? false}`).join(',') ?? 'none');

  const planSyncKey = selectedPlan
    ? selectedPlan.planDay?.workout
      ? `plan-${selectedPlan.planDay.workout.id}-${planFingerprint}-${sessionCompletionFingerprint}`
      : `no-plan-${selectedPlan.dateStr}-${sessionCompletionFingerprint}`
    : null;

  const persistSession = useCallback(
    async (date: string, exercises: WorkoutSessionExercise[]) => {
      if (!onSaveCustomSession) return;
      await onSaveCustomSession(date, exercises);
    },
    [onSaveCustomSession]
  );

 // Sync editing exercises when selected plan changes or plan snapshots update
  useEffect(() => {
    if (!selectedPlan) {
      runLayoutAnimation();
      setEditingExercises([]);
      setIsDirty(false);
      lastSyncedKeyRef.current = null;
      localEditsDateRef.current = null;
      return;
    }

    if (lastSyncedKeyRef.current === planSyncKey) {
      return;
    }

    // Load exercises from the plan snapshot if it exists
    if (selectedPlan.planDay?.workout && selectedPlan.planDay.workout.exercises.length > 0) {
      runLayoutAnimation();
      // Look up existing session for this date to restore completion state
      const existingSession = workoutSessions.find(
        (s) => s.date === selectedPlan.dateStr && s.phasePlanId === phase?.id
      );
      const completionByName = new Map<string, boolean>(
        existingSession?.exercises.map((ex) => [ex.name.toLowerCase(), ex.completed ?? false]) ?? []
      );
      const mapped = selectedPlan.planDay.workout.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        bodyParts: [...exercise.bodyParts],
        completed: completionByName.get(exercise.name.toLowerCase()) ?? false,
        sets: exercise.sets ?? 4,
        reps: exercise.reps ?? '8-12',
        movementPattern: exercise.movementPattern,
        exerciseId: exercise.exerciseId ?? undefined,
        displayOrder: exercise.displayOrder,
      }));
      setEditingExercises(mapped);
      setIsDirty(false);
      lastSyncedKeyRef.current = planSyncKey;
      return;
    }

    // No plan snapshot exists - keep local edits only for the same day
    if (
      editingExercisesRef.current.length > 0 &&
      localEditsDateRef.current === selectedPlan.dateStr
    ) {
      lastSyncedKeyRef.current = planSyncKey;
      return;
    }
      runLayoutAnimation();
    setEditingExercises([]);
    setIsDirty(false);
    lastSyncedKeyRef.current = planSyncKey;
  }, [planSyncKey, selectedPlan, workoutSessions, phase?.id]);

  const refreshCompletionMap = useCallback(() => {
    if (!user.id || !weekStart || !weekEnd) return;
    let isActive = true;
    fetchWorkoutCompletionMap(user.id, weekStart, weekEnd)
      .then((map) => {
        if (isActive) {
          setCompletionMap(map);
        }
      })
      .catch((err) => {
        console.error('Failed to load workout completion map:', err);
        if (isActive) {
          setCompletionMap({});
        }
      });
    return () => {
      isActive = false;
    };
  }, [user.id, weekStart, weekEnd]);

  useEffect(() => {
    return refreshCompletionMap();
  }, [refreshCompletionMap]);

  // Animate week strip entrance
  useEffect(() => {
    Animated.spring(weekStripSlide, {
      toValue: 0,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [weekStripSlide]);

  // FAB entrance animation
  useEffect(() => {
    Animated.sequence([
      Animated.delay(200),
      Animated.spring(fabScale, {
        toValue: 1,
        tension: 80,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fabScale]);

  // FAB rotation when modal opens/closes
  useEffect(() => {
    Animated.spring(fabRotation, {
      toValue: exerciseModalVisible ? 1 : 0,
      tension: 180,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [exerciseModalVisible, fabRotation]);

  useEffect(() => {
    if (exerciseModalVisible) {
      Animated.spring(modalSlideAnim, {
        toValue: 0,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      modalSlideAnim.setValue(300);
    }
  }, [exerciseModalVisible, modalSlideAnim]);

  if (!phase) {
 
    return (
      <View style={styles.container}>
        <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradientCentered}>
          <View style={styles.emptyCardCentered}>
            <Text style={styles.emptyIcon}>🏋️‍♂️</Text>
            <Text style={styles.emptyTitle}>No Active Plan</Text>
            <Text style={styles.emptySubtitle}>Complete onboarding to unlock your workouts.</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  const phaseChipText = useMemo(() => {
    const goal = capitalizeLabel(phase.goalType) ?? phase.name ?? 'Active Arc';
    const week = getPhaseWeek(phase);
    return `${goal} · Week ${week}`;
  }, [phase]);

  const selectedDayMeta = useMemo(() => {
    if (!selectedPlan) return null;
    const totalExercises = editingExercises.length;
    const completedCount = editingExercises.filter((exercise) => exercise.completed).length;
    const isFuture = selectedPlan.dateStr > todayKey;
    if (!totalExercises) return 'No workout scheduled';
    if (isFuture) return 'Scheduled workout';
    if (completionMap[selectedPlan.dateStr]) return null;
    return embedded ? null : `${completedCount}/${totalExercises} exercises`;
  }, [selectedPlan, editingExercises, completionMap, todayKey, embedded]);
  const showDayHeader = Boolean(selectedDayMeta) && !embedded;

  const saveCurrentSession = useCallback(
    async (plan: typeof selectedPlan, exercises: WorkoutSessionExercise[]) => {
      if (!plan) return;
      if (!onSaveCustomSession) return;
      await persistSession(plan.dateStr, exercises);
    },
    [onSaveCustomSession, persistSession]
  );

  const enqueueSave = useCallback(
    (plan: typeof selectedPlan, exercises: WorkoutSessionExercise[]) => {
      const run = () => saveCurrentSession(plan, exercises);
      saveQueueRef.current = saveQueueRef.current.then(run, run);
      return saveQueueRef.current;
    },
    [saveCurrentSession]
  );

  const flushAutosave = useCallback(async () => {
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    if (isDeletingRef.current) return;
    if (!selectedPlan || !isDirty) return;
    try {
      await enqueueSave(selectedPlan, editingExercisesRef.current);
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to autosave workout session', err);
    }
  }, [enqueueSave, isDirty, selectedPlan]);

 

  const handleSelectDateAnimated = async (dateStr: string) => {
    await flushAutosave();
    runLayoutAnimation();
    setEditingExerciseIndex(null);
    setSelectedDate(dateStr);
  };

  const getExerciseAnimation = (key: string) => {
    if (!exerciseCardsAnim.has(key)) {
      const anim = new Animated.Value(1);
      exerciseCardsAnim.set(key, anim);
    }
    return exerciseCardsAnim.get(key)!;
  };

  const getSwipeAnimation = (key: string) => {
    if (!swipeCardAnims.has(key)) {
      swipeCardAnims.set(key, new Animated.Value(0));
    }
    return swipeCardAnims.get(key)!;
  };

  const animateExerciseAction = (key: string) => {
    const anim = getExerciseAnimation(key);
    Animated.sequence([
      Animated.spring(anim, {
        toValue: 0.95,
        tension: 200,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.spring(anim, {
        toValue: 1,
        tension: 200,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleAddExercise = async (entry: ExerciseCatalogEntry) => {
    const targetDate = selectedDateOverride ?? selectedDate;
    const targetPlan = weekPlans.find((plan) => plan.dateStr === targetDate) ?? selectedPlan;
    if (!targetPlan) return;

    // Animate modal close first
    setExerciseModalVisible(false);
    localEditsDateRef.current = targetPlan.dateStr;
    
    const isDuplicate = editingExercisesRef.current.some(
      (exercise) =>
        (entry.id && exercise.exerciseId === entry.id) ||
        exercise.name.toLowerCase() === entry.name.toLowerCase()
    );
    if (isDuplicate) {
      Alert.alert('Duplicate exercise', "This exercise is already in today's workout.");
      return;
    }

    const displayOrder = editingExercisesRef.current.length + 1;
    const newExercise = { ...convertCatalogExercise(entry), displayOrder };
    const next = [...editingExercisesRef.current, newExercise];

    // Trigger layout animation for smooth insertion
    runLayoutAnimation({
      duration: 300,
      create: {
        type: 'spring',
        property: 'opacity',
        springDamping: 0.7,
      },
    });

    const planWorkoutId = targetPlan.planDay?.workout?.id;
    const canPersistImmediately = Boolean(planWorkoutId && onAddExercise);
    editingExercisesRef.current = next;
    setEditingExercises(next);
    if (targetPlan) {
      const allComplete = next.length > 0 && next.every((ex) => ex.completed === true);
      setCompletionMap((prevMap) => ({
        ...prevMap,
        [targetPlan.dateStr]: allComplete,
      }));
    }
    if (!canPersistImmediately) {
      setIsDirty(true);
    }

    // Animate the newly added card
    const cardKey = `${newExercise.name}-${next.length - 1}`;
    const cardAnim = getExerciseAnimation(cardKey);
    cardAnim.setValue(0);
    Animated.spring(cardAnim, {
      toValue: 1,
      tension: 80,
      friction: 7,
      useNativeDriver: true,
    }).start();

    try {
      if (planWorkoutId && onAddExercise) {
        const planExerciseId = await onAddExercise(planWorkoutId, newExercise);
        if (planExerciseId) {
          setEditingExercises((prev) => {
            if (!prev.length) return prev;
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            updated[lastIndex] = { ...updated[lastIndex], id: planExerciseId };
            editingExercisesRef.current = updated;
            return updated;
          });
        }
        setIsDirty(false);
        await enqueueSave(targetPlan, editingExercisesRef.current);
        refreshCompletionMap();
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'duplicate_exercise') {
        Alert.alert('Duplicate exercise', "This exercise is already in today's workout.");
        return;
      }
      console.error('Failed to save workout session:', err);
    }
  };

  const handleRemoveExercise = async (index: number) => {
    setEditingExerciseIndex((prev) => (prev === index ? null : prev));
    const exercise = editingExercisesRef.current[index];
    const cardKey = exercise.id ?? exercise.exerciseId ?? `${exercise.name}-${index}`;
    const cardAnim = getExerciseAnimation(cardKey);
    const planWorkoutId = selectedPlan?.planDay?.workout?.id;
    const needsRemoteDelete = Boolean(planWorkoutId && exercise?.id && onDeleteExercise);
    const shouldPersistLocally = !planWorkoutId;
    isDeletingRef.current = true;
    if (selectedPlan) {
      localEditsDateRef.current = selectedPlan.dateStr;
    }
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    // Animate out before removing
    Animated.timing(cardAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      runLayoutAnimation();
      setEditingExercises((prev) => {
        const next = prev.filter((_, idx) => idx !== index);
        editingExercisesRef.current = next;
        if (selectedPlan) {
          const allComplete = next.length > 0 && next.every((ex) => ex.completed === true);
          setCompletionMap((prevMap) => ({
            ...prevMap,
            [selectedPlan.dateStr]: allComplete,
          }));
        }
        return next;
      });
      if (shouldPersistLocally) {
        setIsDirty(true);
      }
      if (!needsRemoteDelete) {
        isDeletingRef.current = false;
      }
    });

    if (needsRemoteDelete) {
      try {
        await onDeleteExercise!(planWorkoutId!, exercise!.id!);
      } catch (err) {
        console.error('Failed to delete workout exercise:', err);
      } finally {
        isDeletingRef.current = false;
      }
    }
  };

  const handleToggleExerciseCompleted = (index: number) => {
    const exerciseName = editingExercisesRef.current[index]?.name;
    const exerciseId = editingExercisesRef.current[index]?.exerciseId;
    setEditingExercises((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = { ...current, completed: !current.completed };
      editingExercisesRef.current = next;
      if (selectedPlan) {
        const allComplete = next.length > 0 && next.every((exercise) => exercise.completed === true);
        setCompletionMap((prevMap) => ({
          ...prevMap,
          [selectedPlan.dateStr]: allComplete,
        }));
      }
      return next;
    });
    if (selectedPlan) {
      localEditsDateRef.current = selectedPlan.dateStr;
    }
    setIsDirty(true);
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    autosaveTimeoutRef.current = setTimeout(() => {
      if (selectedPlan) {
        void enqueueSave(selectedPlan, editingExercisesRef.current);
        setIsDirty(false);
        refreshCompletionMap();
      }
    }, 200);
    // Persist completion to session layer
    if (exerciseName && onToggleComplete) {
      void onToggleComplete(selectedDate, exerciseName, exerciseId, editingExercisesRef.current);
    }
  };

  // Animate completion banner in/out
  const allComplete =
    editingExercises.length > 0 && editingExercises.every((ex) => ex.completed);

  useEffect(() => {
    Animated.spring(completionBannerAnim, {
      toValue: allComplete ? 1 : 0,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [allComplete, completionBannerAnim]);

  const handleChangeSets = (index: number, value: string) => {
    const numeric = parseInt(value, 10);
    setEditingExercises((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], sets: Number.isFinite(numeric) ? numeric : 0 };
      return next;
    });
    if (selectedPlan) {
      localEditsDateRef.current = selectedPlan.dateStr;
    }
    setIsDirty(true);
  };

  const handleChangeReps = (index: number, value: string) => {
    setEditingExercises((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], reps: value };
      return next;
    });
    if (selectedPlan) {
      localEditsDateRef.current = selectedPlan.dateStr;
    }
    setIsDirty(true);
  };

  useEffect(() => {
    if (!selectedPlan || !isDirty) return;
    if (isDeletingRef.current) return;
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    autosaveTimeoutRef.current = setTimeout(() => {
      (async () => {
        try {
          await enqueueSave(selectedPlan, editingExercisesRef.current);
          setIsDirty(false);
        } catch (err) {
          console.error('Failed to autosave workout session', err);
        }
      })();
    }, 600);
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [editingExercises, isDirty, saveCurrentSession, selectedPlan]);

  useEffect(() => {
    editingExercisesRef.current = editingExercises;
  }, [editingExercises]);

  useEffect(() => {
    if (lastExerciseCountRef.current === editingExercises.length) return;
    lastExerciseCountRef.current = editingExercises.length;
    if (!isDirty) return;
    void flushAutosave();
  }, [editingExercises.length, flushAutosave, isDirty]);

  useEffect(() => {
    return () => {
      void flushAutosave();
    };
  }, [flushAutosave]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void flushAutosave();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [flushAutosave]);

  const filteredCatalog = useMemo(() => {
    const term = exerciseSearch.trim().toLowerCase();
    return exerciseCatalog
      .filter((entry) => {
        if (muscleFilter !== 'All') {
          const parts = [...entry.primaryMuscles, ...entry.secondaryMuscles]
            .map((name) => mapMuscleNameToGroup(name))
            .filter((part): part is MuscleGroup => !!part);
          if (!parts.includes(muscleFilter)) return false;
        }
        return true;
      })
      .filter((entry) => {
        if (!term) return true;
        return (
          entry.name.toLowerCase().includes(term) ||
          entry.primaryMuscles.join(' ').toLowerCase().includes(term) ||
          (entry.movementPattern ?? '').toLowerCase().includes(term)
        );
      })
      .slice(0, MAX_LIBRARY_ITEMS);
  }, [exerciseCatalog, muscleFilter, exerciseSearch]);

  const renderSession = () => {
    if (!selectedPlan) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>⚙️</Text>
          <Text style={styles.emptyTitle}>No data for this date.</Text>
          <Text style={styles.emptySubtitle}>Pick a day from the strip above.</Text>
        </View>
      );
    }

    if (!editingExercises.length) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>💪</Text>
          <Text style={styles.emptyTitle}>No workout planned</Text>
          <Text style={styles.emptySubtitle}>
            Add exercises or apply a template to plan your workout for this day.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.workoutCard}>
        <View style={styles.exerciseList}>
          {editingExercises.map((exercise, idx) => {
            const cardKey =
              exercise.id ?? exercise.exerciseId ?? `${exercise.name}-${idx}`;
            const scaleAnim = getExerciseAnimation(cardKey);
            const setsValue = exercise.sets ?? 4;
            const repsValue = exercise.reps ?? '8-12';
            const localKey = exercise.id ?? cardKey;
            const isCompleted = Boolean(exercise.completed);
            const swipeAnim = getSwipeAnimation(localKey);
            const swipeHintOpacity = swipeAnim.interpolate({
              inputRange: [0, 12, 90],
              outputRange: [0, 0.25, 1],
              extrapolate: 'clamp',
            });
            const deleteHintOpacity = swipeAnim.interpolate({
              inputRange: [-120, -12, 0],
              outputRange: [1, 0.25, 0],
              extrapolate: 'clamp',
            });
            const maxSwipeLeft = -120;
            const maxSwipeRight = 90;
            const panResponder = PanResponder.create({
              onMoveShouldSetPanResponder: (_, gesture) =>
                Math.abs(gesture.dx) > 2 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
              onMoveShouldSetPanResponderCapture: (_, gesture) =>
                Math.abs(gesture.dx) > 2 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
              onPanResponderTerminationRequest: () => false,
              onPanResponderMove: (_, gesture) => {
                const nextX = Math.max(maxSwipeLeft, Math.min(maxSwipeRight, gesture.dx));
                swipeAnim.setValue(nextX);
              },
              onPanResponderRelease: (_, gesture) => {
                const shouldDelete = gesture.dx < -80;
                const shouldToggleComplete = gesture.dx > 60;
                if (shouldDelete) {
                  Animated.spring(swipeAnim, {
                    toValue: maxSwipeLeft,
                    tension: 180,
                    friction: 18,
                    useNativeDriver: true,
                  }).start(() => {
                    animateExerciseAction(cardKey);
                    handleRemoveExercise(idx);
                  });
                  return;
                }
                if (shouldToggleComplete) {
                  Animated.spring(swipeAnim, {
                    toValue: maxSwipeRight,
                    tension: 180,
                    friction: 18,
                    useNativeDriver: true,
                  }).start(() => {
                    handleToggleExerciseCompleted(idx);
                    Animated.spring(swipeAnim, {
                      toValue: 0,
                      tension: 180,
                      friction: 18,
                      useNativeDriver: true,
                    }).start();
                  });
                  return;
                }
                Animated.spring(swipeAnim, {
                  toValue: 0,
                  tension: 180,
                  friction: 18,
                  useNativeDriver: true,
                }).start();
              },
              onPanResponderTerminate: () => {
                Animated.spring(swipeAnim, {
                  toValue: 0,
                  tension: 180,
                  friction: 18,
                  useNativeDriver: true,
                }).start();
              },
            });

            return (
              <Animated.View
                key={cardKey}
                style={{
                  opacity: isCompleted ? 0.5 : 1,
                  transform: [{ scale: scaleAnim }],
                }}
              >
                <View style={styles.swipeContainer}>
                  <Animated.View
                    style={[styles.swipeCompleteHint, { opacity: swipeHintOpacity }]}
                    pointerEvents="none"
                  >
                    <Text style={styles.swipeCompleteText}>
                      {isCompleted ? 'Undo' : 'Complete'}
                    </Text>
                  </Animated.View>
                  <Animated.View
                    style={[styles.swipeDeleteHint, { opacity: deleteHintOpacity }]}
                    pointerEvents="none"
                  >
                    <Text style={styles.swipeDeleteText}>Delete</Text>
                  </Animated.View>
                  <Animated.View
                    style={{ transform: [{ translateX: swipeAnim }] }}
                    {...panResponder.panHandlers}
                  >
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() =>
                        setEditingExerciseIndex((prev) => (prev === idx ? null : idx))
                      }
                    >
                      <View style={[styles.exerciseCard, isCompleted && styles.exerciseCardDone]}>
                        <View style={styles.exerciseHeaderRow}>
                          <TouchableOpacity
                            style={[
                              styles.completeRadio,
                              isCompleted && styles.completeRadioChecked,
                            ]}
                            onPress={() => handleToggleExerciseCompleted(idx)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            {isCompleted && <Text style={styles.completeRadioCheck}>✓</Text>}
                          </TouchableOpacity>
                          <View style={styles.exerciseHeaderInfo}>
                            <Text style={[styles.exerciseName, isCompleted && styles.exerciseNameDone]}>
                              {exercise.name}
                            </Text>
                            <Text style={styles.exerciseBodyParts}>
                              {formatBodyPartList(exercise.bodyParts)}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.setsRepsPill}
                            activeOpacity={0.7}
                            onPress={() => setEditingExerciseIndex(idx)}
                          >
                            <Text style={styles.setsRepsPillText}>{setsValue}×{repsValue}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </Animated.View>
            );
          })}
        </View>

        {/* Completion banner */}
        {allComplete && (
          <Animated.View
            style={[
              styles.completionBanner,
              {
                opacity: completionBannerAnim,
                transform: [{ scale: completionBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(0,245,160,0.18)', 'rgba(108,99,255,0.22)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.completionBannerGradient}
            >
              <Text style={styles.completionBannerIcon}>🔥</Text>
              <View style={styles.completionBannerText}>
                <Text style={styles.completionBannerTitle}>Session Complete</Text>
                <Text style={styles.completionBannerSub}>
                  {editingExercises.length} exercise{editingExercises.length !== 1 ? 's' : ''} done
                </Text>
              </View>
              <Text style={styles.completionBannerCheck}>✓</Text>
            </LinearGradient>
          </Animated.View>
        )}

      </View>
    );
  };

  return (

    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      <LinearGradient
        colors={embedded ? (['transparent', 'transparent', 'transparent'] as const) : SCREEN_GRADIENT}
        style={styles.gradient}
      >
        <ScrollView
          stickyHeaderIndices={[0]}
          contentContainerStyle={[
            styles.scrollContent,
            embedded && styles.scrollContentEmbedded,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.stickyHeader,
              embedded && styles.stickyHeaderEmbedded,
              headerStyle,
            ]}
          >
            {!embedded ? (
              <View style={styles.headerTop}>
                <Text style={styles.headerTitle}>Workouts</Text>
                <View style={styles.phaseChip}>
                  <Text style={styles.phaseChipText}>{phaseChipText}</Text>
                </View>
              </View>
            ) : null}
            {!embedded ? (
              <Animated.View
                style={{
                  transform: [{ translateX: weekStripSlide }],
                }}
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.weekStrip}
                >
                  {weekPlans.map((plan) => {
                    const { weekday } = formatDateLabel(plan.dateStr);
                    const isActive = plan.dateStr === selectedDate;
                    const hasWorkout =
                      plan.planDay?.workout && plan.planDay.workout.exercises.length > 0;
                    const isFutureDay = plan.dateStr > todayKey;
                    const isCompletedDay = !isFutureDay && Boolean(completionMap[plan.dateStr]);
                    return (
                      <TouchableOpacity
                        key={plan.dateStr}
                        style={[
                          styles.dayChip,
                          isActive && styles.dayChipActive,
                          isCompletedDay && styles.dayChipCompleted,
                        ]}
                        onPress={() => handleSelectDateAnimated(plan.dateStr)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.dayLabel, isActive && styles.dayLabelActive]}>
                          {weekday}
                        </Text>
                        <View
                          style={[
                            styles.dayDot,
                            hasWorkout && styles.dayDotVisible,
                            isCompletedDay && styles.dayDotComplete,
                          ]}
                        />
                        {isCompletedDay && <Text style={styles.dayCheckMark}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </Animated.View>
            ) : null}
          </Animated.View>

          <Animated.View
            style={[
              styles.content,
              embedded && styles.contentEmbedded,
              contentStyle,
            ]}
          >
            {showDayHeader ? (
              <View style={styles.dayHeader}>
                <View style={styles.dayInfo}>
                  <Text style={styles.dayMeta}>{selectedDayMeta}</Text>
                </View>
              </View>
            ) : null}
            {renderSession()}
          </Animated.View>
        </ScrollView>
      </LinearGradient>

      <Modal
        transparent
        animationType="none"
        visible={exerciseModalVisible}
        onRequestClose={() => setExerciseModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdropPress}
            onPress={() => setExerciseModalVisible(false)}
          />
          <Animated.View
            style={[
              styles.sheet,
              {
                transform: [{ translateY: modalSlideAnim }],
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add Exercise</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setExerciseModalVisible(false)}>
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises..."
              placeholderTextColor={COLORS.textTertiary}
              value={exerciseSearch}
              onChangeText={setExerciseSearch}
            />
            <View style={styles.filterContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {MUSCLE_FILTERS.map((filter) => (
                  <TouchableOpacity
                    key={filter}
                    style={[styles.filterChip, muscleFilter === filter && styles.filterChipActive]}
                    onPress={() => setMuscleFilter(filter)}
                  >
                    <Text style={[styles.filterText, muscleFilter === filter && styles.filterTextActive]}>
                      {filter === 'All' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <ScrollView style={styles.catalogList} showsVerticalScrollIndicator={false}>
              {catalogLoading ? (
                <Text style={styles.catalogEmpty}>Loading exercises…</Text>
              ) : filteredCatalog.length === 0 ? (
                <Text style={styles.catalogEmpty}>No exercises found</Text>
              ) : (
                filteredCatalog.map((entry) => (
                  <TouchableOpacity
                    key={entry.id}
                    style={styles.catalogItem}
                    onPress={() => handleAddExercise(entry)}
                  >
                    <View style={styles.catalogInfo}>
                      <Text style={styles.catalogName}>{entry.name}</Text>
                      <Text style={styles.catalogMeta}>
                        {(entry.primaryMuscles[0] || 'Full body')} • {entry.movementPattern || 'Strength'}
                      </Text>
                    </View>
                    <View style={styles.catalogAddBubble}>
                      <Text style={styles.catalogAddText}>+</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={editingExerciseIndex !== null}
        onRequestClose={() => setEditingExerciseIndex(null)}
      >
        <View style={styles.modalOverlayCenter}>
          <Pressable
            style={styles.modalBackdropPress}
            onPress={() => setEditingExerciseIndex(null)}
          />
          <View style={styles.editCenterCard}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setEditingExerciseIndex(null)}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            {editingExerciseIndex !== null ? (
              <>
                <Text style={styles.editExerciseName}>
                  {editingExercises[editingExerciseIndex]?.name ?? 'Exercise'}
                </Text>
                <View style={styles.editRow}>
                  <Text style={styles.editLabel}>Sets</Text>
                  <View style={styles.stepperSm}>
                    <TouchableOpacity
                      style={styles.stepperButtonSm}
                      onPress={() =>
                        handleChangeSets(
                          editingExerciseIndex,
                          String(
                            Math.max(1, (editingExercises[editingExerciseIndex]?.sets ?? 4) - 1)
                          )
                        )
                      }
                    >
                      <Text style={styles.stepperButtonTextSm}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.stepperValueSm}>
                      {editingExercises[editingExerciseIndex]?.sets ?? 4}
                    </Text>
                    <TouchableOpacity
                      style={styles.stepperButtonSm}
                      onPress={() =>
                        handleChangeSets(
                          editingExerciseIndex,
                          String((editingExercises[editingExerciseIndex]?.sets ?? 4) + 1)
                        )
                      }
                    >
                      <Text style={styles.stepperButtonTextSm}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.editRowSpacer} />
                <View style={styles.editRow}>
                  <Text style={styles.editLabel}>Reps</Text>
                  <View style={styles.presetRow}>
                    {REP_PRESETS.map((preset) => {
                      const repsValue =
                        editingExercises[editingExerciseIndex]?.reps ?? '8-12';
                      const isActive = repsValue === preset;
                      return (
                        <TouchableOpacity
                          key={preset}
                          style={[
                            styles.presetChip,
                            isActive && styles.presetChipActive,
                          ]}
                          onPress={() => handleChangeReps(editingExerciseIndex, preset)}
                        >
                          <Text
                            style={[
                              styles.presetText,
                              isActive && styles.presetTextActive,
                            ]}
                          >
                            {preset}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.editDoneButton}
                  onPress={() => setEditingExerciseIndex(null)}
                >
                  <Text style={styles.editDoneText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  containerEmbedded: {
    backgroundColor: 'transparent',
  },
  gradient: {
    flex: 1,
  },
  gradientCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  scrollContentEmbedded: {
    paddingHorizontal: 0,
  },
  stickyHeader: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: COLORS.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stickyHeaderEmbedded: {
    paddingTop: 0,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    paddingHorizontal: 0,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  phaseChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.elevated,
    borderRadius: 20,
  },
  phaseChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textTertiary,
  },
  weekStrip: {
    paddingVertical: 4,
    gap: 8,
  },
  dayChip: {
    minWidth: 70,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    position: 'relative',
  },
  dayChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  dayChipCompleted: {
    borderColor: COLORS.success,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  dayLabelActive: {
    color: COLORS.textPrimary,
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.success,
    marginTop: 4,
    opacity: 0,
  },
  dayDotVisible: {
    opacity: 1,
  },
  dayDotComplete: {
    backgroundColor: COLORS.success,
    opacity: 1,
  },
  dayCheckMark: {
    position: 'absolute',
    top: 4,
    right: 6,
    color: COLORS.success,
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 1,
  },
  contentEmbedded: {
    paddingHorizontal: 0,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  dayInfo: {
    flex: 1,
  },
  dayMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  workoutCard: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    padding: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    marginBottom: 24,
  },
  exerciseList: {
    gap: 8,
  },
  exerciseCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  exerciseCardDone: {
    borderColor: 'rgba(0, 245, 160, 0.2)',
    backgroundColor: 'rgba(0, 245, 160, 0.04)',
  },
  swipeContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
  },
  swipeCompleteHint: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  swipeDeleteHint: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  swipeCompleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00F5A0',
  },
  swipeDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF8B8B',
  },
  exercisePills: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  pillValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  completionBanner: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  completionBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 160, 0.25)',
  },
  completionBannerIcon: {
    fontSize: 28,
  },
  completionBannerText: {
    flex: 1,
  },
  completionBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  completionBannerSub: {
    fontSize: 12,
    color: COLORS.success,
    marginTop: 2,
    fontWeight: '500',
  },
  completionBannerCheck: {
    fontSize: 20,
    color: COLORS.success,
    fontWeight: '700',
  },
  editCenterCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    width: '88%',
    maxWidth: 380,
  },
  editExerciseName: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: '700',
    marginBottom: 12,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  editRowSpacer: {
    height: 16,
  },
  editLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  stepperSm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.elevated,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepperButtonSm: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  stepperButtonTextSm: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  stepperValueSm: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  presetChipActive: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  presetText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  presetTextActive: {
    color: COLORS.textPrimary,
  },
  editDoneButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    marginTop: 16,
  },
  editDoneText: {
    fontSize: 12,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  exerciseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exerciseHeaderInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    letterSpacing: 0.1,
  },
  exerciseNameDone: {
    textDecorationLine: 'line-through',
    color: COLORS.textTertiary,
  },
  exerciseBodyParts: {
    fontSize: 11,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  exerciseHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setsRepsPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  setsRepsPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  completeRadio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'transparent',
    flexShrink: 0,
  },
  completeRadioChecked: {
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
    borderColor: 'rgba(0, 245, 160, 0.6)',
  },
  completeRadioCheck: {
    color: COLORS.success,
    fontSize: 14,
    fontWeight: '700',
  },
  exerciseInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  inputField: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.elevated,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  inputFieldDisabled: {
    opacity: 0.5,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  iconButtonDanger: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  iconButtonText: {
    fontSize: 20,
    color: '#FF7B7B',
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyCardCentered: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    minHeight: '70%',
    maxHeight: '90%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    backgroundColor: COLORS.borderStrong,
    borderRadius: 2,
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 28,
    color: COLORS.textSecondary,
    fontWeight: '300',
  },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: COLORS.textPrimary,
    marginBottom: 12,
    fontSize: 15,
  },
  filterContainer: {
    height: 48,
    marginBottom: 12,
  },
  filterRow: {
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  filterText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: COLORS.accent,
  },
  catalogList: {
    flex: 1,
  },
  catalogItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  catalogInfo: {
    flex: 1,
    paddingRight: 12,
  },
  catalogName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  catalogMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  catalogAddBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogAddText: {
    color: COLORS.accent,
    fontSize: 20,
    fontWeight: '600',
  },
  catalogEmpty: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    paddingVertical: 32,
  },
});

export default PlansScreen;
