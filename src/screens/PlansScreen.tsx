import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Pressable,
  AppState,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  PhasePlan,
  WorkoutSessionEntry,
  WorkoutSessionExercise,
  MuscleGroup,
} from '../types/domain';
import { useSupabaseExercises } from '../hooks/useSupabaseExercises';
import { ExerciseCatalogEntry } from '../services/exerciseCatalogService';
import { mapMuscleNameToGroup } from '../utils/workoutAnalytics';
import { formatLocalDateYMD } from '../utils/date';
import { fetchWorkoutCompletionMap } from '../services/supabaseWorkoutService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type PlansScreenProps = {
  user: User;
  phase: PhasePlan | null;
  workoutSessions: WorkoutSessionEntry[];
  onSaveCustomSession?: (date: string, exercises: WorkoutSessionExercise[]) => void;
  onDeleteSession?: (date: string) => void;
  onAddExercise?: (sessionId: string, exercise: WorkoutSessionExercise) => Promise<string | void>;
  onDeleteExercise?: (sessionId: string, sessionExerciseId: string) => Promise<void>;
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

const MUSCLE_FILTERS: (MuscleGroup | 'All')[] = ['All', 'chest', 'back', 'shoulders', 'arms', 'legs', 'core'];

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

const createSessionExercises = (entries: WorkoutSessionExercise[]): WorkoutSessionExercise[] =>
  entries.map((exercise) => ({
    name: exercise.name,
    bodyParts: [...exercise.bodyParts],
    completed: !!exercise.completed,
    sets: exercise.sets ?? 4,
    reps: exercise.reps ?? '8-12',
    movementPattern: exercise.movementPattern,
    exerciseId: exercise.exerciseId,
    setDetails: exercise.setDetails?.map((set, index) => ({
      setNumber: set?.setNumber ?? index + 1,
      weight: set?.weight,
      reps: set?.reps,
      rpe: set?.rpe,
      restSeconds: set?.restSeconds,
    })),
  }));

