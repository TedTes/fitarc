import type {
  ExerciseDefinition, ExerciseSelectionTrace, MovementPattern, Muscle,
  TrainingSource, WorkingSetState,
} from './types';

const normalized = (values: string[]) => new Set(values.map((value) => value.toLowerCase().trim()));

type SelectionInput = {
  catalog: ExerciseDefinition[];
  source: TrainingSource;
  targetMuscles: Muscle[];
  movementPatterns: MovementPattern[];
  workingSets: Record<string, WorkingSetState>;
  unavailableExerciseIds?: string[];
  unavailableEquipment?: string[];
  limit: number;
};

type RankedExercise = {
  exercise: ExerciseDefinition;
  score: number;
  primaryMatches: Muscle[];
  secondaryMatches: Muscle[];
  patternMatch: boolean;
  continuity: boolean;
};

const rankExercises = (input: SelectionInput, applyConstraints: boolean): RankedExercise[] => {
  const equipment = normalized(input.source.equipment);
  const limitations = normalized(input.source.limitations);
  const unavailableEquipment = normalized(input.unavailableEquipment ?? []);
  const excluded = new Set([...input.source.excludedExerciseIds, ...(input.unavailableExerciseIds ?? [])]);
  const targetMuscles = new Set(input.targetMuscles);
  const patterns = new Set(input.movementPatterns);

  return input.catalog
    .filter((exercise) => !applyConstraints || !excluded.has(exercise.id))
    .filter((exercise) => !applyConstraints || exercise.equipment.every((item) => equipment.has(item) && !unavailableEquipment.has(item)))
    .filter((exercise) => !applyConstraints || !exercise.contraindications.some((item) => limitations.has(item)))
    .map((exercise) => {
      const primaryMatches = exercise.primaryMuscles.filter((muscle) => targetMuscles.has(muscle));
      const secondaryMatches = exercise.secondaryMuscles.filter((muscle) => targetMuscles.has(muscle));
      const patternMatch = patterns.has(exercise.movementPattern);
      const continuity = Boolean(input.workingSets[exercise.id] || input.source.seedWorkingSets.some((seed) => seed.exerciseId === exercise.id));
      const score = primaryMatches.length * 30 + secondaryMatches.length * 10
        + (patternMatch ? 18 : 0) + (continuity ? 12 : 0)
        + (exercise.compound ? 5 : 0) - exercise.fatigueCost * 2 - exercise.setupMinutes;
      return { exercise, score, primaryMatches, secondaryMatches, patternMatch, continuity };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.exercise.id.localeCompare(b.exercise.id))
    .filter(({ exercise }, index, entries) =>
      entries.findIndex(({ exercise: candidate }) => candidate.substitutionGroup === exercise.substitutionGroup) === index
    );
};

export const selectExercises = (input: SelectionInput): ExerciseDefinition[] =>
  rankExercises(input, true).slice(0, input.limit).map(({ exercise }) => exercise);

export type TracedExerciseSelection = {
  exercise: ExerciseDefinition;
  trace: ExerciseSelectionTrace;
};

export const selectExercisesWithReasons = (input: SelectionInput): TracedExerciseSelection[] => {
  const baseline = rankExercises(input, false).slice(0, input.limit);
  const selected = rankExercises(input, true).slice(0, input.limit);
  const limitations = normalized(input.source.limitations);
  const equipment = normalized(input.source.equipment);
  const unavailableEquipment = normalized(input.unavailableEquipment ?? []);
  const excluded = new Set([...input.source.excludedExerciseIds, ...(input.unavailableExerciseIds ?? [])]);
  const blockedBaseline = baseline.filter(({ exercise }) =>
    excluded.has(exercise.id)
    || exercise.equipment.some((item) => !equipment.has(item) || unavailableEquipment.has(item))
    || exercise.contraindications.some((item) => limitations.has(item))
  );
  const usedBlockedOriginals = new Set<string>();

  return selected.map((candidate) => {
    const alreadyInBaseline = baseline.some(({ exercise }) => exercise.id === candidate.exercise.id);
    const replacementFor = alreadyInBaseline ? undefined : blockedBaseline
      .filter(({ exercise }) => !usedBlockedOriginals.has(exercise.id))
      .map(({ exercise }) => ({
        exercise,
        affinity: exercise.primaryMuscles.filter((muscle) => candidate.exercise.primaryMuscles.includes(muscle)).length * 3
          + (exercise.movementPattern === candidate.exercise.movementPattern ? 2 : 0),
      }))
      .sort((a, b) => b.affinity - a.affinity)[0]?.exercise;
    if (replacementFor) usedBlockedOriginals.add(replacementFor.id);
    const original = replacementFor ?? candidate.exercise;
    const avoidedLimitations = original.contraindications.filter((item) => limitations.has(item));
    const missingEquipment = original.equipment.filter((item) => !equipment.has(item) || unavailableEquipment.has(item));
    const reasons = [
      ...(candidate.primaryMatches.length ? [`targets ${candidate.primaryMatches.join(' + ')}`] : []),
      ...(avoidedLimitations.length ? [`avoids ${avoidedLimitations.join(' + ')}`] : []),
      ...(missingEquipment.length ? [`fits available equipment; ${missingEquipment.join(' + ')} unavailable`] : []),
      ...(excluded.has(original.id) ? ['replaces an excluded lift'] : []),
      ...(candidate.continuity ? ['preserves working-set history'] : []),
      `uses ${candidate.exercise.equipment.join(' + ')}`,
    ];
    return {
      exercise: candidate.exercise,
      trace: {
        originalExerciseId: original.id,
        originalExerciseName: original.name,
        selectedExerciseId: candidate.exercise.id,
        selectedExerciseName: candidate.exercise.name,
        substituted: original.id !== candidate.exercise.id,
        forced: false,
        reasons,
        avoidedLimitations,
      },
    };
  });
};
