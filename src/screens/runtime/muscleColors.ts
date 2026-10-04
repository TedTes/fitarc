import type { ExerciseDefinition, Muscle } from '../../runtime/types';

/** One accent per muscle group so a list of exercises scans by colour. Tuned for the dark ground. */
const MUSCLE_COLOR: Record<Muscle, string> = {
  chest: '#F87171',
  back: '#60A5FA',
  quads: '#A78BFA',
  hamstrings: '#F472B6',
  glutes: '#FB923C',
  delts: '#FBBF24',
  biceps: '#A3E635',
  triceps: '#38BDF8',
  calves: '#2DD4BF',
  core: '#E879F9',
};

export const exerciseColor = (exercise: ExerciseDefinition) => MUSCLE_COLOR[exercise.primaryMuscles[0]] ?? '#F48D4D';

/** `#RRGGBB` plus alpha, for tinted fills behind text. */
export const tint = (hex: string, alpha: number) => `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
