import { RUNTIME_EXERCISES } from '../../runtime';
import type {
  BlockPhase, BlockPhaseKind, ExerciseDiff, ExerciseSelectionTrace, Muscle, PrescribedExercise,
  RecoveryState, SessionContext, SlotChoiceReason, TrainingSlot, WeeklyMuscleStatus,
} from '../../runtime';

// ───────────────────────── Labels ─────────────────────────

const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  delts: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', calves: 'Calves', core: 'Core',
};
export const muscleLabel = (muscle: Muscle) => MUSCLE_LABEL[muscle] ?? muscle;
export const muscleList = (muscles: Muscle[]) => muscles.map((muscle) => muscleLabel(muscle).toLowerCase()).join(', ');

const EQUIPMENT_LABEL: Record<string, string> = {
  barbell: 'Barbell', rack: 'Squat rack', machine: 'Machines', cable: 'Cable stack',
  dumbbell: 'Dumbbells', bench: 'Bench', pullup_bar: 'Pull-up bar',
};
export const equipmentLabel = (item: string) => EQUIPMENT_LABEL[item] ?? item.replace(/_/g, ' ');

export const exerciseName = (exerciseId: string) =>
  RUNTIME_EXERCISES.find((exercise) => exercise.id === exerciseId)?.name ?? exerciseId.replace(/_/g, ' ');

const SLOT_PLAIN: Record<string, string> = {
  'full.a': 'Full body A', 'full.b': 'Full body B', 'full.c': 'Full body C',
  'upper.a': 'Upper body A', 'upper.b': 'Upper body B', upper: 'Upper body',
  'lower.a': 'Lower body A', 'lower.b': 'Lower body B',
  push: 'Push', pull: 'Pull', 'legs.a': 'Legs A', 'legs.b': 'Legs B',
};
/** Plain-language name for a slot. The slot's own label (`upper.a`) is shown next to it. */
export const slotPlain = (slot: Pick<TrainingSlot, 'label'> | undefined | null) =>
  slot ? SLOT_PLAIN[slot.label] ?? slot.label : 'Session';

export const limitationLabel = (item: string) => item.charAt(0).toUpperCase() + item.slice(1);
export const goalLabel = (goal: 'hypertrophy' | 'strength') => goal === 'strength' ? 'strength' : 'hypertrophy';
export const goalPlain = (goal: 'hypertrophy' | 'strength') => goal === 'strength' ? 'get stronger' : 'build muscle';

export const PHASE_COPY: Record<BlockPhaseKind, { name: BlockPhaseKind; plain: string; purpose: string }> = {
  accumulate: { name: 'accumulate', plain: 'build volume', purpose: 'Build volume at a comfortable effort.' },
  intensify: { name: 'intensify', plain: 'raise load', purpose: 'Loads climb and sets get harder.' },
  peak: { name: 'peak', plain: 'test the top', purpose: 'The hardest week, closest to failure. Where new bests happen.' },
  deload: { name: 'deload', plain: 'recover', purpose: 'About half the sets at lighter loads. Clears fatigue before the next block.' },
};

export const phaseEffort = (phase: Pick<BlockPhase, 'minReps' | 'maxReps' | 'targetRir'>) =>
  `${phase.minReps}–${phase.maxReps} reps at RIR ${phase.targetRir}`;

export const RECOVERY_OPTIONS: Array<{ value: RecoveryState; label: string; effect: (deload: boolean) => string }> = [
  { value: 'yes', label: 'good', effect: (deload) => deload ? 'Deload week already halves sets.' : 'Full planned volume.' },
  { value: 'meh', label: 'tired', effect: (deload) => deload ? 'Deload week already halves sets.' : 'Sets ×0.7, rounded up per exercise, so 3-set lifts stay at 3.' },
  { value: 'no', label: 'wrecked', effect: (deload) => deload ? 'Deload week already halves sets.' : 'Capped at 2 sets per exercise.' },
];

export const RIR_MEANING: Record<number, string> = {
  0: 'Nothing left. Could not do another rep.',
  1: 'Could have done 1 more.',
  2: 'Could have done 2 more.',
  3: 'Could have done 3 more.',
  4: 'Could have done 4 or more. It was easy.',
};

