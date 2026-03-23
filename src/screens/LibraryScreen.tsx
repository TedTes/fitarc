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
  LayoutAnimation,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PhasePlan, User, WorkoutSessionExercise, MuscleGroup, PlanDay, WorkoutSessionEntry } from '../types/domain';
import { useWorkoutTemplates } from '../hooks/useWorkoutTemplates';
import { formatLocalDateYMD } from '../utils/date';
import { fetchRecommendedWorkoutTemplates } from '../services/planRuntimeService';

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

const GOAL_ALIAS_MAP: Record<string, string[]> = {
  build_muscle: ['build_muscle', 'hypertrophy', 'muscle', 'general'],
  get_stronger: ['get_stronger', 'strength', 'power', 'general'],
  lose_fat: ['lose_fat', 'fat_loss', 'conditioning', 'general_fitness', 'general'],
  endurance: ['endurance', 'conditioning', 'general_fitness'],
  general_fitness: ['general_fitness', 'general', 'full_body'],
};

const EXPERIENCE_RANK: Record<TemplateDifficulty, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

const EQUIPMENT_RANK: Record<'bodyweight' | 'dumbbells' | 'full_gym', number> = {
  bodyweight: 0,
  dumbbells: 1,
  full_gym: 2,
};

const normalizeKey = (value?: string | null): string =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, '_');

