import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated,
  Pressable,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PhasePlan, User, WorkoutSessionExercise, MuscleGroup, PlanDay, WorkoutSessionEntry } from '../types/domain';
import { useWorkoutTemplates } from '../hooks/useWorkoutTemplates';
import { formatLocalDateYMD } from '../utils/date';

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#0A0E27',
  card: '#101427',
  cardElevated: '#131929',
  accent: '#6C63FF',
  success: '#00F5A0',
  textPrimary: '#FFFFFF',
  textSecondary: '#C7CCE6',
  textMuted: '#8B93B0',
  border: 'rgba(255,255,255,0.08)',
  borderAccent: 'rgba(108,99,255,0.25)',
  overlay: 'rgba(255,255,255,0.06)',
} as const;

const MUSCLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  chest:     { bg: 'rgba(239,68,68,0.15)',    text: '#FCA5A5', border: 'rgba(239,68,68,0.3)'    },
  back:      { bg: 'rgba(59,130,246,0.15)',   text: '#93C5FD', border: 'rgba(59,130,246,0.3)'   },
  legs:      { bg: 'rgba(168,85,247,0.15)',   text: '#C4B5FD', border: 'rgba(168,85,247,0.3)'   },
  shoulders: { bg: 'rgba(234,179,8,0.15)',    text: '#FDE047', border: 'rgba(234,179,8,0.3)'    },
  arms:      { bg: 'rgba(236,72,153,0.15)',   text: '#F9A8D4', border: 'rgba(236,72,153,0.3)'   },
  core:      { bg: 'rgba(16,185,129,0.15)',   text: '#6EE7B7', border: 'rgba(16,185,129,0.3)'   },
};

const KNOWN_MUSCLES = new Set(['chest', 'back', 'legs', 'shoulders', 'arms', 'core']);

const DIFFICULTY_COLORS = {
  beginner:     { bg: 'rgba(16,185,129,0.15)',  text: '#6EE7B7' },
  intermediate: { bg: 'rgba(234,179,8,0.15)',   text: '#FDE047' },
  advanced:     { bg: 'rgba(239,68,68,0.15)',    text: '#FCA5A5' },
};

const ICON_BY_TAG: Record<string, string> = {
  push: '🔥', pull: '🎯', legs: '🦵', upper: '💪', lower: '🏋️', full_body: '⚡',
};

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: 'Build Muscle', strength: 'Get Stronger', fat_loss: 'Fat Loss',
  endurance: 'Endurance', general: 'General Fitness',
};


// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';

type TemplateExercise = {
  id: string;
  exerciseId: string;
  name: string;
  bodyParts: string[];
  sets: number;
  reps: string;
  movementPattern?: string;
};

type WorkoutTemplate = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  exercises: TemplateExercise[];
  difficulty: TemplateDifficulty;
  estimatedTime: number;
  totalSets: number;
  featured: boolean;
  goalTags: string[];
};

// ─── Props ────────────────────────────────────────────────────────────────────