// ───────────────────────── Explanations ─────────────────────────

const REASON_CODE_COPY: Record<string, string> = {
  within_constraints: 'Fits your time and constraints.',
  recovery_meh: 'Sets ×0.7 (rounded up): recovery is "tired".',
  recovery_no: 'Capped at 2 sets: recovery is "wrecked".',
  deload_override: 'Deload week: sets halved.',
  weekly_volume_cap: 'Fewer sets to stay under this muscle\'s weekly MRV.',
  pain_constraint: 'Removed to protect a limitation.',
  exercise_unavailable: 'Marked unavailable today.',
};

/** Turns the engine's "reason · reason · code" string into short sentences. */
export const describeExerciseReason = (reason: string): string[] => reason.split(' · ').map((part) => part.trim()).filter(Boolean).flatMap((part) => {
  if (REASON_CODE_COPY[part]) return [REASON_CODE_COPY[part]];
  if (part.startsWith('targets ')) return [`Targets ${part.slice(8).replace(/ \+ /g, ' and ')}.`];
  if (part.startsWith('uses ')) return [];
  if (part.startsWith('avoids ')) return [`Chosen to avoid loading your ${part.slice(7).replace(/ \+ /g, ' and ')}.`];
  if (part.startsWith('fits available equipment')) return ['Chosen to fit your equipment.'];
  if (part === 'replaces an excluded lift') return ['Replaces an exercise you flagged for pain.'];
  if (part === 'preserves working-set history') return ['Keeps your existing working weight.'];
  if (part.startsWith('substituted for')) return ['Swapped in during this session.'];
  if (part.endsWith('selected within current constraints')) return ['Selected within your constraints.'];
  return [];
});

export type SwapCategory = 'limit' | 'equipment' | 'excluded' | 'preference';

/** Whether a substitution was required by a constraint, or chosen by the selector on merit. */
export const describeSwap = (selection: ExerciseSelectionTrace): { category: SwapCategory; label: string; detail: string } => {
  if (selection.avoidedLimitations.length) {
    const areas = selection.avoidedLimitations.join(' + ');
    return { category: 'limit', label: `required · protects ${areas}`, detail: `${selection.originalExerciseName} loads your ${areas}.` };
  }
  if (selection.reasons.some((reason) => reason.startsWith('fits available equipment'))) {
    return { category: 'equipment', label: 'required · equipment', detail: `${selection.originalExerciseName} needs gear your source doesn't include.` };
  }
  if (selection.reasons.includes('replaces an excluded lift')) {
    return { category: 'excluded', label: 'required · flagged for pain', detail: `You flagged ${selection.originalExerciseName} for pain.` };
  }
  return { category: 'preference', label: 'selector preference', detail: `${selection.selectedExerciseName} scored higher for this slot than ${selection.originalExerciseName}.` };
};

export const describeSlotChoice = (choice: SlotChoiceReason): string => {
  const behind = choice.muscles.slice(0, 2);
  switch (choice.kind) {
    case 'only_remaining': return 'only slot not yet committed this week';
    case 'repeat': return 'all slots committed; repeats the one with the most volume owed';
    case 'next_in_order': return 'next in the block, nothing behind MEV';
    default: return `${muscleList(behind)} furthest below MEV`;
  }
};

export type FitChange = { exerciseName: string; kind: 'kept' | 'reduced' | 'removed'; note: string };

