import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { deleteAsync } from 'expo-file-system/legacy';
import { transcribeRoutine } from '../../services/routineInputService';
import { IconButton, Txt } from './ui';
import { colors, space } from './theme';

const removeRecording=async(uri:string|null)=>{
  if(!uri)return;
  if(Platform.OS==='web'){URL.revokeObjectURL(uri);return;}
  await deleteAsync(uri,{idempotent:true}).catch(()=>undefined);
};
/** m:ss, so a running recording reads like a clock rather than a raw millisecond counter. */
const formatDuration=(millis:number)=>{
  const total=Math.floor(millis/1000);
  return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
};
export const RoutineRecorder=({disabled,onTranscript,onBusy,onError}:{disabled:boolean;onTranscript:(text:string)=>void;onBusy:(busy:boolean)=>void;onError:(message:string)=>void})=>{
  const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY),state=useAudioRecorderState(recorder,250);
  const [phase,setPhase]=useState<'idle'|'preparing'|'recording'|'ready'|'transcribing'>('idle');
  const uri=useRef<string|null>(null),mounted=useRef(true),request=useRef<AbortController|null>(null),generation=useRef(0),phaseRef=useRef(phase);
  phaseRef.current=phase;
  const callbacks=useRef({onTranscript,onBusy,onError});callbacks.current={onTranscript,onBusy,onError};
  useEffect(()=>{onBusy(['preparing','recording','transcribing'].includes(phase));},[phase,onBusy]);
  const stop=async()=>{
    if(phaseRef.current!=='recording')return;
    phaseRef.current='preparing';setPhase('preparing');
    try{await recorder.stop();uri.current=recorder.uri;if(mounted.current)setPhase(uri.current?'ready':'idle');}
    catch{if(mounted.current){callbacks.current.onError('Recording stopped unexpectedly. Your typed text is still here.');setPhase('idle');}}
    finally{await setAudioModeAsync({allowsRecording:false}).catch(()=>undefined);}
  };
  const stopRef=useRef(stop);stopRef.current=stop;
  useEffect(()=>{
    mounted.current=true;
    const sub=AppState.addEventListener('change',next=>{if(next!=='active')void stopRef.current();});
    return()=>{mounted.current=false;generation.current++;request.current?.abort();sub.remove();callbacks.current.onBusy(false);
      void (async()=>{try{if(recorder.isRecording)await recorder.stop();}catch{}await setAudioModeAsync({allowsRecording:false}).catch(()=>undefined);await removeRecording(uri.current??recorder.uri);})();};
  },[recorder]);
  useEffect(()=>{if(phase==='recording'&&state.durationMillis>=90000)void stopRef.current();},[phase,state.durationMillis]);
  const start=async()=>{
    const attempt=++generation.current;callbacks.current.onError('');setPhase('preparing');
    try{
      const permission=await AudioModule.requestRecordingPermissionsAsync();
      if(!mounted.current||attempt!==generation.current)return;
      if(!permission.granted)throw Error('Microphone access was denied. Enable it in your device settings, or type your routine.');
      await removeRecording(uri.current);uri.current=null;
      await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});
      if(!mounted.current||attempt!==generation.current){await setAudioModeAsync({allowsRecording:false});return;}
      await recorder.prepareToRecordAsync();
      if(!mounted.current||attempt!==generation.current)return;
      recorder.record();setPhase('recording');
    }catch(e){if(mounted.current){callbacks.current.onError(e instanceof Error?e.message:'Could not start recording. You can still type.');setPhase('idle');}await setAudioModeAsync({allowsRecording:false}).catch(()=>undefined);}
  };
  const discard=()=>{void removeRecording(uri.current);uri.current=null;setPhase('idle');callbacks.current.onError('');};
  const transcribe=async()=>{
    if(!uri.current)return;
    const controller=new AbortController();request.current=controller;callbacks.current.onError('');setPhase('transcribing');
    const timeout=setTimeout(()=>controller.abort(),60000);
    try{const text=await transcribeRoutine(uri.current,controller.signal);if(!mounted.current||request.current!==controller||controller.signal.aborted)return;callbacks.current.onTranscript(text);await removeRecording(uri.current);uri.current=null;setPhase('idle');}
    catch(e){if(mounted.current&&request.current===controller){callbacks.current.onError(controller.signal.aborted?'Transcription timed out. Retry or type instead.':e instanceof Error?e.message:'Could not transcribe. Try again.');setPhase('ready');}}
    finally{clearTimeout(timeout);if(request.current===controller)request.current=null;}
  };
  const cancelTranscribe=()=>{request.current?.abort();request.current=null;setPhase('ready');};
  if(phase==='idle')return <IconButton icon="mic" tone="accent" label="Record my routine" disabled={disabled} onPress={()=>void start()} />;
  if(phase==='preparing')return <ActivityIndicator color={colors.accent} accessibilityLabel="Preparing microphone" />;
  if(phase==='recording')return <View style={{flexDirection:'row',alignItems:'center',gap:space.sm}}>
    <Txt variant="mono" tone="secondary">{formatDuration(state.durationMillis)}</Txt>
    <IconButton icon="stop" tone="danger" label="Stop recording" onPress={()=>void stop()} />
  </View>;
  if(phase==='ready')return <View style={{flexDirection:'row',alignItems:'center',gap:space.sm}}>
    <Txt variant="caption" tone="muted">OpenAI</Txt>
    <IconButton icon="trash-outline" label="Discard recording" onPress={discard} />
    <IconButton icon="checkmark-circle" tone="accent" label="Use this recording" disabled={disabled} onPress={()=>void transcribe()} />
  </View>;
  return <View style={{flexDirection:'row',alignItems:'center',gap:space.sm}}>
    <Txt variant="caption" tone="muted">OpenAI</Txt>
    <ActivityIndicator color={colors.accent} accessibilityLabel="Transcribing" />
    <IconButton icon="close" label="Cancel transcription" onPress={cancelTranscribe} />
  </View>;
};
