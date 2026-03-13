import { supabase } from '../lib/supabaseClient';
import { MuscleGroup, PlanDay, PlanWorkout, PlanWorkoutExercise, User } from '../types/domain';
import { fetchUserProfile } from './userProfileService';

export type PlanExerciseInput = {
  exerciseId: string;
  name: string;
  bodyParts?: MuscleGroup[];
  movementPattern?: string | null;
  sets?: number | null;
  reps?: string | null;
  displayOrder?: number | null;
  notes?: string | null;
  sourceTemplateExerciseId?: string | null;
};

type PlanContext = {
  planId: string;
  userId: string;
  startDate: string;
  goalType?: string | null;
};

type PlanTemplateMap = Record<string, string>;

type TemplateExerciseRow = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  movement_pattern: string | null;
  body_parts: string[] | null;
  sets: number | null;
  reps: string | null;
  display_order: number | null;
  notes: string | null;
};

type TemplateRow = {
  id: string;
  title: string;
  difficulty: string | null;
  equipment_level: string | null;
  goal_tags: string[] | null;
  exercises: TemplateExerciseRow[];
};

export type RecommendedWorkoutTemplate = {
  id: string;
  title: string;
  difficulty: string | null;
  equipmentLevel: string | null;
  goalTags: string[];
  reason: string[];
  score: number;
};

type OverrideRow = {
  id: string;
  user_id: string;
  plan_id: string;
  day_date: string;
  template_exercise_id: string | null;
  action_type: 'add' | 'remove' | 'update' | 'replace';
  exercise_id: string | null;
  exercise_name: string | null;
  movement_pattern: string | null;
  body_parts: string[] | null;
  sets: number | null;
  reps: string | null;
  display_order: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

type PersistedPlanDayRow = {
  id: string;
  day_date: string;
  template_id?: string | null;
  split_tag?: string | null;
  is_rest_day?: boolean | null;
  source_type?: string | null;
};

type PersistedPlanDayAssignment = {
  id: string;
  date: string;
  templateId: string | null;
  splitTag: string | null;
  isRestDay: boolean;
};

const normalizeKey = (value?: string | null): string =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, '_');

const normalizeEquipmentLevel = (value?: string | null): 'bodyweight' | 'dumbbells' | 'full_gym' | null => {
  const key = normalizeKey(value);
  if (!key) return null;
  if (key === 'full_gym' || key === 'gym') return 'full_gym';
  if (key === 'dumbbells' || key === 'dumbbell') return 'dumbbells';
  if (key === 'bodyweight' || key === 'body_weight') return 'bodyweight';
  return null;
};

const EQUIPMENT_RANK = {
  bodyweight: 0,
  dumbbells: 1,
  full_gym: 2,
} as const;

const EXPERIENCE_RANK: Record<User['experienceLevel'], number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

const GOAL_ALIAS_MAP: Record<string, string[]> = {
  hypertrophy: ['hypertrophy', 'build_muscle', 'muscle', 'general'],
  strength: ['strength', 'get_stronger', 'power', 'general'],
  fat_loss: ['fat_loss', 'lose_fat', 'conditioning', 'general_fitness', 'general'],
  endurance: ['endurance', 'conditioning', 'general_fitness'],
  general: ['general', 'general_fitness', 'conditioning', 'full_body'],
};

const mapSplitToTags = (split: User['trainingSplit']): string[] => {
  switch (split) {
    case 'push_pull_legs':
      return ['push', 'pull', 'legs'];
    case 'upper_lower':
      return ['upper', 'lower'];
    case 'bro_split':
      return ['chest', 'back', 'shoulders', 'arms', 'legs'];
    case 'full_body':
    default:
      return ['full_body'];
  }
};

const inferDaysPerWeek = (split: User['trainingSplit']): 3 | 4 | 5 | 6 => {
  if (split === 'full_body') return 3;
  if (split === 'upper_lower') return 4;
  if (split === 'push_pull_legs') return 6;
  return 6;
};

const resolveDaysPerWeek = (profile: Pick<User, 'trainingSplit' | 'planPreferences'> | null): 3 | 4 | 5 | 6 => {
  const preferred = profile?.planPreferences?.daysPerWeek;
  if (preferred === 3 || preferred === 4 || preferred === 5 || preferred === 6) {
    return preferred;
  }
  return inferDaysPerWeek(profile?.trainingSplit ?? 'full_body');
};

const shouldTrainOnDate = (date: Date, daysPerWeek: 3 | 4 | 5 | 6): boolean => {
  const day = date.getDay();
  if (daysPerWeek === 6) return day !== 0;
  if (daysPerWeek === 5) return day >= 1 && day <= 5;
  if (daysPerWeek === 4) return day === 1 || day === 2 || day === 4 || day === 6;
  return day === 1 || day === 3 || day === 5;
};

const parseYmd = (value: string): Date => {
  const [year, month, day] = value.split('-').map((part) => parseInt(part, 10) || 0);
  return new Date(year, Math.max(0, month - 1), day || 1);
};

