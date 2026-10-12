import type { User } from '../types/domain';
import type { RuntimeState, TrainingSource } from './types';
import { GROUP_TEMPLATES, matchesGroup } from './exercisePools';
import { defaultProgression } from './routine';
import { compileTrainingBlock } from './runtimeService';
import { createRuntimeId } from './id';
import { RUNTIME_EXERCISES } from './exerciseCatalog';

/** Create a persisted starting pool once; previews never reshuffle or start a session. */
export function prepareOnboardingTraining(state: RuntimeState, user: User, random = Math.random): RuntimeState {
  if (state.block || state.source || state.sessions.length) return state;
  const preferences = user.planPreferences!;
  const pattern = user.trainingSplit === 'push_pull_legs' || user.trainingSplit === 'full_body' ? user.trainingSplit : 'upper_lower';
  const source: TrainingSource = {
    id: createRuntimeId(), userId: user.id, version: 1, createdAt: new Date().toISOString(),
    goal: preferences.primaryGoal === 'get_stronger' ? 'strength' : 'hypertrophy',
    experience: user.experienceLevel === 'advanced' ? 'advanced' : 'intermediate',
    daysPerWeek: preferences.daysPerWeek as TrainingSource['daysPerWeek'], sessionMinutes: preferences.sessionMinutes ?? 60,
    equipment: preferences.equipmentLevel === 'dumbbells' ? ['dumbbell', 'bench'] : ['barbell', 'rack', 'machine', 'cable', 'dumbbell', 'bench', 'pullup_bar'],
    limitations: preferences.injuries ?? [], excludedExerciseIds: [], seedWorkingSets: [],
  };
  const catalog = state.catalog ?? RUNTIME_EXERCISES;
  const candidates = catalog.filter(e => e.equipment.every(item => source.equipment.includes(item))
    && !e.contraindications.some(item => source.limitations.includes(item)));
  // Randomize compatible alternatives once, while the solver still chooses for coverage/time.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  source.routine = {
    split: 'custom', preferredSplit: pattern, selectionMode: 'pools', progression: defaultProgression(),
    workouts: GROUP_TEMPLATES[pattern].map(group => ({
      id: createRuntimeId(), name: group.name, targetMuscles: [...group.muscles],
      exercises: candidates.filter(e => matchesGroup(e, group)).slice(0,500).map(e => ({
        exerciseId: e.id, sets: user.experienceLevel === 'beginner' ? 2 : 3,
        minReps: source.goal === 'strength' && e.compound ? 5 : 8,
        maxReps: source.goal === 'strength' && e.compound ? 8 : 12, targetRir: 2,
      })),
    })),
  };
  const empty = source.routine.workouts.find(w => !w.exercises.length);
  if (empty) throw new Error(`No ${empty.name.toLowerCase()} exercises fit these preferences. Try another training style or equipment selection.`);
  return compileTrainingBlock(state, source);
}
