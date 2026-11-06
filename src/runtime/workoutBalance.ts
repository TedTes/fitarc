import type { ExerciseDefinition, Muscle, TrainingSlot } from './types';

type Requirement = { label: string; matches: (exercise: ExerciseDefinition) => boolean };
const pattern = (label: string, ...patterns: string[]): Requirement => ({label, matches: e => patterns.includes(e.movementPattern)});
const push = pattern('pushing', 'horizontal_push', 'vertical_push');
const pull = pattern('pulling', 'horizontal_pull', 'vertical_pull');
const knee = pattern('knee-dominant work', 'squat', 'single_leg');
const hip = pattern('hip-dominant work', 'hinge');
const lower = pattern('lower-body work', 'squat', 'single_leg', 'hinge');
export function balanceRequirements(slot: Pick<TrainingSlot,'targetMuscles'>): Requirement[] {
  const muscles = new Set<Muscle>(slot.targetMuscles);
  const upperPush = muscles.has('chest');
  const upperPull = muscles.has('back');
  const legs = muscles.has('quads') || muscles.has('hamstrings') || muscles.has('glutes');
  if (upperPush && upperPull) return legs ? [lower,push,pull] : [push,pull];
  if (legs) return [ ...(muscles.has('quads') ? [knee] : []), ...(muscles.has('hamstrings') || muscles.has('glutes') ? [hip] : []), ...(upperPush?[push]:[]), ...(upperPull?[pull]:[]) ];
  if (upperPush) return [pattern('chest pressing','horizontal_push'), ...(muscles.has('delts') ? [{label:'shoulder work', matches:(e:ExerciseDefinition)=>e.primaryMuscles.includes('delts')}] : [])];
  if (upperPull) return [pattern('rowing','horizontal_pull'),pattern('vertical pulling','vertical_pull')];
  return [...muscles].map(m => ({label:m, matches:(e:ExerciseDefinition)=>e.primaryMuscles.includes(m)}));
}
export const missingBalance = (slot: Pick<TrainingSlot,'targetMuscles'>, exercises: ExerciseDefinition[]) =>
  balanceRequirements(slot).filter(r=>!exercises.some(r.matches)).map(r=>r.label);
