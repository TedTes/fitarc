import type { TrainingSource } from '../../runtime';

export const FULL_GYM = ['barbell', 'rack', 'machine', 'cable', 'dumbbell', 'bench', 'pullup_bar'];
export const DUMBBELLS = ['dumbbell', 'bench'];
export const LIMITATIONS = ['shoulder', 'lower back', 'knee', 'elbow', 'neck'];
export const SEED_LIFTS = [
  { id: 'back_squat', label: 'Back squat' },
  { id: 'bench_press', label: 'Bench press' },
  { id: 'romanian_deadlift', label: 'Romanian deadlift' },
];

export type EquipmentPreset = 'full' | 'dumbbells';
export const presetOf = (source: Pick<TrainingSource, 'equipment'> | null): EquipmentPreset =>
  source && !source.equipment.includes('barbell') ? 'dumbbells' : 'full';
export const presetLabel = (preset: EquipmentPreset) => preset === 'full' ? 'full gym' : 'dumbbells + bench';
export const presetEquipment = (preset: EquipmentPreset) => preset === 'full' ? FULL_GYM : DUMBBELLS;

export const DAY_OPTIONS = [3, 4, 5] as const;
export const MINUTE_OPTIONS = [30, 45, 60, 75] as const;

/** The four persistent destinations. Keys are the runtime names. */
export type Surface = 'solver' | 'block' | 'week' | 'source';

/** Something the shell shows once, above the current surface, after an action. */
export type Notice = {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  action?: { label: string; run: () => void };
  /** Errors stay until dismissed; everything else clears itself. */
  sticky?: boolean;
};
export type Notify = (notice: Omit<Notice, 'id'>) => void;
