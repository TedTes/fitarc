import type { ExerciseDefinition, Muscle } from '../../runtime/types';
import { MUSCLE_MASKS } from './muscleMasks';

export type TargetMuscles = Pick<ExerciseDefinition, 'primaryMuscles' | 'secondaryMuscles'>;
export type TargetRole = 'primary' | 'secondary';
export type BodyView = 'front' | 'back';

// The side that best shows each group, for choosing a lift's default view. A group can still appear on the
// other side too (upper traps from the front, glute medius at the hip); isMuscleVisible covers that.
const BEST_VIEW: Record<BodyView, readonly Muscle[]> = {
  front: ['chest', 'delts', 'biceps', 'core', 'quads', 'calves'],
  back: ['back', 'delts', 'triceps', 'glutes', 'hamstrings', 'calves'],
};

/** Whether the picture for this side has a highlightable shape for the group. */
export const isMuscleVisible = (muscle: Muscle, view: BodyView) => MUSCLE_MASKS[view].some((mask) => mask.muscle === muscle);
const bestOn = (muscle: Muscle, view: BodyView) => BEST_VIEW[view].includes(muscle);

export const muscleTargetRole = (targets: TargetMuscles, muscle: Muscle): TargetRole | null => {
  if (targets.primaryMuscles.includes(muscle)) return 'primary';
  if (targets.secondaryMuscles.includes(muscle)) return 'secondary';
  return null;
};

/** Show the side with the most primary targets; assisting muscles break a tie. */
export const preferredTargetView = (targets: TargetMuscles): BodyView => {
  const score = (muscles: readonly Muscle[], view: BodyView) =>
    new Set(muscles.filter((muscle) => bestOn(muscle, view))).size;
  const primaryDifference = score(targets.primaryMuscles, 'back') - score(targets.primaryMuscles, 'front');
  if (primaryDifference !== 0) return primaryDifference > 0 ? 'back' : 'front';
  // Keep multi-primary lifts anchored to their first programmed target (e.g. quads in a squat).
  const first = targets.primaryMuscles[0];
  if (first && bestOn(first, 'front') !== bestOn(first, 'back')) {
    return bestOn(first, 'front') ? 'front' : 'back';
  }
  return score(targets.secondaryMuscles, 'back') > score(targets.secondaryMuscles, 'front') ? 'back' : 'front';
};

export const viewForMuscle = (muscle: Muscle, current: BodyView = 'front'): BodyView =>
  isMuscleVisible(muscle, current) ? current : current === 'front' ? 'back' : 'front';

export const hasLowerBodyTarget = (muscle: Muscle) =>
  muscle === 'quads' || muscle === 'hamstrings' || muscle === 'glutes' || muscle === 'calves';
