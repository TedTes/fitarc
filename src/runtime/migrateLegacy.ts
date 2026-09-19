import type { WorkoutSessionEntry } from '../types/domain';
import type { SeedWorkingSet } from './types';

const runtimeExerciseId = (name: string): string | null => {
  const value = name.toLowerCase();
  if (value.includes('bench press')) return 'bench_press';
  if (value.includes('back squat') || value === 'squat') return 'back_squat';
  if (value.includes('romanian deadlift') || value.includes('rdl')) return 'romanian_deadlift';
  if (value.includes('lat pulldown')) return 'lat_pulldown';
  if (value.includes('cable row')) return 'cable_row';
  if (value.includes('overhead press')) return 'overhead_press';
  return null;
};

export const deriveLegacySeeds = (sessions: WorkoutSessionEntry[]): SeedWorkingSet[] => {
  const seeds = new Map<string, SeedWorkingSet>();
  [...sessions].sort((a, b) => a.date.localeCompare(b.date)).forEach((session) => {
    session.exercises.forEach((exercise) => {
      const exerciseId = runtimeExerciseId(exercise.name);
      if (!exerciseId) return;
      const reliable = (exercise.setDetails ?? []).filter((set) =>
        Number(set.weight ?? 0) > 0 && Number(set.reps ?? 0) > 0
      );
      if (!reliable.length) return;
      const best = reliable.reduce((current, candidate) =>
        Number(candidate.weight ?? 0) * Number(candidate.reps ?? 0) > Number(current.weight ?? 0) * Number(current.reps ?? 0)
          ? candidate : current
      );
      const rpe = Number(best.rpe ?? 0);
      seeds.set(exerciseId, {
        exerciseId, loadKg: Number(best.weight), reps: Number(best.reps),
        ...(rpe > 0 ? { rir: Math.max(0, Math.min(5, Math.round(10 - rpe))) } : {}),
      });
    });
  });
  return [...seeds.values()];
};
