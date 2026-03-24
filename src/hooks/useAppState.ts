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
  sessionHasLoggedProgress,
  addExerciseToSession,
  upsertWorkoutSessionWithExercises,
} from '../services/workoutService';
import { getAppTimeZone } from '../utils/time';
import { formatLocalDateYMD } from '../utils/date';
import {
  arePlanExerciseValuesEqual,
  classifyWorkoutSwapReason,
  mapSwapGuardrailError,
} from './workoutSwapUtils';
import {
  fetchPlanRange,
  appendPlanExercisesForDate,
  replacePlanExercisesForDate,
  deletePlanExercise,
  ensurePlanWorkoutForDate,
  swapPlanExerciseForDate,
} from '../services/planRuntimeService';

export const useAppState = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const lastWorkoutSwapRef = useRef<{
    userId: string;
    planId: string;
    date: string;
    targetPlanExerciseId: string;
    previous: {
      exerciseId: string;
      name: string;
      bodyParts: string[];
      movementPattern?: string | null;
      sets?: number | null;
      reps?: string | null;
      displayOrder?: number | null;
      notes?: string | null;
      sourceTemplateExerciseId?: string | null;
    };
  } | null>(null);
  const [lastWorkoutSwapVersion, setLastWorkoutSwapVersion] = useState(0);
  const nextWorkoutVersion = (base?: AppState | null) =>
    (base?.workoutDataVersion ?? 0) + 1;

  const sanitizeTemplateExercises = useCallback(
    (exercises: WorkoutSessionExercise[]): WorkoutSessionExercise[] => {
      const seen = new Set<string>();
      const next: WorkoutSessionExercise[] = [];

      exercises.forEach((exercise) => {
        if (!exercise.exerciseId) {
          console.warn('Skipping template exercise without exerciseId:', exercise.name);
          return;
        }
        const key = exercise.exerciseId;
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        next.push({
          ...exercise,
          displayOrder: exercise.displayOrder ?? next.length + 1,
        });
      });

      return next;
    },
    []
  );

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

  const applyOptimisticWorkoutSessions = useCallback(
    (updater: (sessions: WorkoutSessionEntry[]) => WorkoutSessionEntry[]) => {
      updateState((prev) => {
        const nextSessions = updater(prev.workoutSessions);
        const analytics = buildWorkoutAnalytics(nextSessions);
        return {
          ...prev,
          workoutSessions: nextSessions,
          workoutLogs: analytics.workoutLogs,
          strengthSnapshots: analytics.strengthSnapshots,
          workoutDataVersion: nextWorkoutVersion(prev),
        };
      });
    },
    [updateState]
  );

  const hydrateFromRemote = useCallback(
    (payload: {
      user?: User | null;
      phase?: PhasePlan | null;
      workoutSessions?: WorkoutSessionEntry[];
      plannedWorkouts?: PlanDay[];
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
        const analytics = buildWorkoutAnalytics(nextSessions);
        return {
          ...prev,
          user: payload.user !== undefined ? payload.user : prev.user,
          currentPhase: nextPhase,
          workoutSessions: nextSessions,
          plannedWorkouts:
            payload.plannedWorkouts !== undefined ? payload.plannedWorkouts : prev.plannedWorkouts,
          workoutLogs: analytics.workoutLogs,
          strengthSnapshots: analytics.strengthSnapshots,
          workoutDataVersion:
            payload.workoutSessions !== undefined || phaseChanged
              ? nextWorkoutVersion(prev)
              : prev.workoutDataVersion,
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
        const planned = await fetchPlanRange(userId, planId, startKey, endKey);
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

  const buildSourceExercisesForDate = useCallback(
    (
      current: AppState,
      phaseId: string,
      date: string,
      currentExercises?: WorkoutSessionExercise[]
    ): WorkoutSessionExercise[] => {
      const planned = current.plannedWorkouts.find(
        (day) => day.planId === phaseId && day.date === date
      );
      const plannedExercises = planned?.workout?.exercises ?? [];
      return currentExercises?.length
        ? currentExercises
        : plannedExercises.map((exercise) => ({
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
    },
    []
  );

  const findSessionForDate = useCallback(
    (sessions: WorkoutSessionEntry[], phaseId: string, date: string) =>
      sessions.find((session) => session.phasePlanId === phaseId && session.date === date),
    []
  );

  const ensurePersistedSessionForDate = useCallback(
    async (
      current: AppState,
      date: string,
      currentExercises?: WorkoutSessionExercise[]
    ): Promise<WorkoutSessionEntry | undefined> => {
      if (!current.currentPhase || !current.user) return undefined;

      const phaseId = current.currentPhase.id;
      const sourceExercises = buildSourceExercisesForDate(current, phaseId, date, currentExercises);
      let session = findSessionForDate(current.workoutSessions, phaseId, date);

      if (!session) {
        if (!sourceExercises.length) {
          console.error('No exercises available to create session for date:', date);
          return undefined;
        }

        await createSessionFromPlanWorkout({
          userId: current.user.id,
          planId: phaseId,
          date,
          exercises: sourceExercises,
        });

        const refreshed = await refreshWorkoutSessions(current.user.id, phaseId);
        return findSessionForDate(refreshed, phaseId, date);
      }

      const needsRebuild =
        session.id.startsWith('local:') ||
        session.exercises.length === 0 ||
        session.exercises.some((exercise) => !exercise.id || exercise.id.startsWith('local:'));

      if (!needsRebuild) {
        return session;
      }

      if (!sourceExercises.length) {
        console.error('Session cannot be rebuilt because no exercises exist for date:', date);
        return undefined;
      }

      if (session.id.startsWith('local:')) {
        await upsertWorkoutSessionWithExercises({
          userId: current.user.id,
          planId: phaseId,
          date,
          exercises: sourceExercises,
        });
      } else {
        await createSessionFromPlanWorkout({
          userId: current.user.id,
          planId: phaseId,
          date,
          exercises: sourceExercises,
        });
      }

      const refreshed = await refreshWorkoutSessions(current.user.id, phaseId);
      return findSessionForDate(refreshed, phaseId, date);
    },
    [buildSourceExercisesForDate, findSessionForDate, refreshWorkoutSessions]
  );


  const toggleWorkoutExercise = useCallback(
    async (
      date: string,
      exerciseName: string,
      exerciseId?: string,
      currentExercises?: WorkoutSessionExercise[]
    ) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      const todayKey = formatLocalDateYMD(new Date());
      if (date > todayKey) {
        console.warn('Blocked completion for future workout date:', date);
        return;
      }
      const phaseId = current.currentPhase.id;

      const buildSourceExercises = () =>
        buildSourceExercisesForDate(current, phaseId, date, currentExercises);

      let session = findSessionForDate(current.workoutSessions, phaseId, date);

      if (!session) {
        const sourceExercises = buildSourceExercises();

        if (sourceExercises.length) {
          const optimisticSessionId = `local:${phaseId}:${date}`;
          const optimisticExercises = sourceExercises.map((exercise, index) => ({
            ...exercise,
            id:
              exercise.id ??
              `local:${phaseId}:${date}:${exercise.exerciseId ?? exercise.name}:${index}`,
            completed: exercise.completed ?? false,
          }));

          applyOptimisticWorkoutSessions((sessions) => [
            ...sessions.filter(
              (entry) => !(entry.phasePlanId === phaseId && entry.date === date)
            ),
            {
              id: optimisticSessionId,
              phasePlanId: phaseId,
              date,
              exercises: optimisticExercises,
              notes: undefined,
              completed: false,
            },
          ]);

          session = {
            id: optimisticSessionId,
            phasePlanId: phaseId,
            date,
            exercises: optimisticExercises,
            notes: undefined,
            completed: false,
          };
        }
      }

      if (!session) {
        session = await ensurePersistedSessionForDate(current, date, currentExercises);
      }
      if (!session) return;

      // Find by exerciseId first (reliable), fall back to name match
      const findExercise = (s: typeof session) =>
        (exerciseId ? s?.exercises.find((ex) => ex.exerciseId === exerciseId) : undefined) ??
        s?.exercises.find(
          (ex) => ex.name.toLowerCase().trim() === exerciseName.toLowerCase().trim()
        );

      let exercise = findExercise(session);

      // If session has no exercises, upsert and re-fetch
      if ((!exercise || !exercise.id) && session.exercises.length === 0) {
        const sourceExercises = buildSourceExercises();
        if (sourceExercises.length > 0) {
          await upsertWorkoutSessionWithExercises({
            userId: current.user.id,
            planId: phaseId,
            date,
            exercises: sourceExercises,
          });
          const refreshed = await refreshWorkoutSessions(current.user.id, phaseId);
          session = refreshed.find((s) => s.phasePlanId === phaseId && s.date === date);
          exercise = findExercise(session);
        }
      }

      // If exercise was found but still has a local ID, the optimistic state
      // hasn't been replaced by real DB IDs yet — force a refresh now
      if (exercise?.id?.startsWith('local:')) {
        const refreshed = await refreshWorkoutSessions(current.user.id, phaseId);
        session = refreshed.find((s) => s.phasePlanId === phaseId && s.date === date);
        exercise = findExercise(session);
      }

      if (!exercise || !exercise.id) {
        console.error(
          'Exercise not found in session:',
          exerciseName,
          exerciseId,
          session?.exercises.map((e) => e.name) ?? []
        );
        return;
      }
      if (!session) return;

      try {
        const willComplete = !(exercise.completed ?? false);
        applyOptimisticWorkoutSessions((sessions) =>
          sessions.map((entry) =>
            entry.id !== session.id
              ? entry
              : {
                  ...entry,
                  exercises: entry.exercises.map((entryExercise) =>
                    entryExercise.id !== exercise.id
                      ? entryExercise
                      : {
                          ...entryExercise,
                          completed: willComplete,
                        }
                  ),
                }
          )
        );

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
        await refreshWorkoutSessions(current.user.id, current.currentPhase.id);
        throw error;
      }
    },[
      applyOptimisticWorkoutSessions,
      buildSourceExercisesForDate,
      ensurePersistedSessionForDate,
      findSessionForDate,
      refreshWorkoutSessions
    ]);

  const markAllWorkoutsComplete = useCallback(
    async (date: string) => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      const todayKey = formatLocalDateYMD(new Date());
      if (date > todayKey) {
        console.warn('Blocked mark-all-complete for future workout date:', date);
        return;
      }
      
      const phaseId = current.currentPhase.id;
      const session = await ensurePersistedSessionForDate(current, date);

      if (!session) return;
      
      try {
        applyOptimisticWorkoutSessions((sessions) =>
          sessions.map((entry) =>
            entry.id !== session.id
              ? entry
              : {
                  ...entry,
                  completed: true,
                  exercises: entry.exercises.map((exercise) => ({
                    ...exercise,
                    completed: true,
                  })),
                }
          )
        );
        await ensureSetsForExercises(session.exercises);
        await markAllExercisesComplete(session.id);
        await refreshWorkoutSessions(current.user.id, phaseId);
      } catch (error) {
        console.error('Failed to mark all complete:', error);
        await refreshWorkoutSessions(current.user.id, phaseId);
        throw error;
      }
    },
    [applyOptimisticWorkoutSessions, ensurePersistedSessionForDate, refreshWorkoutSessions]);

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
      const nextInputs = normalizedExercises.map((exercise) => {
        const templateId = exercise.id?.startsWith('tpl:')
          ? exercise.id.split(':').pop() ?? null
          : null;
        return {
          exerciseId: exercise.exerciseId!,
          name: exercise.name,
          bodyParts: exercise.bodyParts,
          movementPattern: exercise.movementPattern ?? null,
          sets: exercise.sets ?? null,
          reps: exercise.reps ?? null,
          displayOrder: exercise.displayOrder ?? null,
          notes: exercise.notes ?? null,
          sourceTemplateExerciseId: templateId,
        };
      });

      const currentPlanDay = current.plannedWorkouts.find(
        (day) => day.planId === current.currentPhase!.id && day.date === date
      );
      const existingExercises = currentPlanDay?.workout?.exercises ?? [];
      const sameLength = existingExercises.length === nextInputs.length;
      const changedIndices: number[] = [];
      if (sameLength) {
        for (let index = 0; index < nextInputs.length; index++) {
          const existing = existingExercises[index];
          const next = nextInputs[index];
          if (!existing || !arePlanExerciseValuesEqual(existing, next)) {
            changedIndices.push(index);
          }
        }
      }

      const shouldUseGuardedSwap = sameLength && changedIndices.length === 1;
      if (shouldUseGuardedSwap) {
        const changedIndex = changedIndices[0];
        const targetExercise = existingExercises[changedIndex];
        const replacement = nextInputs[changedIndex];
        if (targetExercise?.id?.startsWith('tpl:') && replacement) {
          const previousTemplateExerciseId = targetExercise.id.split(':').pop() ?? null;
          const swapReason = classifyWorkoutSwapReason(targetExercise, replacement);
          try {
            await swapPlanExerciseForDate({
              userId: current.user.id,
              planId: current.currentPhase.id,
              date,
              targetPlanExerciseId: targetExercise.id,
              replacement,
              reason: swapReason,
              enforceGuardrails: true,
            });
            lastWorkoutSwapRef.current = {
              userId: current.user.id,
              planId: current.currentPhase.id,
              date,
              targetPlanExerciseId: targetExercise.id,
              previous: {
                exerciseId: targetExercise.exerciseId,
                name: targetExercise.name,
                bodyParts: targetExercise.bodyParts,
                movementPattern: targetExercise.movementPattern ?? null,
                sets: targetExercise.sets ?? null,
                reps: targetExercise.reps ?? null,
                displayOrder: targetExercise.displayOrder ?? null,
                notes: targetExercise.notes ?? null,
                sourceTemplateExerciseId: previousTemplateExerciseId,
              },
            };
            setLastWorkoutSwapVersion((value) => value + 1);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'swap_failed';
            const mappedMessage = mapSwapGuardrailError(message);
            if (mappedMessage) {
              throw new Error(mappedMessage);
            }
            throw err;
          }
        } else {
          await replacePlanExercisesForDate(current.user.id, current.currentPhase.id, date, nextInputs);
          lastWorkoutSwapRef.current = null;
          setLastWorkoutSwapVersion((value) => value + 1);
        }
      } else {
        await replacePlanExercisesForDate(current.user.id, current.currentPhase.id, date, nextInputs);
        lastWorkoutSwapRef.current = null;
        setLastWorkoutSwapVersion((value) => value + 1);
      }
      await loadPlannedWorkoutsFromSupabase(current.user.id, current.currentPhase.id);
    },
    [loadPlannedWorkoutsFromSupabase]
  );

  const canUndoWorkoutSwap = useCallback(
    (date: string): boolean => {
      const last = lastWorkoutSwapRef.current;
      if (!last) return false;
      return last.date === date;
    },
    [lastWorkoutSwapVersion]
  );

  const undoLastWorkoutSwap = useCallback(
    async (date: string): Promise<boolean> => {
      const last = lastWorkoutSwapRef.current;
      if (!last || last.date !== date) return false;
      await swapPlanExerciseForDate({
        userId: last.userId,
        planId: last.planId,
        date: last.date,
        targetPlanExerciseId: last.targetPlanExerciseId,
        replacement: last.previous,
        reason: 'undo_last_swap',
        enforceGuardrails: false,
      });
      lastWorkoutSwapRef.current = null;
      setLastWorkoutSwapVersion((value) => value + 1);
      await loadPlannedWorkoutsFromSupabase(last.userId, last.planId);
      return true;
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
      const virtualParts = planWorkoutId.startsWith('virtual:')
        ? planWorkoutId.split(':')
        : null;
      const virtualPlanId = virtualParts?.[1];
      const virtualDate = virtualParts?.[2];
      const resolvedDate =
        virtualDate ??
        current.plannedWorkouts.find((day) => day.workout?.id === planWorkoutId)?.date ??
        formatLocalDateYMD(new Date());
      const resolvedPlanId = virtualPlanId ?? current.currentPhase.id;

      await appendPlanExercisesForDate(current.user.id, resolvedPlanId, resolvedDate, [
        {
          exerciseId: exercise.exerciseId,
          name: exercise.name,
          bodyParts: exercise.bodyParts ?? [],
          movementPattern: exercise.movementPattern ?? null,
          sets: exercise.sets ?? null,
          reps: exercise.reps ?? null,
          displayOrder: exercise.displayOrder ?? 1,
          notes: exercise.notes ?? null,
        },
      ]);
      await loadPlannedWorkoutsFromSupabase(current.user.id, current.currentPhase.id);
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

  /**
   * Replace today's workout session entirely with template exercises.
   * Returns { hasProgress: true } if the current session has logged data (caller should warn).
   * Pass force=true to skip the progress check and proceed anyway.
   */
  const replaceSessionWithTemplate = useCallback(
    async (
      date: string,
      exercises: WorkoutSessionExercise[],
      force = false
    ): Promise<{ hasProgress: boolean }> => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return { hasProgress: false };
      const sanitizedExercises = sanitizeTemplateExercises(exercises);
      if (!sanitizedExercises.length) {
        throw new Error('no_valid_template_exercises');
      }

      const existingSession = current.workoutSessions.find(
        (s) => s.phasePlanId === current.currentPhase!.id && s.date === date
      );

      if (!force && existingSession?.id) {
        const hasProgress = await sessionHasLoggedProgress(existingSession.id);
        if (hasProgress) return { hasProgress: true };
      }

      // Delete existing session + child rows
      await deleteWorkoutSessionRemote({
        userId: current.user.id,
        planId: current.currentPhase.id,
        date,
      });

      const normalizedExercises = sanitizedExercises.map((ex, idx) => ({
        exerciseId: ex.exerciseId!,
        name: ex.name,
        bodyParts: ex.bodyParts ?? [],
        movementPattern: ex.movementPattern ?? null,
        sets: ex.sets ?? null,
        reps: ex.reps ?? null,
        displayOrder: ex.displayOrder ?? idx + 1,
        notes: ex.notes ?? null,
        sourceTemplateExerciseId: null,
      }));

      // Replace plan overrides
      await replacePlanExercisesForDate(
        current.user.id,
        current.currentPhase.id,
        date,
        normalizedExercises
      );

      // Create new session with template exercises
      await createSessionFromPlanWorkout({
        userId: current.user.id,
        planId: current.currentPhase.id,
        date,
        exercises: sanitizedExercises.map((ex, idx) => ({
          id: undefined,
          exerciseId: ex.exerciseId,
          name: ex.name,
          bodyParts: ex.bodyParts,
          movementPattern: ex.movementPattern,
          sets: ex.sets ?? 4,
          reps: ex.reps ?? '8-12',
          completed: false,
          displayOrder: ex.displayOrder ?? idx + 1,
          notes: ex.notes,
        })),
      });

      await Promise.all([
        loadPlannedWorkoutsFromSupabase(current.user.id, current.currentPhase.id),
        refreshWorkoutSessions(current.user.id, current.currentPhase.id),
      ]);

      updateState((prev) => ({
        ...prev,
        workoutDataVersion: nextWorkoutVersion(prev),
      }));

      return { hasProgress: false };
    },
    [loadPlannedWorkoutsFromSupabase, refreshWorkoutSessions, sanitizeTemplateExercises, updateState]
  );

  /**
   * Append selected exercises to today's plan overrides and, if a session exists, to the session.
   */
  const appendExercisesToSession = useCallback(
    async (date: string, exercises: WorkoutSessionExercise[]): Promise<void> => {
      const current = stateRef.current;
      if (!current || !current.currentPhase || !current.user) return;
      const sanitizedIncoming = sanitizeTemplateExercises(exercises);
      if (!sanitizedIncoming.length) {
        throw new Error('no_valid_template_exercises');
      }
      const existingPlanDay = current.plannedWorkouts.find(
        (day) => day.planId === current.currentPhase!.id && day.date === date
      );
      const existingIds = new Set(
        (existingPlanDay?.workout?.exercises ?? []).map((exercise) => exercise.exerciseId).filter(Boolean)
      );
      const uniqueExercises = sanitizedIncoming.filter((exercise) => !existingIds.has(exercise.exerciseId ?? ''));
      if (!uniqueExercises.length) {
        return;
      }

      const planExerciseInputs = uniqueExercises.map((ex, idx) => ({
        exerciseId: ex.exerciseId!,
        name: ex.name,
        bodyParts: ex.bodyParts ?? [],
        movementPattern: ex.movementPattern ?? null,
        sets: ex.sets ?? null,
        reps: ex.reps ?? null,
        displayOrder: ex.displayOrder ?? idx + 1,
        notes: ex.notes ?? null,
      }));

      // Append to plan overrides
      await appendPlanExercisesForDate(
        current.user.id,
        current.currentPhase.id,
        date,
        planExerciseInputs
      );

      // If session already exists, also append to session exercises
      const existingSession = current.workoutSessions.find(
        (s) => s.phasePlanId === current.currentPhase!.id && s.date === date
      );
      if (existingSession?.id) {
        const currentCount = existingSession.exercises.length;
        for (let i = 0; i < uniqueExercises.length; i++) {
          const ex = uniqueExercises[i];
          try {
            await addExerciseToSession({
              sessionId: existingSession.id,
              exercise: ex,
              displayOrder: currentCount + i + 1,
            });
          } catch (err: unknown) {
            if (err instanceof Error && err.message === 'duplicate_exercise') continue;
            throw err;
          }
        }
      }

      await Promise.all([
        loadPlannedWorkoutsFromSupabase(current.user.id, current.currentPhase.id),
        refreshWorkoutSessions(current.user.id, current.currentPhase.id),
      ]);

      updateState((prev) => ({
        ...prev,
        workoutDataVersion: nextWorkoutVersion(prev),
      }));
    },
    [loadPlannedWorkoutsFromSupabase, refreshWorkoutSessions, sanitizeTemplateExercises, updateState]
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
    loadWorkoutSessionsFromSupabase,
    loadPlannedWorkoutsFromSupabase,
    saveCustomWorkoutSession,
    createWorkoutSession: createWorkoutSessionForDate,
    addWorkoutExercise,
    deleteWorkoutExercise,
    deleteWorkoutSession,
    replaceSessionWithTemplate,
    appendExercisesToSession,
    canUndoWorkoutSwap,
    undoLastWorkoutSwap,
    hydrateFromRemote,
    markAllWorkoutsComplete,
    resetWorkoutData,
  };
};
