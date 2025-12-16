import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppState,
  User,
  PhasePlan,
  PhotoCheckin,
  ProgressEstimate,
  createEmptyAppState,
  WorkoutLog,
  WorkoutSessionEntry,
  WorkoutSessionExercise,
  DailyMealPlan,
} from '../types/domain';
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

export const useAppState = () => {
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
    // Initialize with empty state - no persistent storage
    setState(createEmptyAppState());
    setIsLoading(false);
  }, []);

  // Update in-memory state only (no persistence)
  const persistState = useCallback(async (newState: AppState) => {
    setState(newState);
  }, []);

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
  }, [state, persistState]);

  const startPhase = useCallback(async (phase: PhasePlan) => {
    if (!state) return;
    const newState: AppState = {
      ...state,
      currentPhase: phase,
    };
    await persistState(newState);
  }, [state, persistState]);

  const addPhotoCheckin = useCallback(async (photo: PhotoCheckin) => {
    if (!state) return;
    const newState: AppState = {
      ...state,
      photoCheckins: [...state.photoCheckins, photo],
    };
    await persistState(newState);
  }, [state, persistState]);

  const updateProgress = useCallback(async (estimate: ProgressEstimate) => {
    if (!state) return;
    const newState: AppState = {
      ...state,
      progressEstimate: estimate,
    };
    await persistState(newState);
  }, [state, persistState]);

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
  }, [state, persistState]);

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
    [state, persistState]
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
    [state, persistState]
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
    [state, persistState]
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
    [state, persistState]
  );

  const createWorkoutSession = useCallback(
    async (date: string) => {
      if (!state || !state.currentPhase || !state.user) return;
      const existing = state.workoutSessions.find(
        (session) =>
          session.phasePlanId === state.currentPhase!.id && session.date === date
      );
      if (existing) return;
      
      // Generate workout exercises based on user's training split
      const sessionEntry = createSessionForDate(state.user, state.currentPhase.id, date);
      
      // Save to Supabase database
      const remoteSession = await upsertWorkoutSessionWithExercises({
        userId: state.user.id,
        phaseId: state.currentPhase.id,
        date,
        exercises: sessionEntry.exercises,
      });

      // Update local state with the session from Supabase (has proper IDs)
      await persistState({
        ...state,
        workoutSessions: upsertWorkoutSession(state.workoutSessions, remoteSession),
        workoutLogs: upsertWorkoutLog(state.workoutLogs, sessionToWorkoutLog(remoteSession)),
        workoutDataVersion: nextWorkoutVersion(state),
      });
    },
    [state, persistState]
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
    [state, persistState]
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
    [state, persistState]
  );

  const clearAllData = useCallback(async () => {
    // Simply reset to empty state (no AsyncStorage to clear)
    setState(createEmptyAppState());
  }, []);

  return {
    state,
    isLoading,
    error,
    updateUser,
    startPhase,
    addPhotoCheckin,
    updateProgress,
    completePhase,
    clearAllData,
    toggleWorkoutExercise,
    reorderWorkoutExercise,
    schedulePhotoReminder,
    toggleMealCompletion,
    loadWorkoutSessionsFromSupabase,
    createWorkoutSession,
    saveCustomWorkoutSession,
    deleteWorkoutSession,
    hydrateFromRemote,
  };
};