import type { StoredTrainingState } from './dataModel';
import type { TrainingBlock, TrainingSource } from './types';

/** One-time reader for the previous device outbox; new writes never use this format. */
export function upgradeStoredTraining(value:unknown):StoredTrainingState{
  const old=value as StoredTrainingState & {schemaVersion:number;preferences?:TrainingSource&{routineEditor?:{text?:string;interpretedText?:string;draft?:{preferredSplit?:TrainingSource['trainingSplit']}}}};
  if((old as {schemaVersion:number}).schemaVersion!==3)return old;
  const source=old.preferences;
  const profile=source?((({routine,routineEditor,...fields})=>({...fields,
    ...(routineEditor?.text!==undefined?{routineText:routineEditor.text}:{}),
    ...(routineEditor?.interpretedText!==undefined?{interpretedRoutineText:routineEditor.interpretedText}:{}),
    trainingSplit:routineEditor?.draft?.preferredSplit??routine?.preferredSplit??routine?.split??fields.trainingSplit
  }))(source)):null;
  const plans=old.plans.map(plan=>{
    if(!plan.preferences)return plan;
    const {routineEditor:_removed,...preferences}=plan.preferences as TrainingSource&{routineEditor?:unknown};
    return {...plan,preferences} as TrainingBlock;
  });
  return {schemaVersion:4,profile,plans,updatedAt:old.updatedAt,activePlanId:old.activePlanId,sessions:old.sessions,lastChanges:old.lastChanges};
}
