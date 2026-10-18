import { useMemo, useRef, useState } from 'react';
import type { RuntimeState } from '../../runtime/types';
import type { previewTrainingSessionDetailed } from '../../runtime/runtimeService';
import type { ApplyResult } from './useRuntimeController';

type Apply = (transform: (state: RuntimeState) => RuntimeState) => ApplyResult;

/** Preview edits stay local until the first logged set, including batched fast taps. */
export function useWorkoutWorkspace(state: RuntimeState, proposal: ReturnType<typeof previewTrainingSessionDetailed> | null | undefined, apply: Apply) {
  const prepared = useMemo<RuntimeState>(() => proposal ? {
    ...state, block: state.block ? { ...state.block, currentWeek: proposal.weekNumber } : null,
    activeSession: { ...proposal.prescription, status: 'active' },
    sessions: [...state.sessions, { ...proposal.prescription, status: 'active' }],
  } : state, [state, proposal]);
  const [draft, setDraft] = useState<{ base: string; state: RuntimeState } | null>(null);
  const workspace = state.activeSession ? state : draft && draft.base === prepared.activeSession?.id ? draft.state : prepared;
  const latest = useRef(workspace);
  latest.current = workspace;
  const live = useRef(Boolean(state.activeSession));
  live.current = Boolean(state.activeSession);
  const update: Apply = transform => {
    if (live.current) return apply(transform);
    try {
      const previous = latest.current;
      const next = transform(previous);
      const hasLogged = next.setResults.some(result => result.prescriptionId === previous.activeSession?.id);
      if (!hasLogged) {
        latest.current = next;
        setDraft(next.activeSession ? { base: prepared.activeSession!.id, state: next } : null);
        return { ok: true, state: next };
      }
      const outcome = apply(current => {
        if (current.activeSession || current.updatedAt !== state.updatedAt || current.block?.id !== state.block?.id) throw Error('Your workout changed. Reopen Today and try again.');
        return next;
      });
      if (outcome.ok) { live.current = true; latest.current = outcome.state; }
      return outcome;
    } catch (error) { return { ok: false, error }; }
  };
  return { workspace, update };
}
