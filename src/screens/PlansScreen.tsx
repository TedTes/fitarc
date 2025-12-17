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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { User, PhasePlan, WorkoutSessionEntry, WorkoutSessionExercise, MuscleGroup } from '../types/domain';
import { useWorkoutSessions } from '../hooks/useWorkoutSessions';
import { useSupabaseExercises } from '../hooks/useSupabaseExercises';
import { ExerciseCatalogEntry } from '../services/exerciseCatalogService';
import { mapMuscleNameToGroup } from '../utils/workoutAnalytics';
import { formatLocalDateYMD } from '../utils/date';
import { fetchWorkoutCompletionMap } from '../services/supabaseWorkoutService';

type PlansScreenProps = {
  user: User;
  phase: PhasePlan | null;
  workoutSessions: WorkoutSessionEntry[];
  onSaveCustomSession?: (date: string, exercises: WorkoutSessionExercise[]) => void;
  onDeleteSession?: (date: string) => void;
  onToggleExercise?: (date: string, exerciseName: string) => void;
};

const SCREEN_GRADIENT = ['#0A0E27', '#151932', '#1E2340'] as const;
const COLORS = {
  bgPrimary: '#0A0E27',
  card: '#101427',
  elevated: '#151A2E',
  surface: '#0C1021',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A3BD',
  textTertiary: '#7B80A0',
  accent: '#6C63FF',
  accentDim: 'rgba(108,99,255,0.15)',
  accentGlow: 'rgba(108,99,255,0.3)',
  border: '#1E2340',
  borderStrong: '#2A2F4F',
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
    day: date.getDate(),
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
  onToggleExercise,
}) => {

  // Load sessions from database based on plan_id
  const {
    sessions: remoteSessions,
    isLoading: sessionsLoading,
    refresh: refreshSessions,
  } = useWorkoutSessions(user.id, phase?.id ?? undefined);
  const { exercises: exerciseCatalog, isLoading: catalogLoading } = useSupabaseExercises();
  
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDateYMD(new Date()));
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<(typeof MUSCLE_FILTERS)[number]>('All');
  const [duplicateTarget, setDuplicateTarget] = useState<string | null>(null);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [completionMap, setCompletionMap] = useState<Record<string, boolean>>({});

  // Use database sessions (remoteSessions) - no fallback to static data
  const resolvedSessions = remoteSessions;

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
      setEditingExercises([]);
      setIsDirty(false);
      lastSyncedKeyRef.current = null;
      return;
    }

    // Only update if we're not in the middle of editing
    if (isDirty && lastSyncedKeyRef.current === planSyncKey) {
      return;
    }

    // Load exercises from the database session if it exists
    if (selectedPlan.session && selectedPlan.session.exercises.length > 0) {
      setEditingExercises(createSessionExercises(selectedPlan.session.exercises));
      setIsDirty(false);
      lastSyncedKeyRef.current = planSyncKey;
    } else {
      // No session exists - clear exercises
      setEditingExercises([]);
      setIsDirty(false);
      lastSyncedKeyRef.current = planSyncKey;
    }
  }, [planSyncKey, selectedPlan, isDirty]);

  useEffect(() => {
    if (!editingExercises.length) {
      setOverflowMenuOpen(false);
    }
  }, [editingExercises.length]);

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

  const selectedDayInfo = useMemo(() => {
    if (!selectedPlan) return null;
    const date = parseLocalDateFromYMD(selectedPlan.dateStr);
    const fullDate = date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    const totalExercises = editingExercises.length;
    const completedCount = editingExercises.filter((exercise) => exercise.completed).length;
    const isFuture = selectedPlan.dateStr > todayKey;
    const meta = !totalExercises
      ? 'No workout scheduled'
      : isFuture
      ? 'Scheduled workout'
      : completionMap[selectedPlan.dateStr]
      ? 'Completed'
      : `${completedCount}/${totalExercises} exercises`;
    return { fullDate, meta };
  }, [selectedPlan, editingExercises, completionMap, todayKey]);

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setOverflowMenuOpen(false);
    refreshSessions();
  };

  const handleAddExercise = (entry: ExerciseCatalogEntry) => {
    if (!selectedPlan) return;
    setEditingExercises((prev) => [...prev, convertCatalogExercise(entry)]);
    setIsDirty(true);
    setExerciseModalVisible(false);
  };

  const handleRemoveExercise = (index: number) => {
    setEditingExercises((prev) => prev.filter((_, idx) => idx !== index));
    setIsDirty(true);
  };

  const handleDuplicateTo = async (targetDate: string) => {
    if (!selectedPlan) return;
    const source =
      selectedPlan.session && selectedPlan.session.exercises.length
        ? createSessionExercises(selectedPlan.session.exercises)
        : editingExercises;
    if (!source.length) return;
    await persistSession(targetDate, source);
    setDuplicateTarget(null);
    setDuplicateModalVisible(false);
  };

  const isFutureSelected = selectedPlan ? selectedPlan.dateStr > todayKey : false;
  const canToggleCompletion = Boolean(onToggleExercise && selectedPlan?.session && !isFutureSelected);

  const handleToggleExerciseCompletion = useCallback(
    (index: number) => {
      if (!canToggleCompletion || !selectedPlan) return;
      setEditingExercises((prev) => {
        const target = prev[index];
        if (!target) return prev;
        onToggleExercise?.(selectedPlan.dateStr, target.name);
        setIsDirty(true);
        return prev.map((exercise, idx) =>
          idx === index ? { ...exercise, completed: !exercise.completed } : exercise
        );
      });
    },
    [canToggleCompletion, onToggleExercise, selectedPlan]
  );

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

  const handleSaveEditedExercises = async () => {
    if (!selectedPlan) return;
    if (!editingExercises.length) {
      await onDeleteSession?.(selectedPlan.dateStr);
      setIsDirty(false);
      return;
    }
    await persistSession(selectedPlan.dateStr, editingExercises);
    setIsDirty(false);
    setOverflowMenuOpen(false);
  };

  const handleClearSession = useCallback(async () => {
    if (!selectedPlan) return;
    await onDeleteSession?.(selectedPlan.dateStr);
    setEditingExercises([]);
    setIsDirty(false);
  }, [onDeleteSession, selectedPlan]);

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
            Start today’s session from the Dashboard tab, then it will appear here.
          </Text>
        </View>
      );
    }

    return (

      <View style={styles.workoutCard}>
        <View style={styles.exerciseList}>
          {editingExercises.map((exercise, idx) => (
            <View key={`${exercise.name}-${idx}`} style={styles.exerciseCard}>
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
                      onPress={() => handleRemoveExercise(idx)}
                    >
                      <Text style={styles.iconButtonText}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={styles.exerciseTags}>
                <Text style={styles.exerciseTag}>{exercise.bodyParts.join(' • ') || 'Full body'}</Text>
                <Text style={styles.exerciseTag}>{`${exercise.sets} sets × ${exercise.reps}`}</Text>
              </View>
              <View style={styles.exerciseInputs}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Sets</Text>
                  <TextInput
                    style={styles.inputField}
                    keyboardType="number-pad"
                    value={String(exercise.sets ?? '')}
                    onChangeText={(value) => handleChangeSets(idx, value)}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Reps</Text>
                  <TextInput
                    style={styles.inputField}
                    value={exercise.reps}
                    onChangeText={(value) => handleChangeReps(idx, value)}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.addExerciseButton} onPress={() => setExerciseModalVisible(true)}>
          <Text style={styles.addExerciseText}>+ Add exercise</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, (!isDirty || !editingExercises.length) && styles.saveButtonDisabled]}
          disabled={!editingExercises.length || !isDirty}
          onPress={handleSaveEditedExercises}
        >
          <Text style={styles.saveButtonText}>{isDirty ? 'Save session' : 'Saved'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (

    <View style={styles.container}>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
        {overflowMenuOpen && (
          <Pressable style={styles.menuBackdrop} onPress={() => setOverflowMenuOpen(false)} />
        )}
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.weekStrip}
            >
              {weekPlans.map((plan) => {
              const { weekday, day } = formatDateLabel(plan.dateStr);
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
                    onPress={() => handleSelectDate(plan.dateStr)}
                  >
                    <Text style={[styles.dayLabel, isActive && styles.dayLabelActive]}>{weekday}</Text>
                    <Text style={[styles.dayNumber, isActive && styles.dayNumberActive]}>{day}</Text>
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
          </View>

          <View style={styles.content}>
            <View style={styles.dayHeader}>
              <View style={styles.dayInfo}>
                <Text style={styles.dayTitle}>{selectedDayInfo?.fullDate ?? '—'}</Text>
                <Text style={styles.dayMeta}>{selectedDayInfo?.meta ?? 'No workout logged'}</Text>
              </View>
              {editingExercises.length > 0 && (
                <View style={styles.overflowWrapper}>
                  <TouchableOpacity
                    style={styles.overflowButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      setOverflowMenuOpen((prev) => !prev);
                    }}
                  >
                    <Text style={styles.overflowButtonText}>⋯</Text>
                  </TouchableOpacity>
                  {overflowMenuOpen && (
                    <View style={styles.overflowMenu}>
                      <TouchableOpacity
                        style={styles.overflowItem}
                        onPress={(event) => {
                          event.stopPropagation();
                          setDuplicateTarget(null);
                          setDuplicateModalVisible(true);
                          setOverflowMenuOpen(false);
                        }}
                      >
                        <Text style={styles.overflowItemText}>Duplicate workout</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.overflowItem, styles.overflowItemDanger]}
                        onPress={async (event) => {
                          event.stopPropagation();
                          setOverflowMenuOpen(false);
                          await handleClearSession();
                        }}
                      >
                        <Text style={[styles.overflowItemText, styles.overflowItemDangerText]}>Delete workout</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
            {sessionsLoading ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptySubtitle}>Loading...</Text>
              </View>
            ) : (
              renderSession()
            )}
          </View>
        </ScrollView>
      </LinearGradient>

      <Modal transparent animationType="fade" visible={exerciseModalVisible} onRequestClose={() => setExerciseModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdropPress} onPress={() => setExerciseModalVisible(false)} />
          <View style={styles.sheet}>
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
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={duplicateModalVisible} onRequestClose={() => setDuplicateModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdropPress} onPress={() => setDuplicateModalVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Duplicate to…</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setDuplicateModalVisible(false)}>
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.duplicateGrid}>
              {weekPlans.map((plan) => {
                const { weekday, day } = formatDateLabel(plan.dateStr);
                const isSelected = duplicateTarget === plan.dateStr;
                return (
                  <TouchableOpacity
                    key={`duplicate-${plan.dateStr}`}
                    style={[styles.duplicateDay, isSelected && styles.duplicateDaySelected]}
                    onPress={() => setDuplicateTarget(plan.dateStr)}
                  >
                    <Text style={[styles.duplicateLabel, isSelected && styles.duplicateLabelSelected]}>{weekday}</Text>
                    <Text style={[styles.duplicateNumber, isSelected && styles.duplicateNumberSelected]}>{day}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.saveButton, !duplicateTarget && styles.saveButtonDisabled]}
              disabled={!duplicateTarget}
              onPress={() => duplicateTarget && handleDuplicateTo(duplicateTarget)}
            >
              <Text style={styles.saveButtonText}>Duplicate workout</Text>
            </TouchableOpacity>
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
  gradient: {
    flex: 1,
  },
  gradientCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 10,
    position: 'absolute',
  },
  scrollContent: {
    paddingBottom: 80,
  },
  stickyHeader: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 24,
    backgroundColor: COLORS.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -1,
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
    paddingVertical: 12,
    gap: 8,
  },
  dayChip: {
    minWidth: 52,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
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
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textTertiary,
  },
  dayLabelActive: {
    color: COLORS.textPrimary,
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  dayNumberActive: {
    color: COLORS.textPrimary,
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
    marginTop: 6,
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
    paddingHorizontal: 24,
    paddingTop: 24,
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
  dayTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  dayMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  overflowWrapper: {
    position: 'relative',
    zIndex: 20,
  },
  overflowButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.elevated,
  },
  overflowButtonText: {
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  overflowMenu: {
    position: 'absolute',
    top: 48,
    right: 0,
    backgroundColor: COLORS.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    minWidth: 180,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 20,
  },
  overflowItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  overflowItemText: {
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  overflowItemDanger: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderStrong,
  },
  overflowItemDangerText: {
    color: '#EF4444',
  },
  workoutCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  exerciseList: {
    gap: 12,
  },
  exerciseCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.elevated,
    padding: 16,
    gap: 10,
  },
  exerciseHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
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
  exerciseTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  exerciseTag: {
    backgroundColor: COLORS.surface,
    color: COLORS.textTertiary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '500',
  },
  exerciseInputs: {
    flexDirection: 'row',
    gap: 12,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
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
  addExerciseButton: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  addExerciseText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  saveButton: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginHorizontal: 24,
    marginVertical: 32,
  },
  emptyCardCentered: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  emptyIcon: {
    fontSize: 56,
    opacity: 0.3,
    color: COLORS.textPrimary,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  secondaryButton: {
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  actionButtonText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalBackdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
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
    fontSize: 26,
    color: COLORS.textSecondary,
  },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.elevated,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  filterText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: COLORS.textPrimary,
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
  duplicateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  duplicateDay: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  duplicateDaySelected: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  duplicateLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
  },
  duplicateLabelSelected: {
    color: COLORS.accent,
  },
  duplicateNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  duplicateNumberSelected: {
    color: COLORS.accent,
  },
});

export default PlansScreen;