const formatYmd = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildDateRange = (startDate: string, endDate: string): string[] => {
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    out.push(formatYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

const resolveScheduledIndex = (
  phaseStartDate: string,
  targetDate: string,
  daysPerWeek: 3 | 4 | 5 | 6
): number | null => {
  const start = parseYmd(phaseStartDate);
  const target = parseYmd(targetDate);
  if (target.getTime() < start.getTime()) return null;

  const cursor = new Date(start);
  let scheduledIndex = -1;
  while (cursor.getTime() <= target.getTime()) {
    if (shouldTrainOnDate(cursor, daysPerWeek)) {
      scheduledIndex += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return scheduledIndex >= 0 ? scheduledIndex : null;
};

const extractTemplateExerciseId = (exerciseId?: string | null): string | null => {
  if (!exerciseId || !exerciseId.startsWith('tpl:')) return null;
  const parts = exerciseId.split(':');
  return parts[parts.length - 1] ?? null;
};

const buildTemplateExerciseUiId = (planId: string, date: string, templateExerciseId: string): string =>
  `tpl:${planId}:${date}:${templateExerciseId}`;

const buildOverrideExerciseUiId = (overrideId: string): string =>
  `ovr:${overrideId}`;

const fetchPlanContext = async (planId: string): Promise<PlanContext | null> => {
  const { data, error } = await supabase
    .from('fitarc_workout_plans')
    .select('id, user_id, start_date, goal_type')
    .eq('id', planId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    planId: data.id,
    userId: data.user_id,
    startDate: data.start_date,
    goalType: data.goal_type,
  };
};

const normalizePlanTemplateMap = (value: unknown): PlanTemplateMap | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, templateId]) => [normalizeKey(key), typeof templateId === 'string' ? templateId : null] as const)
    .filter(([, templateId]) => Boolean(templateId));
  if (!entries.length) return null;
  return Object.fromEntries(entries) as PlanTemplateMap;
};

const fetchStoredPlanTemplateMap = async (planId: string): Promise<PlanTemplateMap | null> => {
  const { data, error } = await supabase
    .from('fitarc_workout_plans')
    .select('template_map')
    .eq('id', planId)
    .maybeSingle();

  // Fail open if the column does not exist yet in DB.
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42703') return null;
    throw error;
  }
  return normalizePlanTemplateMap((data as { template_map?: unknown } | null)?.template_map);
};

const fetchTemplatesForUser = async (userId: string): Promise<TemplateRow[]> => {
  const { data, error } = await supabase
    .from('fitarc_workout_templates')
    .select(
      `
      id,
      title,
      difficulty,
      equipment_level,
      goal_tags,
      exercises:fitarc_workout_template_exercises (
        id,
        exercise_id,
        exercise_name,
        movement_pattern,
        body_parts,
        sets,
        reps,
        display_order,
        notes
      )
    `
    )
    .eq('is_deprecated', false)
    .or(`is_public.eq.true,created_by.eq.${userId}`);
  if (error) throw error;

  return ((data ?? []) as TemplateRow[]).map((template) => ({
    ...template,
    goal_tags: (template.goal_tags ?? []).map((tag) => normalizeKey(tag)),
    exercises: (template.exercises ?? [])
      .filter((exercise) => Boolean(exercise.exercise_id))
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
  }));
};

const fetchOverridesForRange = async (
  userId: string,
  planId: string,
  startDate: string,
  endDate: string
): Promise<Map<string, OverrideRow[]>> => {
  const { data, error } = await supabase
    .from('fitarc_plan_overrides')
    .select(
      `
      id,
      user_id,
      plan_id,
      day_date,
      template_exercise_id,
      action_type,
      exercise_id,
      exercise_name,
      movement_pattern,
      body_parts,
      sets,
      reps,
      display_order,
      notes,
      is_active,
      created_at
    `
    )
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('is_active', true)
    .gte('day_date', startDate)
    .lte('day_date', endDate)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  const byDay = new Map<string, OverrideRow[]>();
  (data ?? []).forEach((row) => {
    const list = byDay.get(row.day_date) ?? [];
    list.push(row as OverrideRow);
    byDay.set(row.day_date, list);
  });
  return byDay;
};

const isMissingPlanDaysSchemaError = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703';
};

const mapPersistedPlanDayAssignment = (row: PersistedPlanDayRow): PersistedPlanDayAssignment => ({
  id: row.id,
  date: row.day_date,
  templateId: row.template_id ?? null,
  splitTag: row.split_tag ?? null,
  isRestDay: typeof row.is_rest_day === 'boolean' ? row.is_rest_day : !row.template_id,
});

const fetchPersistedPlanDaysForRange = async (
  userId: string,
  planId: string,
  startDate: string,
  endDate: string
): Promise<Map<string, PersistedPlanDayAssignment>> => {
  const primary = await supabase
    .from('fitarc_plan_days')
    .select('id, day_date, template_id, split_tag, is_rest_day, source_type')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .gte('day_date', startDate)
    .lte('day_date', endDate)
    .order('day_date', { ascending: true });

  let rows: PersistedPlanDayRow[] = [];
  if (primary.error) {
    if (!isMissingPlanDaysSchemaError(primary.error)) {
      throw primary.error;
    }
    const fallback = await supabase
      .from('fitarc_plan_days')
      .select('id, day_date, source_type')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .gte('day_date', startDate)
      .lte('day_date', endDate)
      .order('day_date', { ascending: true });
    if (fallback.error) {
      if (isMissingPlanDaysSchemaError(fallback.error)) {
        return new Map();
      }
      throw fallback.error;
    }
    rows = (fallback.data ?? []) as PersistedPlanDayRow[];
  } else {
    rows = (primary.data ?? []) as PersistedPlanDayRow[];
  }

  const byDate = new Map<string, PersistedPlanDayAssignment>();
  rows.forEach((row) => {
    byDate.set(row.day_date, mapPersistedPlanDayAssignment(row));
  });
  return byDate;
};

