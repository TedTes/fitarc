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
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  PhasePlan,
  WorkoutSessionEntry,
  WorkoutSessionExercise,
  PlanDay,
} from '../types/domain';
import { useHomeScreenData } from '../hooks/useHomeScreenData';
import { useWorkoutSessions } from '../hooks/useWorkoutSessions';
import { useFabAction } from '../contexts/FabActionContext';
import { useScreenAnimation } from '../hooks/useScreenAnimation';
import { Calendar } from 'react-native-calendars';
import { getBodyPartLabel } from '../utils';
import type { BodyPart } from '../utils/trainingSplitHelper';
import { addDays, formatLocalDateYMD, parseYMDToDate } from '../utils/date';
import { type AdaptationMode } from '../services/planningRules';
import { PLAN_INPUT_LABELS, getMissingPlanInputs } from '../utils/planReadiness';
import { runLayoutAnimation } from '../utils/layoutAnimation';
import { PlansScreen } from './PlansScreen';
import {
  fetchResolvedMealsForDate,
  type RuntimeMealsByType,
} from '../services/mealRuntimeService';

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
  surface: '#0C1021',
  elevated: '#151A2E',
  card: '#101427',
  borderSubtle: 'rgba(255,255,255,0.06)',
} as const;

// Muscle group color mapping with gradients
const MUSCLE_COLORS: Record<string, { 
  bg: string; 
  text: string; 
  border: string;
  gradient: readonly [string, string, ...string[]];
}> = {
  chest: { 
    bg: 'rgba(239, 68, 68, 0.15)', 
    text: '#FCA5A5', 
    border: 'rgba(239, 68, 68, 0.3)',
    gradient: ['#EF4444', '#DC2626'] as const,
  },
  back: { 
    bg: 'rgba(59, 130, 246, 0.15)', 
    text: '#93C5FD', 
    border: 'rgba(59, 130, 246, 0.3)',
    gradient: ['#3B82F6', '#2563EB'] as const,
  },
  legs: { 
    bg: 'rgba(168, 85, 247, 0.15)', 
    text: '#C4B5FD', 
    border: 'rgba(168, 85, 247, 0.3)',
    gradient: ['#A855F7', '#9333EA'] as const,
  },
  shoulders: { 
    bg: 'rgba(234, 179, 8, 0.15)', 
    text: '#FDE047', 
    border: 'rgba(234, 179, 8, 0.3)',
    gradient: ['#EAB308', '#CA8A04'] as const,
  },
  arms: { 
    bg: 'rgba(236, 72, 153, 0.15)', 
    text: '#F9A8D4', 
    border: 'rgba(236, 72, 153, 0.3)',
    gradient: ['#EC4899', '#DB2777'] as const,
  },
  core: { 
    bg: 'rgba(16, 185, 129, 0.15)', 
    text: '#6EE7B7', 
    border: 'rgba(16, 185, 129, 0.3)',
    gradient: ['#10B981', '#059669'] as const,
  },
};

const ACTIVITY_TOTAL_DAYS_FALLBACK = 182;
const KNOWN_BODY_PARTS = new Set(['chest', 'back', 'legs', 'shoulders', 'arms', 'core']);

