import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
  PanResponder,
  Modal,
  Pressable,
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
  PlanDay,
  PlanWorkoutExercise,
} from '../types/domain';
import { useHomeScreenData } from '../hooks/useHomeScreenData';
import { useWorkoutSessions } from '../hooks/useWorkoutSessions';
import { useFabAction } from '../contexts/FabActionContext';
import { useScreenAnimation } from '../hooks/useScreenAnimation';
import { formatLocalDateYMD } from '../utils/date';
import { PLAN_INPUT_LABELS, getMissingPlanInputs } from '../utils/planReadiness';
import { LibraryScreen } from './LibraryScreen';

// ─── Colours ─────────────────────────────────────────────────────────────────

const BG = ['#07091C', '#0B0E22', '#0F1228'] as const;

const C = {
  bg:          '#07091C',
  card:        '#0E1225',
  cardHover:   '#111529',
  surface:     '#131728',
  accent:      '#6C63FF',
  accentDim:   'rgba(108,99,255,0.14)',
  accentBorder:'rgba(108,99,255,0.3)',
  success:     '#00F5A0',
  successDim:  'rgba(0,245,160,0.1)',
  successBorder:'rgba(0,245,160,0.25)',
  danger:      '#FF6B6B',
  dangerDim:   'rgba(255,107,107,0.1)',
  warn:        '#FFC442',
  warnDim:     'rgba(255,196,66,0.08)',
  rest:        '#3A3F5C',
  restDim:     'rgba(58,63,92,0.3)',
  text:        '#FFFFFF',
  textSub:     '#B8BEDC',
  textMuted:   '#6B7194',
  textFaint:   '#353A57',
  rail:        'rgba(255,255,255,0.1)',
  border:      'rgba(255,255,255,0.06)',
  borderMid:   'rgba(255,255,255,0.09)',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type TDay = {
  date:      string;
  dayName:   string;   // Mon, Tue …
  dateLabel: string;   // Jan 6
  planDay:   PlanDay | null;
  session:   WorkoutSessionEntry | null;
  isToday:   boolean;
  isPast:    boolean;
  planIsRest: boolean; // from plan data
};

type TWeek = {
  weekIdx:   number;
  label:     string;
  days:      TDay[];
  doneCount: number;
  workCount: number;
  isCurrent: boolean;
  isDone:    boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const parseYMD = (s: string)  => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

const MON_FIRST = [1, 2, 3, 4, 5, 6, 0] as const; // Mon … Sun day-of-week order
const dayOrder  = (d: Date) => MON_FIRST.indexOf(d.getDay() as typeof MON_FIRST[number]);

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

// Return the Monday on or before `d`
const mondayOf = (d: Date) => {
  const dow = d.getDay();                // 0=Sun … 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // days back to Monday
  return addDays(d, diff);
};

const isSessionDone = (s: WorkoutSessionEntry) =>
  s.completed !== undefined
    ? s.completed
    : s.exercises.length > 0 && s.exercises.every((e) => e.completed);

const goalLabel = (raw?: string | null) => {
  const g = (raw ?? '').toLowerCase();
  if (g.includes('muscle') || g.includes('hypertrophy')) return 'Hypertrophy';
  if (g.includes('strength') || g.includes('stronger'))  return 'Strength';
  if (g.includes('fat') || g.includes('cut'))            return 'Fat Loss';
  if (g.includes('endurance'))                           return 'Endurance';
  return 'General Fitness';
};

// Build Mon-first weekly timeline from phase start → end
const buildTimeline = (
  phase:    PhasePlan,
  planDays: PlanDay[],
  sessions: WorkoutSessionEntry[],
  todayStr: string,
): TWeek[] => {
  const start     = parseYMD(phase.startDate);
  const end       = parseYMD(phase.expectedEndDate);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  const planByDate    = new Map(planDays.map((d) => [d.date, d]));
  const sessionByDate = new Map(sessions.map((s) => [s.date, s]));

  // Build flat day list
  const allDays: TDay[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date    = addDays(start, i);
    const dateStr = formatLocalDateYMD(date);
    const planDay = planByDate.get(dateStr) ?? null;
    const session = sessionByDate.get(dateStr) ?? null;
    allDays.push({
      date:      dateStr,
      dayName:   DAYS[date.getDay()],
      dateLabel: fmtDate(date),
      planDay,
      session,
      isToday:   dateStr === todayStr,
      isPast:    dateStr < todayStr,
      planIsRest: !planDay?.workout || planDay.workout.exercises.length === 0,
    });
  }

  // Group by Mon-Sun calendar weeks
  const mon0       = mondayOf(start);
  const weekMap    = new Map<number, TDay[]>();
  allDays.forEach((day) => {
    const date  = parseYMD(day.date);
    const wIdx  = Math.floor(Math.round((date.getTime() - mon0.getTime()) / 86400000) / 7);
    if (!weekMap.has(wIdx)) weekMap.set(wIdx, []);
    weekMap.get(wIdx)!.push(day);
  });

  // Sort weeks; within each week sort Mon → Sun
  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, days], idx) => {
      const sorted = [...days].sort((a, b) => dayOrder(parseYMD(a.date)) - dayOrder(parseYMD(b.date)));

      const workCount = sorted.filter((d) => !d.planIsRest).length;
      const doneCount = sorted.filter((d) => !d.planIsRest && d.session && isSessionDone(d.session)).length;
      const isCurrent = sorted.some((d) => d.isToday);
      const isDone    = workCount > 0 && doneCount >= workCount && !isCurrent;

      return {
        weekIdx: idx,
        label:   `Week ${idx + 1}`,
        days:    sorted,
        workCount,
        doneCount,
        isCurrent,
        isDone,
      };
    });
};