const chooseTemplatesForTag = (
  tag: string,
  templates: TemplateRow[],
  goalType: string | null | undefined,
  equipmentLevel: 'bodyweight' | 'dumbbells' | 'full_gym' | null,
  experienceLevel?: User['experienceLevel']
): TemplateRow[] => {
  const tagPool = templates.filter((template) => (template.goal_tags ?? []).includes(tag));
  const basePool = tagPool.length ? tagPool : templates;
  const goalAliases = GOAL_ALIAS_MAP[normalizeKey(goalType)] ?? GOAL_ALIAS_MAP.general;

  const matchesGoal = (template: TemplateRow) =>
    !goalAliases.length || (template.goal_tags ?? []).some((entry) => goalAliases.includes(entry));

  const matchesEquipment = (template: TemplateRow) => {
    if (!equipmentLevel) return true;
    const level = normalizeEquipmentLevel(template.equipment_level);
    if (!level) return true;
    return EQUIPMENT_RANK[level] <= EQUIPMENT_RANK[equipmentLevel];
  };

  const matchesDifficulty = (template: TemplateRow) => {
    if (!experienceLevel) return true;
    const templateDifficulty = normalizeKey(template.difficulty) as User['experienceLevel'];
    if (!(templateDifficulty in EXPERIENCE_RANK)) return true;
    return Math.abs(EXPERIENCE_RANK[templateDifficulty] - EXPERIENCE_RANK[experienceLevel]) <= 1;
  };

  const tiers: Array<(template: TemplateRow) => boolean> = [
    (template) => matchesGoal(template) && matchesEquipment(template) && matchesDifficulty(template),
    (template) => matchesGoal(template) && matchesEquipment(template),
    (template) => matchesGoal(template),
    (template) => matchesEquipment(template) && matchesDifficulty(template),
    (template) => matchesEquipment(template),
    (template) => matchesDifficulty(template),
  ];

  for (const tier of tiers) {
    const matched = basePool.filter(tier);
    if (matched.length) return matched;
  }
  return basePool.length ? basePool : templates;
};

const resolveTemplateForDate = (
  context: PlanContext,
  date: string,
  split: User['trainingSplit'],
  daysPerWeek: 3 | 4 | 5 | 6,
  templates: TemplateRow[],
  storedTemplateMap: PlanTemplateMap | null,
  equipmentLevel: 'bodyweight' | 'dumbbells' | 'full_gym' | null,
  experienceLevel?: User['experienceLevel']
): TemplateRow | null => {
  const scheduledIndex = resolveScheduledIndex(context.startDate, date, daysPerWeek);
  if (scheduledIndex === null) return null;
  const tags = mapSplitToTags(split);
  const workoutTag = tags[scheduledIndex % tags.length];
  const mappedTemplateId = storedTemplateMap?.[workoutTag];
  if (mappedTemplateId) {
    const mapped = templates.find((template) => template.id === mappedTemplateId);
    if (mapped) return mapped;
  }
  const candidates = chooseTemplatesForTag(
    workoutTag,
    templates,
    context.goalType,
    equipmentLevel,
    experienceLevel
  );
  return candidates.length ? candidates[scheduledIndex % candidates.length] : null;
};

const buildTemplateMapForPlan = (
  context: PlanContext,
  split: User['trainingSplit'],
  templates: TemplateRow[],
  equipmentLevel: 'bodyweight' | 'dumbbells' | 'full_gym' | null,
  experienceLevel?: User['experienceLevel']
): PlanTemplateMap | null => {
  const tags = mapSplitToTags(split);
  const entries: Array<[string, string]> = [];
  tags.forEach((tag) => {
    const candidates = chooseTemplatesForTag(
      tag,
      templates,
      context.goalType,
      equipmentLevel,
      experienceLevel
    );
    const chosen = candidates[0];
    if (chosen?.id) {
      entries.push([tag, chosen.id]);
    }
  });
  if (!entries.length) return null;
  return Object.fromEntries(entries);
};

const buildBaseExercises = (
  template: TemplateRow,
  planId: string,
  date: string,
  workoutId: string
): PlanWorkoutExercise[] =>
  (template.exercises ?? []).map((exercise, index) => ({
    id: buildTemplateExerciseUiId(planId, date, exercise.id),
    planWorkoutId: workoutId,
    exerciseId: exercise.exercise_id,
    name: exercise.exercise_name,
    bodyParts: (exercise.body_parts ?? []) as MuscleGroup[],
    movementPattern: exercise.movement_pattern ?? undefined,
    sets: exercise.sets ?? 4,
    reps: exercise.reps ?? '8-12',
    displayOrder: exercise.display_order ?? index + 1,
    notes: exercise.notes ?? undefined,
  }));

