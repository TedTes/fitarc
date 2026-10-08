import { createRuntimeId } from '../runtime/id';
import { GROUP_TEMPLATES, matchesGroup, type PoolPattern } from '../runtime/exercisePools';
import type { ExerciseDefinition, TrainingSource } from '../runtime/types';
import { DEFAULT_SET_TARGETS, draftCatalog, exerciseFromDefaults, type RoutineDraft } from './draft';

/** Regroup existing entries without discarding unmatched or unresolved imports. Never fill silently. */
export const groupDraft = (draft:RoutineDraft, pattern:PoolPattern, catalog:ExerciseDefinition[]):RoutineDraft => {
  const all=draftCatalog(draft,catalog);
  const entries=[...new Map(draft.workouts.flatMap(w=>w.exercises).map(e=>[e.exerciseId??e.id,e])).values()];
  const used=new Set<string>();
  const workouts=GROUP_TEMPLATES[pattern].map(group=>{
    const previous=draft.workouts.find(w=>w.name.toLowerCase()===group.name.toLowerCase());
    const exercises=entries.filter(item=>{const e=all.find(e=>e.id===item.exerciseId);return e&&matchesGroup(e,group);});
    exercises.forEach(e=>used.add(e.id));
    return {id:previous?.id??createRuntimeId(),name:group.name,targetMuscles:[...group.muscles],exercises};
  });
  const unmatched=entries.filter(e=>!used.has(e.id));
  if(unmatched.length)workouts.push({id:createRuntimeId(),name:'Other',targetMuscles:[],exercises:unmatched});
  return {...draft,selectionMode:'pools',preferredSplit:pattern,workouts};
};
export const suggestPoolExercises = (draft:RoutineDraft, id:string, source:TrainingSource, catalog:ExerciseDefinition[]):RoutineDraft => ({
  ...draft,workouts:draft.workouts.map(group=>{
    if(group.id!==id)return group;
    const candidates=draftCatalog(draft,catalog).filter(e=>matchesGroup(e,{name:group.name,muscles:group.targetMuscles??[]})
      && !source.excludedExerciseIds.includes(e.id)&&e.equipment.every(item=>(draft.equipment??source.equipment).includes(item))
      && !e.contraindications.some(item=>source.limitations.includes(item)));
    // A starting pool, not a prescribed workout. Include alternatives for later rotation.
    const selected=candidates.filter(e=>!group.exercises.some(item=>item.exerciseId===e.id));
    return {...group,exercises:[...group.exercises,...selected.map(e=>exerciseFromDefaults(e,draft.setDefaults??DEFAULT_SET_TARGETS))].slice(0,500)};
  }),
});
