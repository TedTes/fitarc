import type { RuntimeDecision, SessionPrescription, SetResult, TrainingBlock, TrainingSource } from './types';

export const TRAINING_SCHEMA = 'fitarc';

/** The seven durable entities. Engine projections are not additional persistent records. */
export const TRAINING_TABLES = {
  profiles: 'fitarc_profiles', exercises: 'fitarc_exercise_catalog', plans: 'fitarc_plans',
  sessions: 'fitarc_sessions', sessionExercises: 'fitarc_session_exercises', sets: 'fitarc_sets', sync: 'fitarc_sync_heads',
} as const;

export type RecordedSet = { result: SetResult; decision: RuntimeDecision };
export type StoredTrainingState = {
  schemaVersion: 3;
  updatedAt: string;
  preferences: TrainingSource | null;
  activePlanId: string | null;
  plans: TrainingBlock[];
  sessions: SessionPrescription[];
  lastChanges: string[];
};