const applyOverrides = (
  base: PlanWorkoutExercise[],
  overrides: OverrideRow[],
  planId: string,
  date: string,
  workoutId: string
): PlanWorkoutExercise[] => {
  const overrideByTemplateExercise = new Map<string, OverrideRow>();
  const additions: OverrideRow[] = [];

  overrides.forEach((row) => {
    if (row.action_type === 'add' && !row.template_exercise_id) {
      additions.push(row);
      return;
    }
    if (row.template_exercise_id) {
      overrideByTemplateExercise.set(row.template_exercise_id, row);
    }
  });

  const resolvedBase: PlanWorkoutExercise[] = [];
  base.forEach((exercise) => {
    const templateExerciseId = extractTemplateExerciseId(exercise.id);
    if (!templateExerciseId) {
      resolvedBase.push(exercise);
      return;
    }
    const override = overrideByTemplateExercise.get(templateExerciseId);
    if (!override) {
      resolvedBase.push(exercise);
      return;
    }
    if (override.action_type === 'remove') return;

    resolvedBase.push({
      ...exercise,
      id: buildTemplateExerciseUiId(planId, date, templateExerciseId),
      planWorkoutId: workoutId,
      exerciseId: override.exercise_id ?? exercise.exerciseId,
      name: override.exercise_name ?? exercise.name,
      movementPattern: override.movement_pattern ?? exercise.movementPattern,
      bodyParts: (override.body_parts ?? exercise.bodyParts) as MuscleGroup[],
      sets: override.sets ?? exercise.sets,
      reps: override.reps ?? exercise.reps,
      displayOrder: override.display_order ?? exercise.displayOrder,
      notes: override.notes ?? exercise.notes,
    });
  });

  const resolvedAdds = additions.map((override) => ({
    id: buildOverrideExerciseUiId(override.id),
    planWorkoutId: workoutId,
    exerciseId: override.exercise_id ?? '',
    name: override.exercise_name ?? 'Custom Exercise',
    movementPattern: override.movement_pattern ?? undefined,
    bodyParts: (override.body_parts ?? []) as MuscleGroup[],
    sets: override.sets ?? 4,
    reps: override.reps ?? '8-12',
    displayOrder: override.display_order ?? undefined,
    notes: override.notes ?? undefined,
  }));

  return [...resolvedBase, ...resolvedAdds].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
  );
};

const resolveTemplateBackedPlanDay = (
  context: PlanContext,
  date: string,
  template: TemplateRow,
  overrides: OverrideRow[],
  planDayId?: string
): PlanDay => {
  const dayId = planDayId ?? `virtual:${context.planId}:${date}`;
  const workoutId = `virtual:${context.planId}:${date}`;
  const baseExercises = buildBaseExercises(template, context.planId, date, workoutId);
  const exercises = applyOverrides(baseExercises, overrides, context.planId, date, workoutId);
  return {
    id: dayId,
    planId: context.planId,
    userId: context.userId,
    date,
    workout: {
      id: workoutId,
      planDayId: dayId,
      title: template.title,
      sourceTemplateId: template.id,
      sourceType: 'template',
      exercises,
    },
  };
};

const resolveOverrideOnlyPlanDay = (
  context: PlanContext,
  date: string,
  overrides: OverrideRow[],
  planDayId?: string
): PlanDay | null => {
  const activeOverrides = overrides.filter(
    (override) =>
      override.is_active !== false &&
      override.action_type !== 'remove' &&
      (!!override.exercise_id || !!override.exercise_name)
  );
  if (!activeOverrides.length) return null;

  const dayId = planDayId ?? `virtual:${context.planId}:${date}`;
  const workoutId = `virtual:${context.planId}:${date}`;
  const exercises = applyOverrides([], activeOverrides, context.planId, date, workoutId);
  if (!exercises.length) return null;

  return {
    id: dayId,
    planId: context.planId,
    userId: context.userId,
    date,
    workout: {
      id: workoutId,
      planDayId: dayId,
      title: 'Custom Workout',
      sourceTemplateId: null,
      sourceType: 'override',
      exercises,
    },
  };
};

type TemplateBaselineExercise = {
  exerciseId: string | null;
  name: string;
  movementPattern: string | null;
  bodyParts: string[];
  sets: number | null;
  reps: string | null;
  displayOrder: number | null;
  notes: string | null;
};

