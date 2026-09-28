import { updateRirConfidence } from './setSolver';
import type { StoredTrainingState } from './dataModel';
import type { RuntimeDecision, RuntimeState, SetResult, SessionPrescription, WorkingSetState } from './types';

/** Rebuild disposable engine projections from the set records; never persist a second truth. */
export function projectTrainingState(state: RuntimeState): RuntimeState {
  const records = state.sessions.flatMap((session) => session.exercises.flatMap((entry) => entry.sets
    .filter((set) => set.status === 'completed' && set.result && set.decision)
    .map((set) => ({ result: set.result!, decision: set.decision! }))));
  records.sort((a, b) => (a.result.recordedOrder ?? 0) - (b.result.recordedOrder ?? 0) || a.result.completedAt.localeCompare(b.result.completedAt));
  const workingSets: Record<string, WorkingSetState> = {};
  const setResults: SetResult[] = [];
  const decisions: RuntimeDecision[] = [];
  for (const { result, decision } of records) {
    const prior = workingSets[result.exerciseId];
    workingSets[result.exerciseId] = { exerciseId: result.exerciseId, loadKg: decision.nextLoadKg,
      reps: result.completedReps, rir: result.reportedRir,
      rirConfidence: updateRirConfidence(prior?.rirConfidence ?? 0.35, result), updatedAt: result.completedAt };
    setResults.push(result); decisions.push(decision);
  }
  return { ...state, setResults, decisions, workingSets,
    activeSession: state.sessions.find((session) => session.status !== 'committed') ?? null,
    committedSessionIds: state.sessions.filter((session) => session.status === 'committed').map((session) => session.id) };
}

export function toStoredTraining(state: RuntimeState): StoredTrainingState {
  const plans = [...new Map([...(state.blockHistory ?? []), ...(state.block ? [state.block] : [])].map((plan) => [plan.id, plan])).values()];
  return { schemaVersion: 3, updatedAt: state.updatedAt, preferences: state.source, activePlanId: state.block?.id ?? null,
    plans, sessions: state.sessions, lastChanges: state.lastBlockDiff };
}

export function fromStoredTraining(stored: StoredTrainingState): RuntimeState {
  if (stored.schemaVersion !== 3 || !Array.isArray(stored.plans) || !Array.isArray(stored.sessions)) throw new Error('Unsupported training data format.');
  const ids = new Set<string>();
  const sessions = stored.sessions as SessionPrescription[];
  if (sessions.filter((session) => session.status !== 'committed').length > 1) throw new Error('More than one workout is active.');
  for (const session of sessions) for (const entry of session.exercises) for (const set of entry.sets) {
    if (ids.has(set.id)) throw new Error('Duplicate set ID.');
    ids.add(set.id);
    if (set.status === 'completed') {
      if (!set.result || !set.decision || set.result.setId !== set.id || set.result.prescriptionId !== session.id || set.result.exerciseId !== entry.exercise.id) throw new Error('Incomplete recorded set.');
    } else if (set.result || set.decision) throw new Error('An unfinished set contains a result.');
  }
  const block = stored.plans.find((plan) => plan.id === stored.activePlanId) ?? null;
  if (stored.activePlanId && !block) throw new Error('Current plan is missing.');
  return projectTrainingState({ updatedAt: stored.updatedAt, source: stored.preferences, block,
    blockHistory: stored.plans, sessions, lastBlockDiff: stored.lastChanges,
    activeSession: null, setResults: [], decisions: [], workingSets: {}, committedSessionIds: [] });
}