// ─── Swipeable exercise row ───────────────────────────────────────────────────

const SWIPE_THRESHOLD = 72;

type SwipeRowProps = {
  ex: { name: string; sets?: number | null; reps?: number | string | null };
  done: boolean;
  onToggle: () => void;
  onRemove: () => void;
};

const SwipeableExRow: React.FC<SwipeRowProps> = ({ ex, done, onToggle, onRemove }) => {
  const tx = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 10,
      onPanResponderMove: (_, gs) => tx.setValue(gs.dx),
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
          onToggle();
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          Animated.timing(tx, { toValue: -500, duration: 200, useNativeDriver: true }).start(() => onRemove());
        } else {
          Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const rightHintOpacity = tx.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const leftHintOpacity  = tx.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={s.swipeRowWrap}>
      <Animated.View style={[s.swipeHintRight, { opacity: rightHintOpacity }]}>
        <Text style={s.swipeHintRightTxt}>✓  Done</Text>
      </Animated.View>
      <Animated.View style={[s.swipeHintLeft, { opacity: leftHintOpacity }]}>
        <Text style={s.swipeHintLeftTxt}>Remove</Text>
      </Animated.View>
      <Animated.View
        style={[s.exRow, done && s.exRowDone, { transform: [{ translateX: tx }] }]}
        {...panResponder.panHandlers}
      >
        <View style={s.exInfo}>
          <Text style={[s.exName, done && s.exNameDone]} numberOfLines={1}>{ex.name}</Text>
          <Text style={s.exMeta}>{ex.sets ?? 4} × {ex.reps ?? '8–12'}</Text>
        </View>
        <TouchableOpacity
          style={[s.checkbox, done && s.checkboxOn]}
          onPress={onToggle}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          {done && <Text style={s.checkMark}>✓</Text>}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

// ─── Props ────────────────────────────────────────────────────────────────────

type DashboardScreenProps = {
  user:             User;
  phase:            PhasePlan | null;
  workoutSessions:  WorkoutSessionEntry[];
  plannedWorkouts:  PlanDay[];
  onProfilePress?:  () => void;
  onStartPhase?:    () => void;
  onToggleWorkoutExercise?: (
    date: string, exerciseName: string, exerciseId?: string, currentExercises?: WorkoutSessionExercise[]
  ) => void;
  onSaveCustomSession?:       (date: string, exercises: WorkoutSessionExercise[]) => void;
  onAddExercise?:             (planWorkoutId: string, exercise: WorkoutSessionExercise) => Promise<string | void>;
  onDeleteExercise?:          (planWorkoutId: string, planExerciseId: string) => Promise<void>;
  canUndoWorkoutSwap?:        (date: string) => boolean;
  onUndoLastWorkoutSwap?:     (date: string) => Promise<boolean>;
  onReplaceSessionWithTemplate?: (
    date: string, exercises: WorkoutSessionExercise[], force?: boolean
  ) => Promise<{ hasProgress: boolean }>;
  onAppendExercisesToSession?: (date: string, exercises: WorkoutSessionExercise[]) => Promise<void>;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  user,
  phase,
  workoutSessions,
  plannedWorkouts,
  onProfilePress,
  onStartPhase,
  onToggleWorkoutExercise,
  onSaveCustomSession,
  onDeleteExercise,
  onReplaceSessionWithTemplate,
  onAppendExercisesToSession,
}) => {
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const { setFabAction }  = useFabAction();
  const { headerStyle }   = useScreenAnimation();
  const { data: homeData, isLoading: isHomeLoading } = useHomeScreenData(user.id);
  const derivedPhaseId    = phase?.id ?? homeData?.phase?.id;
  const { sessions: phaseSessions, isLoading: isSessionsLoading } =
    useWorkoutSessions(user.id, derivedPhaseId);

  const scrollRef   = useRef<ScrollView>(null);
  const todayCardY  = useRef(0);
  const headerFade  = useRef(new Animated.Value(0)).current;
  const createPulse = useRef(new Animated.Value(1)).current;

  const resolvedPhase = phase ?? homeData?.phase ?? null;
  const hasActivePlan = resolvedPhase?.status === 'active';

  const resolvedSessions = useMemo(() => {
    const fallback  = phaseSessions.length ? phaseSessions : (homeData?.recentSessions ?? []);
    const preferred = workoutSessions.length ? workoutSessions : fallback;
    if (!derivedPhaseId) return preferred;
    return preferred.filter((s) => s.phasePlanId === derivedPhaseId);
  }, [derivedPhaseId, homeData?.recentSessions, phaseSessions, workoutSessions]);

  const resolvedPlannedWorkouts = useMemo(() => {
    if (!derivedPhaseId) return plannedWorkouts;
    return plannedWorkouts.filter((d) => d.planId === derivedPhaseId);
  }, [derivedPhaseId, plannedWorkouts]);

  const todayStr          = useMemo(() => formatLocalDateYMD(new Date()), []);
  const missingPlanInputs = useMemo(() => getMissingPlanInputs(user), [user]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [expandedDate, setExpandedDate] = useState<string | null>(todayStr);
  const [localDone,    setLocalDone]    = useState<Record<string, boolean>>({});
  const [templateWeek, setTemplateWeek] = useState<TWeek | null>(null);
  const [templateDay,  setTemplateDay]  = useState<TDay | null>(null);

  // ── Timeline ────────────────────────────────────────────────────────────────
  const weeks = useMemo<TWeek[]>(() => {
    if (!resolvedPhase || !hasActivePlan) return [];
    return buildTimeline(resolvedPhase, resolvedPlannedWorkouts, resolvedSessions, todayStr);
  }, [resolvedPhase, hasActivePlan, resolvedPlannedWorkouts, resolvedSessions, todayStr]);

  const { completedSessions, totalWorkouts } = useMemo(() => {
    let done = 0, total = 0;
    weeks.forEach((w) => { total += w.workCount; done += w.doneCount; });
    return { completedSessions: done, totalWorkouts: total };
  }, [weeks]);

  const progressPct = totalWorkouts > 0 ? completedSessions / totalWorkouts : 0;
  const currentWeek = weeks.find((w) => w.isCurrent);
  const displayName = user.name?.trim() || 'Athlete';
  const avatarLabel = displayName.split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  const planName = useMemo(() => {
    if (resolvedPhase?.name) return resolvedPhase.name;
    return `${goalLabel(resolvedPhase?.goalType ?? user?.planPreferences?.primaryGoal)} Plan`;
  }, [resolvedPhase, user]);

  const openCurrentWeekTemplate = useCallback(() => {
    if (!weeks.length) return;
    const targetWeek =
      currentWeek ??
      weeks.find((w) => !w.isDone) ??
      weeks[0];
    if (!targetWeek) return;
    openWeekTemplate(targetWeek);
  }, [currentWeek, weeks]);

  // ── FAB ─────────────────────────────────────────────────────────────────────
  const getFabConfig = useCallback(() => {
    if (hasActivePlan && weeks.length) {
      return {
        colors: [C.accent, '#4C3BFF'] as const,
        iconColor: C.bg,
        labelColor: C.accent,
        label: 'Apply Template',
        icon: '+',
        onPress: openCurrentWeekTemplate,
      };
    }
    if (!hasActivePlan && onStartPhase) {
      return {
        colors: [C.accent, '#4C3BFF'] as const,
        iconColor: C.bg,
        labelColor: C.accent,
        label: 'Create Plan',
        icon: '+',
        onPress: onStartPhase,
      };
    }
    return null;
  }, [hasActivePlan, onStartPhase, weeks.length, openCurrentWeekTemplate]);

  useEffect(() => {
    const cfg = getFabConfig();
    setFabAction('Today', cfg);
    return () => setFabAction('Today', null);
  }, [getFabConfig, setFabAction]);

  // ── Animations ──────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (hasActivePlan) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.spring(createPulse, { toValue: 1.06, tension: 100, friction: 5, useNativeDriver: true }),
        Animated.spring(createPulse, { toValue: 1,    tension: 100, friction: 5, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasActivePlan]);

  // Auto-scroll to today card
  useEffect(() => {
    if (!hasActivePlan || weeks.length === 0) return;
    const t = setTimeout(() => {
      if (todayCardY.current > 0) {
        scrollRef.current?.scrollTo({ y: Math.max(0, todayCardY.current - 90), animated: true });
      }
    }, 450);
    return () => clearTimeout(t);
  }, [hasActivePlan, weeks.length]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const isExDone = (day: TDay, name: string, serverDone?: boolean) =>
    localDone[`${day.date}::${name}`] ?? serverDone ?? false;

  const pickDefaultDayForWeek = (week: TWeek): TDay | null =>
    week.days.find((d) => d.isToday) ??
    week.days.find((d) => !d.isPast) ??
    week.days[0] ??
    null;

  const toggleExercise = (day: TDay, ex: PlanWorkoutExercise | WorkoutSessionExercise) => {
    const key = `${day.date}::${ex.name}`;
    setLocalDone((prev) => ({ ...prev, [key]: !prev[key] }));
    const exId = 'exerciseId' in ex ? ex.exerciseId : undefined;
    onToggleWorkoutExercise?.(day.date, ex.name, exId);
  };

  const toggleAllExercises = (day: TDay) => {
    const exercises = getDayExercises(day);
    if (!exercises.length) return;
    const allCurrentlyDone = exercises.every((ex) =>
      isExDone(day, ex.name, 'completed' in ex ? ex.completed : undefined)
    );
    const updates: Record<string, boolean> = {};
    exercises.forEach((ex) => { updates[`${day.date}::${ex.name}`] = !allCurrentlyDone; });
    setLocalDone((prev) => ({ ...prev, ...updates }));
    exercises.forEach((ex) => {
      const currentDone = isExDone(day, ex.name, 'completed' in ex ? ex.completed : undefined);
      if (currentDone !== !allCurrentlyDone) {
        const exId = 'exerciseId' in ex ? ex.exerciseId : undefined;
        onToggleWorkoutExercise?.(day.date, ex.name, exId);
      }
    });
  };

  function openWeekTemplate(week: TWeek) {
    setTemplateWeek(week);
    setTemplateDay(pickDefaultDayForWeek(week));
  }

  const closeTemplateModal = () => {
    setTemplateWeek(null); setTemplateDay(null);
  };

  const getDayExercises = useCallback((day: TDay): WorkoutSessionExercise[] => {
    if (day.session?.exercises?.length) return day.session.exercises;
    if (!day.planDay?.workout?.exercises?.length) return [];
    return day.planDay.workout.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      bodyParts: exercise.bodyParts,
      movementPattern: exercise.movementPattern,
      sets: exercise.sets ?? 4,
      reps: exercise.reps ?? '8-12',
      completed: false,
      displayOrder: exercise.displayOrder,
      notes: exercise.notes,
    }));
  }, []);

  // ── Consecutive-day awareness ─────────────────────────────────────────────────

  const todayDay = useMemo(() => {
    for (const week of weeks) {
      const d = week.days.find((dd) => dd.isToday);
      if (d) return d;
    }
    return null;
  }, [weeks]);

  const tomorrowStr = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return formatLocalDateYMD(t);
  }, []);

  const todayComplete = useMemo(() => {
    if (!todayDay) return false;
    // Rest day counts as complete — highlight tomorrow
    if (todayDay.planIsRest) return true;
    const exercises = getDayExercises(todayDay);
    if (!exercises.length) return false;
    return exercises.every((ex) =>
      (localDone[`${todayDay.date}::${ex.name}`] ??
        ('completed' in ex ? ex.completed : false)) === true
    );
  }, [todayDay, getDayExercises, localDone]);

  // Auto-open tomorrow's card once today is done (or is a rest day)
  useEffect(() => {
    if (todayComplete) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedDate(tomorrowStr);
    }
  }, [todayComplete, tomorrowStr]);

  // ── Exercise list (inside expanded card) ────────────────────────────────────

  const renderExercises = (day: TDay) => {
    const exercises: Array<PlanWorkoutExercise | WorkoutSessionExercise> =
      day.session?.exercises?.length
        ? day.session.exercises
        : (day.planDay?.workout?.exercises ?? []);

    const allDone = exercises.length > 0 && exercises.every((ex) =>
      isExDone(day, ex.name, 'completed' in ex ? ex.completed : undefined)
    );

    return (
      <View style={s.exSection}>
        {/* Completion banner — shown when today's workout is fully done */}
        {day.isToday && allDone && (
          <View style={s.completionBanner}>
            <Text style={s.completionBannerIcon}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.completionBannerText}>Workout complete!</Text>
              <Text style={s.completionBannerSub}>Rest up — see you tomorrow</Text>
            </View>
          </View>
        )}
        {/* Exercise rows */}
        <View style={s.exRows}>
          {exercises.length === 0 ? (
            <Text style={s.exEmpty}>No exercises — apply a template below</Text>
          ) : (
            exercises.map((ex, i) => {
              const done = isExDone(day, ex.name, 'completed' in ex ? ex.completed : undefined);
              return (
                <View key={i} style={s.exEditableWrap}>
                  <SwipeableExRow
                    ex={ex}
                    done={done}
                    onToggle={() => toggleExercise(day, ex)}
                    onRemove={() => {
                      if ('planWorkoutId' in ex && ex.id) {
                        const wid = day.planDay?.workout?.id;
                        if (wid) onDeleteExercise?.(wid, ex.id);
                      } else {
                        const remaining = getDayExercises(day).filter((_, idx) => idx !== i);
                        onSaveCustomSession?.(day.date, remaining);
                      }
                    }}
                  />
                </View>
              );
            })
          )}
        </View>

      </View>
    );
  };

  // ── Day card ─────────────────────────────────────────────────────────────────

  const renderDayCard = (day: TDay) => {
    const rest        = day.planIsRest;
    const expanded    = expandedDate === day.date && !rest;
    const isNextUp    = todayComplete && day.date === tomorrowStr && !rest;

    const exCount     = rest ? 0 : (day.session?.exercises?.length ?? day.planDay?.workout?.exercises?.length ?? 0);
    const dayExercises = rest ? [] : getDayExercises(day);
    const allExDone   = !rest && dayExercises.length > 0 && dayExercises.every((ex) =>
      isExDone(day, ex.name, 'completed' in ex ? ex.completed : undefined)
    );

    // Dot colour on rail
    let dotColor: string, dotGlow: string | undefined;
    if (rest)            { dotColor = C.textFaint;               dotGlow = undefined; }
    else if (allExDone)  { dotColor = C.success;                 dotGlow = 'rgba(0,245,160,0.45)'; }
    else if (day.isToday){ dotColor = C.success;                 dotGlow = 'rgba(0,245,160,0.45)'; }
    else if (isNextUp)   { dotColor = C.accent;                  dotGlow = 'rgba(108,99,255,0.4)'; }
    else                 { dotColor = 'rgba(255,255,255,0.12)';  dotGlow = undefined; }

    return (
      <View
        key={day.date}
        style={s.dayCardWrap}
        onLayout={(e) => { if (day.isToday) todayCardY.current = e.nativeEvent.layout.y; }}
      >
        {/* ── Rail col ── */}
        <View style={s.railCol}>
          <View style={s.railLine} />
          <View style={s.dotWrap}>
            {dotGlow && <View style={[s.dotGlow, { backgroundColor: dotGlow }]} />}
            <View style={[s.dot, { backgroundColor: dotColor }]} />
          </View>
        </View>

        {/* ── Card ── */}
        <View style={[s.dayCard, allExDone && s.dayCardDone, day.isToday && s.dayCardToday, isNextUp && s.dayCardNextUp, expanded && s.dayCardExpanded]}>

          {/* Card header — always visible */}
          <TouchableOpacity
            activeOpacity={rest ? 1 : 0.85}
            onPress={() => {
              if (rest) return;
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setExpandedDate((p) => p === day.date ? null : day.date);
            }}
            style={s.cardHeader}
          >
            {/* Left: day + date */}
            <View style={s.cardDateGroup}>
              <Text style={[s.cardDayName, allExDone && s.cardDayNameDone, day.isToday && s.cardDayNameToday, rest && s.cardDayNameRest]}>
                {day.dayName}
              </Text>
              <Text style={[s.cardDateLabel, rest && s.cardDateLabelRest]}>
                {day.dateLabel}
              </Text>
              {rest && <Text style={s.restInlineLbl}>· Rest</Text>}
            </View>

            {/* Right: status + toggle */}
            <View style={s.cardHeaderRight}>
              {!rest && day.isToday && !allExDone && (
                <View style={s.todayBadge}><Text style={s.todayBadgeTxt}>Today</Text></View>
              )}
              {isNextUp && (
                <View style={s.nextUpBadge}><Text style={s.nextUpBadgeTxt}>Next Up</Text></View>
              )}
              {!rest && !allExDone && !day.isToday && !isNextUp && exCount > 0 && (
                <Text style={s.exCntBadge}>{exCount} ex</Text>
              )}

              {/* Day checkbox */}
              {!rest && (
                <TouchableOpacity
                  onPress={() => toggleAllExercises(day)}
                  style={[s.dayCheckbox, allExDone && s.dayCheckboxDone]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  {allExDone && <Text style={s.dayCheckboxTick}>✓</Text>}
                </TouchableOpacity>
              )}

              {/* Chevron (workout days only) */}
              {!rest && (
                <Text style={[s.chevron, expanded && s.chevronOpen]}>⌄</Text>
              )}
            </View>
          </TouchableOpacity>

{/* Expanded workout content */}
          {expanded && !rest && renderExercises(day)}
        </View>

      </View>
    );
  };

  // ── Week block ───────────────────────────────────────────────────────────────

  const renderWeek = (week: TWeek, idx: number) => (
    <View key={week.weekIdx} style={s.weekBlock}>
      {idx > 0 && <View style={s.weekDivider} />}

      {/* Week header — integrated with rail */}
      <View style={s.weekHeaderRow}>
        {/* Rail col: continues the line + week marker dot */}
        <View style={s.weekHeaderRailCol}>
          <View style={s.railLine} />
          <View style={[s.weekMarkerDot, week.isCurrent && s.weekMarkerDotCurrent, week.isDone && s.weekMarkerDotDone]} />
        </View>

        {/* Week info */}
        <View style={s.weekHeaderContent}>
          <Text style={[s.weekLabel, week.isCurrent && s.weekLabelCurrent]}>
            {week.label}
          </Text>
          {week.workCount > 0 && (
            <Text style={s.weekProgressTxt}>
              {week.doneCount}/{week.workCount} sessions
            </Text>
          )}
        </View>

        {/* Status badge */}
        {week.isDone && (
          <View style={s.weekStatusBadge}>
            <Text style={s.weekStatusDoneTxt}>✓ Done</Text>
          </View>
        )}
      </View>

      {week.days.map((day) => renderDayCard(day))}
    </View>
  );

  // ── Plan summary card ────────────────────────────────────────────────────────

  const renderPlanCard = () => (
    <LinearGradient
      colors={['rgba(108,99,255,0.22)', 'rgba(108,99,255,0.06)', 'transparent']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.planCard}
    >
      <View style={s.planCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.planName}>{planName}</Text>
          <Text style={s.planMeta}>
            {currentWeek ? currentWeek.label : `${weeks.length} weeks`}
            {resolvedPhase?.expectedWeeks ? `  ·  ${resolvedPhase.expectedWeeks}-week plan` : ''}
          </Text>
        </View>
        <View style={s.ringWrap}>
          <Text style={s.ringPct}>{Math.round(progressPct * 100)}%</Text>
          <Text style={s.ringLbl}>done</Text>
        </View>
      </View>

      <View style={s.planBarBg}>
        <View style={[s.planBarFill, { width: `${Math.round(progressPct * 100)}%` as any }]} />
      </View>
      <View style={s.planBarRow}>
        <Text style={s.planBarStat}>{completedSessions} sessions done</Text>
        <Text style={s.planBarStat}>{totalWorkouts - completedSessions} remaining</Text>
      </View>
    </LinearGradient>
  );

  // ── Template picker modal ────────────────────────────────────────────────────

  const renderTemplateModal = () => (
    <Modal
      visible={templateWeek !== null}
      transparent
      animationType="slide"
      onRequestClose={closeTemplateModal}
    >
      <View style={s.modalOverlay} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFillObject} onPress={closeTemplateModal} />
        <View style={s.modalSheet}>
          <View style={s.sheetHandle} />

          {/* Header */}
          <View style={s.sheetHeader}>
            <View>
              <Text style={s.sheetTitle}>
                {templateWeek ? templateWeek.label : 'Apply Template'}
              </Text>
              {templateDay && (
                <Text style={s.sheetSub}>{templateDay.dayName} · {templateDay.dateLabel}</Text>
              )}
            </View>
            <TouchableOpacity style={s.sheetCloseBtn} onPress={closeTemplateModal}>
              <Text style={s.sheetCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          {templateWeek && (
            <>
              {/* Week picker — sticky */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.weekPickerRow}
              >
                {weeks.map((w) => {
                  const selectedWeek = w.weekIdx === templateWeek.weekIdx;
                  return (
                    <TouchableOpacity
                      key={w.weekIdx}
                      style={[s.weekChip, selectedWeek && s.weekChipSelected]}
                      onPress={() => {
                        setTemplateWeek(w);
                        setTemplateDay(pickDefaultDayForWeek(w));
                      }}
                    >
                      <Text style={[s.weekChipText, selectedWeek && s.weekChipTextSelected]}>
                        {w.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Day picker — sticky */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.dayPickerRow}
              >
                {templateWeek.days.map((d) => {
                  const selected = d.date === templateDay?.date;
                  const rest = d.planIsRest;
                  return (
                    <TouchableOpacity
                      key={d.date}
                      style={[s.dayChip, selected && s.dayChipSelected, rest && s.dayChipRest]}
                      onPress={() => setTemplateDay(d)}
                    >
                      <Text style={[s.dayChipDate, selected && s.dayChipDateSelected]}>
                        {d.dateLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Template list — scrollable */}
              {templateDay && (
                <ScrollView
                  style={s.sheetTemplateScroll}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  <LibraryScreen
                    key={`${templateWeek.weekIdx}-${templateDay.date}`}
                    embedded
                    targetDate={templateDay.date}
                    user={user}
                    phase={phase}
                    plannedWorkouts={plannedWorkouts}
                    workoutSessions={workoutSessions}
                    onReplaceSessionWithTemplate={async (date, exercises, force) => {
                      const r = await (onReplaceSessionWithTemplate?.(date, exercises, force) ?? Promise.resolve({ hasProgress: false }));
                      closeTemplateModal();
                      return r;
                    }}
                    onAppendExercisesToSession={async (date, exercises) => {
                      await onAppendExercisesToSession?.(date, exercises);
                      closeTemplateModal();
                    }}
                    onNavigateToToday={closeTemplateModal}
                  />
                </ScrollView>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  // ── Root render ──────────────────────────────────────────────────────────────

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();

  return (
    <View style={s.root}>
      <LinearGradient colors={BG} style={s.gradient}>

        {/* Header */}
        <Animated.View
          style={[
            s.header, headerStyle,
            {
              opacity: headerFade,
              transform: [{ translateY: headerFade.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
            },
          ]}
        >
          <View style={s.headerLeft}>
            <Text style={s.greeting}>{greeting},</Text>
            <Text style={s.userName}>{displayName}</Text>
          </View>
          {onProfilePress && (
            <TouchableOpacity style={s.avatar} onPress={onProfilePress}>
              {user.avatarUrl
                ? <Image source={{ uri: user.avatarUrl }} style={s.avatarImg} />
                : <Text style={s.avatarTxt}>{avatarLabel || 'A'}</Text>}
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Body */}
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {/* No active plan */}
          {!hasActivePlan && !isHomeLoading && !isSessionsLoading && (
            <>
              {missingPlanInputs.length > 0 && (
                <View style={s.warnCard}>
                  <Text style={s.warnTitle}>Complete your profile to generate a plan</Text>
                  <Text style={s.warnBody}>
                    {missingPlanInputs.map((k) => `• ${PLAN_INPUT_LABELS[k]}`).join('\n')}
                  </Text>
                </View>
              )}
              <View style={s.emptyState}>
                <Text style={s.emptyIcon}>🎯</Text>
                <Text style={s.emptyTitle}>No active plan</Text>
                <Text style={s.emptyBody}>Create a personalized plan to see your full training timeline here.</Text>
                {onStartPhase && (
                  <Animated.View style={{ transform: [{ scale: createPulse }] }}>
                    <TouchableOpacity style={s.startBtn} onPress={onStartPhase}>
                      <Text style={s.startBtnTxt}>Create Plan</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </View>
            </>
          )}

          {/* Active plan timeline */}
          {hasActivePlan && weeks.length > 0 && (
            <>
              {renderPlanCard()}
              {weeks.map((w, i) => renderWeek(w, i))}
            </>
          )}

          {/* Loading */}
          {(isHomeLoading || isSessionsLoading) && !hasActivePlan && (
            <View style={s.emptyState}>
              <Text style={s.emptyBody}>Loading your plan…</Text>
            </View>
          )}
        </ScrollView>
      </LinearGradient>

      {renderTemplateModal()}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const DOT_S  = 2;
const GLOW_S = 10;
const RAIL_W = 1.5;
const RAIL_X = 9; // horizontal centre of rail column

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.bg },
  gradient: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 22, paddingTop: 60, paddingBottom: 12,
  },
  headerLeft: { flex: 1 },
  greeting:   { fontSize: 12, color: C.textMuted, fontWeight: '600', letterSpacing: 0.3, marginBottom: 3 },
  userName:   { fontSize: 30, fontWeight: '800', color: C.text, letterSpacing: -0.8 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: C.accentDim, borderWidth: 1.5, borderColor: C.accentBorder,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarTxt: { fontSize: 16, fontWeight: '800', color: C.text },
  avatarImg:  { width: '100%', height: '100%', borderRadius: 23 },

  // ── Scroll ──────────────────────────────────────────────────────────────
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 130 },

  // ── Plan card ───────────────────────────────────────────────────────────
  planCard: {
    marginHorizontal: 16, marginBottom: 24,
    borderRadius: 20, padding: 22,
    borderWidth: 1.5, borderColor: C.accentBorder,
  },
  planCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 14 },
  planName:    { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.5, marginBottom: 6 },
  planMeta:    { fontSize: 13, color: C.textMuted, fontWeight: '500', lineHeight: 18 },
  ringWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(108,99,255,0.18)', borderWidth: 1.5, borderColor: C.accentBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  ringPct:  { fontSize: 16, fontWeight: '900', color: C.accent, letterSpacing: -0.5 },
  ringLbl:  { fontSize: 9, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  planBarBg:   { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 },
  planBarFill: { height: 4, backgroundColor: C.accent, borderRadius: 2 },
  planBarRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  planBarStat: { fontSize: 12, color: C.textMuted, fontWeight: '500' },

  // ── Week ────────────────────────────────────────────────────────────────
  weekBlock: { marginBottom: 4 },

  weekDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginTop: 8,
    marginBottom: 4,
    marginLeft: RAIL_X * 2, // starts after the rail column
  },

  weekHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
    paddingVertical: 6,
  },
  weekHeaderRailCol: {
    width: RAIL_X * 2,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  weekMarkerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.textFaint,
    zIndex: 1,
  },
  weekMarkerDotCurrent: { backgroundColor: C.accent, width: 12, height: 12, borderRadius: 6 },
  weekMarkerDotDone:    { backgroundColor: C.success },
  weekHeaderContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  weekLabelCurrent: { color: C.accent },
  weekProgressTxt: {
    fontSize: 10,
    color: C.textFaint,
    fontWeight: '500',
  },
  weekStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: C.successDim,
    borderWidth: 1,
    borderColor: C.successBorder,
  },
  weekStatusDoneTxt:    { fontSize: 9, fontWeight: '700', color: C.success },
  weekStatusCurrent:    { backgroundColor: C.accentDim, borderColor: C.accentBorder },
  weekStatusCurrentTxt: { fontSize: 9, fontWeight: '700', color: C.accent },
  // ── Day card ─────────────────────────────────────────────────────────────
  dayCardWrap: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: 16, marginBottom: 2 },

  // Rail
  railCol:  { width: RAIL_X * 2, alignItems: 'center', paddingTop: 22 },
  railLine: {
    position: 'absolute', top: 0, bottom: 0,
    width: RAIL_W, backgroundColor: C.rail,
    left: RAIL_X - RAIL_W / 2,
  },
  dotWrap: {
    width: GLOW_S, height: GLOW_S,
    alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  dotGlow: { position: 'absolute', width: GLOW_S, height: GLOW_S, borderRadius: GLOW_S / 2 },
  dot:     { width: DOT_S, height: DOT_S, borderRadius: DOT_S / 2 },

  // Card
  dayCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 6,
  },
  dayCardDone: {
    backgroundColor: 'rgba(0,245,160,0.04)',
    borderColor: 'rgba(0,245,160,0.18)',
  },
  dayCardToday: {
    borderColor: C.accentBorder,
    backgroundColor: C.accentDim,
  },
  dayCardExpanded: {
    borderColor: 'rgba(255,255,255,0.14)',
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  cardDateGroup: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  cardDayName:   { fontSize: 15, fontWeight: '700', color: C.textSub, letterSpacing: 0.1 },
  cardDayNameDone:  { color: C.success },
  cardDayNameToday: { color: C.accent },
  cardDayNameRest:  { color: C.textFaint },
  cardDateLabel:    { fontSize: 13, fontWeight: '400', color: C.textMuted },
  cardDateLabelRest:{ color: C.textFaint },

  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Status badges
  doneBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: C.successDim, borderWidth: 1, borderColor: C.successBorder },
  doneBadgeTxt: { fontSize: 15, fontWeight: '700', color: C.success },
  todayBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: C.accentDim },
  todayBadgeTxt:{ fontSize: 10, fontWeight: '700', color: C.accent },
  restLbl:      { fontSize: 11, color: C.rest, fontWeight: '500' },
  restInlineLbl:{ fontSize: 12, color: C.textFaint, fontWeight: '400' },
  exCntBadge:   { fontSize: 11, color: C.textMuted, fontWeight: '500' },

  // Rest toggle
  restToggle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  restToggleTxt:    { fontSize: 14 },
  restToggleActive: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.accentDim,
    borderWidth: 1, borderColor: C.accentBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  restToggleActiveTxt: { fontSize: 16, fontWeight: '400', color: C.accent, lineHeight: 20 },

  dayCheckbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  dayCheckboxDone: {
    borderColor: C.success,
    backgroundColor: C.successDim,
  },
  dayCheckboxTick: { fontSize: 12, fontWeight: '700', color: C.success, lineHeight: 14 },

  chevron:     { fontSize: 16, color: 'rgba(255,255,255,0.4)', lineHeight: 20 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },

  // Rest body
  restBody: {
    paddingHorizontal: 14, paddingBottom: 14,
  },
  restBodyTxt: { fontSize: 12, color: C.textFaint, fontStyle: 'italic' },

  // ── Exercise section ──────────────────────────────────────────────────────
  exSection: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    marginHorizontal: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  exRows:  { gap: 6 },
  exEmpty: { fontSize: 12, color: C.textFaint, fontStyle: 'italic', paddingVertical: 8 },
  exEditableWrap: {},
  exEditBtn: {
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: C.border,
  },
  exEditBtnTxt: { fontSize: 11, fontWeight: '700', color: C.textMuted },

  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 16, paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  exRowDone: { backgroundColor: 'rgba(0,245,160,0.05)', borderColor: 'rgba(0,245,160,0.14)' },
  exInfo:    { flex: 1 },
  exName:    { fontSize: 15, fontWeight: '600', color: C.textSub, marginBottom: 3 },
  exNameDone:{ color: C.success },
  exMeta:    { fontSize: 12, color: C.textFaint },

  // Swipeable row
  swipeRowWrap: { overflow: 'hidden', borderRadius: 10 },
  swipeHintRight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.successDim, borderRadius: 10,
    justifyContent: 'center', paddingLeft: 16,
  },
  swipeHintRightTxt: { fontSize: 11, fontWeight: '700', color: C.success },
  swipeHintLeft: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.dangerDim, borderRadius: 10,
    justifyContent: 'center', alignItems: 'flex-end', paddingRight: 16,
  },
  swipeHintLeftTxt: { fontSize: 11, fontWeight: '700', color: C.danger },

  checkbox: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn:  { backgroundColor: C.success, borderColor: C.success },
  checkMark:   { fontSize: 12, fontWeight: '900', color: C.bg },

  dayActions: {
    flexDirection: 'row', gap: 6, marginTop: 12,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border,
  },
  actBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 9,
    backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accentBorder,
    alignItems: 'center',
  },
  actBtnTxt:       { fontSize: 11, fontWeight: '700', color: C.accent },
  actBtnRest:      { backgroundColor: 'rgba(58,63,92,0.3)', borderColor: 'rgba(58,63,92,0.5)', flex: 0, paddingHorizontal: 14 },
  actBtnRestTxt:   { color: C.textMuted },
  actBtnDanger:    { backgroundColor: C.dangerDim, borderColor: 'rgba(255,107,107,0.2)', flex: 0, paddingHorizontal: 12 },
  actBtnDangerTxt: { color: C.danger },

  // ── Day picker (inside template modal) ────────────────────────────────────
  weekPickerRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2,
  },
  weekChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  weekChipSelected: { backgroundColor: C.accentDim, borderColor: C.accentBorder },
  weekChipText: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  weekChipTextSelected: { color: C.accent },
  dayPickerRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  dayChip: {
    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)',
  },
  dayChipSelected:  { backgroundColor: C.accentDim, borderColor: C.accentBorder },
  dayChipRest:      { borderColor: 'rgba(58,63,92,0.8)', backgroundColor: 'rgba(58,63,92,0.22)' },
  dayChipDay:       { fontSize: 11, fontWeight: '700', color: C.textMuted, marginBottom: 2 },
  dayChipDaySelected: { color: C.accent },
  dayChipDayRest:   { color: C.textMuted },
  dayChipDate:      { fontSize: 10, fontWeight: '400', color: C.textFaint },
  dayChipDateSelected: { color: C.textSub },

  // ── Template modal ─────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' },
  editSheet: {
    backgroundColor: '#0C1026',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderColor: C.accentBorder,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 14,
  },
  editTitle: { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  editRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLbl: { fontSize: 12, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },
  editStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  editStepBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accentBorder,
  },
  editStepTxt: { fontSize: 16, fontWeight: '800', color: C.accent, lineHeight: 20 },
  editValue: { fontSize: 14, fontWeight: '700', color: C.textSub, minWidth: 22, textAlign: 'center' },
  repRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  repChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  repChipActive: { borderColor: C.accentBorder, backgroundColor: C.accentDim },
  repChipTxt: { fontSize: 12, fontWeight: '600', color: C.textMuted },
  repChipTxtActive: { color: C.accent },
  saveEditBtn: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: 'center',
  },
  saveEditTxt: { fontSize: 13, fontWeight: '800', color: C.text, letterSpacing: 0.2 },
  modalSheet: {
    backgroundColor: '#0C1026',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1.5, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: C.accentBorder,
    maxHeight: '85%',
    flex: 0,
  },
  sheetTemplateScroll: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  sheetHandle: {
    alignSelf: 'center', width: 34, height: 4,
    borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 10, marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 2,
  },
  sheetTitle:    { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  sheetSub:      { fontSize: 12, color: C.textMuted, marginTop: 3 },
  sheetCloseBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetCloseTxt: { fontSize: 12, color: C.textMuted, fontWeight: '700' },

  // ── Empty / no plan ────────────────────────────────────────────────────────
  warnCard: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,196,66,0.25)',
    backgroundColor: C.warnDim, padding: 14,
  },
  warnTitle: { fontSize: 12, fontWeight: '700', color: C.warn, marginBottom: 6 },
  warnBody:  { fontSize: 12, color: C.textSub, lineHeight: 18 },
  emptyState:{ marginHorizontal: 16, marginTop: 48, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle:{ fontSize: 19, fontWeight: '800', color: C.text, marginBottom: 8, letterSpacing: -0.3 },
  emptyBody: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 28, paddingHorizontal: 20 },
  startBtn: {
    paddingVertical: 14, paddingHorizontal: 38,
    backgroundColor: C.accent, borderRadius: 14,
    shadowColor: C.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
  },
  startBtnTxt: { fontSize: 15, fontWeight: '800', color: C.text, letterSpacing: 0.4 },

  // ── Consecutive day ─────────────────────────────────────────────────────────
  completionBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,245,160,0.07)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,245,160,0.2)',
    padding: 12, marginBottom: 12,
  },
  completionBannerIcon: { fontSize: 22, color: C.success },
  completionBannerText: { fontSize: 14, fontWeight: '700', color: C.success, marginBottom: 2 },
  completionBannerSub:  { fontSize: 11, color: C.textMuted },

  nextUpBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accentBorder },
  nextUpBadgeTxt: { fontSize: 10, fontWeight: '700', color: C.accent },

  dayCardNextUp: {
    borderColor: C.accentBorder,
    backgroundColor: 'rgba(108,99,255,0.05)',
  },
});
