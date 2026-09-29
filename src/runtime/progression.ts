import type { ExerciseDefinition, RoutineExercise, SessionPrescription, TrainingSource } from './types';
import { defaultProgression } from './routine';

export type LoadSuggestion = { loadKg: number; explanation: string; baselineKnown: boolean };
/** Use actual completed exercise evidence; never another movement's working weight. */
export const suggestWorkoutLoad = (exercise: ExerciseDefinition, prescription: RoutineExercise,
  source: TrainingSource, sessions: SessionPrescription[], date?: string): LoadSuggestion => {
  const settings = source.routine?.progression ?? defaultProgression();
  const history = sessions.filter(s=>s.status==='committed' && (!date || s.context.date<=date))
    .map((session,index)=>({session,index,entry:session.exercises.find(e=>e.exercise.id===exercise.id && e.sets.some(s=>s.status==='completed'))}))
    .filter(x=>x.entry).sort((a,b)=>b.session.context.date.localeCompare(a.session.context.date)||b.index-a.index);
  const latest=history[0];
  const seed=prescription.startingLoadKg ?? source.seedWorkingSets.find(x=>x.exerciseId===exercise.id)?.loadKg;
  if(!latest) return {loadKg:seed??0,baselineKnown:seed!==undefined,explanation:seed!==undefined?'Your reported starting weight; no completed baseline yet.':'No recorded baseline. Choose and enter your weight; 0 means no external load.'};
  const first=latest.entry!.sets.find(s=>s.status==='completed')!;
  const load=first.result!.actualLoadKg ?? first.loadKg;
  if(settings.mode==='manual') return {loadKg:load,baselineKnown:true,explanation:'Your last recorded starting weight. Progression is set to manual.'};
  const dates=new Set<string>();
  const recent=history.filter(({session})=>{if(dates.has(session.context.date))return false;dates.add(session.context.date);return true;}).slice(0,settings.successfulSessions);
  const successful=recent.every(({session,entry})=>session.phase!=='deload' && session.context.recovery==='yes'
    && entry!.sets.length===prescription.sets && entry!.sets.every(s=>s.status==='completed' && s.minReps===prescription.minReps && s.maxReps===prescription.maxReps
      && s.targetRir===prescription.targetRir && (s.result!.actualLoadKg??s.loadKg)===load
      && s.result!.completedReps>=prescription.maxReps && s.result!.reportedRir>=Math.max(settings.minimumRir,prescription.targetRir)));
  if(recent.length===settings.successfulSessions && successful) {
    const increment=settings.increments[exercise.id]??exercise.incrementKg;
    return {loadKg:Number((load+increment).toFixed(4)),baselineKnown:true,
      explanation:`All ${prescription.sets} working sets reached ${prescription.maxReps} reps with the required effort in ${settings.successfulSessions} comparable sessions at ${load} kg. Suggest +${increment} kg; you can override it.`};
  }
  return {loadKg:load,baselineKnown:true,explanation:`Keep your last starting weight. An increase needs all ${prescription.sets} sets at ${prescription.maxReps} reps with at least ${Math.max(settings.minimumRir,prescription.targetRir)} reps left in ${settings.successfulSessions} comparable sessions.`};
};
