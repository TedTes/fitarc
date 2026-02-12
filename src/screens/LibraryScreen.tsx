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

    const onSuccess = () => {
      setAppliedThisSession((prev) => {
        const next = new Set(prev);
        exercises.forEach((ex) => next.add(`${template.id}-${ex.exerciseId}`));
        return next;
      });
      if (replaceAll) setCurrentTemplateId(template.id);
      setSelectedModal(null);
      onNavigateToToday?.();
    };

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
        onSuccess();
      } catch {
        Alert.alert('Error', 'Could not apply template. Please try again.');
      }
    } else {
      if (!onAppendExercisesToSession) return;
      try {
        await onAppendExercisesToSession(today, sessionExercises);
        onSuccess();
      } catch {
        Alert.alert('Error', 'Could not add exercises. Please try again.');
      }
    }
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
    const diff = DIFFICULTY_COLORS[template.difficulty];
    const muscles = Array.from(
      new Set(template.exercises.flatMap((ex) => ex.bodyParts.map((b) => b.toLowerCase())))
    ).filter((b) => KNOWN_MUSCLES.has(b)).slice(0, 4);

    return (
      <TouchableOpacity
        key={template.id}
        activeOpacity={0.75}
        onPress={() => setSelectedModal(template)}
        style={[styles.card, isCurrent && styles.cardCurrent, template.featured && !isCurrent && styles.cardFeatured]}
      >
        {isCurrent && <View style={styles.activeStrip} />}

        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={[styles.iconBadge, isCurrent && styles.iconBadgeCurrent]}>
            <Text style={styles.iconText}>{template.icon}</Text>
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={[styles.cardTitle, isCurrent && { color: COLORS.success }]} numberOfLines={1}>
              {template.title}
            </Text>
            <Text style={styles.cardSubtitle}>{template.subtitle}</Text>
          </View>
          {isCurrent ? (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>✓ Active</Text>
            </View>
          ) : (
            <View style={[styles.diffBadge, { backgroundColor: diff.bg }]}>
              <Text style={[styles.diffBadgeText, { color: diff.text }]}>
                {template.difficulty.charAt(0).toUpperCase() + template.difficulty.slice(1)}
              </Text>
            </View>
          )}
        </View>

        {/* Muscle pills */}
        {muscles.length > 0 && (
          <View style={styles.pillsRow}>
            {muscles.map((m) => {
              const mc = MUSCLE_COLORS[m] ?? MUSCLE_COLORS.core;
              return (
                <View key={m} style={[styles.pill, { backgroundColor: mc.bg, borderColor: mc.border }]}>
                  <Text style={[styles.pillText, { color: mc.text }]}>{formatBodyPart(m)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { value: template.exercises.length, label: 'exercises' },
            { value: template.totalSets, label: 'sets' },
            { value: template.estimatedTime, label: 'min' },
          ].map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && <View style={styles.statDivider} />}
              <View style={styles.stat}>
                <Text style={[styles.statValue, isCurrent && { color: COLORS.success }]}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* CTA */}
        {isCurrent ? (
          <View style={styles.ctaCurrent}>
            <Text style={styles.ctaCurrentText}>✓ Active for Today</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.cta}
            onPress={(e) => {
              e.stopPropagation();
              confirmAndApply(template, template.exercises, true);
            }}
          >
            <Text style={styles.ctaText}>Use Today</Text>
          </TouchableOpacity>
        )}
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
          <Text style={styles.pageTitle}>Library</Text>
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
              const btnLabel = addable.length === 0 ? 'Nothing to add' : isAll ? 'Use Today' : `Add ${addable.length} Exercise${addable.length !== 1 ? 's' : ''}`;

              return (
                <>
                  {/* Modal header */}
                  <View style={styles.modalHeader}>
                    <View style={[styles.modalIconBadge, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                      <Text style={styles.modalIconText}>{selectedModal.icon}</Text>
                    </View>
                    <View style={styles.modalHeaderText}>
                      <Text style={styles.modalTitle}>{selectedModal.title}</Text>
                      <View style={styles.modalMetaRow}>
                        <View style={[styles.diffBadge, { backgroundColor: diff.bg }]}>
                          <Text style={[styles.diffBadgeText, { color: diff.text }]}>
                            {selectedModal.difficulty.charAt(0).toUpperCase() + selectedModal.difficulty.slice(1)}
                          </Text>
                        </View>
                        <Text style={styles.modalMeta}>
                          {selectedModal.exercises.length} exercises · {selectedModal.totalSets} sets · {selectedModal.estimatedTime} min
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedModal(null)}>
                      <Text style={styles.modalCloseText}>×</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Exercise list */}
                  <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
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
                          <View style={[styles.exDot, { backgroundColor: mc.text }]} />
                          <View style={styles.exInfo}>
                            <Text style={styles.exName}>{ex.name}</Text>
                            <Text style={styles.exMeta}>
                              {ex.sets}×{ex.reps} · {ex.bodyParts.slice(0, 2).map(formatBodyPart).join(', ')}
                            </Text>
                          </View>
                          <View style={[styles.exCheck, (isSelected || wasAdded) && styles.exCheckActive]}>
                            {(isSelected || wasAdded) && <Text style={styles.exCheckText}>✓</Text>}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Footer */}
                  <View style={styles.modalFooter}>
                    <TouchableOpacity
                      style={[styles.applyBtn, addable.length === 0 && styles.applyBtnDisabled]}
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
    borderRadius: 18, padding: 18, marginBottom: 12,
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  cardCurrent: { borderColor: 'rgba(0,245,160,0.35)', backgroundColor: '#0D1A18', shadowColor: '#00F5A0', shadowOpacity: 0.15 },
  cardFeatured: { borderColor: 'rgba(108,99,255,0.3)', shadowColor: '#6C63FF', shadowOpacity: 0.1 },
  activeStrip: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, borderTopLeftRadius: 18, borderBottomLeftRadius: 18, backgroundColor: COLORS.success },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  iconBadge: { width: 46, height: 46, borderRadius: 14, backgroundColor: COLORS.overlay, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  iconBadgeCurrent: { backgroundColor: 'rgba(0,245,160,0.1)', borderColor: 'rgba(0,245,160,0.2)' },
  iconText: { fontSize: 22 },
  cardHeaderText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.2, marginBottom: 2 },
  cardSubtitle: { fontSize: 12, fontWeight: '500', color: COLORS.textMuted },
  currentBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(0,245,160,0.12)', borderWidth: 1, borderColor: 'rgba(0,245,160,0.3)' },
  currentBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.success, textTransform: 'uppercase', letterSpacing: 0.5 },
  diffBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  diffBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Muscle pills
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  pill: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', marginBottom: 14 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 2 },
  statLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.06)' },

  // CTAs
  cta: { paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(108,99,255,0.2)', borderWidth: 1.5, borderColor: 'rgba(108,99,255,0.4)', alignItems: 'center' },
  ctaText: { fontSize: 13, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.2 },
  ctaCurrent: { paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(0,245,160,0.08)', borderWidth: 1.5, borderColor: 'rgba(0,245,160,0.25)', alignItems: 'center' },
  ctaCurrentText: { fontSize: 13, fontWeight: '700', color: COLORS.success, letterSpacing: 0.2 },

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
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', marginBottom: 8 },
  modalIconBadge: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalIconText: { fontSize: 20 },
  modalHeaderText: { flex: 1 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.3, marginBottom: 4 },
  modalMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalMeta: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.overlay, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontSize: 22, color: COLORS.textSecondary, fontWeight: '300', marginTop: -2 },
  modalList: { flex: 1, paddingHorizontal: 20 },

  // Exercise rows
  exRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderRadius: 12, backgroundColor: COLORS.overlay, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', gap: 10 },
  exRowSelected: { backgroundColor: 'rgba(108,99,255,0.15)', borderColor: 'rgba(108,99,255,0.35)' },
  exDot: { width: 8, height: 8, borderRadius: 4 },
  exInfo: { flex: 1 },
  exName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 3, letterSpacing: -0.2 },
  exMeta: { fontSize: 11, fontWeight: '500', color: COLORS.textMuted },
  exCheck: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.03)', alignItems: 'center', justifyContent: 'center' },
  exCheckActive: { backgroundColor: 'rgba(0,245,160,0.15)', borderColor: 'rgba(0,245,160,0.45)' },
  exCheckText: { fontSize: 13, fontWeight: '800', color: COLORS.success },

  // Footer
  modalFooter: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  applyBtn: { paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.accent, alignItems: 'center', shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  applyBtnDisabled: { backgroundColor: '#3A3F62', shadowOpacity: 0, elevation: 0 },
  applyBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
});
