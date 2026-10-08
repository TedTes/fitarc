import { validateCatalog } from './catalogValidation';
import { createRuntimeId } from './id';
import { MUSCLES } from './trainingPolicy';
import type { ExerciseDefinition, ProgressionSettings, RoutineDefinition, TrainingBlock, TrainingSource } from './types';

export const defaultProgression = (): ProgressionSettings => ({
  mode: 'double_progression', successfulSessions: 2, minimumRir: 2,
  adjustDuringWorkout: false, increments: {},
});
export const defaultRoutine = (): RoutineDefinition => ({ split: 'auto', workouts: [], progression: defaultProgression() });

/** Convert only when the user explicitly edits a legacy/generated routine. No historical rewrite. */
export const editableRoutine = (plan: TrainingBlock): RoutineDefinition => ({
  selectionMode:plan.preferences?.routine?.selectionMode,
  focus:plan.preferences?.routine?.focus,
  setDefaults:plan.preferences?.routine?.setDefaults,
  limitationNote:plan.preferences?.routine?.limitationNote,
  customExercises: plan.preferences?.routine?.customExercises,
  preferredSplit: plan.preferences?.routine?.preferredSplit ?? plan.preferences?.routine?.split,
  split: 'custom', progression: plan.preferences?.routine?.progression ?? defaultProgression(),
  workouts: plan.slots.map(slot => {
    const targetMuscles = plan.preferences?.routine?.workouts.find(workout=>workout.id===slot.id)?.targetMuscles;
    return { id: slot.id, name: slot.label, ...(targetMuscles ? { targetMuscles } : {}), exercises: slot.plannedExercises.map(item => ({
    exerciseId: item.exerciseId, sets: item.sets,
    minReps: item.prescription?.minReps ?? plan.phases[0].minReps,
    maxReps: item.prescription?.maxReps ?? plan.phases[0].maxReps,
    targetRir: item.prescription?.targetRir ?? plan.phases[0].targetRir,
    startingLoadKg: item.prescription?.startingLoadKg,
    })) };
  }),
});
export const emptyWorkout = () => ({ id: createRuntimeId(), name: 'My workout', exercises: [] });

export const validateRoutineSource = (source: TrainingSource, catalog: ExerciseDefinition[]) => {
  if (!Number.isInteger(source.daysPerWeek) || source.daysPerWeek < 1 || source.daysPerWeek > 7) throw Error('Choose 1–7 training days.');
  catalog = routineCatalog(source,catalog);
  const routine = source.routine;
  if (!routine) return;
  if (routine.selectionMode !== undefined && !['fixed','pools'].includes(routine.selectionMode)) throw Error('Choose fixed workouts or exercise pools.');
  if (routine.selectionMode==='pools' && routine.split!=='custom') throw Error('Add your muscle groups before saving exercise pools.');
  if (routine.focus !== undefined && !['build_muscle','lose_fat','strength','maintain'].includes(routine.focus)) throw Error('Choose a training goal.');
  if (routine.limitationNote !== undefined && (typeof routine.limitationNote !== 'string' || routine.limitationNote.length > 1000)) throw Error('Keep your limitations note under 1,000 characters.');
  const defaults = routine.setDefaults;
  if (defaults && (!Number.isInteger(defaults.sets) || defaults.sets < 1 || defaults.sets > 20
    || !Number.isInteger(defaults.minReps) || defaults.minReps < 1 || !Number.isInteger(defaults.maxReps) || defaults.maxReps < defaults.minReps || defaults.maxReps > 99
    || !Number.isInteger(defaults.targetRir) || defaults.targetRir < 0 || defaults.targetRir > 5)) throw Error('Check your set defaults.');
  if (!['auto','full_body','upper_lower','push_pull_legs','custom'].includes(routine.split)) throw Error('Choose a workout structure.');
  if (routine.preferredSplit !== undefined && !['auto','full_body','upper_lower','push_pull_legs','custom'].includes(routine.preferredSplit)) throw Error('Choose a workout structure.');
  const settings = routine.progression;
  if (!settings || !['manual','double_progression'].includes(settings.mode)
    || !Number.isInteger(settings.successfulSessions) || settings.successfulSessions < 1 || settings.successfulSessions > 5
    || !Number.isInteger(settings.minimumRir) || settings.minimumRir < 0 || settings.minimumRir > 5
    || typeof settings.adjustDuringWorkout !== 'boolean'
    || Object.values(settings.increments).some(x => !Number.isFinite(x) || x <= 0 || x > 100)) throw Error('Check progression settings and weight increments.');
  if (routine.split !== 'custom') return;
  if (!routine.workouts.length || routine.workouts.length > 14) throw Error('Add 1–14 workouts to your routine.');
  const ids = new Set<string>();
  for (const workout of routine.workouts) {
    if (workout.targetMuscles !== undefined && (!Array.isArray(workout.targetMuscles) || workout.targetMuscles.some(muscle=>!MUSCLES.includes(muscle)))) throw Error('Choose valid target muscles.');
    if (!workout.id || ids.has(workout.id)) throw Error('Workout IDs must be unique.');
    ids.add(workout.id);
    if (!workout.name.trim() || workout.name.length > 80) throw Error('Give each workout a name of up to 80 characters.');
    if (!workout.exercises.length || workout.exercises.length > (routine.selectionMode==='pools'?500:20)) throw Error(`Add 1–${routine.selectionMode==='pools'?500:20} exercises to ${workout.name}.`);
    const exercises = new Set<string>();
    for (const item of workout.exercises) {
      if (!catalog.some(x => x.id === item.exerciseId)) throw Error('An exercise is missing from the available catalog.');
      if (exercises.has(item.exerciseId)) throw Error('Use one entry per exercise in a workout; adjust its set count instead.');
      exercises.add(item.exerciseId);
      if (!Number.isInteger(item.sets) || item.sets < 1 || item.sets > 20
        || !Number.isInteger(item.minReps) || item.minReps < 1 || !Number.isInteger(item.maxReps) || item.maxReps < item.minReps || item.maxReps > 99
        || !Number.isInteger(item.targetRir) || item.targetRir < 0 || item.targetRir > 5
        || (item.startingLoadKg !== undefined && (!Number.isFinite(item.startingLoadKg) || item.startingLoadKg < 0 || item.startingLoadKg > 1000))) throw Error(`Check sets, reps, effort and weight in ${workout.name}.`);
    }
  }
};

export const routineCatalog = (source: TrainingSource, catalog: ExerciseDefinition[]): ExerciseDefinition[] => {
  const custom=source.routine?.customExercises ?? [];
  if(custom.length>100) throw Error('Keep up to 100 private exercises in a routine.');
  if(custom.some(x=>!x.id.startsWith('user_'))) throw Error('Private exercises need their own IDs.');
  if(custom.length)validateCatalog(custom);
  return [...new Map([...catalog,...custom].map(x=>[x.id,x])).values()];
};
