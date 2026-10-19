import { groupDraft } from '../../routineSetup/pools';
import { useFlushOnLeave } from '../../hooks/useFlushOnLeave';
import { isPoolPattern } from '../../runtime/exercisePools';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ExerciseDefinition, TrainingSource } from '../../runtime/types';
import { RUNTIME_EXERCISES } from '../../runtime/exerciseCatalog';
import { draftFromRoutine, emptyDraft, valueOf } from '../../routineSetup/draft';
import { editorSettings, type RoutineEditorInput } from '../../routineSetup/editor';
import { applyInputContext, type RoutineInputContext } from '../../routineSetup/context';
import { RoutineContextChips } from './RoutineContextChips';
import { RoutineDraftReview } from './RoutineDraftReview';
import { Txt } from './ui';
import { colors, planTokens as t } from './theme';
import type { SyncStatus } from './useRuntimeController';

type Props={inline?:boolean;catalog?:ExerciseDefinition[];initial:TrainingSource;sessionActive?:boolean;sync:SyncStatus;onSave:(editor:RoutineEditorInput)=>string|undefined;onClose:()=>void};
/** Direct routine controls; existing descriptions remain stored but are no longer interpreted. */
export const SourceIntake=({inline=false,initial,onSave,onClose,sync,catalog=RUNTIME_EXERCISES}:Props)=>{
  const insets=useSafeAreaInsets();
  const [editor,setEditor]=useState<RoutineEditorInput>(()=>({
    settings:editorSettings(initial),text:initial.routineText??'',interpretedText:initial.interpretedRoutineText??'',
    draft:initial.routine?.workouts.length?draftFromRoutine(initial.routine,initial,catalog):emptyDraft(),
  }));
  const latest=useRef(editor),saveCallback=useRef(onSave),lastSaved=useRef(JSON.stringify(editor)),dirty=useRef(false),mounted=useRef(true);
  saveCallback.current=onSave;
  const [error,setError]=useState('');
  const flush=()=>{
    if(!dirty.current)return;
    if(JSON.stringify(latest.current)===lastSaved.current){dirty.current=false;return;}
    const failure=saveCallback.current(latest.current);
    if(failure){if(mounted.current)setError(failure);return;}
    dirty.current=false;lastSaved.current=JSON.stringify(latest.current);
  };
  const update=(next:RoutineEditorInput)=>{latest.current=next;dirty.current=true;setEditor(next);setError('');};
  useEffect(()=>{const timer=setTimeout(flush,450);return()=>clearTimeout(timer);},[editor]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;flush();};},[]);
  useFlushOnLeave(flush);
  const context:RoutineInputContext={split:editor.draft.preferredSplit,days:(editor.draft.days.value??editor.settings.daysPerWeek) as TrainingSource['daysPerWeek'],minutes:editor.draft.minutes.value??editor.settings.sessionMinutes};
  const Container=inline?View:ScrollView;
  return <View style={inline?undefined:styles.flex}>
    {!inline?<View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={()=>{flush();onClose();}} style={styles.close}><Ionicons name="chevron-back" size={26} color={colors.text}/></Pressable>
      <Txt variant="title">Your routine</Txt>
    </View>:null}
    <Container {...(inline?{style:styles.content}:{contentContainerStyle:[styles.content,{paddingBottom:Math.max(insets.bottom,16)}]})}>
      {sync==='failed'||sync==='conflict'?<Txt variant="caption" tone="danger" accessibilityLiveRegion="polite">{sync==='failed'?'Changes could not sync.':'Training changed on another device.'}</Txt>:null}
      <View style={styles.section}><Txt variant="label" tone="muted" style={styles.label}>SCHEDULE</Txt>
        <RoutineContextChips value={context} initial={editor.settings} disabled={false} onChange={next=>update({...latest.current,context:next,
          draft:isPoolPattern(next.split)&&next.split!==latest.current.draft.preferredSplit?groupDraft(applyInputContext(latest.current.draft,next),next.split,catalog):applyInputContext(latest.current.draft,next)})}/>
      </View>
      <View style={styles.section}><Txt variant="label" tone="muted" style={styles.label}>GOAL</Txt><View style={styles.choices}>
        {([{value:'build_muscle',label:'Build muscle'},{value:'lose_fat',label:'Lose fat'}] as const).map(goal=><Pressable key={goal.value} accessibilityRole="button" accessibilityLabel={goal.label}
          accessibilityState={{selected:editor.draft.focus===goal.value}} onPress={()=>update({...latest.current,draft:{...latest.current.draft,focus:goal.value,goal:valueOf('hypertrophy')}})}
          style={({pressed})=>[styles.choice,editor.draft.focus===goal.value&&styles.selected,pressed&&styles.pressed]}>
          <Ionicons name="add" size={12} color={colors.accent}/><Txt variant="heading" style={styles.choiceLabel}>{goal.label}</Txt>
        </Pressable>)}
      </View></View>
      <RoutineDraftReview embedded draft={editor.draft} initial={editor.settings} catalog={catalog}
        onChange={draft=>update({...latest.current,draft})} onSettingsChange={settings=>update({...latest.current,settings:editorSettings(settings)})}/>
      {error?<Txt variant="caption" tone="danger" accessibilityLiveRegion="polite">{error}</Txt>:null}
    </Container>
  </View>;
};
const styles=StyleSheet.create({flex:{flex:1},content:{gap:14},header:{flexDirection:'row',alignItems:'center',paddingBottom:16},close:{width:t.touch,height:t.touch,alignItems:'center',justifyContent:'center'},
  section:{gap:9,marginTop:4},label:{fontSize:9,lineHeight:14,letterSpacing:1},choices:{flexDirection:'row',flexWrap:'wrap',gap:8},
  choice:{minHeight:36,flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:12,borderWidth:1,borderColor:colors.borderStrong,borderRadius:22,backgroundColor:colors.surface},
  choiceLabel:{fontSize:12,lineHeight:17},selected:{borderColor:colors.accent,backgroundColor:colors.accentSoft},pressed:{opacity:0.8}});