// 🎨 Progress Ring Component
const ProgressRing: React.FC<{
  progress: number;
  size: number;
  strokeWidth: number;
  color: string;
}> = ({ progress, size, strokeWidth, color }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <Svg width={size} height={size}>
      <Circle
        stroke="rgba(255,255,255,0.1)"
        fill="none"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
      />
      <Circle
        stroke={color}
        fill="none"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
};

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
  bounce: {
    tension: 300,
    friction: 8,
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

const formatBodyPartSafe = (part: string) => {
  const key = part.toLowerCase();
  return KNOWN_BODY_PARTS.has(key) ? getBodyPartLabel(key as BodyPart) : part;
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
  plannedWorkouts: PlanDay[];
  onProfilePress?: () => void;
  onStartPhase?: () => void;
  onToggleWorkoutExercise?: (date: string, exerciseName: string, exerciseId?: string, currentExercises?: WorkoutSessionExercise[]) => void;
  onSaveCustomSession?: (date: string, exercises: WorkoutSessionExercise[]) => void;
  onAddExercise?: (planWorkoutId: string, exercise: WorkoutSessionExercise) => Promise<string | void>;
  onDeleteExercise?: (planWorkoutId: string, planExerciseId: string) => Promise<void>;
};

const EMPTY_EXERCISES: WorkoutSessionEntry['exercises'] = [];

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  user,
  phase,
  workoutSessions,
  plannedWorkouts,
  onProfilePress,
  onStartPhase,
  onToggleWorkoutExercise,
  onSaveCustomSession,
  onAddExercise,
  onDeleteExercise,
}) => {
  const { setFabAction } = useFabAction();
  const { headerStyle } = useScreenAnimation();
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
  
  const [shouldMountCalendar, setShouldMountCalendar] = useState(false);
  
  const resolvedPhase = phase ?? homeData?.phase ?? null;
  const hasActivePlan = resolvedPhase?.status === 'active';
  const [mealsByType, setMealsByType] = useState<RuntimeMealsByType>({});
  const resolvedSessions = useMemo(() => {
    const fallbackSessions = phaseSessions.length
      ? phaseSessions
      : homeData?.recentSessions ?? [];
    const preferredSessions = workoutSessions.length ? workoutSessions : fallbackSessions;
    if (!derivedPhaseId) return preferredSessions;
    return preferredSessions.filter((session) => session.phasePlanId === derivedPhaseId);
  }, [derivedPhaseId, homeData?.recentSessions, phaseSessions, workoutSessions]);
  const resolvedPlannedWorkouts = useMemo(() => {
    if (!derivedPhaseId) return plannedWorkouts;
    return plannedWorkouts.filter((day) => day.planId === derivedPhaseId);
  }, [derivedPhaseId, plannedWorkouts]);

  const today = new Date();
  const todayStr = formatLocalDateYMD(today);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const selectedSession =
    resolvedSessions.find((session) => session.date === selectedDate) || null;
  const selectedPlanDay =
    resolvedPlannedWorkouts.find((day) => day.date === selectedDate) || null;


  useEffect(() => {
    if (!hasActivePlan) {
      setMealsByType({});
      return;
    }
    let cancelled = false;
    fetchResolvedMealsForDate(user.id, derivedPhaseId ?? null, todayStr, user.eatingMode)
      .then((result) => {
        if (!cancelled) setMealsByType(result.mealsByType);
      })
      .catch(() => {
        if (!cancelled) setMealsByType({});
      });
    return () => { cancelled = true; };
  }, [hasActivePlan, user.id, derivedPhaseId, todayStr, user.eatingMode]);

  const mealSummary = useMemo(() => {
    const types = Object.keys(mealsByType);
    if (!types.length) return null;
    let calories = 0, protein = 0, carbs = 0, fats = 0;
    types.forEach((type) => {
      mealsByType[type].forEach((entry) => {
        calories += Number(entry.calories ?? 0);
        protein += Number(entry.protein ?? 0);
        carbs += Number(entry.carbs ?? 0);
        fats += Number(entry.fats ?? 0);
      });
    });
    return {
      types,
      totalItems: types.reduce((sum, type) => sum + mealsByType[type].length, 0),
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fats: Math.round(fats),
    };
  }, [mealsByType]);

  const plannedExercisesForSelectedDate = useMemo<WorkoutSessionExercise[]>(() => {
    if (selectedSession?.exercises?.length || !selectedPlanDay?.workout?.exercises?.length) {
      return EMPTY_EXERCISES;
    }
    return selectedPlanDay.workout.exercises.map((exercise) => ({
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
  }, [selectedPlanDay, selectedSession]);

  const displayExercises: WorkoutSessionExercise[] =
    selectedSession?.exercises?.length
      ? selectedSession.exercises
      : plannedExercisesForSelectedDate ?? EMPTY_EXERCISES;
  
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
    const plannedDates = new Set(
      resolvedPlannedWorkouts
        .filter((day) => day.workout && day.workout.exercises.length > 0)
        .map((day) => day.date)
    );
    phaseDates.forEach((dateKey) => {
      const serverComplete = (completedSessionsByDate.get(dateKey) || 0) > 0;
      const isComplete =
        dateKey === selectedDate && displayExercises.length
          ? selectedSessionComplete
          : serverComplete;
      const isToday = dateKey === todayStr;
      const hasPlannedWorkout = sessionDates.has(dateKey) || plannedDates.has(dateKey);
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
    resolvedPlannedWorkouts,
    resolvedSessions,
    selectedDate,
    selectedSessionComplete,
    todayStr,
  ]);

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
      if (!displayExercises.length) {
        return {
          ...baseConfig,
          label: 'Add Workout',
          icon: '+',
          onPress: () => setExercisePickerNonce((prev) => prev + 1),
        };
      }
      return {
        ...baseConfig,
        label: 'Add Exercise',
        icon: '+',
        onPress: () => setExercisePickerNonce((prev) => prev + 1),
      };
    }
    return null;
  }, [
    shouldCreatePlan,
    onStartPhase,
    hasActivePlan,
    displayExercises.length,
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
      setShouldMountCalendar(true);
    }
  }, [calendarExpanded]);

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
    </View>
  );


  const renderWorkoutsSection = () => {
    const renderExerciseCard = (exercise: WorkoutSessionEntry['exercises'][number]) => {
      const isMarked = isExerciseMarked(exercise);
      const cardKey = `${selectedDate}-${getExerciseKey(exercise)}`;
      const exerciseKey = getExerciseKey(exercise);
      const isExpanded = expandedExerciseKey === exerciseKey;
      const targetSets = Math.max(1, exercise.sets ?? 3);
      const scaleAnim = getExerciseCardAnimation(cardKey);
      const completedSets = workoutSetProgress[exerciseKey]?.completedSets ?? 0;
      const setProgress = targetSets > 0 ? (completedSets / targetSets) * 100 : 0;

      // Get primary muscle color
      const primaryMuscle = exercise.bodyParts[0]?.toLowerCase() || 'core';
      const muscleColor = MUSCLE_COLORS[primaryMuscle] || MUSCLE_COLORS.core;

      return (
        <Animated.View
          key={cardKey}
          style={{
            transform: [{ scale: scaleAnim }],
          }}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              setExpandedExerciseKey((prev) => (prev === exerciseKey ? null : exerciseKey))
            }
          >
            <LinearGradient
              colors={isMarked 
                ? ['rgba(0, 245, 160, 0.15)', 'rgba(0, 200, 130, 0.1)']
                : CARD_GRADIENT_DEFAULT
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.exerciseCard,
                !canLogWorkouts && styles.exerciseCardDisabled,
                isMarked && styles.exerciseCardCompleted,
              ]}
            >
              <View style={styles.exerciseCardRow}>
                {/* Left Side: Progress Ring + Checkbox */}
                <View style={styles.exerciseLeftSection}>
                  <View style={styles.progressRingContainer}>
                    <ProgressRing
                      progress={setProgress}
                      size={56}
                      strokeWidth={4}
                      color={isMarked ? COLORS.success : muscleColor.text}
                    />
                    <TouchableOpacity
                      disabled={!canLogWorkouts}
                      onPress={() => canLogWorkouts && handleToggleExerciseAnimated(exercise)}
                      style={styles.centeredCheckbox}
                    >
                      <Animated.View
                        style={{
                          transform: [{ scale: checkboxPulseAnim }],
                        }}
                      >
                        <View
                          style={isMarked ? styles.checkCircleActive : styles.checkCircleInactive}
                        >
                          {isMarked && <Text style={styles.checkCircleText}>✓</Text>}
                        </View>
                      </Animated.View>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Right Side: Exercise Info */}
                <View style={styles.exerciseRightSection}>
                  <Text
                    numberOfLines={2}
                    ellipsizeMode="tail"
                    style={[styles.exerciseName, isMarked && styles.exerciseNameCompleted]}
                  >
                    {exercise.name}
                  </Text>

                  <View style={styles.muscleTagsRow}>
                    {exercise.bodyParts.slice(0, 3).map((muscle, i) => {
                      const muscleKey = muscle.toLowerCase();
                      const colors = MUSCLE_COLORS[muscleKey] || MUSCLE_COLORS.core;
                      return (
                        <LinearGradient
                          key={i}
                          colors={colors.gradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.muscleTag}
                        >
                          <Text style={styles.muscleTagText}>
                            {formatBodyPartSafe(muscle)}
                          </Text>
                        </LinearGradient>
                      );
                    })}
                  </View>

                  <View style={styles.exerciseMetaRow}>
                    <View style={styles.exerciseMetaBadge}>
                      <Text style={styles.exerciseMetaText}>
                        {exercise.sets ?? '—'} sets
                      </Text>
                    </View>
                    <View style={styles.exerciseMetaBadge}>
                      <Text style={styles.exerciseMetaText}>
                        {exercise.reps ?? '—'} reps
                      </Text>
                    </View>
                    {isMarked && (
                      <View style={styles.completedBadge}>
                        <Text style={styles.completedBadgeText}>✓ Done</Text>
                      </View>
                    )}
                  </View>

                  {isExpanded ? (
                    <View style={styles.workoutControlRow}>
                      <View style={styles.stepper}>
                        <TouchableOpacity
                          style={styles.stepperButton}
                          onPress={() => updateExerciseSets(exerciseKey, targetSets, -1)}
                        >
                          <Text style={styles.stepperButtonText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepperValue}>
                          {`${completedSets}/${targetSets} sets`}
                        </Text>
                        <TouchableOpacity
                          style={styles.stepperButton}
                          onPress={() => updateExerciseSets(exerciseKey, targetSets, 1)}
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
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      );
    };

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

        {!hasActivePlan && !isHomeLoading && !isSessionsLoading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>No active plan</Text>
            <Text style={styles.emptyText}>
              Create your personalized training plan to get started.
            </Text>
            {onStartPhase && (
              <Animated.View style={{ transform: [{ scale: createButtonPulse }] }}>
                <TouchableOpacity style={styles.createPlanButton} onPress={onStartPhase}>
                  <Text style={styles.createPlanButtonText}>Create Plan</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        ) : hasActivePlan ? (
          <>
            <PlansScreen
              user={user}
              phase={phase}
              workoutSessions={workoutSessions}
              plannedWorkouts={plannedWorkouts}
              onSaveCustomSession={onSaveCustomSession}
              onAddExercise={onAddExercise}
              onDeleteExercise={onDeleteExercise}
              onToggleComplete={onToggleWorkoutExercise}
              embedded
              openExercisePickerSignal={exercisePickerNonce}
              selectedDateOverride={selectedDate}
            />
          </>
        ) : !hasSyncedWorkout ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>No workout scheduled</Text>
            <Text style={styles.emptyText}>
              Go to the Library tab to pick a template for today.
            </Text>
          </View>
        ) : (
          <View style={styles.verticalList}>
            {sortedWorkoutCards.map(renderExerciseCard)}
          </View>
        )}
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
      if (calendarExpanded) {
        runLayoutAnimation();
        setCalendarExpanded(false);
      }
    },
    [calendarExpanded]
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
        >
          {renderWorkoutsSection()}

          {/* Condensed meal summary */}
          {hasActivePlan && mealSummary && (
            <View style={styles.mealSummarySection}>
              <View style={styles.mealSummaryHeader}>
                <Text style={styles.mealSummaryTitle}>Today's Nutrition</Text>
                <Text style={styles.mealSummaryCount}>
                  {mealSummary.totalItems} items
                </Text>
              </View>
              <LinearGradient
                colors={CARD_GRADIENT_DEFAULT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.mealSummaryCard}
              >
                <View style={styles.mealMacroRow}>
                  <View style={styles.mealMacroItem}>
                    <Text style={styles.mealMacroValue}>{mealSummary.calories}</Text>
                    <Text style={styles.mealMacroLabel}>kcal</Text>
                  </View>
                  <View style={styles.mealMacroDivider} />
                  <View style={styles.mealMacroItem}>
                    <Text style={[styles.mealMacroValue, { color: '#60A5FA' }]}>{mealSummary.protein}g</Text>
                    <Text style={styles.mealMacroLabel}>Protein</Text>
                  </View>
                  <View style={styles.mealMacroDivider} />
                  <View style={styles.mealMacroItem}>
                    <Text style={[styles.mealMacroValue, { color: '#FBBF24' }]}>{mealSummary.carbs}g</Text>
                    <Text style={styles.mealMacroLabel}>Carbs</Text>
                  </View>
                  <View style={styles.mealMacroDivider} />
                  <View style={styles.mealMacroItem}>
                    <Text style={[styles.mealMacroValue, { color: '#F472B6' }]}>{mealSummary.fats}g</Text>
                    <Text style={styles.mealMacroLabel}>Fats</Text>
                  </View>
                </View>
                <View style={styles.mealSlotRow}>
                  {mealSummary.types.map((type) => (
                    <View key={type} style={styles.mealSlotChip}>
                      <Text style={styles.mealSlotChipText}>{type}</Text>
                      <Text style={styles.mealSlotChipCount}>
                        {mealsByType[type].reduce((s, e) => s + Number(e.calories ?? 0), 0)} cal
                      </Text>
                    </View>
                  ))}
                </View>
              </LinearGradient>
            </View>
          )}
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
  // HEADER
  // ========================================
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
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
  // CALENDAR
  // ========================================
  calendarSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  calendarCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.25)',
    backgroundColor: COLORS.card,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
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
  // CONTENT
  // ========================================
  contentScrollView: {
    flex: 1,
  },
  contentScrollContent: {
    paddingTop: 0,
    paddingBottom: 160,
  },
  section: {
    position: 'relative',
    paddingHorizontal: 20,
  },
  progressMainColumn: {
    flex: 1,
    gap: 6,
  },

  // ========================================
  // TABS
  // ========================================
  tabsStickyWrapper: {
    paddingBottom: 16,
    paddingTop: 4,
    paddingHorizontal: 20,
  },
  dashboardTabRow: {
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  dashboardTabButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 2,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 12,
  },
  dashboardTabButtonActive: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderWidth: 0,
  },
  dashboardTabText: {
    fontSize: 13,
    color: '#8B93B0',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  dashboardTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ========================================
  // 🎨 TEMPLATE SOURCE BANNER
  // ========================================
  templateSourceBanner: {
    marginBottom: 16,
  },
  templateSourceCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.3)',
    backgroundColor: COLORS.card,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  templateSourceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  templateSourceIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  templateSourceIconText: {
    fontSize: 20,
  },
  templateSourceInfo: {
    flex: 1,
  },
  templateSourceLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '700',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  templateSourceTitle: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  templateSourceClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateSourceCloseText: {
    fontSize: 20,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginTop: -2,
  },

  // ========================================
  // 🎨 TEMPLATES - SUBTLE VERSION
  // ========================================
  templateList: {
    marginTop: 0,
    gap: 0,
  },
  templateSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  templateSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
  },
  templateSectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  templateFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  templateFilterButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  templateFilterButtonActive: {
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
    borderColor: 'rgba(108, 99, 255, 0.4)',
  },
  templateFilterText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  templateFilterTextActive: {
    color: COLORS.accent,
  },
  templateLoadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  templateCtaButton: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.35)',
  },
  templateCtaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  templateCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: COLORS.card,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  templateIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  templateIcon: {
    fontSize: 22,
  },
  templateHeaderText: {
    flex: 1,
  },
  templateTitle: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: '700',
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  templateSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  difficultyBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  difficultyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  templateDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 14,
    lineHeight: 19,
  },
  templateStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
  },
  templateStat: {
    flex: 1,
    alignItems: 'center',
  },
  templateStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  templateStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  templateStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.borderSubtle,
  },
  quickAddButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.4)',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  quickAddButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.2,
  },
  quickAddButtonCurrent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 245, 160, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 245, 160, 0.3)',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickAddButtonCurrentText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 0.2,
  },
  templateCardCurrent: {
    borderColor: 'rgba(0, 245, 160, 0.35)',
    backgroundColor: '#0D1A18',
    shadowColor: COLORS.success,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  templateCardFeatured: {
    borderColor: 'rgba(108, 99, 255, 0.3)',
    shadowColor: COLORS.accent,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  templateCardActiveStrip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    backgroundColor: COLORS.success,
  },
  templateCurrentBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 160, 0.35)',
  },
  templateCurrentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  templateMusclePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  templateMusclePill: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  templateMusclePillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  templateExerciseList: {
    overflow: 'hidden',
  },
  templateExerciseDivider: {
    height: 1,
    backgroundColor: COLORS.borderSubtle,
    marginVertical: 12,
  },
  templateExerciseScroll: {
    maxHeight: 240,
  },
  templateExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  templateExerciseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  templateExerciseInfo: {
    flex: 1,
  },
  templateExerciseName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 3,
  },
  templateExerciseMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  templateExerciseAddButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateExerciseAddButtonAdded: {
    backgroundColor: 'rgba(0, 245, 160, 0.15)',
    borderColor: 'rgba(0, 245, 160, 0.3)',
  },
  templateExerciseAddText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.accent,
  },
  templateExerciseAddTextAdded: {
    color: COLORS.success,
    fontSize: 14,
  },

  // ========================================
  // 🎨 TEMPLATE MODAL - COMPACT LAYOUT
  // ========================================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalBackdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  templateModalSheet: {
    backgroundColor: '#0E1229',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 20,
    minHeight: '80%',
    maxHeight: '90%',
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
    display: 'flex',
    flexDirection: 'column',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    marginBottom: 16,
  },
  
  // Compact Header
  templateModalHeaderCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
  },
  templateModalIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  templateModalIconSmallText: {
    fontSize: 20,
  },
  templateModalHeaderTextCompact: {
    flex: 1,
  },
  templateModalTitleCompact: {
    fontSize: 17,
    color: COLORS.textPrimary,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  templateModalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  difficultyBadgeSmall: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  difficultyBadgeSmallText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  templateModalQuickStats: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  modalCloseButtonCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseButtonText: {
    fontSize: 24,
    color: COLORS.textSecondary,
    fontWeight: '300',
    marginTop: -2,
  },
  
  // Exercise List - Takes Most Space
  templateModalExerciseListTop: {
    flex: 1,
    paddingHorizontal: 20,
  },
  templateModalExerciseListContent: {
    paddingBottom: 12,
  },
  templateModalExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 10,
  },
  templateModalExerciseRowSelected: {
    backgroundColor: 'rgba(108, 99, 255, 0.18)',
    borderColor: 'rgba(108, 99, 255, 0.35)',
  },
  templateModalExerciseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  templateModalExerciseInfo: {
    flex: 1,
  },
  templateModalExerciseName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  templateModalExerciseMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  templateModalExerciseCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateModalExerciseCheckActive: {
    backgroundColor: 'rgba(0, 245, 160, 0.18)',
    borderColor: 'rgba(0, 245, 160, 0.5)',
  },
  templateModalExerciseCheckText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.success,
  },
  
  // Footer with Add All Button
  templateModalFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  templateModalAddAllButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  templateModalAddAllButtonDisabled: {
    backgroundColor: '#4A4F73',
    shadowOpacity: 0,
    elevation: 0,
  },
  templateModalAddAllText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
  },

  // ========================================
  // OTHER CARDS
  // ========================================
  adaptationCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 245, 160, 0.3)',
    backgroundColor: 'rgba(0, 245, 160, 0.08)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
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
  checklistCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 196, 66, 0.35)',
    backgroundColor: 'rgba(255, 196, 66, 0.08)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
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
  emptyCard: {
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.25)',
    padding: 36,
    alignItems: 'center',
    backgroundColor: COLORS.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 20,
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
  // MEAL SUMMARY
  // ========================================
  mealSummarySection: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  mealSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mealSummaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  mealSummaryCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8B93B0',
  },
  mealSummaryCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.25)',
    backgroundColor: '#101427',
  },
  mealMacroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  mealMacroItem: {
    flex: 1,
    alignItems: 'center',
  },
  mealMacroValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  mealMacroLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8B93B0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealMacroDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  mealSlotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  mealSlotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  mealSlotChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C7CCE6',
  },
  mealSlotChipCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8B93B0',
  },

  // ========================================
  // 🎨 TEMPLATE BADGE (for exercises from templates)
  // ========================================
  templateBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.4)',
    zIndex: 10,
  },
  templateBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.3,
  },

  // ========================================
  // EXERCISE CARDS
  // ========================================
  verticalList: {
    marginTop: 0,
    gap: 10,
  },
  exerciseCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.25)',
    backgroundColor: COLORS.card,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  exerciseCardCompleted: {
    borderColor: 'rgba(0, 245, 160, 0.4)',
    shadowColor: '#00F5A0',
    shadowOpacity: 0.2,
  },
  exerciseCardFromTemplate: {
    borderColor: 'rgba(108, 99, 255, 0.4)',
    borderWidth: 1.5,
  },
  exerciseCardDisabled: {
    opacity: 0.6,
  },
  exerciseCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  exerciseLeftSection: {
    marginRight: 4,
  },
  progressRingContainer: {
    position: 'relative',
    width: 56,
    height: 56,
  },
  centeredCheckbox: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -14,
    marginTop: -14,
  },
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
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  checkCircleInactive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleText: {
    color: '#0A0E27',
    fontSize: 16,
    fontWeight: '900',
  },
  exerciseRightSection: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  exerciseNameCompleted: {
    color: '#00F5A0',
  },
  muscleTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  muscleTag: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  muscleTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exerciseMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  exerciseMetaBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  exerciseMetaText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  completedBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 245, 160, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 160, 0.4)',
  },
  completedBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00F5A0',
  },
  workoutControlRow: {
    marginTop: 12,
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