const buildTemplateBaselineForDate = async (
  userId: string,
  context: PlanContext,
  date: string
): Promise<Map<string, TemplateBaselineExercise>> => {
  const persistedByDate = await fetchPersistedPlanDaysForRange(userId, context.planId, date, date);
  const persisted = persistedByDate.get(date);
  const profile = await fetchUserProfile(userId);
  const templates = await fetchTemplatesForUser(userId);
  if (!templates.length) {
    return new Map();
  }
  if (persisted) {
    if (persisted.isRestDay || !persisted.templateId) {
      return new Map();
    }
    const matched = templates.find((template) => template.id === persisted.templateId);
    if (!matched) {
      return new Map();
    }
    const baseline = new Map<string, TemplateBaselineExercise>();
    (matched.exercises ?? []).forEach((exercise, index) => {
      baseline.set(exercise.id, {
        exerciseId: exercise.exercise_id ?? null,
        name: exercise.exercise_name,
        movementPattern: exercise.movement_pattern ?? null,
        bodyParts: (exercise.body_parts ?? []).map((part) => normalizeKey(part)),
        sets: exercise.sets ?? null,
        reps: exercise.reps ?? null,
        displayOrder: exercise.display_order ?? index + 1,
        notes: exercise.notes ?? null,
      });
    });
    return baseline;
  }

  const split = profile?.trainingSplit ?? 'full_body';
  const daysPerWeek = resolveDaysPerWeek(profile);
  if (!shouldTrainOnDate(parseYmd(date), daysPerWeek)) {
    return new Map();
  }
  const storedTemplateMap = await fetchStoredPlanTemplateMap(context.planId);
  const equipmentLevel = normalizeEquipmentLevel(profile?.planPreferences?.equipmentLevel);
  const template = resolveTemplateForDate(
    context,
    date,
    split,
    daysPerWeek,
    templates,
    storedTemplateMap,
    equipmentLevel,
    profile?.experienceLevel
  );
  if (!template) {
    return new Map();
  }

  const baseline = new Map<string, TemplateBaselineExercise>();
  (template.exercises ?? []).forEach((exercise, index) => {
    baseline.set(exercise.id, {
      exerciseId: exercise.exercise_id ?? null,
      name: exercise.exercise_name,
      movementPattern: exercise.movement_pattern ?? null,
      bodyParts: (exercise.body_parts ?? []).map((part) => normalizeKey(part)),
      sets: exercise.sets ?? null,
      reps: exercise.reps ?? null,
      displayOrder: exercise.display_order ?? index + 1,
      notes: exercise.notes ?? null,
    });
  });
  return baseline;
};

const normalizeNullableText = (value?: string | null): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeBodyParts = (parts?: string[] | null): string[] =>
  (parts ?? []).map((part) => normalizeKey(part)).filter(Boolean);

const isSameAsBaseline = (
  input: PlanExerciseInput,
  displayOrder: number | null,
  baseline: TemplateBaselineExercise
): boolean => {
  return (
    (input.exerciseId ?? null) === baseline.exerciseId &&
    normalizeNullableText(input.name) === normalizeNullableText(baseline.name) &&
    normalizeNullableText(input.movementPattern ?? null) === baseline.movementPattern &&
    JSON.stringify(normalizeBodyParts(input.bodyParts)) === JSON.stringify(baseline.bodyParts) &&
    (input.sets ?? null) === baseline.sets &&
    normalizeNullableText(input.reps ?? null) === normalizeNullableText(baseline.reps) &&
    (displayOrder ?? null) === baseline.displayOrder &&
    normalizeNullableText(input.notes ?? null) === normalizeNullableText(baseline.notes)
  );
};

const hasBodyPartOverlap = (a: string[] = [], b: string[] = []): boolean => {
  if (!a.length || !b.length) return true;
  const bSet = new Set(b.map((part) => normalizeKey(part)));
  return a.some((part) => bSet.has(normalizeKey(part)));
};

const mergeSwapReason = (notes: string | null | undefined, reason?: string): string | null => {
  const normalized = normalizeNullableText(notes ?? null);
  const normalizedReason = normalizeNullableText(reason ?? null);
  if (!normalizedReason) return normalized;
  if (!normalized) return `Swap reason: ${normalizedReason}`;
  return `${normalized}\nSwap reason: ${normalizedReason}`;
};

export const fetchPlanRange = async (
  userId: string,
  planId: string,
  startDate: string,
  endDate: string
): Promise<PlanDay[]> => {
  const context = await fetchPlanContext(planId);
  if (!context || context.userId !== userId) return [];

  const profile = await fetchUserProfile(userId);
  const split = profile?.trainingSplit ?? 'full_body';
  const daysPerWeek = resolveDaysPerWeek(profile);
  const templates = await fetchTemplatesForUser(userId);
  if (!templates.length) return [];
  const storedTemplateMap = await fetchStoredPlanTemplateMap(planId);
  const overridesByDay = await fetchOverridesForRange(userId, planId, startDate, endDate);
  const persistedByDay = await fetchPersistedPlanDaysForRange(userId, planId, startDate, endDate);
  const equipmentLevel = normalizeEquipmentLevel(profile?.planPreferences?.equipmentLevel);

  const dates = buildDateRange(startDate, endDate);
  const resolved: PlanDay[] = [];
  dates.forEach((date) => {
    const persisted = persistedByDay.get(date);
    const overrides = overridesByDay.get(date) ?? [];
    if (persisted) {
      if (persisted.isRestDay || !persisted.templateId) {
        const overrideOnly = resolveOverrideOnlyPlanDay(context, date, overrides, persisted.id);
        if (overrideOnly) {
          resolved.push(overrideOnly);
        }
        return;
      }
      const persistedTemplate = templates.find((template) => template.id === persisted.templateId);
      if (persistedTemplate) {
        resolved.push(
          resolveTemplateBackedPlanDay(context, date, persistedTemplate, overrides, persisted.id)
        );
        return;
      }
    }

    if (!shouldTrainOnDate(parseYmd(date), daysPerWeek)) return;
    const template = resolveTemplateForDate(
      context,
      date,
      split,
      daysPerWeek,
      templates,
      storedTemplateMap,
      equipmentLevel,
      profile?.experienceLevel
    );
    if (!template) return;
    resolved.push(resolveTemplateBackedPlanDay(context, date, template, overrides));
  });
  return resolved;
};

