import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExerciseDefinition, TrainingSource } from '../../runtime/types';
import type { User } from '../../types/domain';
import { RUNTIME_EXERCISES } from '../../runtime/exerciseCatalog';
import { draftFromRoutine, draftIssues, emptyDraft, sourceFromDraft, valueOf, type RoutineDraft } from '../../routineSetup/draft';
import { interpretLocally } from '../../routineSetup/localInterpretation';
import { hostedRoutineInputEnabled, interpretRoutine } from '../../services/routineInputService';
import { defaultRoutine, editableRoutine } from '../../runtime/routine';
import { applyInputContext, type RoutineInputContext } from '../../routineSetup/context';
import { RoutineContextChips } from './RoutineContextChips';
import { RoutineDescription, type RoutineStarter } from './RoutineDescription';
import { RoutineDraftReview } from './RoutineDraftReview';
import { PlanFooter, PlanText, planStyles } from './PlanKit';
import { RoutineVoiceInput } from './RoutineVoiceInput';
import { Txt } from './ui';
import { colors, planTokens as t } from './theme';
import { Ionicons } from '@expo/vector-icons';
import { compileBlock } from '../../runtime/blockCompiler';

type Props={user:User;catalog?:ExerciseDefinition[];firstRun?:boolean;initial:TrainingSource;blockVersion:number;sessionActive?:boolean;onSubmit:(source:TrainingSource)=>boolean|void;onCancel:()=>void};
type Page='describe'|'review';
export const SourceIntake=({user,initial,sessionActive,onSubmit,onCancel,firstRun=false,catalog=RUNTIME_EXERCISES}:Props)=>{
  const insets=useSafeAreaInsets();
  const reviewScroll=useRef<ScrollView>(null);
  const [scheduleRequest,setScheduleRequest]=useState(0);
  const [inputContext,setInputContext]=useState<RoutineInputContext>({split:initial.routine?.preferredSplit??(initial.routine?.split!=='custom'?initial.routine?.split:undefined)});
  const [goalStarter,setGoalStarter]=useState<'muscle'|'fat_loss'|null>(null);
  const existing=initial.routine?.split==='custom'&&initial.routine.workouts.length?initial.routine:null;
  const [page,setPage]=useState<Page>('describe');
  const [text,setText]=useState(()=>existing?existing.workouts.map(workout=>`${workout.name}: ${workout.exercises.map(item=>`${catalog.find(e=>e.id===item.exerciseId)?.name??item.exerciseId} ${item.sets} x ${item.minReps}–${item.maxReps}${item.startingLoadKg===undefined?'':` at ${item.startingLoadKg} kg`} RIR ${item.targetRir}`).join(', ')}`).join('\n') : ''),[draft,setDraft]=useState<RoutineDraft|null>(()=>!firstRun&&existing?draftFromRoutine(existing,initial,catalog):null);
  const [settings,setSettings]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[voiceBusy,setVoiceBusy]=useState(false);
  const originalText=useRef(text);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const navigate=(next:Page)=>{request.current?.abort();request.current=null;setBusy(false);setError('');setPage(next);};
  const adopt=(next:RoutineDraft)=>{
    Keyboard.dismiss();
    // Keep definitions for the user's existing private exercises available on save.
    next={...next,...(goalStarter?{focus:goalStarter==='muscle'?'build_muscle' as const:'lose_fat' as const,goal:valueOf('hypertrophy' as const)}:{}),notes:[...new Set([...next.notes,...(goalStarter==='fat_loss'?['Focus: fat loss.']:[])])],customExercises:[...new Map([...(initial.routine?.customExercises??[]),...next.customExercises].map(e=>[e.id,e])).values()]};
    setDraft(next);setError('');setPage('review');
  };
  const interpret=async(local=false)=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');
    const timeout=setTimeout(()=>controller.abort(),60000);
    try{const next=local?interpretLocally(text,catalog):await interpretRoutine(text,catalog,controller.signal);if(!controller.signal.aborted&&request.current===controller){const contextual=applyInputContext(next,inputContext);adopt(contextual.workouts.length?contextual:generateDraft(contextual));}}
    catch(e){if(request.current===controller)setError(controller.signal.aborted?'This is taking too long. Your text is preserved; try again.':e instanceof Error?e.message:'Could not prepare a draft. Your text is preserved.');}
    finally{clearTimeout(timeout);if(request.current===controller){setBusy(false);request.current=null;}}
  };
  const save=()=>{
    if(!draft||sessionActive)return;
    try{
      const source=sourceFromDraft(draft,{...settings,userId:user.id},catalog);
      if(onSubmit(source)===false)setError('Could not apply every workout. Check equipment, limitations and excluded exercises in Advanced settings.');
      else setError('');
    }catch(e){setError(e instanceof Error?e.message:'Check your routine before saving.');}
  };
  const generateDraft=(parsed?:RoutineDraft):RoutineDraft=>{
    const selected=inputContext.split??parsed?.preferredSplit??settings.routine?.preferredSplit??settings.routine?.split??'auto';
    const split=selected==='custom'?'auto':selected;
    const proposed:TrainingSource={...settings,goal:parsed?.goal.value??settings.goal,
      daysPerWeek:inputContext.days??(parsed?.days.value as TrainingSource['daysPerWeek']|undefined)??settings.daysPerWeek,
      sessionMinutes:inputContext.minutes??parsed?.minutes.value??settings.sessionMinutes,equipment:parsed?.equipment??settings.equipment,
      routine:{...defaultRoutine(),progression:settings.routine?.progression??defaultRoutine().progression,split,preferredSplit:split}};
    const plan=compileBlock(proposed,undefined,undefined,catalog);
    if(!plan.slots.length||plan.slots.some(slot=>!slot.plannedExercises.length))throw Error('No routine fits these constraints. Adjust your preferences or build manually.');
    const generated=draftFromRoutine(editableRoutine(plan),proposed,catalog,'guided');
    return {...generated,originalText:text,notes:[...(parsed?.notes??[]),...(goalStarter==='fat_loss'?['Focus: fat loss.']:[])]};
  };
  const generate=()=>{
    if(existing&&text===originalText.current&&draft?.method==='saved'){adopt(applyInputContext(draft,inputContext));return;}
    if(text.trim()){void interpret();return;}
    try{adopt(generateDraft());}catch(e){setError(e instanceof Error?e.message:'Could not generate a routine.');}
  };
  const selectStarter=(starter:RoutineStarter)=>{
    setError('');
    if(starter==='muscle'||starter==='fat_loss'){
      setGoalStarter(starter);
      if(starter==='muscle')setSettings(current=>({...current,goal:'hypertrophy'}));
    }else setInputContext(current=>({...current,split:starter,...(starter==='full_body'?{days:3 as const}:{})}));
  };
  const manual=()=>adopt(applyInputContext(draft??emptyDraft(text),inputContext));
  const selectedStarters:RoutineStarter[]=[...(goalStarter?[goalStarter]:[]),...(inputContext.split&&['full_body','upper_lower','push_pull_legs'].includes(inputContext.split)?[inputContext.split as RoutineStarter]:[])];
  const issues=draft?draftIssues(draft,catalog):[];
  const exitAction = <Pressable accessibilityRole="button" accessibilityLabel={firstRun?'Sign out':'Cancel and discard changes'}
    onPress={()=>{request.current?.abort();onCancel();}} style={({pressed})=>[styles.exitLink,pressed&&styles.pressed]}>
    <Txt variant="caption" tone="muted">{firstRun?'Sign out':'Cancel'}</Txt>
  </Pressable>;
  return <KeyboardAvoidingView style={styles.flex} enabled={firstRun} behavior={Platform.OS==='ios'?'padding':undefined}>
    {page==='describe'?<RoutineDescription text={text} onChange={value=>{setText(value);setError('');}} busy={busy||voiceBusy}
      onGenerate={generate} onManual={manual} onStarter={selectStarter} selectedStarters={selectedStarters}
      onLocalReview={hostedRoutineInputEnabled&&text.trim()?()=>void interpret(true):undefined}
      error={error} headerAction={exitAction}
      contextControls={<RoutineContextChips value={inputContext} initial={settings} disabled={busy||voiceBusy} onChange={next=>{setInputContext(next);setError('');}}/>}
      bottomInset={firstRun?insets.bottom:0}
      voiceControl={<RoutineVoiceInput disabled={busy} onBusy={setVoiceBusy} onError={setError} onTranscript={transcript=>setText(previous=>previous.trim()?`${previous.trim()}\n${transcript}`:transcript)} />} />:null}
    {page==='review'&&draft?<View style={styles.flex}>
      <View style={planStyles.header}>
        <View style={styles.flex}><PlanText kind="overline">TRAINING PREFERENCES</PlanText><PlanText kind="title">Review routine</PlanText></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit schedule" onPress={()=>{setScheduleRequest(value=>value+1);reviewScroll.current?.scrollTo({y:0,animated:true});}} style={styles.calendar}><Ionicons name="calendar-outline" size={t.icon} color={colors.textMuted}/></Pressable>
        {exitAction}
      </View>
      <ScrollView ref={reviewScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={planStyles.content}>
        <RoutineDraftReview draft={draft} initial={settings} catalog={catalog} scheduleRequest={scheduleRequest} onChange={next=>{setDraft(next);setError('');}}
          onSettingsChange={next=>{setSettings(next);setError('');}}/>
        {error?<PlanText kind="meta">{error}</PlanText>:null}
        {sessionActive?<Txt variant="caption" tone="warning">Finish or discard your active workout before updating your routine.</Txt>:null}
      </ScrollView>
      <View style={{paddingBottom:firstRun?insets.bottom:0}}><PlanFooter secondary="Edit input" primary="Save changes" disabled={Boolean(sessionActive)||issues.length>0} onSecondary={()=>{setInputContext({split:draft.preferredSplit,days:(draft.days.value??settings.daysPerWeek) as TrainingSource['daysPerWeek'],minutes:draft.minutes.value??settings.sessionMinutes});navigate('describe');}} onPrimary={save}/></View>
    </View>:null}

  </KeyboardAvoidingView>;
};
const styles=StyleSheet.create({
  flex:{flex:1},calendar:{width:t.touch,height:t.touch,alignItems:'center',justifyContent:'center',borderWidth:t.border,borderColor:colors.border,borderRadius:t.radius.segment},
  exitLink:{minHeight:t.touch,paddingHorizontal:t.pad.small,justifyContent:'center'},
  pressed:{opacity:t.pressed},
});