/** Compares today's solve with the planned slot: what stayed, shrank or dropped, and why. */
export const describeFit = (
  slot: TrainingSlot | null, exercises: PrescribedExercise[], context: SessionContext, painIds: string[]
): FitChange[] => {
  if (!slot) return [];
  const unavailableEquipment = new Set(context.unavailableEquipment);
  const pain = new Set(painIds);
  const skipped = new Set(context.unavailableExerciseIds);
  return slot.plannedExercises.map((plan) => {
    const definition = RUNTIME_EXERCISES.find((item) => item.id === plan.exerciseId);
    const name = definition?.name ?? exerciseName(plan.exerciseId);
    const today = exercises.find((entry) => entry.exercise.id === plan.exerciseId);
    if (!today) {
      const blocked = definition?.equipment.filter((item) => unavailableEquipment.has(item)) ?? [];
      if (pain.has(plan.exerciseId)) return { exerciseName: name, kind: 'removed', note: 'Flagged for pain. Recompile the block to get a replacement.' };
      if (skipped.has(plan.exerciseId)) return { exerciseName: name, kind: 'removed', note: 'Marked unavailable today.' };
      if (blocked.length) return { exerciseName: name, kind: 'removed', note: `Needs ${blocked.map(equipmentLabel).join(' + ').toLowerCase()}, unavailable today.` };
      return { exerciseName: name, kind: 'removed', note: `Dropped to fit the ${context.minutesAvailable}-minute cap.` };
    }
    if (today.sets.length < plan.sets) {
      const code = today.reason.split(' · ').pop() ?? '';
      const why = code === 'within_constraints' ? `Trimmed to fit ${context.minutesAvailable} min.` : REASON_CODE_COPY[code] ?? 'Trimmed to fit today.';
      return { exerciseName: name, kind: 'reduced', note: `${plan.sets} → ${today.sets.length} sets. ${why}` };
    }
    return { exerciseName: name, kind: 'kept', note: `${today.sets.length} sets, as compiled.` };
  });
};

// ───────────────────────── Formatting ─────────────────────────

export const formatKg = (kg: number) => `${Number.isInteger(kg) ? kg : Number(kg.toFixed(2))} kg`;
export const formatSets = (sets: number) => `${Number.isInteger(sets) ? sets : sets.toFixed(1)}`;
export const setsWord = (count: number) => `${count} ${count === 1 ? 'set' : 'sets'}`;

export const formatDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
export const formatShortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Mirrors the solver's own time model so per-exercise estimates add up to the session total. */
export const estimateExerciseMinutes = (entry: PrescribedExercise) =>
  Math.ceil(entry.exercise.setupMinutes + entry.sets.length * (entry.exercise.compound ? 3.5 : 2.5));

export const OUTCOME_COPY: Record<ExerciseDiff['outcome'], { symbol: string; meaning: string }> = {
  progressed: { symbol: '▲', meaning: 'load, reps or effort improved' },
  held: { symbol: '＝', meaning: 'same load, reps and effort' },
  stalled: { symbol: '▽', meaning: 'reps landed under target' },
};

export const muscleStateCopy = (item: WeeklyMuscleStatus, weekComplete: boolean): { label: string; tone: 'ok' | 'info' | 'warn' } => {
  if (weekComplete) {
    if (item.state === 'under') return { label: 'under MEV', tone: 'warn' };
    if (item.state === 'over') return { label: 'over MRV', tone: 'warn' };
    return { label: 'in range', tone: 'ok' };
  }
  const projected = item.projectedSets ?? item.completedSets;
  if (item.state === 'on_track') return { label: 'projected in range', tone: 'ok' };
  if (item.state === 'scheduled') return { label: 'nothing scheduled', tone: 'info' };
  return { label: projected > item.max ? 'projected over MRV' : 'projected under MEV', tone: 'info' };
};

// ───────────────────────── Errors ─────────────────────────

/** Every error the runtime can raise, with what the person can do about it. */
export const describeRuntimeError = (error: unknown): { title: string; message: string } => {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'finish_active_session_before_recompile':
    case 'finish_active_session_first':
      return { title: 'A session is active', message: 'Commit or discard it in solver() first, then try again.' };
    case 'set_already_recorded':
      return { title: 'Set already logged', message: 'That set was already recorded. Nothing changed.' };
    case 'active_session_required':
      return { title: 'No active session', message: 'That session is no longer active. Start a new one in solver().' };
    case 'replacement_not_compatible':
      return { title: 'Cannot swap to that exercise', message: 'It no longer fits your constraints. Pick another, or skip the exercise.' };
    case 'undo_stale':
      return { title: 'Cannot undo that set', message: 'A newer set was logged since. Only the latest set can be undone.' };
    case 'nothing_to_undo':
      return { title: 'Nothing to undo', message: 'No sets are logged in this session yet.' };
    case 'runtime_not_compiled':
      return { title: 'No block yet', message: 'Compile a block from your source first.' };
    default:
      return { title: 'That did not apply', message: code && !code.includes('_') ? code : 'Nothing was changed. Try again.' };
  }
};
