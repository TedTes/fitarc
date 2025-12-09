import { useState, useEffect, useCallback } from 'react';
import {
  AppState,
  User,
  PhasePlan,
  DailyConsistencyLog,
  PhotoCheckin,
  ProgressEstimate,
  createEmptyAppState,
  WorkoutLog,
  StrengthSnapshot,
  WorkoutSessionEntry,
  HabitLog,
  HabitType,
  DailyMealPlan,
  MuscleGroup,
} from '../types/domain';
import { StorageAdapter } from '../storage';
import { getTodayFocusAreas } from '../utils/trainingSplitHelper';
import { buildWorkoutLogFromFocus, generateSeedPerformanceData } from '../utils/performanceTracker';
import {
  createSessionForDate,
  toggleExerciseCompletion,
  sessionToWorkoutLog,
} from '../utils/workoutPlanner';
import { createMealPlanForDate } from '../utils/dietPlanner';
import weeklyPlanTemplate from '../data/weeklyPlanTemplate.json';

type WeeklyTemplateEntry = typeof weeklyPlanTemplate[number];

const upsertWorkoutLog = (logs: WorkoutLog[], log: WorkoutLog): WorkoutLog[] => {
  const index = logs.findIndex(
    (existing) => existing.date === log.date && existing.phasePlanId === log.phasePlanId
  );
  if (index >= 0) {
    const updated = [...logs];
    updated[index] = log;
    return updated;
  }
  return [...logs, log];
};

