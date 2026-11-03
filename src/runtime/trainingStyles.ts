import type { RuntimeState, TrainingBlock, TrainingSource } from './types';

/** Style identity is independent of its editable name, exercise choices and revision. */
export function trainingStyle(source?: TrainingSource): string {
  const routine = source?.routine;
  const style = routine?.preferredSplit ?? (routine?.split !== 'custom' ? routine?.split : undefined) ?? source?.trainingSplit ?? routine?.split;
  return style ?? 'auto';
}

export function currentStylePlans(block: TrainingBlock | null, history: TrainingBlock[] = []): TrainingBlock[] {
  const plans = [...new Map([...history, ...(block ? [block] : [])].map(plan => [plan.id, plan])).values()]
    .filter(plan => plan.kind !== 'workout' && plan.preferences && plan.slots.length)
    .sort((a, b) => Number(b.id === block?.id) - Number(a.id === block?.id) || b.createdAt.localeCompare(a.createdAt) || b.version - a.version);
  const seen = new Set<string>();
  return plans.filter(plan => {
    const key = trainingStyle(plan.preferences);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Count actual occurrences across revisions, not the template's number of groups. */
export function styleSessionCount(state: RuntimeState, plan: TrainingBlock): number {
  const plans = new Map([...(state.blockHistory ?? []), ...(state.block ? [state.block] : [])].map(item => [item.id, item]));
  const style = trainingStyle(plan.preferences);
  return state.sessions.filter(session => {
    const owner = session.blockId ? plans.get(session.blockId) : undefined;
    return owner && owner.kind !== 'workout' && trainingStyle(owner.preferences) === style
      && session.status === 'committed' && session.exercises.some(entry => entry.sets.some(set => set.status === 'completed' && (set.result?.completedReps ?? 0) > 0));
  }).length;
}
