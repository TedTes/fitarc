import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppState,
  User,
  PhasePlan,
  DailyConsistencyLog,
  PhotoCheckin,
  ProgressEstimate,
  createEmptyAppState,
  WorkoutLog,
  WorkoutSessionEntry,
  WorkoutSessionExercise,
  HabitLog,
  HabitType,
  DailyMealPlan,
} from '../types/domain';
import { StorageAdapter } from '../storage';
import { generateSeedPerformanceData } from '../utils/performanceTracker';
import {
  createSessionForDate,
  toggleExerciseCompletion,
  sessionToWorkoutLog,
} from '../utils/workoutPlanner';
import { createMealPlanForDate } from '../utils/dietPlanner';
import {
  fetchWorkoutSessionEntries,
  upsertWorkoutSessionWithExercises,
  deleteWorkoutSessionRemote,
} from '../services/supabaseWorkoutService';
import { getAppTimeZone } from '../utils/time';

const ENABLE_STATE_STORAGE = false;

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
  const stateRef = useRef<AppState | null>(null);
  const nextWorkoutVersion = (base?: AppState | null) =>
    (base?.workoutDataVersion ?? 0) + 1;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      setIsLoading(true);
      setError(null);
      if (!ENABLE_STATE_STORAGE) {
        setState(createEmptyAppState());
        return;
      }
      const loadedState = await storageAdapter.getAppState();
      const normalizedState = loadedState
        ? { ...loadedState, workoutDataVersion: loadedState.workoutDataVersion ?? 0 }
        : createEmptyAppState();
      setState(normalizedState);
    } catch (err) {
      setError('Failed to load app state');
      console.error('Load state error:', err);
      setState(createEmptyAppState());
    } finally {
      setIsLoading(false);
    }
  };

  const persistState = useCallback(async (newState: AppState) => {
    if (!ENABLE_STATE_STORAGE) {
      setState(newState);
      return;
    }
    try {
      await storageAdapter.saveAppState(newState);
      setState(newState);
    } catch (err) {
      setError('Failed to save app state');
      console.error('Persist state error:', err);
      throw err;
    }
  }, [storageAdapter]);

  const hydrateFromRemote = useCallback(
    async (payload: {
      user?: User | null;
      phase?: PhasePlan | null;
      workoutSessions?: WorkoutSessionEntry[];
      mealPlans?: DailyMealPlan[];
    }) => {
      if (!state) return;
      const newState: AppState = {
        ...state,
        user: payload.user !== undefined ? payload.user : state.user,
        currentPhase: payload.phase !== undefined ? payload.phase : state.currentPhase,
        workoutSessions:
          payload.workoutSessions !== undefined ? payload.workoutSessions : state.workoutSessions,
        mealPlans: payload.mealPlans !== undefined ? payload.mealPlans : state.mealPlans,
      };
      await persistState(newState);
    },
    [state, persistState]
  );

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
      workoutDataVersion: nextWorkoutVersion(state),
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
        workoutDataVersion: nextWorkoutVersion(state),
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
        workoutDataVersion: nextWorkoutVersion(state),
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
      const updatedMeals = plan.meals.map((meal) =>
        meal.title === mealTitle ? { ...meal, completed: !meal.completed } : meal
      );
      const updatedPlan: DailyMealPlan = {
        ...plan,
        meals: updatedMeals,
        completed: updatedMeals.every((meal) => meal.completed),
      };
      const updatedPlans = upsertMealPlan(state.mealPlans, updatedPlan);
      await persistState({
        ...state,
        mealPlans: updatedPlans,
      });
    },
    [state]
  );

  const loadWorkoutSessionsFromSupabase = useCallback(
    async (userId: string, phaseId?: string) => {
      const currentState = stateRef.current;
      if (!currentState) return;
      try {
        const remoteSessions = await fetchWorkoutSessionEntries(
          userId,
          phaseId,
          getAppTimeZone()
        );
        await persistState({
          ...currentState,
          workoutSessions: remoteSessions,
          workoutDataVersion: nextWorkoutVersion(currentState),
        });
      } catch (err) {
        console.error('Failed to load workouts from Supabase:', err);
        setError('Failed to load workouts from Supabase');
      }
    },
    [persistState]
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

  const createWorkoutSession = useCallback(
    async (date: string) => {
      if (!state || !state.currentPhase || !state.user) return;
      const existing = state.workoutSessions.find(
        (session) =>
          session.phasePlanId === state.currentPhase!.id && session.date === date
      );
      if (existing) return;
      const sessionEntry = createSessionForDate(state.user, state.currentPhase.id, date);
      await persistState({
        ...state,
        workoutSessions: upsertWorkoutSession(state.workoutSessions, sessionEntry),
        workoutDataVersion: nextWorkoutVersion(state),
      });
    },
    [state]
  );

  const saveCustomWorkoutSession = useCallback(
    async (date: string, exercises: WorkoutSessionExercise[]) => {
      if (!state || !state.currentPhase || !state.user) return;
      const normalizedExercises = exercises.map((exercise) => ({
        ...exercise,
        bodyParts: exercise.bodyParts,
        sets: exercise.sets ?? 4,
        reps: exercise.reps ?? '8-12',
      }));

      const remoteSession = await upsertWorkoutSessionWithExercises({
        userId: state.user.id,
        phaseId: state.currentPhase.id,
        date,
        exercises: normalizedExercises,
      });

      await persistState({
        ...state,
        workoutSessions: upsertWorkoutSession(state.workoutSessions, remoteSession),
        workoutLogs: upsertWorkoutLog(state.workoutLogs, sessionToWorkoutLog(remoteSession)),
        workoutDataVersion: nextWorkoutVersion(state),
      });
    },
    [state]
  );

  const deleteWorkoutSession = useCallback(
    async (date: string) => {
      if (!state || !state.currentPhase || !state.user) return;
      await deleteWorkoutSessionRemote({
        userId: state.user.id,
        phaseId: state.currentPhase.id,
        date,
      });
      const filteredSessions = state.workoutSessions.filter(
        (session) =>
          !(session.phasePlanId === state.currentPhase!.id && session.date === date)
      );
      const filteredLogs = state.workoutLogs.filter(
        (log) => !(log.phasePlanId === state.currentPhase!.id && log.date === date)
      );
      await persistState({
        ...state,
        workoutSessions: filteredSessions,
        workoutLogs: filteredLogs,
        workoutDataVersion: nextWorkoutVersion(state),
      });
    },
    [state]
  );

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
    toggleHabit,
    schedulePhotoReminder,
    toggleMealCompletion,
    loadWorkoutSessionsFromSupabase,
    createWorkoutSession,
    saveCustomWorkoutSession,
    deleteWorkoutSession,
    hydrateFromRemote,
  };
};
