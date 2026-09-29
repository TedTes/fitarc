import type { ExerciseDefinition, SessionContext, SessionPrescription, TrainingSource } from './types';
export const exerciseAlternatives = (target: ExerciseDefinition, catalog: ExerciseDefinition[], source: TrainingSource,
  sessions: SessionPrescription[], context: SessionContext, excluded: string[] = []) => catalog
  .filter(exercise=>exercise.id!==target.id && !excluded.includes(exercise.id) && !source.excludedExerciseIds.includes(exercise.id)
    && !context.unavailableExerciseIds.includes(exercise.id)
    && exercise.equipment.every(item=>source.equipment.includes(item) && !context.unavailableEquipment.includes(item))
    && !exercise.contraindications.some(item=>source.limitations.includes(item))
    && exercise.primaryMuscles.some(muscle=>target.primaryMuscles.includes(muscle))
    && (exercise.movementPattern===target.movementPattern || exercise.substitutionGroup===target.substitutionGroup))
  .map(exercise=>{
    const prior=sessions.filter(s=>s.status==='committed' && s.context.date<=context.date && s.exercises.some(e=>e.exercise.id===exercise.id && e.sets.some(set=>set.status==='completed')));
    const last=prior.map(s=>s.context.date).sort().slice(-1)[0];
    return {exercise,score:(exercise.substitutionGroup===target.substitutionGroup?10:0)+(prior.length?2:0),
      explanation:`Shares ${exercise.primaryMuscles.filter(m=>target.primaryMuscles.includes(m)).join(', ')} and a compatible movement. Fits today’s equipment. ${last?`Recorded in ${prior.length} workouts; last used ${last}. Uses its own weight history.`:'An unfamiliar alternative in your history. Establish its own starting weight.'}`};
  }).sort((a,b)=>b.score-a.score || a.exercise.name.localeCompare(b.exercise.name));
