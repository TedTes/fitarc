import { groupDraft } from '../../routineSetup/pools';
import { isPoolPattern } from '../../runtime/exercisePools';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ExerciseDefinition, TrainingSource } from '../../runtime/types';
import { RUNTIME_EXERCISES } from '../../runtime/exerciseCatalog';
import { draftFromRoutine, draftIssues, emptyDraft, sourceFromDraft, valueOf } from '../../routineSetup/draft';
import { editorSettings, mergeRoutineInput, type RoutineEditorInput } from '../../routineSetup/editor';
import { interpretLocally } from '../../routineSetup/localInterpretation';
import { hostedRoutineInputEnabled, interpretRoutine } from '../../services/routineInputService';
import { applyInputContext, type RoutineInputContext } from '../../routineSetup/context';
import { RoutineContextChips } from './RoutineContextChips';
import { RoutineDescription, type RoutineStarter } from './RoutineDescription';
import { RoutineDraftReview } from './RoutineDraftReview';
import { RoutineVoiceInput } from './RoutineVoiceInput';
import { Txt } from './ui';
import { colors, planTokens as t } from './theme';
import type { SyncStatus } from './useRuntimeController';

type Props={catalog?:ExerciseDefinition[];initial:TrainingSource;sessionActive?:boolean;sync:SyncStatus;onSave:(editor:RoutineEditorInput)=>string|undefined;onClose:()=>void};
export const SourceIntake=({initial,sessionActive,onSave,onClose,sync,catalog=RUNTIME_EXERCISES}:Props)=>{
  const insets=useSafeAreaInsets();
  const [editor,setEditor]=useState<RoutineEditorInput>(()=>{
    const saved=initial.routineEditor;
    if(saved?.version===1&&saved.baseVersion===initial.version)return saved;
    const routine=initial.routine;
    return {settings:editorSettings(initial),text:'',interpretedText:'',draft:routine?.split==='custom'&&routine.workouts.length?draftFromRoutine(routine,initial,catalog):emptyDraft()};
  });
  const latest=useRef(editor),saveCallback=useRef(onSave),lastSaved=useRef(JSON.stringify(editor)),dirty=useRef(false),request=useRef<AbortController|null>(null),mounted=useRef(true);
  saveCallback.current=onSave;
  const [busy,setBusy]=useState(false),[voiceBusy,setVoiceBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const flush=(value=latest.current)=>{
    if(!dirty.current)return;
    if(JSON.stringify(value)===lastSaved.current){dirty.current=false;if(mounted.current)setPending(false);return;}
    const failure=saveCallback.current(value);
    if(failure){if(mounted.current)setError(failure);return;}
    dirty.current=false;lastSaved.current=JSON.stringify(value);if(mounted.current)setPending(false);
  };
  const update=(next:RoutineEditorInput)=>{
    request.current?.abort();request.current=null;
    latest.current=next;dirty.current=true;setEditor(next);setPending(true);setError('');setBusy(false);
  };
  useEffect(()=>{const timer=setTimeout(()=>flush(),450);return()=>clearTimeout(timer);},[editor]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();flush();};},[]);
  useEffect(()=>{
    if(!sessionActive&&initial.routineEditor){dirty.current=true;lastSaved.current='';flush();}
  },[sessionActive]);
  const context:RoutineInputContext={split:editor.draft.preferredSplit,days:(editor.draft.days.value??editor.settings.daysPerWeek) as TrainingSource['daysPerWeek'],minutes:editor.draft.minutes.value??editor.settings.sessionMinutes};
  const interpret=async(local=false)=>{
    const input=latest.current;
    if(input.text===input.interpretedText)return;
    if(!input.text.trim()){update({...input,interpretedText:input.text});flush();return;}
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');
    const timeout=setTimeout(()=>controller.abort(),60000);
    try{
      const all=[...new Map([...catalog,...input.draft.customExercises].map(item=>[item.id,item])).values()];
      const parsed=local?interpretLocally(input.text,all):await interpretRoutine(input.text,all,controller.signal);
      if(!mounted.current||controller.signal.aborted||request.current!==controller||latest.current!==input)return;
      const merged=mergeRoutineInput(input.draft,applyInputContext(parsed,input.context??{}));
      const draft=input.draft.selectionMode==='pools'&&isPoolPattern(merged.preferredSplit)
        ?groupDraft(merged,merged.preferredSplit,all):merged;
      const next={...input,interpretedText:input.text,draft};
      update(next);flush(next);
    }catch(problem){if(mounted.current&&request.current===controller)setError(controller.signal.aborted?'Could not update workouts. Your input is saved.':problem instanceof Error?problem.message:'Could not read your routine.');}
    finally{clearTimeout(timeout);if(mounted.current&&request.current===controller){request.current=null;setBusy(false);}}
  };
  const close=async()=>{if(voiceBusy)return;await interpret();flush();if(mounted.current)onClose();};
  const selectStarter=(starter:RoutineStarter)=>{
    const input=latest.current;
    let draft=input.draft;
    if(starter==='muscle'||starter==='fat_loss')draft={...draft,focus:starter==='muscle'?'build_muscle':'lose_fat',goal:valueOf('hypertrophy')};
    else{
      draft=groupDraft(draft,starter,catalog);
    }
    update({...input,draft,...(starter==='muscle'||starter==='fat_loss'?{}:{context:{...input.context,split:starter}})});
  };
  const selectedStarters:RoutineStarter[]=[...(editor.draft.focus==='build_muscle'?['muscle' as const]:editor.draft.focus==='lose_fat'?['fat_loss' as const]:[]),...(['full_body','upper_lower','push_pull_legs'].includes(editor.draft.preferredSplit??'')?[editor.draft.preferredSplit as RoutineStarter]:[])];
  let issue=editor.draft.workouts.length?draftIssues(editor.draft,catalog)[0]:undefined;
  if(!issue&&editor.draft.workouts.length){try{sourceFromDraft(editor.draft,editor.settings,catalog);}catch(problem){issue=problem instanceof Error?problem.message:'Check your routine';}}
  const status=busy?'Updating…':pending||sync==='saving'?'Saving…':sync==='failed'?'Not saved':sync==='conflict'?'Sync conflict':sync==='device'?'Saved on device':sessionActive||issue||editor.text!==editor.interpretedText?'Draft saved':'Saved';
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}>
    <RoutineDescription text={editor.text} onChange={text=>update({...latest.current,text})} onBlur={()=>void interpret()} busy={voiceBusy}
      onStarter={selectStarter} selectedStarters={selectedStarters} error={error}
      onLocalReview={hostedRoutineInputEnabled&&error?()=>void interpret(true):undefined}
      status={<Txt variant="mono" tone="muted" style={styles.status} accessibilityLiveRegion="polite">{status}</Txt>}
      backAction={<Pressable accessibilityRole="button" accessibilityLabel="Save and go back" onPress={()=>void close()} disabled={voiceBusy} style={styles.close}><Ionicons name="chevron-back" size={26} color={colors.text}/></Pressable>}
      contextControls={<RoutineContextChips value={context} initial={editor.settings} disabled={voiceBusy} onChange={next=>{update({...latest.current,context:next,draft:isPoolPattern(next.split)&&next.split!==latest.current.draft.preferredSplit?groupDraft(applyInputContext(latest.current.draft,next),next.split,catalog):applyInputContext(latest.current.draft,next)});void interpret();}}/>}
      bottomInset={insets.bottom}
      voiceControl={<RoutineVoiceInput disabled={busy} onBusy={setVoiceBusy} onError={setError} onTranscript={transcript=>{const input=latest.current;update({...input,text:input.text.trim()?`${input.text.trim()}\n${transcript}`:transcript});void interpret();}}/>}>
      <RoutineDraftReview embedded draft={editor.draft} initial={editor.settings} catalog={catalog}
        onChange={draft=>update({...latest.current,draft})} onSettingsChange={settings=>update({...latest.current,settings:editorSettings(settings)})}/>
      {sessionActive?<Txt variant="caption" tone="muted">Finish your workout to apply changes.</Txt>:null}
    </RoutineDescription>
  </KeyboardAvoidingView>;
};
const styles=StyleSheet.create({flex:{flex:1},status:{fontSize:10},close:{width:t.touch,height:t.touch,alignItems:'center',justifyContent:'center'}});