export const fetchRecommendedWorkoutTemplates = async (
  userId: string,
  planId: string,
  limit = 6
): Promise<RecommendedWorkoutTemplate[]> => {
  const context = await fetchPlanContext(planId);
  if (!context || context.userId !== userId) return [];

  const profile = await fetchUserProfile(userId);
  const templates = await fetchTemplatesForUser(userId);
  if (!templates.length) return [];

  const splitTags = new Set(mapSplitToTags(profile?.trainingSplit ?? 'full_body').map(normalizeKey));
  const goalAliases = GOAL_ALIAS_MAP[normalizeKey(context.goalType)] ?? GOAL_ALIAS_MAP.general;
  const equipmentLevel = normalizeEquipmentLevel(profile?.planPreferences?.equipmentLevel);
  const experienceLevel = profile?.experienceLevel;

  const scored = templates
    .map((template) => {
      let score = 0;
      const reason: string[] = [];
      const templateGoalTags = (template.goal_tags ?? []).map(normalizeKey);

      if (templateGoalTags.some((tag) => goalAliases.includes(tag))) {
        score += 4;
        reason.push('matches your goal');
      }

      if (templateGoalTags.some((tag) => splitTags.has(tag))) {
        score += 2;
        reason.push('fits your split');
      }

      if (equipmentLevel) {
        const templateLevel = normalizeEquipmentLevel(template.equipment_level);
        if (!templateLevel || EQUIPMENT_RANK[templateLevel] <= EQUIPMENT_RANK[equipmentLevel]) {
          score += 2;
          reason.push('fits your equipment');
        } else {
          score -= 3;
        }
      }

      if (experienceLevel) {
        const templateDifficulty = normalizeKey(template.difficulty) as User['experienceLevel'];
        if (templateDifficulty in EXPERIENCE_RANK) {
          const diffGap = Math.abs(
            EXPERIENCE_RANK[templateDifficulty] - EXPERIENCE_RANK[experienceLevel]
          );
          if (diffGap === 0) {
            score += 2;
            reason.push('aligned with your level');
          } else if (diffGap > 1) {
            score -= 1;
          }
        }
      }

      return {
        id: template.id,
        title: template.title,
        difficulty: template.difficulty,
        equipmentLevel: template.equipment_level,
        goalTags: templateGoalTags,
        reason: reason.slice(0, 2),
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));

  return scored;
};

export const fetchResolvedPlanForDate = async (
  userId: string,
  planId: string,
  date: string
): Promise<PlanDay | null> => {
  const context = await fetchPlanContext(planId);
  if (!context || context.userId !== userId) return null;

  const profile = await fetchUserProfile(userId);
  const templates = await fetchTemplatesForUser(userId);
  if (!templates.length) return null;
  const overridesByDay = await fetchOverridesForRange(userId, planId, date, date);
  const overrides = overridesByDay.get(date) ?? [];
  const persistedByDay = await fetchPersistedPlanDaysForRange(userId, planId, date, date);
  const persisted = persistedByDay.get(date);
  if (persisted) {
    if (persisted.isRestDay || !persisted.templateId) {
      return resolveOverrideOnlyPlanDay(context, date, overrides, persisted.id);
    }
    const persistedTemplate = templates.find((template) => template.id === persisted.templateId);
    if (!persistedTemplate) {
      return null;
    }
    return resolveTemplateBackedPlanDay(
      context,
      date,
      persistedTemplate,
      overrides,
      persisted.id
    );
  }

  const split = profile?.trainingSplit ?? 'full_body';
  const daysPerWeek = resolveDaysPerWeek(profile);
  if (!shouldTrainOnDate(parseYmd(date), daysPerWeek)) return null;

  const storedTemplateMap = await fetchStoredPlanTemplateMap(planId);
  const equipmentLevel = normalizeEquipmentLevel(profile?.planPreferences?.equipmentLevel);
  const template = resolveTemplateForDate(
    context,
    date,
    split,
    daysPerWeek,
    templates,
    storedTemplateMap,
    equipmentLevel,
    profile?.experienceLevel
  );
  if (!template) return null;
  return resolveTemplateBackedPlanDay(context, date, template, overrides);
};

export const ensurePlanWorkoutForDate = async (
  userId: string,
  planId: string,
  date: string
): Promise<PlanWorkout> => {
  const resolved = await fetchResolvedPlanForDate(userId, planId, date);
  if (resolved?.workout) return resolved.workout;
  return {
    id: `virtual:${planId}:${date}`,
    planDayId: `virtual:${planId}:${date}`,
    title: null,
    sourceType: 'template',
    exercises: [],
  };
};

export const replacePlanExercisesForDate = async (
  userId: string,
  planId: string,
  date: string,
  exercises: PlanExerciseInput[],
  _sourceTemplateId?: string | null,
  _title?: string | null
) => {
  const context = await fetchPlanContext(planId);
  if (!context || context.userId !== userId) {
    throw new Error('plan_not_found_or_not_owned');
  }

  const baselineByTemplateExerciseId = await buildTemplateBaselineForDate(userId, context, date);
  const desiredTemplateIds = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];

  exercises.forEach((exercise, index) => {
    const displayOrder = exercise.displayOrder ?? index + 1;
    const templateExerciseId = exercise.sourceTemplateExerciseId ?? null;
    if (templateExerciseId) {
      desiredTemplateIds.add(templateExerciseId);
      const baseline = baselineByTemplateExerciseId.get(templateExerciseId);
      if (baseline && isSameAsBaseline(exercise, displayOrder, baseline)) {
        return;
      }
      rows.push({
        user_id: userId,
        plan_id: planId,
        day_date: date,
        template_exercise_id: templateExerciseId,
        action_type: 'replace',
        exercise_id: exercise.exerciseId,
        exercise_name: exercise.name,
        movement_pattern: exercise.movementPattern ?? null,
        body_parts: exercise.bodyParts ?? [],
        sets: exercise.sets ?? null,
        reps: exercise.reps ?? null,
        display_order: displayOrder,
        notes: exercise.notes ?? null,
        is_active: true,
      });
      return;
    }

    rows.push({
      user_id: userId,
      plan_id: planId,
      day_date: date,
      template_exercise_id: null,
      action_type: 'add',
      exercise_id: exercise.exerciseId,
      exercise_name: exercise.name,
      movement_pattern: exercise.movementPattern ?? null,
      body_parts: exercise.bodyParts ?? [],
      sets: exercise.sets ?? null,
      reps: exercise.reps ?? null,
      display_order: displayOrder,
      notes: exercise.notes ?? null,
      is_active: true,
    });
  });

  baselineByTemplateExerciseId.forEach((_baseline, templateExerciseId) => {
    if (desiredTemplateIds.has(templateExerciseId)) return;
    rows.push({
      user_id: userId,
      plan_id: planId,
      day_date: date,
      template_exercise_id: templateExerciseId,
      action_type: 'remove',
      exercise_id: null,
      exercise_name: null,
      movement_pattern: null,
      body_parts: null,
      sets: null,
      reps: null,
      display_order: null,
      notes: null,
      is_active: true,
    });
  });

  const { error: clearError } = await supabase
    .from('fitarc_plan_overrides')
    .delete()
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('day_date', date);
  if (clearError) throw clearError;

  if (!rows.length) return;
  const { error } = await supabase.from('fitarc_plan_overrides').insert(rows);
  if (error) throw error;
};