type LibraryScreenProps = {
  user: User;
  phase: PhasePlan | null;
  plannedWorkouts: PlanDay[];
  workoutSessions: WorkoutSessionEntry[];
  onReplaceSessionWithTemplate?: (
    date: string,
    exercises: WorkoutSessionExercise[],
    force?: boolean
  ) => Promise<{ hasProgress: boolean }>;
  onAppendExercisesToSession?: (date: string, exercises: WorkoutSessionExercise[]) => Promise<void>;
  onNavigateToToday?: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  user,
  phase,
  plannedWorkouts,
  workoutSessions,
  onReplaceSessionWithTemplate,
  onAppendExercisesToSession,
  onNavigateToToday,
}) => {
  const today = formatLocalDateYMD(new Date());

  const { templates: remoteTemplates, isLoading, error } = useWorkoutTemplates(user.id);

  // ─ Template state ─
  const [tagFilter, setTagFilter] = useState('all');
  const [selectedModal, setSelectedModal] = useState<WorkoutTemplate | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [appliedThisSession, setAppliedThisSession] = useState<Set<string>>(new Set());
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);

  // ─ Animation ─
  const modalSlide = useRef(new Animated.Value(400)).current;

  // ─ Map remote templates to local shape ─
  const templates = useMemo<WorkoutTemplate[]>(() => {
    return remoteTemplates.map((t) => {
      const totalSets = t.exercises.reduce((s, ex) => s + (ex.sets ?? 0), 0);
      const estimatedTime = t.estimatedTimeMinutes ?? Math.max(20, t.exercises.length * 8);
      const primaryTag = t.goalTags.find((tag) => ICON_BY_TAG[tag]);
      const icon = primaryTag ? ICON_BY_TAG[primaryTag] : '💪';
      const rawDiff = (t.difficulty ?? '').toLowerCase();
      const difficulty: TemplateDifficulty =
        rawDiff === 'intermediate' || rawDiff === 'advanced' ? rawDiff : 'beginner';
      return {
        id: t.id,
        title: t.title,
        subtitle: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} · ${estimatedTime} min`,
        description: t.description ?? 'Workout template',
        icon,
        exercises: t.exercises.map((ex) => ({
          id: ex.id,
          exerciseId: ex.exerciseId,
          name: ex.name,
          bodyParts: ex.bodyParts as string[],
          sets: ex.sets ?? 4,
          reps: ex.reps ?? '8-12',
          movementPattern: ex.movementPattern ?? undefined,
        })),
        difficulty,
        estimatedTime,
        totalSets,
        featured: t.isPublic && t.goalTags.includes('full_body'),
        goalTags: t.goalTags,
      };
    });
  }, [remoteTemplates]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    templates.forEach((t) => t.goalTags.forEach((tag) => tags.add(tag)));
    return ['all', ...Array.from(tags).sort()];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (tagFilter === 'all') return templates;
    return templates.filter((t) => t.goalTags.includes(tagFilter));
  }, [tagFilter, templates]);

  const featuredTemplates = useMemo(() => filteredTemplates.filter((t) => t.featured), [filteredTemplates]);
  const regularTemplates = useMemo(() => filteredTemplates.filter((t) => !t.featured), [filteredTemplates]);

  // ─ Phase stats ─
  const weeksElapsed = useMemo(() => {
    if (!phase) return 0;
    const start = new Date(phase.startDate);
    const now = new Date();
    return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
  }, [phase]);

  const todaySession = useMemo(
    () => workoutSessions.find((s) => s.phasePlanId === phase?.id && s.date === today),
    [workoutSessions, phase, today]
  );

  const todayExerciseCount = useMemo(() => {
    if (todaySession?.exercises?.length) return todaySession.exercises.length;
    const planned = plannedWorkouts.find((d) => d.planId === phase?.id && d.date === today);
    return planned?.workout?.exercises?.length ?? 0;
  }, [todaySession, plannedWorkouts, phase, today]);

  // Modal open/close animation
  useEffect(() => {
    if (selectedModal) {
      const keys = new Set(selectedModal.exercises.map((ex) => `${selectedModal.id}-${ex.exerciseId}`));
      setSelectedKeys(keys);
      Animated.spring(modalSlide, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }).start();
    } else {
      modalSlide.setValue(400);
      setSelectedKeys(new Set());
    }
  }, [selectedModal, modalSlide]);

  const toggleKey = useCallback((key: string, disabled?: boolean) => {
    if (disabled) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const toggleAllKeys = useCallback(() => {
    if (!selectedModal) return;
    const allKeys = selectedModal.exercises.map((ex) => `${selectedModal.id}-${ex.exerciseId}`);
    const unapplied = allKeys.filter((k) => !appliedThisSession.has(k));
    const allSelected = unapplied.every((k) => selectedKeys.has(k));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        unapplied.forEach((k) => next.delete(k));
      } else {
        unapplied.forEach((k) => next.add(k));
      }
      return next;
    });
  }, [selectedModal, selectedKeys, appliedThisSession]);

  // ─ Apply template ─
  const buildSessionExercises = useCallback((_template: WorkoutTemplate, exercises: TemplateExercise[]): WorkoutSessionExercise[] =>
    exercises.map((ex, i) => ({
      exerciseId: ex.exerciseId,
      name: ex.name,
      bodyParts: ex.bodyParts as MuscleGroup[],
      sets: ex.sets,
      reps: ex.reps,
      movementPattern: ex.movementPattern,
      displayOrder: i + 1,
      completed: false,
    })), []);

  const handleApply = useCallback(async (
    template: WorkoutTemplate,
    exercises: TemplateExercise[],
    replaceAll: boolean,
    force = false
  ) => {
    const sessionExercises = buildSessionExercises(template, exercises);

    if (replaceAll) {
      if (!onReplaceSessionWithTemplate) return;
      try {
        const result = await onReplaceSessionWithTemplate(today, sessionExercises, force);
        if (result.hasProgress) {
          Alert.alert(
            'Session has logged data',
            'Your current workout has progress logged. Replace it anyway?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Replace', style: 'destructive', onPress: () => void handleApply(template, exercises, replaceAll, true) },
            ]
          );
          return;
        }
      } catch {
        Alert.alert('Error', 'Could not apply template. Please try again.');
        return;
      }
    } else {
      // Selective add: close and navigate immediately, append in background
      setSelectedModal(null);
      onNavigateToToday?.();
      if (!onAppendExercisesToSession) return;
      void onAppendExercisesToSession(today, sessionExercises).catch(() =>
        Alert.alert('Error', 'Could not add exercises. Please try again.')
      );
      setAppliedThisSession((prev) => {
        const next = new Set(prev);
        exercises.forEach((ex) => next.add(`${template.id}-${ex.exerciseId}`));
        return next;
      });
      return;
    }

    // Full replace success
    setAppliedThisSession((prev) => {
      const next = new Set(prev);
      exercises.forEach((ex) => next.add(`${template.id}-${ex.exerciseId}`));
      return next;
    });
    setCurrentTemplateId(template.id);
    setSelectedModal(null);
    onNavigateToToday?.();
  }, [today, buildSessionExercises, onReplaceSessionWithTemplate, onAppendExercisesToSession, onNavigateToToday]);

  const confirmAndApply = useCallback((template: WorkoutTemplate, exercises: TemplateExercise[], replaceAll: boolean) => {
    if (replaceAll && todayExerciseCount > 0) {
      Alert.alert(
        'Replace today\'s workout?',
        `This will replace your current ${todayExerciseCount} exercise${todayExerciseCount !== 1 ? 's' : ''} with "${template.title}".`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: () => void handleApply(template, exercises, replaceAll, false) },
        ]
      );
    } else {
      void handleApply(template, exercises, replaceAll, false);
    }
  }, [todayExerciseCount, handleApply]);

  // ─ Render helpers ─
  const formatBodyPart = (bp: string) =>
    bp.charAt(0).toUpperCase() + bp.slice(1).replace(/_/g, ' ');

  const renderTemplateCard = (template: WorkoutTemplate) => {
    const isCurrent = currentTemplateId === template.id;
    const muscles = Array.from(
      new Set(template.exercises.flatMap((ex) => ex.bodyParts.map((b) => b.toLowerCase())))
    ).filter((b) => KNOWN_MUSCLES.has(b)).slice(0, 3);

    return (
      <TouchableOpacity
        key={template.id}
        activeOpacity={0.75}
        onPress={() => setSelectedModal(template)}
        style={[styles.card, isCurrent && styles.cardCurrent]}
      >
        {isCurrent && <View style={styles.activeStrip} />}

        <View style={styles.cardInner}>
          <View style={[styles.iconBadge, isCurrent && styles.iconBadgeCurrent]}>
            <Text style={styles.iconText}>{template.icon}</Text>
          </View>

          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, isCurrent && { color: COLORS.success }]} numberOfLines={1}>
              {template.title}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {template.difficulty.charAt(0).toUpperCase() + template.difficulty.slice(1)}
              {' · '}{template.exercises.length} exercises{' · '}{template.estimatedTime} min
              {muscles.length > 0 ? '  ·  ' + muscles.map(formatBodyPart).join(', ') : ''}
            </Text>
          </View>

          <View style={styles.cardRight}>
            {isCurrent ? (
              <Text style={styles.activeCheck}>✓</Text>
            ) : (
              <Text style={styles.cardChevron}>›</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Workouts</Text>
          <Text style={styles.pageSubtitle}>Templates & your training plan</Text>
        </View>

        {/* ── Phase card ── */}
        {phase ? (
          <View style={styles.phaseCard}>
            <LinearGradient
              colors={['rgba(108,99,255,0.18)', 'rgba(108,99,255,0.06)']}
              style={styles.phaseGradient}
            >
              <View style={styles.phaseTop}>
                <View>
                  <Text style={styles.phaseLabel}>ACTIVE PLAN</Text>
                  <Text style={styles.phaseName}>{phase.name ?? GOAL_LABELS[phase.goalType ?? ''] ?? 'My Plan'}</Text>
                </View>
                <View style={styles.phaseWeekBadge}>
                  <Text style={styles.phaseWeekNum}>W{weeksElapsed}</Text>
                  <Text style={styles.phaseWeekOf}>of {phase.expectedWeeks}</Text>
                </View>
              </View>
              <View style={styles.phaseStats}>
                <View style={styles.phaseStat}>
                  <Text style={styles.phaseStatVal}>{GOAL_LABELS[phase.goalType ?? ''] ?? '—'}</Text>
                  <Text style={styles.phaseStatLbl}>Goal</Text>
                </View>
                <View style={styles.phaseStatDiv} />
                <View style={styles.phaseStat}>
                  <Text style={styles.phaseStatVal}>{phase.expectedWeeks}</Text>
                  <Text style={styles.phaseStatLbl}>Weeks</Text>
                </View>
                <View style={styles.phaseStatDiv} />
                <View style={styles.phaseStat}>
                  <Text style={styles.phaseStatVal}>{todayExerciseCount || '—'}</Text>
                  <Text style={styles.phaseStatLbl}>Today</Text>
                </View>
              </View>
              {/* Week progress bar */}
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${Math.min(100, (weeksElapsed / phase.expectedWeeks) * 100)}%` },
                  ]}
                />
              </View>
            </LinearGradient>
          </View>
        ) : (
          <View style={styles.noPlanCard}>
            <Text style={styles.noPlanEmoji}>🎯</Text>
            <Text style={styles.noPlanTitle}>No active plan</Text>
            <Text style={styles.noPlanText}>Create a plan to unlock personalized workouts.</Text>
          </View>
        )}

        {/* ── Templates ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Workout Templates</Text>
          {templates.length > 0 && (
            <Text style={styles.sectionCount}>{templates.length} templates</Text>
          )}
        </View>

        {/* Filter chips */}
        {availableTags.length > 2 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {availableTags.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.filterChip, tagFilter === tag && styles.filterChipActive]}
                onPress={() => setTagFilter(tag)}
              >
                <Text style={[styles.filterChipText, tagFilter === tag && styles.filterChipTextActive]}>
                  {tag === 'all' ? 'All' : tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Loading */}
        {isLoading && (
          <Text style={styles.loadingText}>Loading templates…</Text>
        )}
        {!isLoading && error && (
          <Text style={styles.loadingText}>Failed to load templates.</Text>
        )}

        {/* Featured */}
        {!isLoading && featuredTemplates.length > 0 && (
          <>
            <View style={styles.subHeader}>
              <Text style={styles.subHeaderText}>⭐ Featured</Text>
            </View>
            {featuredTemplates.map(renderTemplateCard)}
          </>
        )}

        {/* All */}
        {!isLoading && regularTemplates.length > 0 && (
          <>
            <View style={styles.subHeader}>
              <Text style={styles.subHeaderText}>All Templates</Text>
            </View>
            {regularTemplates.map(renderTemplateCard)}
          </>
        )}

        {!isLoading && filteredTemplates.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyTitle}>No templates yet</Text>
            <Text style={styles.emptyText}>Templates will appear here once added.</Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Template modal ── */}
      <Modal
        transparent
        animationType="none"
        visible={selectedModal !== null}
        onRequestClose={() => setSelectedModal(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSelectedModal(null)} />
          <Animated.View style={[styles.modalSheet, { transform: [{ translateY: modalSlide }] }]}>
            <View style={styles.sheetHandle} />
            {selectedModal && (() => {
              const diff = DIFFICULTY_COLORS[selectedModal.difficulty];
              const addable = selectedModal.exercises.filter((ex) => {
                const k = `${selectedModal.id}-${ex.exerciseId}`;
                return selectedKeys.has(k) && !appliedThisSession.has(k);
              });
              const isAll = addable.length === selectedModal.exercises.length;
              const btnLabel = addable.length === 0 ? 'Nothing to add' : isAll ? 'Use Template' : `Add ${addable.length} Exercise${addable.length !== 1 ? 's' : ''}`;
              const unappliedKeys = selectedModal.exercises
                .map((ex) => `${selectedModal.id}-${ex.exerciseId}`)
                .filter((k) => !appliedThisSession.has(k));
              const allSelected = unappliedKeys.length > 0 && unappliedKeys.every((k) => selectedKeys.has(k));

              return (
                <>
                  {/* Gradient header */}
                  <LinearGradient
                    colors={[diff.bg, 'transparent']}
                    style={styles.modalHeaderGradient}
                  >
                    <View style={styles.modalHeaderRow}>
                      <View style={[styles.modalIconBadge, { borderColor: diff.text + '40' }]}>
                        <Text style={styles.modalIconText}>{selectedModal.icon}</Text>
                      </View>
                      <View style={styles.modalHeaderText}>
                        <Text style={styles.modalTitle}>{selectedModal.title}</Text>
                        {selectedModal.description ? (
                          <Text style={styles.modalDesc} numberOfLines={1}>{selectedModal.description}</Text>
                        ) : null}
                        <View style={styles.modalTagRow}>
                          <View style={[styles.diffBadge, { backgroundColor: diff.bg }]}>
                            <Text style={[styles.diffBadgeText, { color: diff.text }]}>
                              {selectedModal.difficulty.charAt(0).toUpperCase() + selectedModal.difficulty.slice(1)}
                            </Text>
                          </View>
                          {selectedModal.goalTags.slice(0, 2).map((tag) => (
                            <View key={tag} style={styles.goalBadge}>
                              <Text style={styles.goalBadgeText}>{GOAL_LABELS[tag] ?? tag}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                      <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedModal(null)}>
                        <Text style={styles.modalCloseText}>×</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Stats strip */}
                    <View style={styles.statsStrip}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{selectedModal.exercises.length}</Text>
                        <Text style={styles.statLabel}>Exercises</Text>
                      </View>
                      <View style={styles.statDivider} />
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{selectedModal.totalSets}</Text>
                        <Text style={styles.statLabel}>Sets</Text>
                      </View>
                      <View style={styles.statDivider} />
                      <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: COLORS.accent }]}>{selectedModal.estimatedTime}</Text>
                        <Text style={styles.statLabel}>Min</Text>
                      </View>
                    </View>
                  </LinearGradient>

                  {/* Exercise list header */}
                  <View style={styles.exListHeader}>
                    <Text style={styles.exListTitle}>Exercises</Text>
                    <TouchableOpacity onPress={toggleAllKeys}>
                      <Text style={styles.selectAllBtn}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Exercise list */}
                  <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                    {selectedModal.exercises.map((ex, idx) => {
                      const mc = MUSCLE_COLORS[ex.bodyParts[0]?.toLowerCase() ?? ''] ?? MUSCLE_COLORS.core;
                      const key = `${selectedModal.id}-${ex.exerciseId}`;
                      const wasAdded = appliedThisSession.has(key);
                      const isSelected = selectedKeys.has(key);
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.exRow, (isSelected || wasAdded) && styles.exRowSelected]}
                          onPress={() => toggleKey(key, wasAdded)}
                          disabled={wasAdded}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.exColorBar, { backgroundColor: mc.text }]} />
                          <View style={styles.exInfo}>
                            <Text style={[styles.exName, wasAdded && { color: COLORS.textMuted }]}>{ex.name}</Text>
                            <Text style={styles.exMeta}>
                              {ex.bodyParts.slice(0, 2).map(formatBodyPart).join(' · ')}
                            </Text>
                          </View>
                          <Text style={[styles.exSetsReps, (isSelected || wasAdded) && { color: diff.text }]}>
                            {ex.sets}×{ex.reps}
                          </Text>
                          <View style={[styles.exCheck, (isSelected || wasAdded) && styles.exCheckActive]}>
                            {(isSelected || wasAdded) && <Text style={styles.exCheckText}>✓</Text>}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Footer */}
                  <View style={styles.modalFooter}>
                    {addable.length > 0 && !isAll && (
                      <Text style={styles.footerHint}>
                        {addable.length} of {selectedModal.exercises.length} selected · tap to deselect
                      </Text>
                    )}
                    <TouchableOpacity
                      style={[styles.applyBtn, isAll && styles.applyBtnPrimary, addable.length === 0 && styles.applyBtnDisabled]}
                      disabled={addable.length === 0}
                      onPress={() => confirmAndApply(selectedModal, addable, isAll)}
                    >
                      <Text style={styles.applyBtnText}>{btnLabel}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </Animated.View>
        </View>
      </Modal>
    </LinearGradient>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 60 },

  // Page header
  pageHeader: { marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 3, fontWeight: '500' },

  // Phase card
  phaseCard: { borderRadius: 20, overflow: 'hidden', marginBottom: 28, borderWidth: 1, borderColor: COLORS.borderAccent },
  phaseGradient: { padding: 20 },
  phaseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  phaseLabel: { fontSize: 10, fontWeight: '700', color: COLORS.accent, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  phaseName: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  phaseWeekBadge: { alignItems: 'center', backgroundColor: 'rgba(108,99,255,0.2)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.borderAccent },
  phaseWeekNum: { fontSize: 20, fontWeight: '800', color: COLORS.accent },
  phaseWeekOf: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },
  phaseStats: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  phaseStat: { flex: 1, alignItems: 'center' },
  phaseStatVal: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 2 },
  phaseStatLbl: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  phaseStatDiv: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.08)' },
  progressBarTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  progressBarFill: { height: 4, borderRadius: 2, backgroundColor: COLORS.accent },

  // No plan
  noPlanCard: { borderRadius: 16, padding: 24, backgroundColor: COLORS.card, alignItems: 'center', marginBottom: 28, borderWidth: 1, borderColor: COLORS.border },
  noPlanEmoji: { fontSize: 32, marginBottom: 8 },
  noPlanTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  noPlanText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },

  // Section headers
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.3 },
  sectionCount: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  subHeader: { marginBottom: 10, marginTop: 4 },
  subHeaderText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Filter chips
  filterRow: { paddingBottom: 14, gap: 8 },
  filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: COLORS.overlay, borderWidth: 1.5, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: 'rgba(108,99,255,0.2)', borderColor: 'rgba(108,99,255,0.45)' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  filterChipTextActive: { color: COLORS.accent },

  loadingText: { fontSize: 13, color: COLORS.textMuted, marginVertical: 12, fontWeight: '500' },

  // Template cards
  card: {
    borderRadius: 14, marginBottom: 8,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardCurrent: { borderColor: 'rgba(0,245,160,0.3)', backgroundColor: '#0C1A17' },
  activeStrip: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, backgroundColor: COLORS.success },
  cardInner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 14 },
  iconBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.overlay, alignItems: 'center', justifyContent: 'center' },
  iconBadgeCurrent: { backgroundColor: 'rgba(0,245,160,0.08)' },
  iconText: { fontSize: 20 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.2, marginBottom: 3 },
  cardMeta: { fontSize: 12, fontWeight: '500', color: COLORS.textMuted },
  cardRight: { paddingLeft: 4 },
  activeCheck: { fontSize: 16, fontWeight: '700', color: COLORS.success },
  cardChevron: { fontSize: 22, color: COLORS.textMuted, fontWeight: '300', marginTop: -1 },

  // Empty state
  emptyCard: { borderRadius: 16, padding: 32, backgroundColor: COLORS.card, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  emptyEmoji: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1 },
  modalSheet: {
    backgroundColor: '#0E1229', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingBottom: 24, minHeight: '78%', maxHeight: '90%',
    borderTopWidth: 1.5, borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(108,99,255,0.25)',
    display: 'flex', flexDirection: 'column',
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 2, marginBottom: 16 },

  // Modal header
  modalHeaderGradient: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', marginBottom: 0 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 16 },
  modalIconBadge: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  modalIconText: { fontSize: 26 },
  modalHeaderText: { flex: 1 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.4, marginBottom: 3 },
  modalDesc: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500', marginBottom: 8 },
  modalTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  modalMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalMeta: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  diffBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  goalBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(108,99,255,0.18)', borderWidth: 1, borderColor: 'rgba(108,99,255,0.3)' },
  goalBadgeText: { fontSize: 10, fontWeight: '600', color: '#A89FFF', letterSpacing: 0.2 },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.overlay, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontSize: 22, color: COLORS.textSecondary, fontWeight: '300', marginTop: -2 },

  // Stats strip
  statsStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, paddingVertical: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.08)' },

  // Exercise list header
  exListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  exListTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  selectAllBtn: { fontSize: 12, fontWeight: '700', color: COLORS.accent },

  modalList: { flex: 1, paddingHorizontal: 20 },

  // Exercise rows
  exRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, borderRadius: 12, backgroundColor: COLORS.overlay, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', gap: 12, overflow: 'hidden' },
  exRowSelected: { backgroundColor: 'rgba(108,99,255,0.12)', borderColor: 'rgba(108,99,255,0.3)' },
  exColorBar: { width: 4, alignSelf: 'stretch', minHeight: 52 },
  exInfo: { flex: 1, paddingVertical: 12 },
  exName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 3, letterSpacing: -0.2 },
  exMeta: { fontSize: 11, fontWeight: '500', color: COLORS.textMuted },
  exSetsReps: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, paddingRight: 4, letterSpacing: -0.2 },
  exCheck: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.03)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  exCheckActive: { backgroundColor: 'rgba(0,245,160,0.15)', borderColor: 'rgba(0,245,160,0.45)' },
  exCheckText: { fontSize: 13, fontWeight: '800', color: COLORS.success },

  // Footer
  modalFooter: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  footerHint: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginBottom: 10, fontWeight: '500' },
  applyBtn: { paddingVertical: 14, borderRadius: 12, backgroundColor: '#252A4A', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(108,99,255,0.25)' },
  applyBtnPrimary: { backgroundColor: COLORS.accent, borderColor: 'transparent', shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  applyBtnDisabled: { backgroundColor: '#181D35', borderColor: 'rgba(255,255,255,0.06)', shadowOpacity: 0, elevation: 0 },
  applyBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
});
