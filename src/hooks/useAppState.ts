import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppState,
  User,
  PhasePlan,
  PhotoCheckin,
  ProgressEstimate,
  createEmptyAppState,
  WorkoutSessionEntry,
  WorkoutSessionExercise,
  DailyMealPlan,
  PlanDay,
} from '../types/domain';
import { buildWorkoutAnalytics } from '../utils/workoutAnalytics';
import {
  fetchWorkoutSessionEntries,
  createSessionFromPlanWorkout,
  deleteWorkoutSessionRemote,
  toggleExerciseAndCheckSession, 
  markAllExercisesComplete,
  ensureSetsForExercises,
} from '../services/workoutService';
import { getAppTimeZone } from '../utils/time';
import { formatLocalDateYMD } from '../utils/date';
import { fetchMealPlansForRange } from '../services/mealService';
import { supabase } from '../lib/supabaseClient';
import {
  fetchPlanWorkoutsForRange,
  replacePlanExercisesForDate,
  deletePlanExercise,
  ensurePlanWorkoutForDate,
} from '../services/planSnapshotService';

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
      plannedWorkouts?: PlanDay[];
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
          plannedWorkouts:
            payload.plannedWorkouts !== undefined ? payload.plannedWorkouts : prev.plannedWorkouts,
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
      plannedWorkouts: [],
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
  const refreshWorkoutSessions = useCallback(
    async (userId: string, planId?: string) => {
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
      return remoteSessions;
    },
    []
  );

  const loadWorkoutSessionsFromSupabase = useCallback(
    async (userId: string, planId?: string) => {
      try {
        await refreshWorkoutSessions(userId, planId);
      } catch (err) {
        console.error('Failed to load workouts from Supabase:', err);
        setError('Failed to load workouts from Supabase');
      }
    },
    [refreshWorkoutSessions]
  );

  const loadPlannedWorkoutsFromSupabase = useCallback(
    async (userId: string, planId?: string | null) => {
      if (!planId) return;
      try {
        const today = new Date();
        const start = new Date(today);
        start.setDate(start.getDate() - 14);
        const end = new Date(today);
        end.setDate(end.getDate() + 14);
        const startKey = formatLocalDateYMD(start);
        const endKey = formatLocalDateYMD(end);
        const planned = await fetchPlanWorkoutsForRange(userId, planId, startKey, endKey);
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            plannedWorkouts: planned,
          };
        });
        return planned;
      } catch (err) {
        console.error('Failed to load planned workouts from Supabase:', err);
        return [];
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
      
      let session = current.workoutSessions.find(
        (s) => s.phasePlanId === current.currentPhase!.id && s.date === date
      );
      
      if (!session) {
        const planned = current.plannedWorkouts.find(
          (day) => day.planId === current.currentPhase!.id && day.date === date
        );
        const plannedExercises = planned?.workout?.exercises ?? [];
        if (!plannedExercises.length) {
          console.error('No planned workout found for date:', date);
          return;
        }

        const exercisesForSession: WorkoutSessionExercise[] = plannedExercises.map((exercise) => ({
          id: undefined,
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

        await createSessionFromPlanWorkout({
          userId: current.user.id,
          planId: current.currentPhase.id,
          date,
          exercises: exercisesForSession,
        });

        const refreshed = await refreshWorkoutSessions(
          current.user.id,
          current.currentPhase.id
        );
        session = refreshed.find(
          (s) => s.phasePlanId === current.currentPhase!.id && s.date === date
        );
      }
      if (!session) return;
  
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
        
        await refreshWorkoutSessions(current.user.id, current.currentPhase.id);
      } catch (error) {
        console.error('Failed to toggle exercise:', error);
        throw error;
      }
    },[refreshWorkoutSessions]);

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
        await refreshWorkoutSessions(current.user.id, current.currentPhase.id);
      } catch (error) {
        console.error('Failed to mark all complete:', error);
        throw error;
      }
    },
    [refreshWorkoutSessions]);

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
      const missingIds = normalizedExercises.filter((exercise) => !exercise.exerciseId);
      if (missingIds.length) {
        console.error(
          'Cannot save plan exercise without exerciseId. Missing ids:',
          missingIds.map((exercise) => exercise.name)
        );
        return;
      }
      await replacePlanExercisesForDate(
        current.user.id,
        current.currentPhase.id,
        date,
        normalizedExercises.map((exercise) => ({
          exerciseId: exercise.exerciseId!,
          name: exercise.name,
          bodyParts: exercise.bodyParts,
          movementPattern: exercise.movementPattern ?? null,
          sets: exercise.sets ?? null,
          reps: exercise.reps ?? null,
          displayOrder: exercise.displayOrder ?? null,
          notes: exercise.notes ?? null,
        }))
      );
      await loadPlannedWorkoutsFromSupabase(current.user.id, current.currentPhase.id);
    },
    [loadPlannedWorkoutsFromSupabase]
  );

  const createWorkoutSessionForDate = useCallback(
    async (date: string) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      const existing = current.workoutSessions.find(
        (entry) => entry.phasePlanId === current.currentPhase!.id && entry.date === date
      );
      if (existing) return;

      const planned = current.plannedWorkouts.find(
        (day) => day.planId === current.currentPhase!.id && day.date === date
      );
      const plannedExercises = planned?.workout?.exercises ?? [];
      if (!plannedExercises.length) {
        await ensurePlanWorkoutForDate(current.user.id, current.currentPhase.id, date);
        await loadPlannedWorkoutsFromSupabase(current.user.id, current.currentPhase.id);
        return;
      }

      const exercisesForSession: WorkoutSessionExercise[] = plannedExercises.map((exercise) => ({
        id: undefined,
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

      await createSessionFromPlanWorkout({
        userId: current.user.id,
        planId: current.currentPhase.id,
        date,
        exercises: exercisesForSession,
      });
      await refreshWorkoutSessions(current.user.id, current.currentPhase.id);
    },
    [loadPlannedWorkoutsFromSupabase, refreshWorkoutSessions]
  );

  const addWorkoutExercise = useCallback(
    async (planWorkoutId: string, exercise: WorkoutSessionExercise) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      if (!exercise.exerciseId) {
        throw new Error('exercise_id_required');
      }
      const displayOrder = exercise.displayOrder ?? 1;
      const { data, error } = await supabase
        .from('fitarc_plan_exercises')
        .insert({
          plan_workout_id: planWorkoutId,
          exercise_id: exercise.exerciseId,
          exercise_name: exercise.name,
          movement_pattern: exercise.movementPattern ?? null,
          body_parts: exercise.bodyParts ?? [],
          sets: exercise.sets ?? null,
          reps: exercise.reps ?? null,
          display_order: displayOrder,
          notes: exercise.notes ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      await loadPlannedWorkoutsFromSupabase(current.user.id, current.currentPhase.id);
      return data?.id;
    },
    [loadPlannedWorkoutsFromSupabase]
  );

  const deleteWorkoutExercise = useCallback(
    async (_planWorkoutId: string, planExerciseId: string) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      await deletePlanExercise(planExerciseId);
      await loadPlannedWorkoutsFromSupabase(current.user.id, current.currentPhase.id);
    },
    [loadPlannedWorkoutsFromSupabase]
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
      plannedWorkouts: [],
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
    loadPlannedWorkoutsFromSupabase,
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
