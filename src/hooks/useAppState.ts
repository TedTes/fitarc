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
import {
  fetchWorkoutSessionEntries,
  createWorkoutSession,
  deleteWorkoutSessionRemote,
  toggleExerciseAndCheckSession, 
  markAllExercisesComplete,
  ensureSetsForExercises,
  addExerciseToSession,
  updateSessionExercises,
  deleteWorkoutSessionExercise,
  ensureRollingWeekWorkouts,
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
      updateState((prev) => {
        const nextPhase = payload.phase !== undefined ? payload.phase : prev.currentPhase;
        const nextPhaseId = nextPhase?.id ?? null;
        const phaseChanged = nextPhaseId !== (prev.currentPhase?.id ?? null);
        const nextSessions =
          payload.workoutSessions !== undefined
            ? payload.workoutSessions.filter(
                (session) => !nextPhaseId || session.phasePlanId === nextPhaseId
              )
            : prev.workoutSessions;
        return {
          ...prev,
          user: payload.user !== undefined ? payload.user : prev.user,
          currentPhase: nextPhase,
          workoutSessions: nextSessions,
          workoutLogs: phaseChanged ? [] : prev.workoutLogs,
          strengthSnapshots: phaseChanged ? [] : prev.strengthSnapshots,
          workoutDataVersion: phaseChanged ? nextWorkoutVersion(prev) : prev.workoutDataVersion,
          mealPlans: payload.mealPlans !== undefined ? payload.mealPlans : prev.mealPlans,
        };
      });
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
      workoutSessions: [],
      workoutLogs: [],
      strengthSnapshots: [],
      workoutDataVersion: nextWorkoutVersion(prev),
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
        const current = stateRef.current;
        if (planId && current?.currentPhase && current?.user) {
          try {
            await ensureRollingWeekWorkouts(
              userId,
              planId,
              current.user.trainingSplit,
              new Date(),
              {
                eatingMode: current.user.eatingMode,
                experienceLevel: current.user.experienceLevel,
              }
            );
          } catch (err) {
            console.warn('Failed to ensure rolling workouts:', err);
          }
        }
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
      const plan = current.mealPlans.find(
        (item) => item.date === date && item.phasePlanId === current.currentPhase!.id
      );
      if (!plan) return;
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
      let session = current.workoutSessions.find(
        (entry) => entry.phasePlanId === current.currentPhase!.id && entry.date === date
      );
      if (!session) {
        session = await createWorkoutSession({
          userId: current.user.id,
          planId: current.currentPhase.id,
          date,
        });
      }

      const refreshedSessions = await fetchWorkoutSessionEntries(
        current.user.id,
        current.currentPhase.id,
        getAppTimeZone()
      );
      const existingSession = refreshedSessions.find((entry) => entry.id === session.id);
      const exerciseIdToSessionId = new Map<string, string>();
      const exerciseNameToSessionId = new Map<string, string>();
      existingSession?.exercises.forEach((entry) => {
        if (entry.exerciseId && entry.id) {
          exerciseIdToSessionId.set(entry.exerciseId, entry.id);
        }
        if (entry.name && entry.id) {
          exerciseNameToSessionId.set(entry.name.toLowerCase(), entry.id);
        }
      });

      const validSessionExerciseIds = new Set([
        ...exerciseIdToSessionId.values(),
        ...exerciseNameToSessionId.values(),
      ]);
      const exercisesWithIds = await Promise.all(
        normalizedExercises.map(async (exercise, index) => {
          if (exercise.exerciseId && exerciseIdToSessionId.has(exercise.exerciseId)) {
            return { ...exercise, id: exerciseIdToSessionId.get(exercise.exerciseId)! };
          }
          const nameKey = exercise.name?.toLowerCase();
          if (nameKey && exerciseNameToSessionId.has(nameKey)) {
            return { ...exercise, id: exerciseNameToSessionId.get(nameKey)! };
          }
          try {
            const sessionExerciseId = await addExerciseToSession({
              sessionId: session!.id,
              exercise,
              displayOrder: exercise.displayOrder ?? index + 1,
            });
            validSessionExerciseIds.add(sessionExerciseId);
            return { ...exercise, id: sessionExerciseId };
          } catch (err) {
            if (err instanceof Error && err.message === 'duplicate_exercise') {
              if (exercise.exerciseId && exerciseIdToSessionId.has(exercise.exerciseId)) {
                return { ...exercise, id: exerciseIdToSessionId.get(exercise.exerciseId)! };
              }
              if (nameKey && exerciseNameToSessionId.has(nameKey)) {
                return { ...exercise, id: exerciseNameToSessionId.get(nameKey)! };
              }
              return exercise;
            }
            throw err;
          }
        })
      );

      const exercisesForUpdate = exercisesWithIds.filter(
        (exercise) => exercise.id && validSessionExerciseIds.has(exercise.id)
      );

      await updateSessionExercises({
        sessionId: session.id,
        exercises: exercisesForUpdate,
      });

      const updatedSession: WorkoutSessionEntry = {
        ...session,
        exercises: exercisesWithIds,
      };

      updateState((prev) => ({
        ...prev,
        workoutSessions: refreshedSessions,
        workoutLogs: upsertWorkoutLog(prev.workoutLogs, sessionToWorkoutLog(updatedSession)),
        workoutDataVersion: nextWorkoutVersion(prev),
      }));
    },
    [updateState]
  );

  const createWorkoutSessionForDate = useCallback(
    async (date: string) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      const existing = current.workoutSessions.find(
        (entry) => entry.phasePlanId === current.currentPhase!.id && entry.date === date
      );
      if (existing) return;

      const created = await createWorkoutSession({
        userId: current.user.id,
        planId: current.currentPhase.id,
        date,
      });

      updateState((prev) => ({
        ...prev,
        workoutSessions: upsertWorkoutSession(prev.workoutSessions, created),
        workoutLogs: upsertWorkoutLog(prev.workoutLogs, sessionToWorkoutLog(created)),
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
      await loadWorkoutSessionsFromSupabase(current.user.id, current.currentPhase.id);
      return sessionExerciseId;
    },
    [loadWorkoutSessionsFromSupabase]
  );

  const deleteWorkoutExercise = useCallback(
    async (_sessionId: string, sessionExerciseId: string) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      await deleteWorkoutSessionExercise(sessionExerciseId);
      await loadWorkoutSessionsFromSupabase(current.user.id, current.currentPhase.id);
    },
    [loadWorkoutSessionsFromSupabase]
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

  const resetWorkoutData = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      workoutSessions: [],
      workoutLogs: [],
      strengthSnapshots: [],
      workoutDataVersion: nextWorkoutVersion(prev),
    }));
  }, [updateState]);

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
    createWorkoutSession: createWorkoutSessionForDate,
    addWorkoutExercise,
    deleteWorkoutExercise,
    deleteWorkoutSession,
    hydrateFromRemote,
    markAllWorkoutsComplete,
    resetWorkoutData,
  };
};