const mergeSnapshots = (
  snapshots: StrengthSnapshot[],
  incoming: StrengthSnapshot[]
): StrengthSnapshot[] => {
  const existingMap = new Map(snapshots.map((snap) => [snap.id, snap]));
  incoming.forEach((snapshot) => {
    existingMap.set(snapshot.id, snapshot);
  });
  return Array.from(existingMap.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
};

const upsertWorkoutSession = (
  sessions: WorkoutSessionEntry[],
  session: WorkoutSessionEntry
): WorkoutSessionEntry[] => {
  const index = sessions.findIndex(
    (existing) => existing.date === session.date && existing.phasePlanId === session.phasePlanId
  );
  if (index >= 0) {
    const updated = [...sessions];
    updated[index] = session;
    return updated;
  }
  return [...sessions, session];
};

const upsertHabitLog = (logs: HabitLog[], log: HabitLog): HabitLog[] => {
  const index = logs.findIndex(
    (existing) => existing.date === log.date && existing.phasePlanId === log.phasePlanId
  );
  if (index >= 0) {
    const updated = [...logs];
    updated[index] = log;
    return updated;
  }
  return [...logs, log];
};

const upsertMealPlan = (plans: DailyMealPlan[], plan: DailyMealPlan): DailyMealPlan[] => {
  const index = plans.findIndex(
    (existing) => existing.date === plan.date && existing.phasePlanId === plan.phasePlanId
  );
  if (index >= 0) {
    const updated = [...plans];
    updated[index] = plan;
    return updated;
  }
  return [...plans, plan];
};

const getOrCreateSessionEntry = (
  sessions: WorkoutSessionEntry[],
  user: User,
  phasePlanId: string,
  date: string
): WorkoutSessionEntry => {
  const existing = sessions.find(
    (session) => session.date === date && session.phasePlanId === phasePlanId
  );
  if (existing) {
    return existing;
  }
  return createSessionForDate(user, phasePlanId, date);
};

const getOrCreateMealPlan = (
  plans: DailyMealPlan[],
  user: User,
  phasePlanId: string,
  date: string
): DailyMealPlan => {
  const existing = plans.find((plan) => plan.date === date && plan.phasePlanId === phasePlanId);
  if (existing) {
    return existing;
  }
  return createMealPlanForDate(user, phasePlanId, date);
};

export const useAppState = (storageAdapter: StorageAdapter) => {
  const [state, setState] = useState<AppState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loadedState = await storageAdapter.getAppState();
      setState(loadedState || createEmptyAppState());
    } catch (err) {
      setError('Failed to load app state');
      console.error('Load state error:', err);
      setState(createEmptyAppState());
    } finally {
      setIsLoading(false);
    }
  };

  const persistState = async (newState: AppState) => {
    try {
      await storageAdapter.saveAppState(newState);
      setState(newState);
    } catch (err) {
      setError('Failed to save app state');
      console.error('Persist state error:', err);
      throw err;
    }
  };

  const updateUser = useCallback(async (user: User) => {
    if (!state) return;
    const newState: AppState = {
      ...state,
      user,
    };
    await persistState(newState);
  }, [state]);

  const startPhase = useCallback(async (phase: PhasePlan) => {
    if (!state) return;
    const newState: AppState = {
      ...state,
      currentPhase: phase,
      progressEstimate: {
        phasePlanId: phase.id,
        lastUpdated: new Date().toISOString(),
        progressPercent: 0,
        daysActive: 0,
        daysLogged: 0,
      },
    };
    await persistState(newState);
  }, [state]);

  const markDayConsistent = useCallback(async (log: DailyConsistencyLog) => {
    if (!state) return;
    
    const existingLogIndex = state.dailyConsistency.findIndex(
      l => l.date === log.date && l.phasePlanId === log.phasePlanId
    );

    let updatedLogs: DailyConsistencyLog[];
    if (existingLogIndex >= 0) {
      updatedLogs = [...state.dailyConsistency];
      updatedLogs[existingLogIndex] = log;
    } else {
      updatedLogs = [...state.dailyConsistency, log];
    }

    let newState: AppState = {
      ...state,
      dailyConsistency: updatedLogs,
    };

    if (
      log.isConsistent &&
      state.user &&
      state.currentPhase
    ) {
      const sessionEntry = getOrCreateSessionEntry(
        newState.workoutSessions,
        state.user,
        state.currentPhase.id,
        log.date
      );
      newState = {
        ...newState,
        workoutSessions: upsertWorkoutSession(newState.workoutSessions, sessionEntry),
      };

      const focusAreas = getTodayFocusAreas(
        state.user.trainingSplit,
        new Date(log.date).getDay()
      );
      const generated = buildWorkoutLogFromFocus({
        date: log.date,
        phasePlanId: state.currentPhase.id,
        focusAreas,
        existingSnapshots: newState.strengthSnapshots,
      });

      if (generated) {
        newState = {
          ...newState,
          workoutLogs: upsertWorkoutLog(newState.workoutLogs, generated.log),
          strengthSnapshots: mergeSnapshots(newState.strengthSnapshots, generated.snapshots),
        };
      }
    }

    await persistState(newState);
  }, [state]);

  const addPhotoCheckin = useCallback(async (photo: PhotoCheckin) => {
    if (!state) return;
    const newState: AppState = {
      ...state,
      photoCheckins: [...state.photoCheckins, photo],
    };
    await persistState(newState);
  }, [state]);

  const updateProgress = useCallback(async (estimate: ProgressEstimate) => {
    if (!state) return;
    const newState: AppState = {
      ...state,
      progressEstimate: estimate,
    };
    await persistState(newState);
  }, [state]);

  const completePhase = useCallback(async () => {
    if (!state || !state.currentPhase) return;
    const newState: AppState = {
      ...state,
      currentPhase: {
        ...state.currentPhase,
        status: 'completed',
      },
    };
    await persistState(newState);
  }, [state]);

  const recalculateProgress = useCallback(async () => {
    if (!state?.currentPhase) return;
    
    const { calculateProgress } = require('../utils/progressCalculator');
    const newEstimate = calculateProgress(state.currentPhase, state.dailyConsistency);
    
    await updateProgress(newEstimate);
  }, [state, updateProgress]);

  const seedPerformanceData = useCallback(async (phase: PhasePlan, user: User) => {
    if (!state) return;
    const { workoutLogs, strengthSnapshots } = generateSeedPerformanceData(phase, user);
    const newState: AppState = {
      ...state,
      workoutLogs,
      strengthSnapshots,
      workoutSessions: [],
      habitLogs: [],
      nextPhotoReminder: null,
    };
    await persistState(newState);
  }, [state]);

  const toggleWorkoutExercise = useCallback(
    async (date: string, exerciseName: string) => {
      if (!state || !state.currentPhase || !state.user) return;
      const session = getOrCreateSessionEntry(
        state.workoutSessions,
        state.user,
        state.currentPhase.id,
        date
      );

      const updatedSession = toggleExerciseCompletion(session, exerciseName);
      const updatedSessions = upsertWorkoutSession(state.workoutSessions, updatedSession);
      const log = sessionToWorkoutLog(updatedSession);
      const updatedLogs = upsertWorkoutLog(state.workoutLogs, log);

      await persistState({
        ...state,
        workoutSessions: updatedSessions,
        workoutLogs: updatedLogs,
      });
    },
    [state]
  );

  const reorderWorkoutExercise = useCallback(
    async (date: string, fromIndex: number, toIndex: number) => {
      if (!state || !state.currentPhase || !state.user) return;
      const session = getOrCreateSessionEntry(
        state.workoutSessions,
        state.user,
        state.currentPhase.id,
        date
      );
      const length = session.exercises.length;
      if (length === 0) return;
      if (fromIndex < 0 || fromIndex >= length) return;
      const rawTarget = Math.max(0, Math.min(toIndex, length - 1));
      if (fromIndex === rawTarget) return;
      const exercises = [...session.exercises];
      const [moved] = exercises.splice(fromIndex, 1);
      if (!moved) return;
      const adjustedTarget = fromIndex < rawTarget ? rawTarget - 1 : rawTarget;
      exercises.splice(adjustedTarget, 0, moved);
      const updatedSession: WorkoutSessionEntry = {
        ...session,
        exercises,
      };
      const updatedSessions = upsertWorkoutSession(state.workoutSessions, updatedSession);
      await persistState({
        ...state,
        workoutSessions: updatedSessions,
      });
    },
    [state]
  );

  const regenerateWorkoutPlan = useCallback(
    async (date: string) => {
      if (!state || !state.currentPhase || !state.user) return;
      const session = createSessionForDate(state.user, state.currentPhase.id, date);
      const updatedSessions = upsertWorkoutSession(state.workoutSessions, session);
      await persistState({
        ...state,
        workoutSessions: updatedSessions,
      });
    },
    [state]
  );

  const toggleHabit = useCallback(
    async (date: string, habit: HabitType, value: boolean) => {
      if (!state || !state.currentPhase) return;
      const existing =
        state.habitLogs.find(
          (log) => log.date === date && log.phasePlanId === state.currentPhase?.id
        ) || {
          id: `habit_${state.currentPhase.id}_${date}`,
          date,
          phasePlanId: state.currentPhase.id,
          habits: { steps: false, sleep: false, hydration: false },
        };

      const updatedLog: HabitLog = {
        ...existing,
        habits: {
          ...existing.habits,
          [habit]: value,
        },
      };

      await persistState({
        ...state,
        habitLogs: upsertHabitLog(state.habitLogs, updatedLog),
      });
    },
    [state]
  );

  const toggleMealCompletion = useCallback(
    async (date: string, mealTitle: string) => {
      if (!state || !state.currentPhase || !state.user) return;
      const plan = getOrCreateMealPlan(
        state.mealPlans,
        state.user,
        state.currentPhase.id,
        date
      );
      const updatedPlan: DailyMealPlan = {
        ...plan,
        meals: plan.meals.map((meal) =>
          meal.title === mealTitle ? { ...meal, completed: !meal.completed } : meal
        ),
      };
      const updatedPlans = upsertMealPlan(state.mealPlans, updatedPlan);
      await persistState({
        ...state,
        mealPlans: updatedPlans,
      });
    },
    [state]
  );

  const regenerateMealPlan = useCallback(
    async (date: string) => {
      if (!state || !state.currentPhase || !state.user) return;
      const plan = createMealPlanForDate(state.user, state.currentPhase.id, date);
      const updatedPlans = upsertMealPlan(state.mealPlans, plan);
      await persistState({
        ...state,
        mealPlans: updatedPlans,
      });
    },
    [state]
  );

  const loadWeeklyTemplate = useCallback(
    async (anchorDate?: string) => {
      if (!state || !state.currentPhase || !state.user) return;
      const base = anchorDate ? new Date(anchorDate) : new Date();
      const baseDate = new Date(base.toISOString().split('T')[0]);
      let sessions = state.workoutSessions;
      let plans = state.mealPlans;

      weeklyPlanTemplate.forEach((template, index) => {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() + index);
        const dateStr = date.toISOString().split('T')[0];
        const session: WorkoutSessionEntry = {
          id: `session_${state.currentPhase!.id}_${dateStr}`,
          date: dateStr,
          phasePlanId: state.currentPhase!.id,
          exercises: template.workout.map((exercise) => ({
            name: exercise.name,
            sets: exercise.sets,
            reps: exercise.reps,
            bodyParts: exercise.bodyParts as MuscleGroup[],
            completed: false,
          })),
        };
        const mealPlan: DailyMealPlan = {
          id: `meal_${state.currentPhase!.id}_${dateStr}`,
          date: dateStr,
          phasePlanId: state.currentPhase!.id,
          meals: template.meals.map((meal) => ({
            title: meal.title,
            items: meal.items,
            completed: false,
          })),
        };
        sessions = upsertWorkoutSession(sessions, session);
        plans = upsertMealPlan(plans, mealPlan);
      });

      await persistState({
        ...state,
        workoutSessions: sessions,
        mealPlans: plans,
      });
    },
    [state]
  );

  const schedulePhotoReminder = useCallback(
    async (date: string) => {
      if (!state) return;
      await persistState({
        ...state,
        nextPhotoReminder: date,
      });
    },
    [state]
  );

  useEffect(() => {
    if (!state?.currentPhase || !state.user) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const hasSession = state.workoutSessions.some(
      (session) =>
        session.date === todayStr && session.phasePlanId === state.currentPhase!.id
    );
    const hasMealPlan = state.mealPlans.some(
      (plan) => plan.date === todayStr && plan.phasePlanId === state.currentPhase!.id
    );
    if (hasSession && hasMealPlan) {
      return;
    }

    const ensureEntries = async () => {
      let nextState = state;

      if (!hasSession) {
        const session = createSessionForDate(state.user!, state.currentPhase!.id, todayStr);
        nextState = {
          ...nextState,
          workoutSessions: upsertWorkoutSession(nextState.workoutSessions, session),
        };
      }

      if (!hasMealPlan) {
        const plan = createMealPlanForDate(state.user!, state.currentPhase!.id, todayStr);
        nextState = {
          ...nextState,
          mealPlans: upsertMealPlan(nextState.mealPlans, plan),
        };
      }

      if (nextState !== state) {
        await persistState(nextState);
      }
    };

    ensureEntries();
  }, [
    state,
    state?.currentPhase?.id,
    state?.user,
    state?.workoutSessions,
    state?.mealPlans,
  ]);

  const clearAllData = useCallback(async () => {
    try {
      await storageAdapter.clearAll();
      setState(createEmptyAppState());
    } catch (err) {
      setError('Failed to clear data');
      console.error('Clear data error:', err);
      throw err;
    }
  }, []);

  return {
    state,
    isLoading,
    error,
    updateUser,
    startPhase,
    markDayConsistent,
    addPhotoCheckin,
    updateProgress,
    completePhase,
    clearAllData,
    refreshState: loadState,
    recalculateProgress,
    seedPerformanceData,
    toggleWorkoutExercise,
    reorderWorkoutExercise,
    regenerateWorkoutPlan,
    toggleHabit,
    schedulePhotoReminder,
    toggleMealCompletion,
    regenerateMealPlan,
    loadWeeklyTemplate,
  };
};
