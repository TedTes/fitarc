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

type PlansScreenProps = {
  user: User;
  phase: PhasePlan | null;
  workoutSessions: WorkoutSessionEntry[];
  onSaveCustomSession?: (date: string, exercises: WorkoutSessionExercise[]) => void;
  onDeleteSession?: (date: string) => void;
};

const SCREEN_GRADIENT = ['#080808', '#0F0F0F', '#151515'] as const;
const ACCENT = '#6366F1';
const ACCENT_BORDER = 'rgba(99, 102, 241, 0.25)';
const ACCENT_DIM = 'rgba(99, 102, 241, 0.1)';
const SUCCESS = '#10B981';
const CARD_BG = '#1B1B1B';
const SURFACE_BG = '#141414';
const BORDER = '#262626';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_SECONDARY = '#A3A3A3';
const TEXT_TERTIARY = '#737373';
const MAX_LIBRARY_ITEMS = 30;

type WorkoutTemplate = {
  id: string;
  title: string;
  description: string;
  focus: string[];
  exercises: string[];
};

const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'upper_push',
    title: 'Upper Push',
    description: 'Pressing focus for chest, shoulders, and triceps.',
    focus: ['Chest', 'Shoulders', 'Arms'],
    exercises: [
      'Barbell Bench Press',
      'Incline Dumbbell Press',
      'Cable Flyes',
      'Overhead Barbell Press',
      'Dumbbell Lateral Raise',
    ],
  },
  {
    id: 'upper_pull',
    title: 'Upper Pull',
    description: 'Rowing + pull focus for back thickness and lats.',
    focus: ['Back', 'Arms'],
    exercises: [
      'Bent Over Barbell Row',
      'Seated Cable Row',
      'Lat Pulldown',
      'Pull-Up',
      'Face Pull',
    ],
  },
  {
    id: 'lower_strength',
    title: 'Lower Strength',
    description: 'Heavy squat/hinge staples for legs + glutes.',
    focus: ['Legs'],
    exercises: [
      'Barbell Back Squat',
      'Romanian Deadlift',
      'Leg Press',
      'Barbell Hip Thrust',
      'Walking Lunges',
    ],
  },
];

const TEMPLATE_SEQUENCE: Record<User['trainingSplit'], WorkoutTemplate['id'][]> = {
  full_body: ['upper_push', 'lower_strength', 'upper_pull'],
  upper_lower: ['upper_push', 'lower_strength', 'upper_pull', 'lower_strength'],
  push_pull_legs: ['upper_push', 'upper_pull', 'lower_strength'],
  bro_split: ['upper_push', 'upper_pull', 'lower_strength'],
  custom: ['upper_push', 'upper_pull', 'lower_strength'],
};

const MUSCLE_FILTERS: (MuscleGroup | 'All')[] = [
  'All',
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
];

