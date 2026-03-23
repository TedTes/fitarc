const normalizeTextValue = (value?: string | null): string =>
  (value ?? '').trim().toLowerCase();

const normalizeBodyPartsValue = (parts?: string[] | null): string[] =>
  (parts ?? []).map((part) => normalizeTextValue(part)).filter(Boolean).sort();

export const arePlanExerciseValuesEqual = (
  current: {
    exerciseId?: string | null;
    name?: string | null;
    movementPattern?: string | null;
    bodyParts?: string[] | null;
    sets?: number | null;
    reps?: string | null;
    displayOrder?: number | null;
    notes?: string | null;
  },
  next: {
    exerciseId?: string | null;
    name?: string | null;
    movementPattern?: string | null;
    bodyParts?: string[] | null;
    sets?: number | null;
    reps?: string | null;
    displayOrder?: number | null;
    notes?: string | null;
  }
): boolean =>
  (current.exerciseId ?? null) === (next.exerciseId ?? null) &&
  normalizeTextValue(current.name) === normalizeTextValue(next.name) &&
  normalizeTextValue(current.movementPattern) === normalizeTextValue(next.movementPattern) &&
  JSON.stringify(normalizeBodyPartsValue(current.bodyParts)) ===
    JSON.stringify(normalizeBodyPartsValue(next.bodyParts)) &&
  (current.sets ?? null) === (next.sets ?? null) &&
  normalizeTextValue(current.reps) === normalizeTextValue(next.reps) &&
  (current.displayOrder ?? null) === (next.displayOrder ?? null) &&
  normalizeTextValue(current.notes) === normalizeTextValue(next.notes);

export const mapSwapGuardrailError = (message: string): string | null => {
  if (message === 'swap_guardrail_failed_movement_pattern') {
    return 'Swap blocked: replacement must keep the same movement pattern.';
  }
  if (message === 'swap_guardrail_failed_body_part_mismatch') {
    return 'Swap blocked: replacement must target similar muscle groups.';
  }
  if (message === 'swap_guardrail_failed_volume_range') {
    return 'Swap blocked: sets must stay within an acceptable volume range.';
  }
  return null;
};

export const classifyWorkoutSwapReason = (
  current: {
    exerciseId?: string | null;
    movementPattern?: string | null;
    sets?: number | null;
    reps?: string | null;
    notes?: string | null;
  },
  next: {
    exerciseId?: string | null;
    movementPattern?: string | null;
    sets?: number | null;
    reps?: string | null;
    notes?: string | null;
  }
): string => {
  if ((current.exerciseId ?? null) !== (next.exerciseId ?? null)) {
    return 'swap_reason:exercise_substitution';
  }
  if (
    normalizeTextValue(current.movementPattern) !==
    normalizeTextValue(next.movementPattern)
  ) {
    return 'swap_reason:movement_adjustment';
  }
  if ((current.sets ?? null) !== (next.sets ?? null)) {
    return 'swap_reason:volume_adjustment';
  }
  if (normalizeTextValue(current.reps) !== normalizeTextValue(next.reps)) {
    return 'swap_reason:rep_adjustment';
  }
  if (normalizeTextValue(current.notes) !== normalizeTextValue(next.notes)) {
    return 'swap_reason:notes_update';
  }
  return 'swap_reason:editor_update';
};
