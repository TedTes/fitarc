import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SavedRoutines } from './SavedRoutines';
import { SourceIntake } from './SourceIntake';
import { Button, Choice, Sheet, Txt } from './ui';
import { goalLabel } from './copy';
import { Ionicons } from '@expo/vector-icons';
import { colors, space } from './theme';
import { applyGoalChange, proposeGoalChange, GOAL_DEFAULTS } from '../../runtime/goalChanges';
import { selectTrainingStyle } from '../../runtime/planActions';
import { renameSavedRoutine } from '../../runtime/savedRoutines';
import { trainingStyle } from '../../runtime/trainingStyles';
import { editableRoutine } from '../../runtime/routine';
import { saveRoutineEditor } from '../../routineSetup/editor';
import type { RuntimeGoal, RuntimeState, TrainingSource } from '../../runtime/types';
import type { ApplyResult, SyncStatus } from './useRuntimeController';

export const STYLE_OPTIONS=[{id:'upper_lower',name:'Upper / Lower'},{id:'push_pull_legs',name:'Push / Pull / Legs'},{id:'full_body',name:'Full Body'},{id:'custom',name:'Custom'}] as const;
export function PlanSurface({state,defaults,apply,active,sync}:{state:RuntimeState;defaults:TrainingSource;apply:(fn:(state:RuntimeState)=>RuntimeState)=>ApplyResult;active:boolean;sync:SyncStatus}) {
  const [editing,setEditing]=useState(false),[settingsOpen,setSettingsOpen]=useState(false);
  const [goal,setGoal]=useState<RuntimeGoal|null>(null),[replace,setReplace]=useState(false),[error,setError]=useState('');
  const source=state.source??defaults;
  const catalog=[...new Map([...(state.catalog??[]),...(state.block?.catalog??[])].map(e=>[e.id,e])).values()];
  const run=(fn:(current:RuntimeState)=>RuntimeState)=>{const result=apply(fn);const problem=result.ok?undefined:(result.error instanceof Error?result.error.message:'Could not update your plan.');setError(problem??'');return problem;};
  const proposal=goal?proposeGoalChange(state,defaults,goal,replace):null;
  if(editing&&active)return <SourceIntake key={trainingStyle(state.block?.preferences)} initial={state.block?{...source,routine:editableRoutine(state.block)}:source} catalog={catalog} sync={sync} onClose={()=>setEditing(false)} onSave={input=>run(current=>saveRoutineEditor(current,input,catalog))}/>;
  const suggested=STYLE_OPTIONS.find(s=>s.id===(source.daysPerWeek<=3?'full_body':source.daysPerWeek<=4?'upper_lower':'push_pull_legs'))!;
  const style=STYLE_OPTIONS.find(option=>option.id===trainingStyle(state.block?.preferences));
  const hasStyle=Boolean(state.block&&state.block.kind!=='workout');
  // A different goal is only previewed until "Apply goal"; closing the sheet discards it.
  const pendingGoal=goal&&goal!==source.goal?goal:null;
  const openSettings=()=>{setGoal(null);setReplace(false);setError('');setSettingsOpen(true);};
  const closeSettings=()=>{setGoal(null);setSettingsOpen(false);};
  // Sits on the routine-name row; there is no screen title (the tab bar already says Plan).
  const actions=<View style={styles.tools}>
        {hasStyle&&state.block?.slots.length?<Pressable accessibilityRole="button" accessibilityLabel="Edit queues" onPress={()=>setEditing(true)} hitSlop={6} style={({pressed})=>[styles.icon,pressed&&styles.pressed]}>
          <Ionicons name="create-outline" size={18} color={colors.textMuted}/>
        </Pressable>:null}
        <Pressable accessibilityRole="button" accessibilityLabel="Plan settings" accessibilityHint="Goal and training style" onPress={openSettings} hitSlop={6} style={({pressed})=>[styles.icon,pressed&&styles.pressed]}>
          <Ionicons name="options-outline" size={18} color={colors.textMuted}/>
        </Pressable>
      </View>;
  const header=<View style={styles.header}>
    {!hasStyle?<Button label={`Suggested: ${suggested.name}`} variant="secondary" onPress={()=>run(current=>selectTrainingStyle(current,defaults,suggested.id))}/>:null}
    {error&&!settingsOpen?<Txt tone="danger">{error}</Txt>:null}
  </View>;
  const goalTargets=(value:RuntimeGoal)=>`${GOAL_DEFAULTS[value].minReps}–${GOAL_DEFAULTS[value].maxReps} reps · ${GOAL_DEFAULTS[value].targetRir} RIR`;
  return <View style={{flex:1}}>
    <SavedRoutines state={state} active={active} header={header} actions={actions} onRenameRoutine={(id,name)=>run(current=>renameSavedRoutine(current,id,name))}/>
    <Sheet visible={active&&settingsOpen} title="Plan settings" onClose={closeSettings}>
      <Txt variant="label" tone="muted" style={styles.eyebrow}>GOAL</Txt>
      {Object.keys(GOAL_DEFAULTS).map(key=>{const value=key as RuntimeGoal;return <Choice key={value} label={goalLabel(value)} description={goalTargets(value)}
        selected={(pendingGoal??source.goal)===value} onPress={()=>{setError('');setGoal(value);}}/>;})}
      {pendingGoal?<View style={styles.review}>
        <Choice role="checkbox" label="Apply suggested reps and RIR to existing queue exercises" selected={replace} onPress={()=>setReplace(!replace)}/>
        <Txt variant="caption" tone="secondary">Weights, set counts and explicit rest overrides stay as entered. Current and recorded sessions stay unchanged.</Txt>
        {proposal?.changes.length?<ScrollView style={styles.changes}>{proposal.changes.map((change,index)=><Txt key={index} variant="caption" style={styles.change}>{change}</Txt>)}</ScrollView>:null}
        <Button label="Apply goal" onPress={()=>{if(proposal&&!run(current=>applyGoalChange(current,defaults,proposal)))setGoal(null);}}/>
      </View>:null}
      <Txt variant="label" tone="muted" style={[styles.eyebrow,styles.sectionGap]}>TRAINING STYLE</Txt>
      <Txt variant="caption" tone="muted">Each style keeps its own queue position when you switch.</Txt>
      {STYLE_OPTIONS.map(option=><Choice key={option.id} label={option.name} selected={hasStyle&&style?.id===option.id}
        onPress={()=>{if(!run(current=>selectTrainingStyle(current,defaults,option.id)))closeSettings();}}/>)}
      {error?<Txt tone="danger" accessibilityLiveRegion="polite">{error}</Txt>:null}
    </Sheet>
  </View>;
}

const styles=StyleSheet.create({
  header:{paddingHorizontal:space.lg,gap:6},
  tools:{flexDirection:'row',alignItems:'center',gap:8},
  icon:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},
  eyebrow:{fontSize:10,letterSpacing:1.4},
  sectionGap:{marginTop:space.md},
  review:{gap:space.sm,paddingLeft:space.md,borderLeftWidth:2,borderLeftColor:colors.accentBorder},
  changes:{maxHeight:160},
  change:{paddingVertical:3},
  pressed:{opacity:0.7},
});