export type SwapPlanExerciseForDateInput = {
  userId: string;
  planId: string;
  date: string;
  targetPlanExerciseId: string;
  replacement: PlanExerciseInput;
  reason?: string;
  enforceGuardrails?: boolean;
};

export const swapPlanExerciseForDate = async ({
  userId,
  planId,
  date,
  targetPlanExerciseId,
  replacement,
  reason,
  enforceGuardrails = true,
}: SwapPlanExerciseForDateInput): Promise<PlanDay | null> => {
  const resolved = await fetchResolvedPlanForDate(userId, planId, date);
  const workout = resolved?.workout;
  if (!workout) {
    throw new Error('plan_workout_not_found_for_date');
  }

  const current = toPlanExerciseInputs(workout.exercises);
  const targetIndex = workout.exercises.findIndex((exercise) => exercise.id === targetPlanExerciseId);
  if (targetIndex < 0) {
    throw new Error('target_plan_exercise_not_found');
  }

  const target = current[targetIndex];
  const replacementOrder = target.displayOrder ?? targetIndex + 1;

  if (enforceGuardrails) {
    const targetPattern = normalizeKey(target.movementPattern ?? null);
    const replacementPattern = normalizeKey(replacement.movementPattern ?? null);
    if (targetPattern && replacementPattern && targetPattern !== replacementPattern) {
      throw new Error('swap_guardrail_failed_movement_pattern');
    }

    if (!hasBodyPartOverlap(target.bodyParts ?? [], replacement.bodyParts ?? [])) {
      throw new Error('swap_guardrail_failed_body_part_mismatch');
    }

    const baseSets = target.sets ?? null;
    const nextSets = replacement.sets ?? null;
    if (baseSets && nextSets && (nextSets < Math.max(1, Math.floor(baseSets * 0.5)) || nextSets > Math.ceil(baseSets * 1.5))) {
      throw new Error('swap_guardrail_failed_volume_range');
    }
  }

  const next: PlanExerciseInput[] = current.map((exercise, index) =>
    index !== targetIndex
      ? exercise
      : {
          ...exercise,
          ...replacement,
          displayOrder: replacement.displayOrder ?? replacementOrder,
          sourceTemplateExerciseId: exercise.sourceTemplateExerciseId ?? null,
          notes: mergeSwapReason(replacement.notes ?? exercise.notes, reason),
        }
  );

  await replacePlanExercisesForDate(userId, planId, date, next);
  return fetchResolvedPlanForDate(userId, planId, date);
};