const normalizeEquipment = (value?: string | null): 'bodyweight' | 'dumbbells' | 'full_gym' | null => {
  const key = normalizeKey(value);
  if (!key) return null;
  if (key === 'full_gym' || key === 'gym') return 'full_gym';
  if (key === 'dumbbells' || key === 'dumbbell') return 'dumbbells';
  if (key === 'bodyweight' || key === 'body_weight') return 'bodyweight';
  return null;
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
  equipmentLevel?: string;
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
  embedded?: boolean;
  targetDate?: string;
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
  embedded = false,
  targetDate,
}) => {
  const today = formatLocalDateYMD(new Date());
  const activeDate = targetDate ?? today;

  const { templates: remoteTemplates, isLoading, error } = useWorkoutTemplates(user.id);

  // ─ Template state ─
  const [selectedModal, setSelectedModal] = useState<WorkoutTemplate | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [appliedThisSession, setAppliedThisSession] = useState<Set<string>>(new Set());
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [serviceRecommendations, setServiceRecommendations] = useState<
    Array<{ id: string; reason: string[]; score: number }>
  >([]);

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
        equipmentLevel: t.equipmentLevel ?? undefined,
        estimatedTime,
        totalSets,
        featured: t.isPublic && t.goalTags.includes('full_body'),
        goalTags: t.goalTags,
      };
    });
  }, [remoteTemplates]);

  useEffect(() => {
    let cancelled = false;
    const loadRecommendations = async () => {
      if (!phase?.id) {
        setServiceRecommendations([]);
        return;
      }
      try {
        const rows = await fetchRecommendedWorkoutTemplates(user.id, phase.id, 6);
        if (!cancelled) {
          setServiceRecommendations(rows.map((row) => ({ id: row.id, reason: row.reason, score: row.score })));
        }
      } catch (error) {
        console.error('Failed to load recommended workout templates:', error);
        if (!cancelled) setServiceRecommendations([]);
      }
    };
    void loadRecommendations();
    return () => {
      cancelled = true;
    };
  }, [phase?.id, user.id]);

  const filteredTemplates = templates;

  const localRecommendationById = useMemo(() => {
    const preferredGoal = normalizeKey(user.planPreferences?.primaryGoal ?? phase?.goalType);
    const goalAliases = GOAL_ALIAS_MAP[preferredGoal] ?? [];
    const userExperience = user.experienceLevel;
    const userEquipment = normalizeEquipment(user.planPreferences?.equipmentLevel);

    const scored = templates
      .map((template) => {
        let score = 0;
        const reasons: string[] = [];
        const tags = template.goalTags.map(normalizeKey);

        if (goalAliases.length && tags.some((tag) => goalAliases.includes(tag))) {
          score += 4;
          reasons.push('matches your goal');
        }

        const templateDifficulty = template.difficulty;
        const diffGap = Math.abs(EXPERIENCE_RANK[templateDifficulty] - EXPERIENCE_RANK[userExperience]);
        if (diffGap === 0) {
          score += 3;
          reasons.push('aligned with your level');
        } else if (diffGap === 1) {
          score += 1;
        }

        if (userEquipment) {
          const templateEquipment = normalizeEquipment(template.equipmentLevel);
          if (!templateEquipment || EQUIPMENT_RANK[templateEquipment] <= EQUIPMENT_RANK[userEquipment]) {
            score += 2;
            reasons.push('fits your equipment');
          } else {
            score -= 3;
          }
        }

        if (template.exercises.length >= 4 && template.exercises.length <= 8) {
          score += 1;
        }

        return { template, score, reasons };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return new Map(scored.map((entry) => [entry.template.id, entry.reasons.slice(0, 2)]));
  }, [templates, user.planPreferences?.primaryGoal, user.planPreferences?.equipmentLevel, user.experienceLevel, phase?.goalType]);

  const serviceRecommendationById = useMemo(
    () => new Map(serviceRecommendations.map((row) => [row.id, row])),
    [serviceRecommendations]
  );

  const recommendationById = useMemo(
    () =>
      serviceRecommendationById.size
        ? new Map(
            [...serviceRecommendationById.entries()].map(([id, row]) => [id, row.reason])
          )
        : localRecommendationById,
    [localRecommendationById, serviceRecommendationById]
  );

  const recommendationScoreById = useMemo(
    () =>
      serviceRecommendationById.size
        ? new Map(
            [...serviceRecommendationById.entries()].map(([id, row]) => [id, row.score])
          )
        : new Map<string, number>(),
    [serviceRecommendationById]
  );

  const recommendedTemplates = useMemo(
    () => filteredTemplates.filter((template) => recommendationById.has(template.id)),
    [filteredTemplates, recommendationById]
  );

  const sortedRecommendedTemplates = useMemo(() => {
    if (!recommendationScoreById.size) return recommendedTemplates;
    return [...recommendedTemplates].sort(
      (a, b) => (recommendationScoreById.get(b.id) ?? 0) - (recommendationScoreById.get(a.id) ?? 0)
    );
  }, [recommendedTemplates, recommendationScoreById]);

  const nonRecommendedTemplates = useMemo(
    () => filteredTemplates.filter((template) => !recommendationById.has(template.id)),
    [filteredTemplates, recommendationById]
  );

  const featuredTemplates = useMemo(() => nonRecommendedTemplates.filter((t) => t.featured), [nonRecommendedTemplates]);
  const regularTemplates = useMemo(() => nonRecommendedTemplates.filter((t) => !t.featured), [nonRecommendedTemplates]);

  const targetSession = useMemo(
    () => workoutSessions.find((s) => s.phasePlanId === phase?.id && s.date === activeDate),
    [workoutSessions, phase, activeDate]
  );

  const targetExerciseCount = useMemo(() => {
    if (targetSession?.exercises?.length) return targetSession.exercises.length;
    const planned = plannedWorkouts.find((d) => d.planId === phase?.id && d.date === activeDate);
    return planned?.workout?.exercises?.length ?? 0;
  }, [targetSession, plannedWorkouts, phase, activeDate]);

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

  const handleApply = useCallback((
    template: WorkoutTemplate,
    exercises: TemplateExercise[],
    replaceAll: boolean,
  ) => {
    const sessionExercises = buildSessionExercises(template, exercises);

    // Close modal and navigate immediately for both paths
    setAppliedThisSession((prev) => {
      const next = new Set(prev);
      exercises.forEach((ex) => next.add(`${template.id}-${ex.exerciseId}`));
      return next;
    });
    if (replaceAll) setCurrentTemplateId(template.id);
    setSelectedModal(null);
    onNavigateToToday?.();

    if (replaceAll) {
      if (!onReplaceSessionWithTemplate) return;
      // force=true: user already confirmed via the "Replace?" alert, skip hasProgress check
      void onReplaceSessionWithTemplate(activeDate, sessionExercises, true).catch((error) => {
        console.error('Failed applying workout template:', error);
        Alert.alert('Error', 'Could not apply template. Please try again.');
      });
    } else {
      if (!onAppendExercisesToSession) return;
      void onAppendExercisesToSession(activeDate, sessionExercises).catch((error) => {
        console.error('Failed appending workout template exercises:', error);
        Alert.alert('Error', 'Could not add exercises. Please try again.');
      });
    }
  }, [activeDate, buildSessionExercises, onReplaceSessionWithTemplate, onAppendExercisesToSession, onNavigateToToday]);

  const confirmAndApply = useCallback((template: WorkoutTemplate, exercises: TemplateExercise[], replaceAll: boolean) => {
    if (replaceAll && targetExerciseCount > 0) {
      Alert.alert(
        'Replace workout for selected day?',
        `This will replace your current ${targetExerciseCount} exercise${targetExerciseCount !== 1 ? 's' : ''} with "${template.title}".`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: () => handleApply(template, exercises, replaceAll) },
        ]
      );
    } else {
      handleApply(template, exercises, replaceAll);
    }
  }, [targetExerciseCount, handleApply]);

  // ─ Render helpers ─
  const formatBodyPart = (bp: string) =>
    bp.charAt(0).toUpperCase() + bp.slice(1).replace(/_/g, ' ');

  const renderTemplateCard = (template: WorkoutTemplate, recommendationReasons?: string[]) => {
    const isCurrent = currentTemplateId === template.id;
    const isExpanded = embedded && selectedModal?.id === template.id;
    const muscles = Array.from(
      new Set(template.exercises.flatMap((ex) => ex.bodyParts.map((b) => b.toLowerCase())))
    ).filter((b) => KNOWN_MUSCLES.has(b)).slice(0, 3);

    // Inline selection state (computed per-render; state lives in selectedKeys)
    const expandedUnappliedKeys = template.exercises
      .map((ex) => `${template.id}-${ex.exerciseId}`)
      .filter((k) => !appliedThisSession.has(k));
    const expandedAllSelected =
      expandedUnappliedKeys.length > 0 &&
      expandedUnappliedKeys.every((k) => selectedKeys.has(k));
    const expandedAddable = isExpanded
      ? template.exercises.filter((ex) => {
          const k = `${template.id}-${ex.exerciseId}`;
          return selectedKeys.has(k) && !appliedThisSession.has(k);
        })
      : [];

    return (
      <View key={template.id}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => {
            if (embedded) {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setSelectedModal((prev) => (prev?.id === template.id ? null : template));
              return;
            }
            setSelectedModal(template);
          }}
          style={[
            styles.card,
            isCurrent && styles.cardCurrent,
            isExpanded && styles.cardExpanded,
          ]}
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
                {' · '}{template.exercises.length} ex{' · '}{template.estimatedTime} min
                {muscles.length > 0 ? '  ·  ' + muscles.map(formatBodyPart).join(', ') : ''}
              </Text>
              {recommendationReasons?.length ? (
                <Text style={styles.recommendationText} numberOfLines={1}>
                  ✦ {recommendationReasons.join(' · ')}
                </Text>
              ) : null}
            </View>

            <View style={styles.cardRight}>
              {isCurrent ? (
                <Text style={styles.activeCheck}>✓</Text>
              ) : (
                <Text style={[styles.cardChevron, isExpanded && styles.cardChevronOpen]}>
                  {isExpanded ? '⌄' : '›'}
                </Text>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.inlineExpand}>
            {/* Select row */}
            <View style={styles.inlineSelectRow}>
              <Text style={styles.inlineSelectCount}>
                {expandedAddable.length > 0
                  ? `${expandedAddable.length} of ${expandedUnappliedKeys.length} selected`
                  : 'Tap exercises to select'}
              </Text>
              <TouchableOpacity onPress={toggleAllKeys}>
                <Text style={styles.inlineSelectAll}>
                  {expandedAllSelected ? 'Clear' : 'Select all'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Exercise rows */}
            {template.exercises.map((ex) => {
              const key = `${template.id}-${ex.exerciseId}`;
              const wasAdded = appliedThisSession.has(key);
              const isSelected = selectedKeys.has(key);
              const primaryMuscle = ex.bodyParts[0]?.toLowerCase() ?? '';
              const mc = MUSCLE_COLORS[primaryMuscle] ?? {
                bg: 'rgba(255,255,255,0.06)', text: '#8B93B0', border: 'rgba(255,255,255,0.1)',
              };
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.inlineExRow, (isSelected || wasAdded) && styles.inlineExRowSelected]}
                  onPress={() => toggleKey(key, wasAdded)}
                  disabled={wasAdded}
                  activeOpacity={0.7}
                >
                  <View style={[styles.inlineColorBar, { backgroundColor: mc.text }]} />
                  <View style={styles.inlineExInfo}>
                    <Text
                      style={[styles.inlineExName, wasAdded && { color: COLORS.textMuted }]}
                      numberOfLines={1}
                    >
                      {ex.name}
                    </Text>
                    {primaryMuscle ? (
                      <Text style={[styles.inlineExMuscle, { color: mc.text }]}>
                        {formatBodyPart(primaryMuscle)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.inlineExSets}>{ex.sets}×{ex.reps}</Text>
                  <View style={[styles.inlineCheckbox, (isSelected || wasAdded) && styles.inlineCheckboxOn]}>
                    {(isSelected || wasAdded) && <Text style={styles.inlineCheckMark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Action row */}
            <View style={styles.inlineActions}>
              <TouchableOpacity
                style={[
                  styles.inlineBtn,
                  styles.inlineBtnSecondary,
                  expandedAddable.length === 0 && styles.inlineBtnDisabled,
                ]}
                disabled={expandedAddable.length === 0}
                onPress={() => confirmAndApply(template, expandedAddable, false)}
              >
                <Text style={[styles.inlineBtnTxt, expandedAddable.length === 0 && styles.inlineBtnTxtMuted]}>
                  {expandedAddable.length === 0 ? 'None selected' : `Add ${expandedAddable.length}`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inlineBtn, styles.inlineBtnPrimary]}
                onPress={() => confirmAndApply(template, template.exercises, true)}
              >
                <Text style={styles.inlineBtnTxt}>Replace All</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const listContent = (
    <>
      {/* ── Header (non-embedded only) ── */}
      {!embedded && (
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Workouts</Text>
          <Text style={styles.pageSubtitle}>Apply templates matched to your active plan</Text>
        </View>
      )}
      {!embedded && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Workout Templates</Text>
          {templates.length > 0 && (
            <Text style={styles.sectionCount}>{templates.length} templates</Text>
          )}
        </View>
      )}

      {/* Loading / error */}
      {isLoading && <Text style={styles.loadingText}>Loading templates…</Text>}
      {!isLoading && error && <Text style={styles.loadingText}>Failed to load templates.</Text>}

      {!isLoading && (
        <>
          {/* ── Embedded: flat list, recommended first ── */}
          {embedded && (
            <>
              {sortedRecommendedTemplates.map((t) =>
                renderTemplateCard(t, recommendationById.get(t.id))
              )}
              {sortedRecommendedTemplates.length > 0 && nonRecommendedTemplates.length > 0 && (
                <View style={styles.sectionDivider} />
              )}
              {nonRecommendedTemplates.map((t) => renderTemplateCard(t))}
            </>
          )}

          {/* ── Non-embedded: full sections with subheaders ── */}
          {!embedded && (
            <>
              {sortedRecommendedTemplates.length > 0 && (
                <>
                  <View style={styles.subHeader}>
                    <Text style={styles.subHeaderText}>Plan-Matched Templates</Text>
                  </View>
                  {sortedRecommendedTemplates.map((t) =>
                    renderTemplateCard(t, recommendationById.get(t.id))
                  )}
                </>
              )}
              {featuredTemplates.length > 0 && (
                <>
                  <View style={styles.subHeader}>
                    <Text style={styles.subHeaderText}>⭐ Featured</Text>
                  </View>
                  {featuredTemplates.map((t) => renderTemplateCard(t))}
                </>
              )}
              {regularTemplates.length > 0 && (
                <>
                  <View style={styles.subHeader}>
                    <Text style={styles.subHeaderText}>All Templates</Text>
                  </View>
                  {regularTemplates.map((t) => renderTemplateCard(t))}
                </>
              )}
            </>
          )}

          {filteredTemplates.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>📦</Text>
              <Text style={styles.emptyTitle}>No templates yet</Text>
              <Text style={styles.emptyText}>Templates will appear here once added.</Text>
            </View>
          )}
        </>
      )}

      {!embedded && <View style={{ height: 120 }} />}
    </>
  );

  return (
    <LinearGradient
      colors={embedded ? (['transparent', 'transparent', 'transparent'] as const) : (['#0A0E27', '#151932', '#1E2340'] as const)}
      style={embedded ? styles.containerEmbedded : styles.container}
    >
      {embedded ? (
        <View style={styles.embeddedContent}>{listContent}</View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {listContent}
        </ScrollView>
      )}

      {/* ── Template modal ── */}
      <Modal
        transparent
        animationType="none"
        visible={!embedded && selectedModal !== null}
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
                    {addable.length > 0 && (
                      <Text style={styles.footerHint}>
                        {addable.length} of {selectedModal.exercises.length} selected · tap to deselect
                      </Text>
                    )}
                    <View style={styles.modalActionsRow}>
                      <TouchableOpacity
                        style={[styles.applyBtn, styles.applyBtnSecondary, addable.length === 0 && styles.applyBtnDisabled]}
                        disabled={addable.length === 0}
                        onPress={() => confirmAndApply(selectedModal, addable, false)}
                      >
                        <Text style={styles.applyBtnText}>
                          {addable.length === 0
                            ? 'Nothing selected'
                            : `Add ${addable.length} Selected`}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.applyBtn, styles.applyBtnPrimary]}
                        onPress={() => confirmAndApply(selectedModal, selectedModal.exercises, true)}
                      >
                        <Text style={styles.applyBtnText}>Replace All</Text>
                      </TouchableOpacity>
                    </View>
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
  containerEmbedded: { width: '100%' },
  embeddedContent: { paddingTop: 6 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 60 },

  // Page header
  pageHeader: { marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 3, fontWeight: '500' },
  embeddedHeader: { marginBottom: 10, paddingHorizontal: 2 },
  embeddedSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontWeight: '500' },

  // Section headers
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionHeaderEmbedded: { alignItems: 'flex-end', marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.3 },
  sectionCount: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  subHeader: { marginBottom: 10, marginTop: 4 },
  subHeaderText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  loadingText: { fontSize: 13, color: COLORS.textMuted, marginVertical: 12, fontWeight: '500' },

  // Template cards
  card: {
    borderRadius: 14, marginBottom: 8,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardCurrent: { borderColor: 'rgba(0,245,160,0.3)', backgroundColor: '#0C1A17' },
  cardExpanded: {
    borderColor: COLORS.borderAccent,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
  },
  activeStrip: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, backgroundColor: COLORS.success },
  cardInner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 14 },
  iconBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.overlay, alignItems: 'center', justifyContent: 'center' },
  iconBadgeCurrent: { backgroundColor: 'rgba(0,245,160,0.08)' },
  iconText: { fontSize: 20 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: -0.2, marginBottom: 3 },
  cardMeta: { fontSize: 12, fontWeight: '500', color: COLORS.textMuted },
  recommendationText: { marginTop: 4, fontSize: 11, fontWeight: '600', color: '#9FA5FF' },
  cardRight: { paddingLeft: 4 },
  activeCheck: { fontSize: 16, fontWeight: '700', color: COLORS.success },
  cardChevron: { fontSize: 22, color: COLORS.textMuted, fontWeight: '300', marginTop: -1 },
  cardChevronOpen: { color: COLORS.accent },

  // ── Inline expand ─────────────────────────────────────────────────────────
  inlineExpand: {
    marginBottom: 8,
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: 'rgba(108,99,255,0.03)',
    overflow: 'hidden',
  },
  inlineSelectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  inlineSelectCount: { fontSize: 11, fontWeight: '500', color: COLORS.textMuted },
  inlineSelectAll: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  inlineExRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  inlineExRowSelected: { backgroundColor: 'rgba(108,99,255,0.08)' },
  inlineColorBar: { width: 3, alignSelf: 'stretch', minHeight: 48 },
  inlineExInfo: { flex: 1, paddingVertical: 11, paddingLeft: 12 },
  inlineExName: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 2 },
  inlineExMuscle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
  inlineExSets: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, paddingHorizontal: 10 },
  inlineCheckbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  inlineCheckboxOn: { backgroundColor: 'rgba(0,245,160,0.15)', borderColor: 'rgba(0,245,160,0.45)' },
  inlineCheckMark: { fontSize: 11, fontWeight: '900', color: COLORS.success },
  inlineActions: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  inlineBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    alignItems: 'center', borderWidth: 1,
  },
  inlineBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  inlineBtnPrimary: {
    backgroundColor: COLORS.accent,
    borderColor: 'transparent',
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  inlineBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
    shadowOpacity: 0, elevation: 0,
  },
  inlineBtnTxt: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 0.2 },
  inlineBtnTxtMuted: { color: COLORS.textMuted },

  // Divider between recommended and rest in embedded mode
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 10,
    marginHorizontal: 4,
  },

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
  modalActionsRow: { flexDirection: 'row', gap: 10 },
  footerHint: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginBottom: 10, fontWeight: '500' },
  applyBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#252A4A', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(108,99,255,0.25)' },
  applyBtnSecondary: { backgroundColor: '#1F2440' },
  applyBtnPrimary: { backgroundColor: COLORS.accent, borderColor: 'transparent', shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  applyBtnDisabled: { backgroundColor: '#181D35', borderColor: 'rgba(255,255,255,0.06)', shadowOpacity: 0, elevation: 0 },
  applyBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
});
