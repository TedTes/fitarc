import type { ExerciseDefinition } from './types';
import { MUSCLES } from './trainingPolicy';

export const MOVEMENT_PATTERNS = ['squat', 'hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'single_leg', 'isolation', 'carry'];
export const EQUIPMENT = ['barbell', 'rack', 'machine', 'dumbbell', 'bench', 'cable', 'pullup_bar'];
export const LIMITATIONS = ['knee', 'lower back', 'shoulder', 'elbow', 'neck'];

/** Reject incomplete solver metadata instead of inventing training values for imported records. */
export function validateExercise(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Expected an exercise object.'];
  const item = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of ['id', 'name', 'substitutionGroup']) {
    if (typeof item[key] !== 'string' || !(item[key] as string).trim()) errors.push(`${key} is required.`);
  }
  if (typeof item.id === 'string' && !/^[a-z0-9][a-z0-9_-]{0,159}$/.test(item.id)) errors.push('id must be a stable lowercase identifier.');
  for (const [key, allowed] of Object.entries({ primaryMuscles: MUSCLES, secondaryMuscles: MUSCLES, equipment: EQUIPMENT, contraindications: LIMITATIONS })) {
    const values = item[key];
    if (!Array.isArray(values) || values.some((entry) => typeof entry !== 'string' || !(allowed as readonly string[]).includes(entry))) errors.push(`${key} contains missing or unknown tags.`);
    else if (new Set(values).size !== values.length) errors.push(`${key} contains duplicate tags.`);
  }
  if (!Array.isArray(item.primaryMuscles) || !item.primaryMuscles.length) errors.push('At least one primary muscle is required.');
  if (Array.isArray(item.primaryMuscles) && Array.isArray(item.secondaryMuscles) && item.primaryMuscles.some((tag) => (item.secondaryMuscles as unknown[]).includes(tag))) errors.push('Primary and secondary muscles must not overlap.');
  if (!MOVEMENT_PATTERNS.includes(String(item.movementPattern))) errors.push('movementPattern is unknown.');
  for (const [key, min, max] of [['fatigueCost', 0.1, 10], ['setupMinutes', 0, 30], ['incrementKg', 0.1, 100]] as const) {
    if (typeof item[key] !== 'number' || !Number.isFinite(item[key]) || (item[key] as number) < min || (item[key] as number) > max) errors.push(`${key} must be between ${min} and ${max}.`);
  }
  if (typeof item.compound !== 'boolean') errors.push('compound must be true or false.');
  return errors;
}

export function validateCatalog(value: unknown): ExerciseDefinition[] {
  if (!Array.isArray(value) || !value.length) throw new Error('The exercise catalog is empty.');
  const ids = new Set<string>();
  for (const entry of value) {
    const errors = validateExercise(entry);
    if (errors.length) throw new Error(`Invalid exercise ${entry?.id ?? '?'}: ${errors.join(' ')}`);
    if (ids.has(entry.id)) throw new Error(`Duplicate exercise id: ${entry.id}`);
    ids.add(entry.id);
  }
  return value as ExerciseDefinition[];
}
