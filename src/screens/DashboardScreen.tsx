import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  PhasePlan,
  WorkoutSessionEntry,
  WorkoutSessionExercise,
  MuscleGroup,
} from '../types/domain';
import { useHomeScreenData } from '../hooks/useHomeScreenData';
import { useWorkoutSessions } from '../hooks/useWorkoutSessions';
import { useFabAction } from '../contexts/FabActionContext';
import { useScreenAnimation } from '../hooks/useScreenAnimation';
import { Calendar } from 'react-native-calendars';
import { getBodyPartLabel } from '../utils';
import { addDays, formatLocalDateYMD, parseYMDToDate } from '../utils/date';
import { type AdaptationMode } from '../services/planningRules';
import { PLAN_INPUT_LABELS, getMissingPlanInputs } from '../utils/planReadiness';
import { runLayoutAnimation } from '../utils/layoutAnimation';
import { PlansScreen } from './PlansScreen';

// Constants
const CARD_GRADIENT_DEFAULT = ['rgba(30, 35, 64, 0.8)', 'rgba(21, 25, 50, 0.6)'] as const;
const BACKGROUND_GRADIENT = ['#0A0E27', '#151932', '#1E2340'] as const;

const COLORS = {
  bgPrimary: '#0A0E27',
  textPrimary: '#FFFFFF',
  textMuted: '#8B93B0',
  textSecondary: '#C7CCE6',
  accent: '#6C63FF',
  accentDark: '#4C3BFF',
  success: '#00F5A0',
  successGlow: 'rgba(0, 245, 160, 0.4)',
  border: 'rgba(108, 99, 255, 0.2)',
  borderLight: 'rgba(108, 99, 255, 0.15)',
  overlay: 'rgba(255, 255, 255, 0.08)',
  overlayLight: 'rgba(255, 255, 255, 0.25)',
} as const;

const ACTIVITY_TOTAL_DAYS_FALLBACK = 182;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ACTIVITY_SECTION_HEIGHT = Math.min(320, Math.max(240, Math.round(SCREEN_HEIGHT * 0.20)));

const KNOWN_BODY_PARTS = new Set(['chest', 'back', 'legs', 'shoulders', 'arms', 'core']);
const TEMPLATE_PLACEHOLDERS = [
  { id: 'tmpl-upper', title: 'Upper Body Power', meta: '45-55 min • Strength' },
  { id: 'tmpl-lower', title: 'Lower Body Builder', meta: '40-50 min • Hypertrophy' },
  { id: 'tmpl-full', title: 'Full Body Express', meta: '30-40 min • Conditioning' },
] as const;

// Animation configurations
const ANIMATION_CONFIG = {
  headerFade: {
    duration: 600,
    easing: Easing.out(Easing.cubic),
  },
  spring: {
    tension: 200,
    friction: 10,
  },
  springLight: {
    tension: 100,
    friction: 5,
  },
  springMedium: {
    tension: 100,
    friction: 10,
  },
  pulse: {
    delay: 2000,
    scale: 1.05,
  },
  checkboxPulse: {
    scale: 1.3,
  },
  exerciseCard: {
    scale: 0.97,
  },
} as const;

