import { RUNTIME_EXERCISES } from '../../runtime';
import { MUSCLE_MASKS } from './muscleMasks';

/**
 * The runtime tracks weekly dose per muscle GROUP, so parts (the individual muscles the map can highlight)
 * carry no numbers of their own. What a part can honestly say is which compiled lifts train it. That is
 * anatomy, not runtime data, so it lives here as a static table and is labelled as approximate in the UI.
 */
type PartLifts = { primary: string[]; assist: string[] };

const PART_LIFTS: Record<string, PartLifts> = {
  upper_traps: { primary: [], assist: ['cable_row', 'chest_supported_row', 'overhead_press'] },
  mid_traps: { primary: ['cable_row', 'chest_supported_row'], assist: ['lat_pulldown', 'pull_up'] },
  lower_traps: { primary: ['lat_pulldown', 'pull_up'], assist: ['cable_row'] },
  infraspinatus: { primary: [], assist: ['chest_supported_row', 'cable_row'] },
  teres_major: { primary: ['lat_pulldown', 'pull_up'], assist: ['cable_row', 'chest_supported_row'] },
  lats: { primary: ['lat_pulldown', 'pull_up'], assist: ['cable_row', 'chest_supported_row'] },
  erectors: { primary: ['romanian_deadlift'], assist: ['back_squat'] },
};

/** Name of a split part such as `lats`, or null for a part that is just its whole group. */
export const partLabel = (part: string): string | null => {
  for (const view of ['front', 'back'] as const) {
    const found = MUSCLE_MASKS[view].find((mask) => mask.part === part && mask.label);
    if (found) return found.label ?? null;
  }
  return null;
};

export type PartLift = { name: string; role: 'primary' | 'assist' };

/** The lifts in this block that train a part, direct work first. */
export const liftsForPart = (part: string, plannedExerciseIds: Set<string>): PartLift[] => {
  const spec = PART_LIFTS[part];
  if (!spec) return [];
  const named = (id: string) => RUNTIME_EXERCISES.find((exercise) => exercise.id === id)?.name;
  const pick = (ids: string[], role: PartLift['role']): PartLift[] => ids
    .filter((id) => plannedExerciseIds.has(id))
    .flatMap((id) => { const name = named(id); return name ? [{ name, role }] : []; });
  return [...pick(spec.primary, 'primary'), ...pick(spec.assist, 'assist')];
};
