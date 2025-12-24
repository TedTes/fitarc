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
  sessionToWorkoutLog,
} from '../utils/workoutPlanner';
import { buildWorkoutAnalytics } from '../utils/workoutAnalytics';
import { createMealPlanForDate } from '../utils/dietPlanner';
import {
  fetchWorkoutSessionEntries,
  deleteWorkoutSessionRemote,
  toggleExerciseAndCheckSession, 
  markAllExercisesComplete,
  ensureSetsForExercises,
  addExerciseToSession,
  updateSessionExercises,
  deleteWorkoutSessionExercise,
} from '../services/workoutService';
import { getAppTimeZone } from '../utils/time';
import { formatLocalDateYMD } from '../utils/date';
import { fetchMealPlansForRange } from '../services/mealService';

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

  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setState((prev) => {
      const base = prev ?? createEmptyAppState();
      return updater(base);
    });
  }, []);

  const hydrateFromRemote = useCallback(
    (payload: {
      user?: User | null;
      phase?: PhasePlan | null;
      workoutSessions?: WorkoutSessionEntry[];
      mealPlans?: DailyMealPlan[];
    }) => {
      updateState((prev) => ({
        ...prev,
        user: payload.user !== undefined ? payload.user : prev.user,
        currentPhase: payload.phase !== undefined ? payload.phase : prev.currentPhase,
        workoutSessions:
          payload.workoutSessions !== undefined ? payload.workoutSessions : prev.workoutSessions,
        mealPlans: payload.mealPlans !== undefined ? payload.mealPlans : prev.mealPlans,
      }));
    },
    [updateState]
  );

  const updateUser = useCallback((user: User) => {
    updateState((prev) => ({
      ...prev,
      user,
    }));
  }, [updateState]);

  const startPhase = useCallback((phase: PhasePlan) => {
    updateState((prev) => ({
      ...prev,
      currentPhase: phase,
    }));
  }, [updateState]);

  const addPhotoCheckin = useCallback((photo: PhotoCheckin) => {
    updateState((prev) => ({
      ...prev,
      photoCheckins: [...prev.photoCheckins, photo],
    }));
  }, [updateState]);

  const updateProgress = useCallback((estimate: ProgressEstimate) => {
    updateState((prev) => ({
      ...prev,
      progressEstimate: estimate,
    }));
  }, [updateState]);

  const completePhase = useCallback(() => {
    updateState((prev) => {
      if (!prev.currentPhase) return prev;
      return {
        ...prev,
        currentPhase: {
          ...prev.currentPhase,
          status: 'completed',
        },
      };
    });
  }, [updateState]);
  const loadWorkoutSessionsFromSupabase = useCallback(
    async (userId: string, planId?: string) => {
      try {
        const remoteSessions = await fetchWorkoutSessionEntries(
          userId,
          planId,
          getAppTimeZone()
        );
        const analytics = buildWorkoutAnalytics(remoteSessions);
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            workoutSessions: remoteSessions,
            workoutLogs: analytics.workoutLogs,
            strengthSnapshots: analytics.strengthSnapshots,
            workoutDataVersion: nextWorkoutVersion(prev),
          };
        });
      } catch (err) {
        console.error('Failed to load workouts from Supabase:', err);
        setError('Failed to load workouts from Supabase');
      }
    },
    []
  );

  const loadMealPlansFromSupabase = useCallback(
    async (userId: string, planId?: string | null) => {
      try {
        const today = new Date();
        const start = new Date(today);
        start.setDate(start.getDate() - 14);
        const end = new Date(today);
        end.setDate(end.getDate() + 7);
        const startKey = formatLocalDateYMD(start);
        const endKey = formatLocalDateYMD(end);
        const remotePlans = await fetchMealPlansForRange(
          userId,
          startKey,
          endKey,
          planId ?? undefined
        );
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            mealPlans: remotePlans,
          };
        });
      } catch (err) {
        console.error('Failed to load meals from Supabase:', err);
      }
    },
    []
  );

  const toggleWorkoutExercise = useCallback(
    async (date: string, exerciseName: string) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      
      const session = current.workoutSessions.find(
        (s) => s.phasePlanId === current.currentPhase!.id && s.date === date
      );
      
      if (!session) {
        console.error('No session found for date:', date);
        return;
      }
  
      const exercise = session.exercises.find((ex) => ex.name === exerciseName);
      
      if (!exercise || !exercise.id) {
        console.error('Exercise not found or missing ID:', exerciseName);
        return;
      }
  
      try {
        const willComplete = !(exercise.completed ?? false);
        if (willComplete) {
          await ensureSetsForExercises([exercise]);
        }
        await toggleExerciseAndCheckSession(
          session.id,
          exercise.id,
          exercise.completed || false
        );
        
        await loadWorkoutSessionsFromSupabase(current.user.id, current.currentPhase.id);
      } catch (error) {
        console.error('Failed to toggle exercise:', error);
        throw error;
      }
    },[loadWorkoutSessionsFromSupabase]);

  const markAllWorkoutsComplete = useCallback(
    async (date: string) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      
      const session = current.workoutSessions.find(
        (s) => s.phasePlanId === current.currentPhase!.id && s.date === date
      );
      
      if (!session) {
        console.error('No session found for date:', date);
        return;
      }
      
      try {
        await ensureSetsForExercises(session.exercises);
        await markAllExercisesComplete(session.id);
        await loadWorkoutSessionsFromSupabase(current.user.id, current.currentPhase.id);
      } catch (error) {
        console.error('Failed to mark all complete:', error);
        throw error;
      }
    },
    [loadWorkoutSessionsFromSupabase]);

  const toggleMealCompletion = useCallback(
    async (date: string, mealTitle: string) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      const plan = getOrCreateMealPlan(
        current.mealPlans,
        current.user,
        current.currentPhase.id,
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
      const updatedPlans = upsertMealPlan(current.mealPlans, updatedPlan);
      updateState((prev) => ({
        ...prev,
        mealPlans: updatedPlans,
      }));
    },
    [updateState]
  );


  const schedulePhotoReminder = useCallback(
    async (date: string) => {
      updateState((prev) => ({
        ...prev,
        nextPhotoReminder: date,
      }));
    },
    [updateState]
  );

  const saveCustomWorkoutSession = useCallback(
    async (date: string, exercises: WorkoutSessionExercise[]) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      const normalizedExercises = exercises.map((exercise, index) => ({
        ...exercise,
        bodyParts: exercise.bodyParts,
        sets: exercise.sets ?? 4,
        reps: exercise.reps ?? '8-12',
        displayOrder: exercise.displayOrder ?? index + 1,
      }));
      const session = current.workoutSessions.find(
        (entry) => entry.phasePlanId === current.currentPhase!.id && entry.date === date
      );
      if (!session) return;

      await updateSessionExercises({
        sessionId: session.id,
        exercises: normalizedExercises,
      });

      const updatedSession: WorkoutSessionEntry = {
        ...session,
        exercises: normalizedExercises,
      };

      updateState((prev) => ({
        ...prev,
        workoutSessions: upsertWorkoutSession(prev.workoutSessions, updatedSession),
        workoutLogs: upsertWorkoutLog(prev.workoutLogs, sessionToWorkoutLog(updatedSession)),
        workoutDataVersion: nextWorkoutVersion(prev),
      }));
    },
    [updateState]
  );

  const addWorkoutExercise = useCallback(
    async (sessionId: string, exercise: WorkoutSessionExercise) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      const session = current.workoutSessions.find((entry) => entry.id === sessionId);
      const displayOrder = exercise.displayOrder ?? (session?.exercises.length ?? 0) + 1;
      const sessionExerciseId = await addExerciseToSession({
        sessionId,
        exercise,
        displayOrder,
      });
      return sessionExerciseId;
    },
    []
  );

  const deleteWorkoutExercise = useCallback(
    async (sessionId: string, sessionExerciseId: string) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      await deleteWorkoutSessionExercise(sessionExerciseId);
      const session = current.workoutSessions.find((entry) => entry.id === sessionId);
      if (!session) return;
      const updatedSession: WorkoutSessionEntry = {
        ...session,
        exercises: session.exercises.filter((exercise) => exercise.id !== sessionExerciseId),
      };
      updateState((prev) => ({
        ...prev,
        workoutSessions: upsertWorkoutSession(prev.workoutSessions, updatedSession),
        workoutLogs: upsertWorkoutLog(prev.workoutLogs, sessionToWorkoutLog(updatedSession)),
        workoutDataVersion: nextWorkoutVersion(prev),
      }));
    },
    [updateState]
  );

  const deleteWorkoutSession = useCallback(
    async (date: string) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      await deleteWorkoutSessionRemote({
        userId: current.user.id,
        planId: current.currentPhase.id,
        date,
      });
      const filteredSessions = current.workoutSessions.filter(
        (session) =>
          !(session.phasePlanId === current.currentPhase!.id && session.date === date)
      );
      const filteredLogs = current.workoutLogs.filter(
        (log) => !(log.phasePlanId === current.currentPhase!.id && log.date === date)
      );
      updateState((prev) => ({
        ...prev,
        workoutSessions: filteredSessions,
        workoutLogs: filteredLogs,
        workoutDataVersion: nextWorkoutVersion(prev),
      }));
    },
    [updateState]
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
    schedulePhotoReminder,
    toggleMealCompletion,
    loadWorkoutSessionsFromSupabase,
    loadMealPlansFromSupabase,
    saveCustomWorkoutSession,
    addWorkoutExercise,
    deleteWorkoutExercise,
    deleteWorkoutSession,
    hydrateFromRemote,
    markAllWorkoutsComplete,
  };
};
