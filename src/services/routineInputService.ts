import { Platform } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import type { ExerciseDefinition } from '../runtime/types';
import { draftFromExtraction } from '../routineSetup/interpretation';
import { interpretLocally } from '../routineSetup/localInterpretation';
export const hostedRoutineInputEnabled=process.env.EXPO_PUBLIC_ROUTINE_INPUT_MODE==='hosted';
export async function interpretRoutine(text:string,catalog:ExerciseDefinition[],signal?:AbortSignal){
  if(!hostedRoutineInputEnabled)return interpretLocally(text,catalog);
  const {data,error}=await supabase.functions.invoke('routine-input',{body:{text},signal});
  if(error||data?.error)throw Error(typeof data?.error==='string'?data.error:'Could not prepare the draft. Your text is preserved; retry or use local interpretation.');
  return draftFromExtraction(data?.routine,text,catalog);
}
export async function transcribeRoutine(uri:string,signal?:AbortSignal):Promise<string>{
  if(!hostedRoutineInputEnabled)throw Error('Voice recording needs the transcription service. You can type or use your keyboard’s dictation.');
  const body=new FormData();
  if(Platform.OS==='web'){
    const blob=await (await fetch(uri,{signal})).blob();
    if(blob.size>5*1024*1024)throw Error('Keep recordings under 5 MB.');
    body.append('file',blob,'routine.webm');
  }else body.append('file',{uri,name:'routine.m4a',type:'audio/mp4'} as unknown as Blob);
  const {data,error}=await supabase.functions.invoke('routine-input',{body,signal});
  if(error||data?.error||typeof data?.text!=='string'||!data.text.trim())throw Error(typeof data?.error==='string'?data.error:'Could not transcribe the recording. Retry or type your routine.');
  return data.text;
}