const formatDateLabel = (dateStr: string) => {
  const date = new Date(dateStr);
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
    day: date.getDate(),
  };
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
}) => {
  const { sessions: remoteSessions } = useWorkoutSessions(user.id, phase?.id ?? undefined);
  const { exercises: exerciseCatalog, isLoading: catalogLoading } = useSupabaseExercises();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<(typeof MUSCLE_FILTERS)[number]>('All');
  const [duplicateTarget, setDuplicateTarget] = useState<string | null>(null);
  const seededDatesRef = useRef<Set<string>>(new Set());

  if (!phase) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏋️‍♂️</Text>
            <Text style={styles.emptyTitle}>No Active Phase</Text>
            <Text style={styles.emptySubtitle}>Complete onboarding to unlock your workouts.</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  const resolvedSessions = remoteSessions.length ? remoteSessions : workoutSessions;

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

  const weekPlans = useMemo(() => {
    const today = new Date();
    const anchor = new Date(today.toISOString().split('T')[0]);
    return Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + idx);
      const dateStr = date.toISOString().split('T')[0];
      const session =
        resolvedSessions.find(
          (entry) => entry.phasePlanId === phase.id && entry.date === dateStr
        ) || null;
      return {
        dateStr,
        session,
      };
    });
  }, [resolvedSessions, phase.id]);

  const weekPlansWithTemplates = useMemo(() => {
    const sequence = TEMPLATE_SEQUENCE[user.trainingSplit] || TEMPLATE_SEQUENCE.custom;
    return weekPlans.map((plan, idx) => {
      const templateId = sequence[idx % sequence.length];
      const template = WORKOUT_TEMPLATES.find((tpl) => tpl.id === templateId) || null;
      const templateExercises = template
        ? template.exercises
            .map((name) => exerciseCatalog.find((exercise) => exercise.name === name))
            .filter((exercise): exercise is ExerciseCatalogEntry => !!exercise)
            .map((exercise) => convertCatalogExercise(exercise))
        : [];
      return {
        ...plan,
        template,
        templateExercises,
      };
    });
  }, [weekPlans, exerciseCatalog, convertCatalogExercise, user.trainingSplit]);

  const selectedPlan =
    weekPlansWithTemplates.find((plan) => plan.dateStr === selectedDate) || weekPlansWithTemplates[0];
  const [editingExercises, setEditingExercises] = useState<WorkoutSessionExercise[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const lastSyncedKeyRef = useRef<string | null>(null);
  const planSyncKey = selectedPlan
    ? selectedPlan.session
      ? `session-${selectedPlan.session.id}`
      : `template-${selectedPlan.dateStr}-${selectedPlan.templateExercises
          .map((exercise) => exercise.exerciseId ?? exercise.name)
          .join(',')}`
    : null;

  const persistSession = useCallback(
    async (date: string, exercises: WorkoutSessionExercise[]) => {
      if (!onSaveCustomSession) return;
      await onSaveCustomSession(date, exercises);
    },
    [onSaveCustomSession]
  );

  useEffect(() => {
    if (!planSyncKey || !selectedPlan) {
      setEditingExercises([]);
      setIsDirty(false);
      lastSyncedKeyRef.current = null;
      return;
    }
    if (isDirty && lastSyncedKeyRef.current === planSyncKey) {
      return;
    }
    const source =
      selectedPlan.session && selectedPlan.session.exercises.length
        ? selectedPlan.session.exercises
        : selectedPlan.templateExercises;
    setEditingExercises(createSessionExercises(source));
    setIsDirty(false);
    lastSyncedKeyRef.current = planSyncKey;
  }, [planSyncKey, selectedPlan, isDirty]);

  useEffect(() => {
    const seedMissingSessions = async () => {
      if (!onSaveCustomSession) return;
      for (const plan of weekPlansWithTemplates) {
        if (!plan.templateExercises.length) continue;
        if (plan.session) continue;
        if (seededDatesRef.current.has(plan.dateStr)) continue;
        seededDatesRef.current.add(plan.dateStr);
        await onSaveCustomSession(plan.dateStr, plan.templateExercises);
      }
    };
    seedMissingSessions();
  }, [weekPlansWithTemplates, onSaveCustomSession]);

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

  const handleAddFromTemplate = () => {
    if (!selectedPlan || !selectedPlan.templateExercises.length) return;
    setEditingExercises(createSessionExercises(selectedPlan.templateExercises));
    setIsDirty(true);
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

  const handleSaveEditedExercises = async () => {
    if (!selectedPlan) return;
    if (!editingExercises.length) {
      await onDeleteSession?.(selectedPlan.dateStr);
      setIsDirty(false);
      return;
    }
    await persistSession(selectedPlan.dateStr, editingExercises);
    setIsDirty(false);
  };

  const handleClearSession = async () => {
    if (!selectedPlan) return;
    await onDeleteSession?.(selectedPlan.dateStr);
    setEditingExercises([]);
    setIsDirty(false);
  };

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
        <View style={styles.emptySession}>
          <Text style={styles.emptyIcon}>⚙️</Text>
          <Text style={styles.emptyStateText}>No data for this date.</Text>
        </View>
      );
    }

    if (!editingExercises.length) {
      return (
        <View style={styles.emptySession}>
          <Text style={styles.emptyIcon}>💪</Text>
          <Text style={styles.emptyStateText}>No workout scheduled.</Text>
          {selectedPlan.templateExercises.length ? (
            <TouchableOpacity style={styles.primaryButton} onPress={handleAddFromTemplate}>
              <Text style={styles.primaryButtonText}>Load suggested workout</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setExerciseModalVisible(true)}>
              <Text style={styles.secondaryButtonText}>Start from blank</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View style={styles.sessionCard}>
        <Text style={styles.sessionDate}>
          {new Date(selectedPlan.dateStr).toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </Text>
        <View style={styles.exerciseList}>
          {editingExercises.map((exercise, idx) => (
            <View key={`${exercise.name}-${idx}`} style={styles.exerciseRow}>
              <View style={styles.exerciseInfo}>
                <Text style={styles.exerciseTitle}>{exercise.name}</Text>
                <View style={styles.exerciseMeta}>
                  <Text style={styles.exerciseLabel}>
                    {exercise.bodyParts.join(' • ') || 'Full body'}
                  </Text>
                  <Text style={styles.exerciseLabel}>•</Text>
                  <Text style={styles.exerciseLabel}>
                    {exercise.sets} sets × {exercise.reps}
                  </Text>
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
              <View style={styles.exerciseActions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => handleRemoveExercise(idx)}>
                  <Text style={styles.actionButtonText}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.addExerciseButton} onPress={() => setExerciseModalVisible(true)}>
          <Text style={styles.addExerciseText}>+ Add exercise</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, (!isDirty || !editingExercises.length) && styles.primaryButtonDisabled]}
          disabled={!editingExercises.length || !isDirty}
          onPress={handleSaveEditedExercises}
        >
          <Text style={styles.primaryButtonText}>
            {isDirty ? 'Save session' : 'Saved'}
          </Text>
        </TouchableOpacity>
        <View style={styles.sessionActions}>
          <TouchableOpacity
            style={styles.sessionActionButton}
            onPress={() => setDuplicateModalVisible(true)}
          >
            <Text style={styles.sessionActionText}>Duplicate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sessionActionButton, styles.sessionActionDanger]}
            onPress={handleClearSession}
          >
            <Text style={[styles.sessionActionText, styles.sessionActionDangerText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.scrollContent} stickyHeaderIndices={[0]}>
          <View style={styles.header}>
            <Text style={styles.title}>Workouts</Text>
            <Text style={styles.subtitle}>
              {phase.name || 'Current arc'} · Week {phase.expectedWeeks}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.daySelector}
          >
            {weekPlansWithTemplates.map((plan) => {
              const { weekday, day } = formatDateLabel(plan.dateStr);
              const isActive = plan.dateStr === selectedDate;
              return (
                <TouchableOpacity
                  key={plan.dateStr}
                  style={[styles.dayButton, isActive && styles.dayButtonActive]}
                  onPress={() => setSelectedDate(plan.dateStr)}
                >
                  <Text style={[styles.dayLabel, isActive && styles.dayLabelActive]}>{weekday}</Text>
                  <Text style={[styles.dayNumber, isActive && styles.dayNumberActive]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.content}>{renderSession()}</View>
        </ScrollView>
      </LinearGradient>

      <Modal transparent animationType="fade" visible={exerciseModalVisible}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalBackLayer} onPress={() => setExerciseModalVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Exercise</Text>
              <TouchableOpacity onPress={() => setExerciseModalVisible(false)}>
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search movements"
              placeholderTextColor={TEXT_TERTIARY}
              value={exerciseSearch}
              onChangeText={setExerciseSearch}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.muscleFilterRow}
            >
              {MUSCLE_FILTERS.map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={[
                    styles.filterChip,
                    muscleFilter === filter && styles.filterChipActive,
                  ]}
                  onPress={() => setMuscleFilter(filter)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      muscleFilter === filter && styles.filterChipTextActive,
                    ]}
                  >
                    {filter === 'All' ? 'All muscles' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView style={styles.catalogList}>
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
                    <View>
                      <Text style={styles.catalogName}>{entry.name}</Text>
                      <Text style={styles.catalogMeta}>
                        {(entry.primaryMuscles[0] || 'Full body')} · {entry.movementPattern || 'Strength'}
                      </Text>
                    </View>
                    <Text style={styles.catalogAdd}>＋</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={duplicateModalVisible}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalBackLayer} onPress={() => setDuplicateModalVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Duplicate workout</Text>
              <TouchableOpacity onPress={() => setDuplicateModalVisible(false)}>
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.duplicateGrid}>
              {weekPlansWithTemplates.map((plan) => {
                const { weekday, day } = formatDateLabel(plan.dateStr);
                const isSelected = duplicateTarget === plan.dateStr;
                return (
                  <TouchableOpacity
                    key={`duplicate-${plan.dateStr}`}
                    style={[
                      styles.duplicateButton,
                      isSelected && styles.duplicateButtonActive,
                    ]}
                    onPress={() => setDuplicateTarget(plan.dateStr)}
                  >
                    <Text
                      style={[
                        styles.duplicateLabel,
                        isSelected && styles.duplicateLabelActive,
                      ]}
                    >
                      {weekday}
                    </Text>
                    <Text
                      style={[
                        styles.duplicateValue,
                        isSelected && styles.duplicateValueActive,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                !duplicateTarget && styles.primaryButtonDisabled,
              ]}
              disabled={!duplicateTarget}
              onPress={() => duplicateTarget && handleDuplicateTo(duplicateTarget)}
            >
              <Text style={styles.primaryButtonText}>Duplicate here</Text>
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
    backgroundColor: SURFACE_BG,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: SURFACE_BG,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_TERTIARY,
    marginTop: 4,
  },
  daySelector: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: SURFACE_BG,
    gap: 10,
  },
  dayButton: {
    width: 56,
    height: 70,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dayButtonActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  dayLabel: {
    fontSize: 11,
    color: TEXT_TERTIARY,
    fontWeight: '600',
  },
  dayLabelActive: {
    color: TEXT_PRIMARY,
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  dayNumberActive: {
    color: TEXT_PRIMARY,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sessionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 14,
  },
  sessionDate: {
    fontSize: 12,
    color: TEXT_TERTIARY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exerciseList: {
    gap: 12,
  },
  exerciseRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: SURFACE_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  exerciseInfo: {
    flex: 1,
    gap: 4,
  },
  exerciseTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  exerciseMeta: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  exerciseLabel: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  exerciseInputs: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  inputGroup: {
    flex: 1,
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    color: TEXT_TERTIARY,
    textTransform: 'uppercase',
  },
  inputField: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_BG,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: TEXT_PRIMARY,
    fontSize: 13,
  },
  exerciseActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 18,
    color: TEXT_SECONDARY,
  },
  addExerciseButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: SURFACE_BG,
  },
  addExerciseText: {
    color: TEXT_SECONDARY,
    fontWeight: '600',
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 10,
  },
  sessionActionButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: SURFACE_BG,
  },
  sessionActionText: {
    color: TEXT_SECONDARY,
    fontWeight: '600',
  },
  sessionActionDanger: {
    borderColor: 'rgba(239,68,68,0.3)',
  },
  sessionActionDangerText: {
    color: '#EF4444',
  },
  emptySession: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  emptySessionText: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    textAlign: 'center',
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: ACCENT,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    color: TEXT_PRIMARY,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_BG,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalBackLayer: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  closeText: {
    fontSize: 32,
    color: TEXT_SECONDARY,
  },
  searchInput: {
    backgroundColor: SURFACE_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  muscleFilterRow: {
    gap: 8,
    paddingVertical: 6,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_BG,
  },
  filterChipActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_DIM,
  },
  filterChipText: {
    color: TEXT_SECONDARY,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: ACCENT,
  },
  catalogList: {
    marginTop: 8,
  },
  catalogItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_BG,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  catalogName: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  catalogMeta: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  catalogAdd: {
    color: ACCENT,
    fontSize: 20,
  },
  catalogEmpty: {
    color: TEXT_SECONDARY,
    textAlign: 'center',
    paddingVertical: 40,
  },
  duplicateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  duplicateButton: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  duplicateButtonActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_DIM,
  },
  duplicateLabel: {
    fontSize: 12,
    color: TEXT_TERTIARY,
  },
  duplicateLabelActive: {
    color: ACCENT,
  },
  duplicateValue: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_SECONDARY,
  },
  duplicateValueActive: {
    color: ACCENT,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: TEXT_SECONDARY,
    textAlign: 'center',
  },
});

export default PlansScreen;