// Calendar theme configuration
const getCalendarTheme = () => ({
  calendarBackground: 'transparent',
  monthTextColor: COLORS.textPrimary,
  textSectionTitleColor: COLORS.textMuted,
  dayTextColor: COLORS.textSecondary,
  textDisabledColor: 'rgba(255,255,255,0.15)',
  arrowColor: COLORS.accent,
  todayTextColor: COLORS.textPrimary,
  textDayFontSize: 9,
  textMonthFontSize: 11,
  textDayHeaderFontSize: 7,
  'stylesheet.day.basic': {
    base: {
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
  },
  'stylesheet.calendar.main': {
    week: {
      marginTop: 1,
      marginBottom: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
  },
} as any);

// Helper functions
const formatBodyPartList = (parts: MuscleGroup[]): string => {
  if (!parts.length) return 'Full Body';
  return parts
    .map((part) => {
      const key = part.toLowerCase();
      return KNOWN_BODY_PARTS.has(key) ? getBodyPartLabel(key as any) : part;
    })
    .join(' • ');
};

const getGreetingMessage = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const getCalendarDateStyles = (
  isComplete: boolean,
  isToday: boolean,
  hasPlannedWorkout: boolean
) => {
  let backgroundColor: string;
  let borderColor: string = 'transparent';
  let shadowOpacity: number = 0;

  if (isComplete) {
    backgroundColor = COLORS.success;
    shadowOpacity = 0.4;
  } else if (isToday) {
    backgroundColor = 'rgba(108, 99, 255, 0.3)';
    borderColor = COLORS.accent;
  } else if (hasPlannedWorkout) {
    backgroundColor = 'rgba(255,255,255,0.2)';
  } else {
    backgroundColor = COLORS.overlay;
  }
  
  return {
    container: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor,
      borderWidth: isToday && !isComplete ? 2 : 0,
      borderColor,
      shadowColor: isComplete ? COLORS.success : 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity,
      shadowRadius: 6,
    },
    text: {
      color: isComplete ? COLORS.bgPrimary : COLORS.textPrimary,
      fontWeight: isComplete ? '700' : isToday ? '600' : '500',
      fontSize: 10,
    },
  };
};

type AdaptationInsight = {
  mode: AdaptationMode;
  sessionRate: number;
  exerciseRate: number;
  trackedSessions: number;
};

const deriveAdaptationInsight = (
  sessions: WorkoutSessionEntry[],
  todayKey: string
): AdaptationInsight | null => {
  const recent = sessions.filter((session) => {
    if (!session.date) return false;
    if (session.date >= todayKey) return false;
    const now = parseYMDToDate(todayKey).getTime();
    const sessionTs = parseYMDToDate(session.date).getTime();
    return now - sessionTs <= 27 * 86400000;
  });
  if (recent.length < 6) return null;

  const completedSessions = recent.filter((session) => {
    if (session.completed !== undefined) return !!session.completed;
    if (!session.exercises.length) return false;
    return session.exercises.every((exercise) => exercise.completed === true);
  });
  const trackedSessions = recent.filter((session) => {
    if (session.completed) return true;
    return session.exercises.some((exercise) => exercise.completed === true);
  }).length;
  if (trackedSessions < 3) return null;

  const totalExercises = recent.reduce((sum, session) => sum + session.exercises.length, 0);
  const completedExercises = recent.reduce(
    (sum, session) =>
      sum + session.exercises.filter((exercise) => exercise.completed === true).length,
    0
  );
  const sessionRate = completedSessions.length / recent.length;
  const exerciseRate = totalExercises > 0 ? completedExercises / totalExercises : sessionRate;

  if (sessionRate >= 0.75 && exerciseRate >= 0.85) {
    return { mode: 'progressive', sessionRate, exerciseRate, trackedSessions };
  }
  if (sessionRate <= 0.45 && exerciseRate <= 0.6) {
    return { mode: 'recovery', sessionRate, exerciseRate, trackedSessions };
  }
  return { mode: 'balanced', sessionRate, exerciseRate, trackedSessions };
};

const getAdaptationCopy = (insight: AdaptationInsight) => {
  const completionText = `${Math.round(insight.sessionRate * 100)}% sessions, ${Math.round(
    insight.exerciseRate * 100
  )}% exercises completed`;
  if (insight.mode === 'progressive') {
    return {
      title: 'Progressive Week',
      text: `${completionText}. Great adherence detected; volume may increase slightly.`,
    };
  }
  if (insight.mode === 'recovery') {
    return {
      title: 'Recovery Week',
      text: `${completionText}. Lower adherence detected; volume may scale down to improve consistency.`,
    };
  }
  return {
    title: 'Balanced Week',
    text: `${completionText}. Steady adherence detected; volume is kept stable.`,
  };
};

type DashboardScreenProps = {
  user: User;
  phase: PhasePlan | null;
  workoutSessions: WorkoutSessionEntry[];
  onProfilePress?: () => void;
  onStartPhase?: () => void;
  onToggleWorkoutExercise?: (date: string, exerciseName: string) => void;
  onCreateSession?: (date: string) => void;
  onSaveCustomSession?: (date: string, exercises: WorkoutSessionExercise[]) => void;
  onDeleteSession?: (date: string) => void;
  onAddExercise?: (sessionId: string, exercise: WorkoutSessionExercise) => Promise<string | void>;
  onDeleteExercise?: (sessionId: string, sessionExerciseId: string) => Promise<void>;
};

const EMPTY_EXERCISES: WorkoutSessionEntry['exercises'] = [];

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  user,
  phase,
  workoutSessions,
  onProfilePress,
  onStartPhase,
  onToggleWorkoutExercise,
  onCreateSession: _onCreateSession,
  onSaveCustomSession,
  onDeleteSession,
  onAddExercise,
  onDeleteExercise,
}) => {
  const { setFabAction } = useFabAction();
  const { headerStyle, contentStyle } = useScreenAnimation();
  const { data: homeData, isLoading: isHomeLoading } = useHomeScreenData(user.id);
  const derivedPhaseId = phase?.id ?? homeData?.phase?.id;
  const { sessions: phaseSessions, isLoading: isSessionsLoading } = useWorkoutSessions(
    user.id,
    derivedPhaseId
  );
  const [localCompletionOverrides, setLocalCompletionOverrides] = useState<Record<string, boolean>>(
    {}
  );
  const [workoutSetProgress, setWorkoutSetProgress] = useState<
    Record<string, { completedSets: number; rpe: number | null }>
  >({});
  const [expandedExerciseKey, setExpandedExerciseKey] = useState<string | null>(null);
  const [activeRestKey, setActiveRestKey] = useState<string | null>(null);
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [exercisePickerNonce, setExercisePickerNonce] = useState(0);
  const [orderUpdateTrigger, setOrderUpdateTrigger] = useState(0);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [calendarCardWidth, setCalendarCardWidth] = useState(
    Dimensions.get('window').width - 40
  );
  const [dashboardTab, setDashboardTab] = useState<'plans' | 'templates'>('plans');
  const pendingToggleRef = useRef<Map<string, { name: string; count: number }>>(new Map());
  const toggleFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 🎨 Animation values
  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const activityCardSlideAnim = useRef(new Animated.Value(50)).current;
  const exerciseCardAnims = useRef<Map<string, Animated.Value>>(new Map()).current;
  const checkboxPulseAnim = useRef(new Animated.Value(1)).current;
  const createButtonPulse = useRef(new Animated.Value(1)).current;
  const calendarExpandAnim = useRef(new Animated.Value(0)).current;
  const pendingOrderRef = useRef<string[]>([]);
  const completedOrderRef = useRef<string[]>([]);
  
  // Track if calendar should be mounted (for smooth animation)
  const [shouldMountCalendar, setShouldMountCalendar] = useState(false);
  
  const resolvedPhase = phase ?? homeData?.phase ?? null;
  const hasActivePlan = resolvedPhase?.status === 'active';
  const resolvedSessions = useMemo(() => {
    const fallbackSessions = phaseSessions.length
      ? phaseSessions
      : homeData?.recentSessions ?? [];
    const preferredSessions = workoutSessions.length ? workoutSessions : fallbackSessions;
    if (!derivedPhaseId) return preferredSessions;
    return preferredSessions.filter((session) => session.phasePlanId === derivedPhaseId);
  }, [derivedPhaseId, homeData?.recentSessions, phaseSessions, workoutSessions]);

  const today = new Date();
  const todayStr = formatLocalDateYMD(today);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const selectedSession =
    resolvedSessions.find((session) => session.date === selectedDate) || null;

  const displayExercises = selectedSession?.exercises ?? EMPTY_EXERCISES;
  const getExerciseKey = (exercise: WorkoutSessionEntry['exercises'][number]) => {
    if (exercise.id) return exercise.id;
    if (exercise.exerciseId && exercise.displayOrder !== undefined && exercise.displayOrder !== null) {
      return `${exercise.exerciseId}-${exercise.displayOrder}`;
    }
    if (exercise.exerciseId) return exercise.exerciseId;
    const orderSuffix = exercise.displayOrder ?? '';
    const parts = [
      exercise.name,
      orderSuffix,
      exercise.sets ?? '',
      exercise.reps ?? '',
      exercise.movementPattern ?? '',
    ];
    return parts.filter(Boolean).join('-');
  };

  useEffect(() => {
    setLocalCompletionOverrides({});
    pendingToggleRef.current.clear();
    if (toggleFlushTimeoutRef.current) {
      clearTimeout(toggleFlushTimeoutRef.current);
      toggleFlushTimeoutRef.current = null;
    }
    if (orderUpdateTimeoutRef.current) {
      clearTimeout(orderUpdateTimeoutRef.current);
      orderUpdateTimeoutRef.current = null;
    }
  }, [selectedSession?.id]);

  useEffect(() => {
    if (!activeRestKey || restSecondsLeft <= 0) return;
    const timer = setInterval(() => {
      setRestSecondsLeft((prev) => {
        if (prev <= 1) {
          setActiveRestKey(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeRestKey, restSecondsLeft]);

  const isExerciseMarked = useCallback(
    (exercise: WorkoutSessionEntry['exercises'][number]) => {
      const key = getExerciseKey(exercise);
      const override = localCompletionOverrides[key];
      return override ?? exercise.completed;
    },
    [localCompletionOverrides]
  );

  useEffect(() => {
    const next: Record<string, { completedSets: number; rpe: number | null }> = {};
    displayExercises.forEach((exercise) => {
      const key = getExerciseKey(exercise);
      const targetSets = Math.max(1, exercise.sets ?? 3);
      next[key] = {
        completedSets: isExerciseMarked(exercise) ? targetSets : 0,
        rpe: null,
      };
    });
    setWorkoutSetProgress(next);
    setExpandedExerciseKey(null);
    setActiveRestKey(null);
    setRestSecondsLeft(0);
  }, [displayExercises, isExerciseMarked]);

  useEffect(() => {
    const nextKeys = displayExercises.map((exercise) => getExerciseKey(exercise));
    const nextSet = new Set(nextKeys);
    const pending = pendingOrderRef.current.filter((key) => nextSet.has(key));
    const completed = completedOrderRef.current.filter((key) => nextSet.has(key));
    const seen = new Set([...pending, ...completed]);

    displayExercises.forEach((exercise) => {
      const key = getExerciseKey(exercise);
      if (seen.has(key)) return;
      if (isExerciseMarked(exercise)) {
        completed.push(key);
      } else {
        pending.push(key);
      }
      seen.add(key);
    });

    pendingOrderRef.current = pending;
    completedOrderRef.current = completed;
  }, [displayExercises, isExerciseMarked]);

  const sortedWorkoutCards = useMemo(() => {
    const byKey = new Map(displayExercises.map((exercise) => [getExerciseKey(exercise), exercise]));
    const pending: typeof displayExercises = [];
    const completed: typeof displayExercises = [];
    pendingOrderRef.current.forEach((key) => {
      const exercise = byKey.get(key);
      if (!exercise) return;
      pending.push(exercise);
    });
    completedOrderRef.current.forEach((key) => {
      const exercise = byKey.get(key);
      if (!exercise) return;
      completed.push(exercise);
    });
    return [...pending, ...completed];
  }, [displayExercises, isExerciseMarked, orderUpdateTrigger]);

  const selectedSessionComplete = useMemo(() => {
    if (!displayExercises.length) return false;
    return displayExercises.every((exercise) => isExerciseMarked(exercise));
  }, [displayExercises, isExerciseMarked]);
  
  const hasSyncedWorkout = displayExercises.length > 0;
  const greetingMessage = getGreetingMessage();
  const displayName = user.name?.trim() || 'Athlete';
  const avatarLabel = displayName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const avatarUrl = user.avatarUrl;

  const completedSessionsByDate = useMemo(() => {
    const map = new Map<string, number>();
    const isSessionCompleted = (session: WorkoutSessionEntry) => {
      const sessionComplete = (session as WorkoutSessionEntry & { complete?: boolean }).complete;
      if (sessionComplete !== undefined) return sessionComplete;
      if (session.completed !== undefined) return session.completed;
      if (!session.exercises?.length) return false;
      return session.exercises.every(
        (exercise) =>
          (exercise as typeof exercise & { complete?: boolean }).complete ?? exercise.completed
      );
    };
    resolvedSessions.forEach((session) => {
      if (!session.date) return;
      if (!isSessionCompleted(session)) return;
      const key = session.date;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [resolvedSessions]);

  const activityRange = useMemo(() => {
    const startValue = resolvedPhase?.startDate;
    const endValue = resolvedPhase?.expectedEndDate;
    const startDate = startValue ? parseYMDToDate(startValue) : null;
    const endDate = endValue ? parseYMDToDate(endValue) : null;
    const isValidRange =
      !!startDate &&
      !!endDate &&
      !Number.isNaN(startDate.getTime()) &&
      !Number.isNaN(endDate.getTime()) &&
      endDate.getTime() >= startDate.getTime();
    if (!isValidRange) {
      const paddedDays = Math.max(7, Math.ceil(ACTIVITY_TOTAL_DAYS_FALLBACK / 7) * 7);
      return {
        startDate: null,
        totalDays: ACTIVITY_TOTAL_DAYS_FALLBACK,
        paddedDays,
        usePhaseRange: false,
      };
    }
    const diffMs = endDate.getTime() - startDate.getTime();
    const totalDays = Math.max(1, Math.floor(diffMs / 86400000) + 1);
    const paddedDays = Math.max(7, Math.ceil(totalDays / 7) * 7);
    return { startDate, totalDays, paddedDays, usePhaseRange: true };
  }, [resolvedPhase?.expectedEndDate, resolvedPhase?.startDate]);

  const calendarRange = useMemo(() => {
    if (!activityRange.usePhaseRange || !activityRange.startDate) return null;
    const startDate = activityRange.startDate;
    const endDate = addDays(startDate, activityRange.totalDays - 1);
    const startKey = formatLocalDateYMD(startDate);
    const endKey = formatLocalDateYMD(endDate);
    let currentKey = todayStr;
    if (currentKey < startKey) currentKey = startKey;
    if (currentKey > endKey) currentKey = endKey;
    return { startDate, endDate, startKey, endKey, currentKey };
  }, [activityRange, todayStr]);

  const phaseDates = useMemo(() => {
    if (!calendarRange) return [];
    const dates: string[] = [];
    for (let i = 0; i < activityRange.totalDays; i += 1) {
      dates.push(formatLocalDateYMD(addDays(calendarRange.startDate, i)));
    }
    return dates;
  }, [activityRange.totalDays, calendarRange]);

  const calendarMarkedDates = useMemo(() => {
    if (!calendarRange) return {};
    const marks: Record<string, { customStyles: { container: object; text: object } }> = {};
    const sessionDates = new Set(resolvedSessions.map((session) => session.date).filter(Boolean));
    phaseDates.forEach((dateKey) => {
      const serverComplete = (completedSessionsByDate.get(dateKey) || 0) > 0;
      const isComplete =
        dateKey === selectedDate && displayExercises.length
          ? selectedSessionComplete
          : serverComplete;
      const isToday = dateKey === todayStr;
      const hasPlannedWorkout = sessionDates.has(dateKey);
      marks[dateKey] = {
        customStyles: getCalendarDateStyles(isComplete, isToday, hasPlannedWorkout),
      };
    });
    return marks;
  }, [
    calendarRange,
    completedSessionsByDate,
    displayExercises.length,
    phaseDates,
    resolvedSessions,
    selectedDate,
    selectedSessionComplete,
    todayStr,
  ]);

  // Week view data
  const weekDates = useMemo(() => {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(startOfWeek, i);
      return {
        date,
        dateKey: formatLocalDateYMD(date),
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
        dayNumber: date.getDate(),
      };
    });
  }, [today]);

  const visibleWeekDates = useMemo(() => weekDates, [weekDates]);

  const canLogWorkouts = hasActivePlan && !!onToggleWorkoutExercise;
  const adaptationInsight = useMemo(
    () => deriveAdaptationInsight(resolvedSessions, todayStr),
    [resolvedSessions, todayStr]
  );
  const adaptationCopy = adaptationInsight ? getAdaptationCopy(adaptationInsight) : null;

  const shouldCreatePlan = !hasActivePlan && !!onStartPhase;
  const missingPlanInputs = useMemo(() => getMissingPlanInputs(user), [user]);
  const planContextText = useMemo(() => {
    const goalRaw = user?.planPreferences?.primaryGoal ?? resolvedPhase?.goalType;
    const days = user?.planPreferences?.daysPerWeek;
    if (!goalRaw && !days) return null;
    const goal = goalRaw ? String(goalRaw).toLowerCase() : null;
    const goalLabel =
      goal === 'build_muscle' || goal === 'hypertrophy' || goal === 'muscle'
        ? 'Hypertrophy'
        : goal === 'get_stronger' || goal === 'strength'
          ? 'Strength'
          : goal === 'lose_fat' || goal === 'fat_loss' || goal === 'cut'
            ? 'Fat Loss'
            : goal === 'endurance'
              ? 'Endurance'
              : goal === 'general_fitness' || goal === 'general' || goal === 'maintenance'
                ? 'Maintenance'
                : null;
    if (goalLabel && days) return `${goalLabel} • ${days} days/week`;
    return goalLabel ?? (days ? `${days} days/week` : null);
  }, [resolvedPhase?.goalType, user?.planPreferences?.daysPerWeek, user?.planPreferences?.primaryGoal]);

  const sessionMetaLine = useMemo(() => {
    if (!displayExercises.length && !planContextText) return null;
    const estimatedMinutes = displayExercises.length
      ? Math.max(20, displayExercises.length * 8)
      : null;
    if (!planContextText) {
      return estimatedMinutes ? `~${estimatedMinutes} min` : null;
    }
    return estimatedMinutes ? `${planContextText} · ~${estimatedMinutes} min` : planContextText;
  }, [displayExercises.length, planContextText]);

  // FAB Action configuration
  const getFabActionConfig = useCallback(() => {
    const baseConfig = {
      colors: [COLORS.accent, COLORS.accentDark] as const,
      iconColor: COLORS.bgPrimary,
      labelColor: COLORS.accent,
    };

    if (shouldCreatePlan) {
      return {
        ...baseConfig,
        label: 'Create Plan',
        icon: '+',
        onPress: onStartPhase!,
      };
    }
    if (hasActivePlan) {
      return {
        ...baseConfig,
        label: 'Workout',
        icon: '+',
        onPress: () => setExercisePickerNonce((prev) => prev + 1),
      };
    }
    return null;
  }, [
    shouldCreatePlan,
    onStartPhase,
    hasActivePlan,
    sortedWorkoutCards,
  ]);

  useEffect(() => {
    const config = getFabActionConfig();
    setFabAction('Home', config);
    return () => setFabAction('Home', null);
  }, [getFabActionConfig, setFabAction]);

  const getExerciseCardAnimation = (key: string) => {
    if (!exerciseCardAnims.has(key)) {
      const anim = new Animated.Value(1);
      exerciseCardAnims.set(key, anim);
    }
    return exerciseCardAnims.get(key)!;
  };

  const animateExerciseCompletion = (key: string) => {
    const scaleAnim = getExerciseCardAnimation(key);
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: ANIMATION_CONFIG.exerciseCard.scale,
        ...ANIMATION_CONFIG.spring,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        ...ANIMATION_CONFIG.spring,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Header entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFadeAnim, {
        toValue: 1,
        ...ANIMATION_CONFIG.headerFade,
        useNativeDriver: true,
      }),
      Animated.spring(activityCardSlideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Calendar expand/collapse animation
  useEffect(() => {
    const animation = Animated.timing(calendarExpandAnim, {
      toValue: calendarExpanded ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished && !calendarExpanded) {
        setShouldMountCalendar(false);
      }
    });

    return () => {
      animation.stop();
    };
  }, [calendarExpanded, calendarExpandAnim]);

  useEffect(() => {
    if (calendarExpanded) {
      // Mount immediately when expanding
      setShouldMountCalendar(true);
    }
    // Note: unmounting is handled in animation completion callback above
  }, [calendarExpanded]);

  // Create button pulse animation
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(ANIMATION_CONFIG.pulse.delay),
        Animated.spring(createButtonPulse, {
          toValue: ANIMATION_CONFIG.pulse.scale,
          ...ANIMATION_CONFIG.springLight,
          useNativeDriver: true,
        }),
        Animated.spring(createButtonPulse, {
          toValue: 1,
          ...ANIMATION_CONFIG.springLight,
          useNativeDriver: true,
        }),
      ])
    );
    
    if (!hasActivePlan) {
      pulseLoop.start();
    }
    
    return () => pulseLoop.stop();
  }, [hasActivePlan]);

  const flushPendingToggles = useCallback(async () => {
    if (toggleFlushTimeoutRef.current) {
      clearTimeout(toggleFlushTimeoutRef.current);
      toggleFlushTimeoutRef.current = null;
    }
    if (!onToggleWorkoutExercise) return;
    const pending = pendingToggleRef.current;
    if (!pending.size) return;
    const entries = Array.from(pending.entries());
    pending.clear();
    await Promise.all(
      entries
        .filter(([, payload]) => payload.count % 2 === 1)
        .map(([, payload]) => onToggleWorkoutExercise(selectedDate, payload.name))
    );
  }, [onToggleWorkoutExercise, selectedDate]);

  const handleToggleExercise = (exercise: WorkoutSessionEntry['exercises'][number]) => {
    if (!canLogWorkouts) return;
    const key = getExerciseKey(exercise);
    
    setLocalCompletionOverrides((prev) => {
      const current = prev[key] ?? exercise.completed;
      const nextValue = !current;
      if (nextValue) {
        if (orderUpdateTimeoutRef.current) {
          clearTimeout(orderUpdateTimeoutRef.current);
        }
        orderUpdateTimeoutRef.current = setTimeout(() => {
          pendingOrderRef.current = pendingOrderRef.current.filter((entry) => entry !== key);
          if (!completedOrderRef.current.includes(key)) {
            completedOrderRef.current.push(key);
          }
          setOrderUpdateTrigger((prev) => prev + 1);
        }, 600);
      } else {
        if (orderUpdateTimeoutRef.current) {
          clearTimeout(orderUpdateTimeoutRef.current);
          orderUpdateTimeoutRef.current = null;
        }
        completedOrderRef.current = completedOrderRef.current.filter((entry) => entry !== key);
        if (!pendingOrderRef.current.includes(key)) {
          pendingOrderRef.current.push(key);
        }
        setOrderUpdateTrigger((prev) => prev + 1);
      }
      
      if (nextValue === exercise.completed) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: nextValue };
    });

    const pending = pendingToggleRef.current;
    const entry = pending.get(key);
    pending.set(key, {
      name: exercise.name,
      count: (entry?.count ?? 0) + 1,
    });
    if (toggleFlushTimeoutRef.current) {
      clearTimeout(toggleFlushTimeoutRef.current);
    }
    toggleFlushTimeoutRef.current = setTimeout(() => {
      void flushPendingToggles();
    }, 700);
  };

  const handleToggleExerciseAnimated = (exercise: WorkoutSessionEntry['exercises'][number]) => {
    const key = `${selectedDate}-${getExerciseKey(exercise)}`;
    animateExerciseCompletion(key);

    Animated.sequence([
      Animated.spring(checkboxPulseAnim, {
        toValue: ANIMATION_CONFIG.checkboxPulse.scale,
        ...ANIMATION_CONFIG.spring,
        useNativeDriver: true,
      }),
      Animated.spring(checkboxPulseAnim, {
        toValue: 1,
        ...ANIMATION_CONFIG.spring,
        useNativeDriver: true,
      }),
    ]).start();
    
    handleToggleExercise(exercise);
  };

  const updateExerciseSets = (exerciseKey: string, targetSets: number, delta: 1 | -1) => {
    setWorkoutSetProgress((prev) => {
      const current = prev[exerciseKey] ?? { completedSets: 0, rpe: null };
      const completedSets = Math.max(0, Math.min(targetSets, current.completedSets + delta));
      return {
        ...prev,
        [exerciseKey]: { ...current, completedSets },
      };
    });
  };

  const updateExerciseRpe = (exerciseKey: string, delta: 0.5 | -0.5) => {
    setWorkoutSetProgress((prev) => {
      const current = prev[exerciseKey] ?? { completedSets: 0, rpe: null };
      const base = current.rpe ?? 7;
      const next = Math.max(1, Math.min(10, base + delta));
      return {
        ...prev,
        [exerciseKey]: { ...current, rpe: next },
      };
    });
  };

  const startRestTimerFor = (exerciseKey: string, seconds = 90) => {
    setActiveRestKey(exerciseKey);
    setRestSecondsLeft(seconds);
  };

  const formatRest = (seconds: number) => {
    const mm = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const ss = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${mm}:${ss}`;
  };

  useEffect(() => {
    return () => {
      void flushPendingToggles();
      if (orderUpdateTimeoutRef.current) {
        clearTimeout(orderUpdateTimeoutRef.current);
        orderUpdateTimeoutRef.current = null;
      }
    };
  }, [flushPendingToggles]);

  const weekDayWidth = Math.max(48, Math.floor((calendarCardWidth - 48) / 7) + 2);

  const renderWeekView = () => (
    <View style={styles.weekViewContainer}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekScrollContent}
      >
        {visibleWeekDates.map((day) => {
          const isComplete = (completedSessionsByDate.get(day.dateKey) || 0) > 0;
          const isToday = day.dateKey === todayStr;
          
          const isSelected = day.dateKey === selectedDate;
          const handleSelectDay = () => {
            handleSelectDate(day.dateKey);
          };
          return (
            <TouchableOpacity 
              key={day.dateKey} 
              style={[
                styles.weekDay,
                { width: weekDayWidth },
                isSelected && styles.weekDaySelected,
                isToday && styles.weekDayToday,
              ]}
              onPress={handleSelectDay}
            >
              <Text style={[styles.weekDayName, isToday && styles.weekDayNameToday]}>
                {day.dayName}
              </Text>
              <View style={[
                styles.weekDayNumber,
                isComplete && styles.weekDayNumberComplete,
                isToday && !isComplete && styles.weekDayNumberToday,
              ]}>
                <Text style={[
                  styles.weekDayNumberText,
                  isComplete && styles.weekDayNumberTextComplete,
                  isToday && !isComplete && styles.weekDayNumberTextToday,
                ]}>
                  {day.dayNumber}
                </Text>
              </View>
              {isComplete && (
                <View style={styles.weekDayIndicator} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      
      {null}
    </View>
  );



  const renderWorkoutsSection = () => {
    const mainContent = (
      <>
        {hasActivePlan && adaptationCopy ? (
          <View style={styles.adaptationCard}>
            <Text style={styles.adaptationTitle}>{adaptationCopy.title}</Text>
            <Text style={styles.adaptationText}>{adaptationCopy.text}</Text>
          </View>
        ) : null}
        {!hasActivePlan && missingPlanInputs.length > 0 ? (
          <View style={styles.checklistCard}>
            <Text style={styles.checklistTitle}>Missing inputs for plan generation</Text>
            <Text style={styles.checklistSubtitle}>
              Complete these profile fields to generate a personalized plan:
            </Text>
            <Text style={styles.checklistItems}>
              {missingPlanInputs.map((key) => `• ${PLAN_INPUT_LABELS[key]}`).join('\n')}
            </Text>
          </View>
        ) : null}
        {hasActivePlan && planContextText ? null : null}

        {dashboardTab === 'templates' ? (
          <View style={styles.templateList}>
            {TEMPLATE_PLACEHOLDERS.map((template) => (
              <LinearGradient
                key={template.id}
                colors={CARD_GRADIENT_DEFAULT}
                style={styles.templateCard}
              >
                <Text style={styles.templateTitle}>{template.title}</Text>
                <Text style={styles.templateMeta}>{template.meta}</Text>
                <TouchableOpacity style={styles.templateAction}>
                  <Text style={styles.templateActionText}>Use Template</Text>
                </TouchableOpacity>
              </LinearGradient>
            ))}
          </View>
        ) : null}

        {dashboardTab === 'plans' && !hasActivePlan && !isHomeLoading && !isSessionsLoading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>No active plan</Text>
            <Text style={styles.emptyText}>
              Create your personalized training plan to get started.
            </Text>
            
            {onStartPhase && (
              <Animated.View style={{ transform: [{ scale: createButtonPulse }] }}>
                <TouchableOpacity 
                  style={styles.createPlanButton} 
                  onPress={onStartPhase}
                >
                  <Text style={styles.createPlanButtonText}>Create Plan</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        ) : dashboardTab === 'plans' && hasActivePlan ? (
          <PlansScreen
            user={user}
            phase={phase}
            workoutSessions={workoutSessions}
            onSaveCustomSession={onSaveCustomSession}
            onDeleteSession={onDeleteSession}
            onAddExercise={onAddExercise}
            onDeleteExercise={onDeleteExercise}
            embedded
            openExercisePickerSignal={exercisePickerNonce}
            selectedDateOverride={selectedDate}
          />
        ) : dashboardTab === 'plans' && !hasSyncedWorkout ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>No workout scheduled</Text>
            <Text style={styles.emptyText}>
              Your workout for today will appear here once scheduled.
            </Text>
          </View>
        ) : dashboardTab === 'plans' ? (
          <View style={styles.verticalList}>
            {sortedWorkoutCards.map((exercise) => {
              const isMarked = isExerciseMarked(exercise);
              const cardKey = `${selectedDate}-${getExerciseKey(exercise)}`;
              const exerciseKey = getExerciseKey(exercise);
              const isExpanded = expandedExerciseKey === exerciseKey;
              const targetSets = Math.max(1, exercise.sets ?? 3);
              const scaleAnim = getExerciseCardAnimation(cardKey);
              
              return (
                <Animated.View
                  key={cardKey}
                  style={{
                    transform: [{ scale: scaleAnim }],
                  }}
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setExpandedExerciseKey((prev) => (prev === exerciseKey ? null : exerciseKey))}
                  >
                    <LinearGradient
                      colors={CARD_GRADIENT_DEFAULT}
                      style={[
                        styles.exerciseCard,
                        !canLogWorkouts && styles.exerciseCardDisabled,
                      ]}
                    >
                      <View style={styles.exerciseCardRow}>
                        <View style={styles.exerciseCardMain}>
                          <View style={styles.cardHeader}>
                            <Animated.View
                              style={{
                                transform: [{ scale: checkboxPulseAnim }],
                              }}
                            >
                              <TouchableOpacity
                                disabled={!canLogWorkouts}
                                onPress={() =>
                                  canLogWorkouts && handleToggleExerciseAnimated(exercise)
                                }
                              >
                                <View
                                  style={isMarked ? styles.checkCircleActive : styles.checkCircleInactive}
                                >
                                  {isMarked && <Text style={styles.checkCircleText}>✓</Text>}
                                </View>
                              </TouchableOpacity>
                            </Animated.View>
                            <View style={styles.exerciseHeaderText}>
                              <Text style={styles.exerciseName}>{exercise.name}</Text>
                              <Text style={styles.exerciseBodyParts}>
                                {formatBodyPartList(exercise.bodyParts)}
                              </Text>
                              <Text style={styles.exerciseMetaLine}>
                                {`${exercise.sets ?? '—'} sets • ${exercise.reps ?? '—'} reps`}
                              </Text>
                              {isExpanded ? (
                                <View style={styles.workoutControlRow}>
                                  <View style={styles.stepper}>
                                    <TouchableOpacity
                                      style={styles.stepperButton}
                                      onPress={() =>
                                        updateExerciseSets(exerciseKey, targetSets, -1)
                                      }
                                    >
                                      <Text style={styles.stepperButtonText}>−</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.stepperValue}>
                                      {`${workoutSetProgress[exerciseKey]?.completedSets ?? 0}/${targetSets} sets`}
                                    </Text>
                                    <TouchableOpacity
                                      style={styles.stepperButton}
                                      onPress={() =>
                                        updateExerciseSets(exerciseKey, targetSets, 1)
                                      }
                                    >
                                      <Text style={styles.stepperButtonText}>+</Text>
                                    </TouchableOpacity>
                                  </View>
                                  <View style={styles.stepper}>
                                    <TouchableOpacity
                                      style={styles.stepperButton}
                                      onPress={() => updateExerciseRpe(exerciseKey, -0.5)}
                                    >
                                      <Text style={styles.stepperButtonText}>−</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.stepperValue}>
                                      {`RPE ${workoutSetProgress[exerciseKey]?.rpe?.toFixed(1) ?? '—'}`}
                                    </Text>
                                    <TouchableOpacity
                                      style={styles.stepperButton}
                                      onPress={() => updateExerciseRpe(exerciseKey, 0.5)}
                                    >
                                      <Text style={styles.stepperButtonText}>+</Text>
                                    </TouchableOpacity>
                                  </View>
                                  <TouchableOpacity
                                    style={styles.restButton}
                                    onPress={() => startRestTimerFor(exerciseKey)}
                                  >
                                    <Text style={styles.restButtonText}>
                                      {activeRestKey === exerciseKey && restSecondsLeft > 0
                                        ? `Rest ${formatRest(restSecondsLeft)}`
                                        : 'Start Rest Timer'}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        ) : null}
      </>
    );

    return (
      <View style={styles.section}>
        <View style={styles.progressMainColumn}>{mainContent}</View>
      </View>
    );
  };

  const handleContentScrollBegin = useCallback(() => {
    if (!calendarExpanded) return;
    runLayoutAnimation();
    setCalendarExpanded(false);
  }, [calendarExpanded]);

  const handleSelectDate = useCallback(
    (dateKey: string) => {
      setSelectedDate(dateKey);
      if (!resolvedSessions.find((session) => session.date === dateKey)) {
        if (_onCreateSession) {
          _onCreateSession(dateKey);
        }
      }
      if (calendarExpanded) {
        runLayoutAnimation();
        setCalendarExpanded(false);
      }
    },
    [calendarExpanded, resolvedSessions, _onCreateSession]
  );

  const expandedCalendarHeight = Math.min(
    320,
    Math.max(190, Math.round(calendarCardWidth * 0.5) - 10)
  );
  const calendarHeight = calendarExpandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, expandedCalendarHeight],
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={BACKGROUND_GRADIENT} style={styles.gradient}>
        <Animated.View
          style={[
            styles.header,
            headerStyle,
            {
              opacity: headerFadeAnim,
              transform: [
                {
                  translateY: headerFadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greetingMessage},</Text>
            <Text style={styles.userName}>{displayName}</Text>
            {sessionMetaLine ? (
              <Text style={styles.sessionMetaLine}>{sessionMetaLine}</Text>
            ) : null}
          </View>
          {onProfilePress && (
            <TouchableOpacity style={styles.avatarButton} onPress={onProfilePress}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{avatarLabel || 'A'}</Text>
              )}
            </TouchableOpacity>
          )}
        </Animated.View>

        <Animated.View
          style={[
            styles.calendarSection,
            {
              opacity: headerFadeAnim,
              transform: [{ translateY: activityCardSlideAnim }],
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              if (calendarExpanded) return;
              runLayoutAnimation();
              setCalendarExpanded(true);
            }}
          >
          <LinearGradient
            colors={CARD_GRADIENT_DEFAULT}
            style={styles.calendarCard}
            onLayout={(event) => {
              const nextWidth = event.nativeEvent.layout.width;
              if (nextWidth && nextWidth !== calendarCardWidth) {
                setCalendarCardWidth(nextWidth);
              }
            }}
          >
            {renderWeekView()}
            <View
              style={[
                styles.calendarLegendRow,
                { paddingHorizontal: Math.max(0, (weekDayWidth - 8) / 2) },
              ]}
            >
              <View style={styles.calendarLegendItem}>
                <View style={[styles.calendarLegendDot, styles.calendarLegendDotComplete]} />
                <Text style={styles.calendarLegendText}>Completed</Text>
              </View>
              <View style={styles.calendarLegendItem}>
                <View style={[styles.calendarLegendDot, styles.calendarLegendDotToday]} />
                <Text style={styles.calendarLegendText}>Today</Text>
              </View>
              <View style={styles.calendarLegendItem}>
                <View style={[styles.calendarLegendDot, styles.calendarLegendDotPlanned]} />
                <Text style={styles.calendarLegendText}>Planned</Text>
              </View>
            </View>
            
            <Animated.View
              style={[
                styles.fullCalendarContainer,
                calendarExpanded && styles.fullCalendarContainerExpanded,
                { height: calendarHeight, opacity: calendarExpandAnim },
              ]}
              pointerEvents={calendarExpanded ? 'auto' : 'none'}
            >
              {shouldMountCalendar && calendarRange && (
                <Calendar
                  current={calendarRange.currentKey}
                  minDate={calendarRange.startKey}
                  maxDate={calendarRange.endKey}
                  enableSwipeMonths
                  markingType="custom"
                  markedDates={calendarMarkedDates}
                  hideExtraDays={false}
                  showSixWeeks
                  theme={getCalendarTheme()}
                  onDayPress={(day) => handleSelectDate(day.dateString)}
                  style={[styles.fullCalendar, { height: expandedCalendarHeight }]}
                />
              )}
            </Animated.View>
          </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        <ScrollView
          style={styles.contentScrollView}
          contentContainerStyle={styles.contentScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          onScrollBeginDrag={handleContentScrollBegin}
          stickyHeaderIndices={[0]}
        >
          <View style={styles.tabsStickyWrapper}>
            <View style={styles.dashboardTabRow}>
              <TouchableOpacity
                style={[
                  styles.dashboardTabButton,
                  dashboardTab === 'plans' && styles.dashboardTabButtonActive,
                ]}
                onPress={() => setDashboardTab('plans')}
              >
                <Text
                  style={[
                    styles.dashboardTabText,
                    dashboardTab === 'plans' && styles.dashboardTabTextActive,
                  ]}
                >
                  Plans
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dashboardTabButton,
                  dashboardTab === 'templates' && styles.dashboardTabButtonActive,
                ]}
                onPress={() => setDashboardTab('templates')}
              >
                <Text
                  style={[
                    styles.dashboardTabText,
                    dashboardTab === 'templates' && styles.dashboardTabTextActive,
                  ]}
                >
                  Templates
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {renderWorkoutsSection()}
        </ScrollView>
      </LinearGradient>
    </View>
  );
};



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  gradient: {
    flex: 1,
  },
  
  // ========================================
  // HEADER SECTION - Enhanced visual hierarchy
  // ========================================
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: '#8B93B0',
    marginBottom: 6,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  userName: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginBottom: 2,
  },
  sessionMetaLine: {
    marginTop: 8,
    fontSize: 13,
    color: '#6C63FF',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  avatarButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderWidth: 2.5,
    borderColor: 'rgba(108, 99, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 31,
  },

  // ========================================
  // CALENDAR SECTION - Modern glassmorphism
  // ========================================
  calendarSection: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  calendarCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  calendarLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  calendarLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  calendarLegendDotComplete: {
    backgroundColor: '#00F5A0',
    shadowColor: '#00F5A0',
  },
  calendarLegendDotToday: {
    backgroundColor: '#6C63FF',
    shadowColor: '#6C63FF',
  },
  calendarLegendDotPlanned: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  calendarLegendText: {
    fontSize: 11,
    color: '#A0A3BD',
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // ========================================
  // WEEK VIEW - Enhanced visual indicators
  // ========================================
  weekViewContainer: {
    position: 'relative',
  },
  weekScrollContent: {
    paddingVertical: 8,
    gap: 0,
    paddingHorizontal: 12,
  },
  weekDay: {
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 16,
  },
  weekDayToday: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderRadius: 16,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  weekDaySelected: {
    backgroundColor: 'rgba(108, 99, 255, 0.25)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.4)',
  },
  weekDayName: {
    fontSize: 10,
    color: '#8B93B0',
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  weekDayNameToday: {
    color: '#8B7FFF',
    fontWeight: '800',
  },
  weekDayNumber: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  weekDayNumberComplete: {
    backgroundColor: '#00F5A0',
    borderColor: '#00F5A0',
    shadowColor: '#00F5A0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  weekDayNumberToday: {
    backgroundColor: 'rgba(108, 99, 255, 0.25)',
    borderWidth: 2.5,
    borderColor: '#6C63FF',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  weekDayNumberText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  weekDayNumberTextComplete: {
    color: '#0A0E27',
    fontWeight: '900',
  },
  weekDayNumberTextToday: {
    color: '#6C63FF',
  },
  weekDayIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#00F5A0',
    marginTop: 8,
    shadowColor: '#00F5A0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },

  // ========================================
  // FULL CALENDAR - Expandable section
  // ========================================
  fullCalendarContainer: {
    overflow: 'hidden',
    marginTop: 0,
  },
  fullCalendarContainerExpanded: {
    marginTop: 8,
  },
  fullCalendar: {
    marginTop: 0,
  },

  // ========================================
  // CONTENT SCROLL - Main content area
  // ========================================
  contentScrollView: {
    flex: 1,
  },
  contentScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 160,
  },

  // ========================================
  // SECTIONS - Layout structure
  // ========================================
  section: {
    position: 'relative',
  },
  progressMainColumn: {
    flex: 1,
    gap: 8,
  },

  // ========================================
  // TABS - Enhanced tab navigation
  // ========================================
  tabsStickyWrapper: {
    paddingBottom: 0,
  },
  dashboardTabRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  dashboardTabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(30, 36, 61, 0.4)',
    borderWidth: 1.5,
    borderColor: 'rgba(199, 204, 230, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dashboardTabButtonActive: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.45)',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  dashboardTabText: {
    fontSize: 13,
    color: '#8B93B0',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dashboardTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // ========================================
  // TEMPLATES - Template list
  // ========================================
  templateList: {
    gap: 12,
  },
  templateCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  templateTitle: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  templateMeta: {
    fontSize: 13,
    color: '#A0A3BD',
    marginBottom: 14,
    fontWeight: '600',
  },
  templateAction: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(108, 99, 255, 0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.4)',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  templateActionText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // ========================================
  // ADAPTATION CARD - Progress insights
  // ========================================
  adaptationCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 245, 160, 0.3)',
    backgroundColor: 'rgba(0, 245, 160, 0.1)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#00F5A0',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  adaptationTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#00F5A0',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  adaptationText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#E0E2F0',
    fontWeight: '500',
  },

  // ========================================
  // CHECKLIST CARD - Missing inputs
  // ========================================
  checklistCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 196, 66, 0.35)',
    backgroundColor: 'rgba(255, 196, 66, 0.09)',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  checklistTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFC442',
    marginBottom: 4,
  },
  checklistSubtitle: {
    fontSize: 12,
    color: '#C7CCE6',
    marginBottom: 6,
    lineHeight: 17,
  },
  checklistItems: {
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 18,
  },

  // ========================================
  // PLAN CONTEXT CARD - Plan details
  // ========================================
  planContextCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
    backgroundColor: 'rgba(108, 99, 255, 0.12)',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  planContextTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C7CCE6',
    marginBottom: 4,
  },
  planContextText: {
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 17,
  },

  // ========================================
  // EMPTY STATE - No content placeholder
  // ========================================
  emptyCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.25)',
    padding: 36,
    alignItems: 'center',
    backgroundColor: 'rgba(108, 99, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 14,
    color: '#A0A3BD',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  createPlanButton: {
    paddingVertical: 16,
    paddingHorizontal: 36,
    backgroundColor: '#6C63FF',
    borderRadius: 14,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  createPlanButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // ========================================
  // EXERCISE CARDS - Workout items
  // ========================================
  verticalList: {
    gap: 12,
  },
  exerciseCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.25)',
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  exerciseCardDisabled: {
    opacity: 0.6,
  },
  exerciseCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  exerciseCardMain: {
    flex: 1,
    minWidth: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  exerciseHeaderText: {
    flex: 1,
    minWidth: 0,
  },

  // ========================================
  // CHECKBOX - Exercise completion
  // ========================================
  checkCircleActive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#00F5A0',
    backgroundColor: '#00F5A0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00F5A0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  checkCircleInactive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleText: {
    color: '#0A0E27',
    fontSize: 16,
    fontWeight: '900',
  },

  // ========================================
  // EXERCISE INFO - Details and meta
  // ========================================
  exerciseName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  exerciseMetaLine: {
    fontSize: 12,
    color: '#A0A3BD',
    marginBottom: 10,
    fontWeight: '600',
  },
  exerciseBodyParts: {
    fontSize: 12,
    color: '#8B7FFF',
    marginBottom: 4,
    fontWeight: '600',
  },

  // ========================================
  // WORKOUT CONTROLS - Sets, RPE, Rest
  // ========================================
  workoutControlRow: {
    marginTop: 8,
    gap: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108, 99, 255, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
  },
  stepperButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  stepperValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  restButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 245, 160, 0.4)',
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
    shadowColor: '#00F5A0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  restButtonText: {
    color: '#00F5A0',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