export const appendPlanExercisesForDate = async (
  userId: string,
  planId: string,
  date: string,
  exercises: PlanExerciseInput[],
  _sourceTemplateId?: string | null,
  _title?: string | null
) => {
  const existing = await fetchResolvedPlanForDate(userId, planId, date);
  const current = toPlanExerciseInputs(existing?.workout?.exercises ?? []);
  const nextStartOrder = current.length + 1;
  const appended = [
    ...current,
    ...exercises.map((exercise, idx) => ({
      ...exercise,
      displayOrder: exercise.displayOrder ?? nextStartOrder + idx,
    })),
  ];
  return replacePlanExercisesForDate(userId, planId, date, appended);
};

export const deletePlanExercise = async (planExerciseId: string) => {
  if (planExerciseId.startsWith('ovr:')) {
    const overrideId = planExerciseId.slice(4);
    const { error } = await supabase
      .from('fitarc_plan_overrides')
      .update({ is_active: false })
      .eq('id', overrideId);
    if (error) throw error;
    return;
  }

  if (!planExerciseId.startsWith('tpl:')) {
    throw new Error('unsupported_plan_exercise_identifier');
  }

  const parts = planExerciseId.split(':');
  if (parts.length < 4) throw new Error('invalid_template_exercise_id');
  const planId = parts[1];
  const dayDate = parts[2];
  const templateExerciseId = parts[3];

  const context = await fetchPlanContext(planId);
  if (!context) throw new Error('plan_not_found');

  const { data: existing, error: existingError } = await supabase
    .from('fitarc_plan_overrides')
    .select('id')
    .eq('user_id', context.userId)
    .eq('plan_id', planId)
    .eq('day_date', dayDate)
    .eq('template_exercise_id', templateExerciseId)
    .eq('is_active', true)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await supabase
      .from('fitarc_plan_overrides')
      .update({
        action_type: 'remove',
        exercise_id: null,
        exercise_name: null,
        movement_pattern: null,
        body_parts: null,
        sets: null,
        reps: null,
        notes: null,
      })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('fitarc_plan_overrides').insert({
    user_id: context.userId,
    plan_id: planId,
    day_date: dayDate,
    template_exercise_id: templateExerciseId,
    action_type: 'remove',
    is_active: true,
  });
  if (error) throw error;
};

export const toPlanExerciseInputs = (
  exercises: PlanWorkoutExercise[]
): PlanExerciseInput[] =>
  exercises.map((exercise) => ({
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    bodyParts: exercise.bodyParts,
    movementPattern: exercise.movementPattern ?? null,
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    displayOrder: exercise.displayOrder ?? null,
    notes: exercise.notes ?? null,
    sourceTemplateExerciseId: extractTemplateExerciseId(exercise.id),
  }));

export const linkPlanToMatchedTemplates = async (
  userId: string,
  planId: string
): Promise<PlanTemplateMap | null> => {
  const context = await fetchPlanContext(planId);
  if (!context || context.userId !== userId) return null;

  const profile = await fetchUserProfile(userId);
  const split = profile?.trainingSplit ?? 'full_body';
  const templates = await fetchTemplatesForUser(userId);
  if (!templates.length) return null;
  const equipmentLevel = normalizeEquipmentLevel(profile?.planPreferences?.equipmentLevel);
  const templateMap = buildTemplateMapForPlan(
    context,
    split,
    templates,
    equipmentLevel,
    profile?.experienceLevel
  );
  if (!templateMap) return null;

  const { error } = await supabase
    .from('fitarc_workout_plans')
    .update({ template_map: templateMap })
    .eq('id', planId)
    .eq('user_id', userId);
  if (error) throw error;

  return templateMap;
};

export type GeneratePlanDaysInput = {
  planId: string;
  userId: string;
  startDate: string;
  endDate: string;
  goalTag: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  equipmentLevel: 'bodyweight' | 'dumbbells' | 'full_gym';
  splitPattern: string[];
  daysPerWeek: 3 | 4 | 5 | 6;
};

export const generatePlanDaysForPlan = async (
  input: GeneratePlanDaysInput
): Promise<number | null> => {
  const {
    planId,
    userId,
    startDate,
    endDate,
    goalTag,
    difficulty,
    equipmentLevel,
    splitPattern,
    daysPerWeek,
  } = input;

  const { data, error } = await supabase.rpc('fitarc_generate_plan_days', {
    p_plan_id: planId,
    p_user_id: userId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_goal_tag: goalTag,
    p_difficulty: difficulty,
    p_equipment_level: equipmentLevel,
    p_split_pattern: splitPattern,
    p_train_days_per_week: daysPerWeek,
  });

  if (error) {
    // Fail open for environments where the SQL function is not created yet.
    const code = (error as { code?: string } | null)?.code;
    if (code === 'PGRST202' || code === '42883') {
      return null;
    }
    throw error;
  }

  const numeric = Number(data ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};