export const PlansScreen: React.FC<PlansScreenProps> = ({
  user,
  phase,
  workoutSessions,
  onSaveCustomSession,
  onDeleteSession,
  onAddExercise,
  onDeleteExercise,
}) => {

  const { exercises: exerciseCatalog, isLoading: catalogLoading } = useSupabaseExercises();
  
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDateYMD(new Date()));
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<(typeof MUSCLE_FILTERS)[number]>('All');
  const [completionMap, setCompletionMap] = useState<Record<string, boolean>>({});
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Animation values
  const weekStripSlide = useRef(new Animated.Value(-100)).current;
  const fabRotation = useRef(new Animated.Value(0)).current;
  const fabScale = useRef(new Animated.Value(0)).current;
  const exerciseCardsAnim = useRef<Map<string, Animated.Value>>(new Map()).current;
  const modalSlideAnim = useRef(new Animated.Value(300)).current;

  const resolvedSessions = useMemo(() => {
    if (!phase?.id) return workoutSessions;
    return workoutSessions.filter((session) => session.phasePlanId === phase.id);
  }, [phase?.id, workoutSessions]);

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

  // Build week plans from database sessions only
  const weekPlans = useMemo(() => {
    if (!phase) return [];
    const anchor = new Date();
    anchor.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + idx);
      const dateStr = formatLocalDateYMD(date);
      const session =
        resolvedSessions.find((entry) => entry.phasePlanId === phase.id && entry.date === dateStr) || null;
      return {
        dateStr,
        session,
      };
    });
  }, [resolvedSessions, phase?.id]);

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
  const sessionFingerprint =
    selectedPlan?.session?.exercises
      ?.map(
        (exercise) =>
          `${exercise.name}:${exercise.completed ? '1' : '0'}:${exercise.sets ?? ''}:${exercise.reps ?? ''}`
      )
      .join('|') ?? '';

  const planSyncKey = selectedPlan
    ? selectedPlan.session
      ? `session-${selectedPlan.session.id}-${sessionFingerprint}`
      : `no-session-${selectedPlan.dateStr}`
    : null;

  const persistSession = useCallback(
    async (date: string, exercises: WorkoutSessionExercise[]) => {
      if (!onSaveCustomSession) return;
      await onSaveCustomSession(date, exercises);
    },
    [onSaveCustomSession]
  );

 // Sync editing exercises when selected plan changes or sessions update
  useEffect(() => {
    if (!selectedPlan) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setEditingExercises([]);
      setIsDirty(false);
      lastSyncedKeyRef.current = null;
      return;
    }

    if (lastSyncedKeyRef.current === planSyncKey) {
      return;
    }

    // Load exercises from the database session if it exists
    if (selectedPlan.session && selectedPlan.session.exercises.length > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setEditingExercises(createSessionExercises(selectedPlan.session.exercises));
      setIsDirty(false);
      lastSyncedKeyRef.current = planSyncKey;
      return;
    }

    // No session exists - clear exercises
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingExercises([]);
    setIsDirty(false);
    lastSyncedKeyRef.current = planSyncKey;
  }, [planSyncKey, selectedPlan]);

  useEffect(() => {
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
    return `${completedCount}/${totalExercises} exercises`;
  }, [selectedPlan, editingExercises, completionMap, todayKey]);

  const saveCurrentSession = useCallback(
    async (plan: typeof selectedPlan, exercises: WorkoutSessionExercise[]) => {
      if (!plan) return;
      if (!onSaveCustomSession && !onDeleteSession) return;
      if (!exercises.length) {
        await onDeleteSession?.(plan.dateStr);
        return;
      }
      await persistSession(plan.dateStr, exercises);
    },
    [onDeleteSession, onSaveCustomSession, persistSession]
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDate(dateStr);
  };

  const getExerciseAnimation = (key: string) => {
    if (!exerciseCardsAnim.has(key)) {
      const anim = new Animated.Value(1);
      exerciseCardsAnim.set(key, anim);
    }
    return exerciseCardsAnim.get(key)!;
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
    if (!selectedPlan) return;

    // Animate modal close first
    setExerciseModalVisible(false);
    
    const wasDirty = isDirty;
    const displayOrder = editingExercisesRef.current.length + 1;
    const newExercise = { ...convertCatalogExercise(entry), displayOrder };
    const next = [...editingExercisesRef.current, newExercise];

    // Trigger layout animation for smooth insertion
    LayoutAnimation.configureNext({
      duration: 300,
      create: {
        type: LayoutAnimation.Types.spring,
        property: LayoutAnimation.Properties.opacity,
        springDamping: 0.7,
      },
    });

    editingExercisesRef.current = next;
    setEditingExercises(next);

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
      if (selectedPlan.session?.id && onAddExercise) {
        const sessionExerciseId = await onAddExercise(selectedPlan.session.id, newExercise);
        if (sessionExerciseId) {
          setEditingExercises((prev) => {
            if (!prev.length) return prev;
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            updated[lastIndex] = { ...updated[lastIndex], id: sessionExerciseId };
            editingExercisesRef.current = updated;
            return updated;
          });
        }
        setIsDirty(wasDirty);
      }
    } catch (err) {
      console.error('Failed to save workout session:', err);
    }
  };

  const handleRemoveExercise = async (index: number) => {
    const exercise = editingExercisesRef.current[index];
    const cardKey = `${exercise.name}-${index}`;
    const cardAnim = getExerciseAnimation(cardKey);

    // Animate out before removing
    Animated.timing(cardAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setEditingExercises((prev) => {
        const next = prev.filter((_, idx) => idx !== index);
        editingExercisesRef.current = next;
        return next;
      });
    });

    setIsDirty(true);
    if (selectedPlan?.session?.id && exercise?.id && onDeleteExercise) {
      try {
        await onDeleteExercise(selectedPlan.session.id, exercise.id);
      } catch (err) {
        console.error('Failed to delete workout exercise:', err);
      }
    }
  };

 
 

  const handleChangeSets = (index: number, value: string) => {
    const numeric = parseInt(value, 10);
    setEditingExercises((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], sets: Number.isFinite(numeric) ? numeric : 0 };
      return next;
    });
    setIsDirty(true);
  };

  const handleChangeReps = (index: number, value: string) => {
    setEditingExercises((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], reps: value };
      return next;
    });
    setIsDirty(true);
  };

  useEffect(() => {
    if (!selectedPlan || !isDirty) return;
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
            Start today's session from the Dashboard tab, then it will appear here.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.workoutCard}>
        <View style={styles.exerciseList}>
          {editingExercises.map((exercise, idx) => {
            const cardKey = `${exercise.name}-${idx}`;
            const scaleAnim = getExerciseAnimation(cardKey);

            return (
              <Animated.View
                key={cardKey}
                style={{
                  transform: [{ scale: scaleAnim }],
                }}
              >
                <View style={styles.exerciseCard}>
                  <View style={styles.exerciseHeaderRow}>
                    <View style={styles.exerciseHeaderInfo}>
                      <Text style={styles.exerciseName}>{exercise.name}</Text>
                    </View>
                    <View style={styles.exerciseHeaderActions}>
                      {exercise.completed && (
                        <View style={styles.planCompleteBadge}>
                          <Text style={styles.planCompleteBadgeText}>Done</Text>
                        </View>
                      )}
                      {!exercise.completed && (
                        <TouchableOpacity
                          style={[styles.iconButton, styles.iconButtonDanger]}
                          onPress={() => {
                            animateExerciseAction(cardKey);
                            handleRemoveExercise(idx);
                          }}
                        >
                          <Text style={styles.iconButtonText}>×</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <View style={styles.exerciseInputs}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Sets</Text>
                      <TextInput
                        style={[
                          styles.inputField,
                          exercise.completed && styles.inputFieldDisabled,
                        ]}
                        keyboardType="number-pad"
                        value={String(exercise.sets ?? '')}
                        onChangeText={(value) => handleChangeSets(idx, value)}
                        editable={!exercise.completed}
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Reps</Text>
                      <TextInput
                        style={[
                          styles.inputField,
                          exercise.completed && styles.inputFieldDisabled,
                        ]}
                        value={exercise.reps}
                        onChangeText={(value) => handleChangeReps(idx, value)}
                        editable={!exercise.completed}
                      />
                    </View>
                  </View>
                </View>
              </Animated.View>
            );
          })}
        </View>
      </View>
    );
  };

  return (

    <View style={styles.container}>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
        <ScrollView
          stickyHeaderIndices={[0]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stickyHeader}>
            <View style={styles.headerTop}>
              <Text style={styles.headerTitle}>Workouts</Text>
              <View style={styles.phaseChip}>
                <Text style={styles.phaseChipText}>{phaseChipText}</Text>
              </View>
            </View>
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
                  const hasWorkout = plan.session && plan.session.exercises.length > 0;
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
          </View>

          <View style={styles.content}>
            <View style={styles.dayHeader}>
              <View style={styles.dayInfo}>
                {selectedDayMeta ? <Text style={styles.dayMeta}>{selectedDayMeta}</Text> : null}
              </View>
            </View>
            {renderSession()}
          </View>
        </ScrollView>
      </LinearGradient>
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 110,
          right: 20,
          zIndex: 10,
          transform: [
            { scale: fabScale },
            {
              rotate: fabRotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '45deg'],
              }),
            },
          ],
        }}
      >
        <TouchableOpacity
          style={styles.fabButton}
          onPress={() => setExerciseModalVisible(!exerciseModalVisible)}
          activeOpacity={0.85}
        >
          <Text style={styles.fabButtonText}>+</Text>
        </TouchableOpacity>
      </Animated.View>

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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
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
  stickyHeader: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: COLORS.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    padding: 18,
    gap: 12,
  },
  exerciseHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 12,
  },
  exerciseHeaderInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  exerciseHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planCompleteBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.success,
    backgroundColor: 'rgba(0, 245, 160, 0.12)',
  },
  planCompleteBadgeText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: '600',
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
  fabButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabButtonText: {
    fontSize: 32,
    fontWeight: '300',
    color: COLORS.textPrimary,
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
