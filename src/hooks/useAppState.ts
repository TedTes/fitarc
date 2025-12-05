import { useState, useEffect, useCallback } from 'react';
import { AppState, User, PhasePlan, DailyAdherenceLog, PhotoCheckin, ProgressEstimate, createEmptyAppState } from '../types/domain';
import { StorageAdapter } from '../storage';

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
      },
    };
    await persistState(newState);
  }, [state]);

  const logAdherence = useCallback(async (log: DailyAdherenceLog) => {
    if (!state) return;
    
    const existingLogIndex = state.adherenceLogs.findIndex(
      l => l.date === log.date && l.phasePlanId === log.phasePlanId
    );

    let updatedLogs: DailyAdherenceLog[];
    if (existingLogIndex >= 0) {
      updatedLogs = [...state.adherenceLogs];
      updatedLogs[existingLogIndex] = {
        ...log,
        workoutDone: Boolean(log.workoutDone),
        dietFollowed: Boolean(log.dietFollowed),
        habits: {
          stepsTargetMet: Boolean(log.habits.stepsTargetMet),
          sleepTargetMet: Boolean(log.habits.sleepTargetMet),
        },
      };
    } else {
      updatedLogs = [
        ...state.adherenceLogs, 
        {
          ...log,
          workoutDone: Boolean(log.workoutDone),
          dietFollowed: Boolean(log.dietFollowed),
          habits: {
            stepsTargetMet: Boolean(log.habits.stepsTargetMet),
            sleepTargetMet: Boolean(log.habits.sleepTargetMet),
          },
        }
      ];
    }

    const newState: AppState = {
      ...state,
      adherenceLogs: updatedLogs,
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
    const newEstimate = calculateProgress(state.currentPhase, state.adherenceLogs);
    
    await updateProgress(newEstimate);
  }, [state, updateProgress]);

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
    logAdherence,
    addPhotoCheckin,
    updateProgress,
    completePhase,
    clearAllData,
    refreshState: loadState,
    recalculateProgress
  };
};