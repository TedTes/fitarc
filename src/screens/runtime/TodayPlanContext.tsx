import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Choice, Sheet, Txt } from './ui';
import { colors, space } from './theme';
import { STYLE_OPTIONS } from './PlanSurface';
import { selectTrainingStyle, jumpTrainingGroup } from '../../runtime/planActions';
import { resumeWorkout } from '../../runtime/sessionSwitching';
import { trainingStyle } from '../../runtime/trainingStyles';
import { nextRoutineSlot } from '../../runtime/sequence';
import type { RuntimeState, TrainingSource } from '../../runtime/types';
import type { ApplyResult } from './useRuntimeController';
export function TodayPlanContext({state,defaults,apply,active}:{state:RuntimeState;defaults:TrainingSource;active:boolean;apply:(fn:(state:RuntimeState)=>RuntimeState)=>ApplyResult}){
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  const style=trainingStyle(state.block?.preferences);
  const group=state.activeSession?.slotId??(state.block?.slots.length?nextRoutineSlot(state.block,state.sessions)?.id:undefined);
  const choose=(fn:(state:RuntimeState)=>RuntimeState)=>{const result=apply(fn);if(result.ok){setError('');setOpen(false);}else setError(result.error instanceof Error?result.error.message:'Could not switch training.');};
  return <View style={{paddingHorizontal:space.lg,paddingTop:space.sm}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Switch training style or group" onPress={()=>setOpen(true)} hitSlop={6} style={{minHeight:32,alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:6}}>
      <Txt variant="caption" tone="muted">{STYLE_OPTIONS.find(s=>s.id===style)?.name??'Choose training'}</Txt><Ionicons name="chevron-down" size={14} color={colors.textMuted}/>
    </Pressable>
    <Sheet visible={active&&open} title="Training" onClose={()=>setOpen(false)}>
      {STYLE_OPTIONS.map(option=><Choice key={option.id} label={option.name} selected={style===option.id} onPress={()=>choose(current=>selectTrainingStyle(current,defaults,option.id))}/>)}
      {state.block?.slots.length?<Txt variant="label">Jump to group</Txt>:null}
      {state.block?.slots.map(slot=><Choice key={slot.id} label={slot.label} selected={group===slot.id} onPress={()=>choose(current=>jumpTrainingGroup(current,slot.id))}/>)}
      {state.sessions.filter(s=>s.status==='paused'&&s.context.extraWorkout).map(session=><Choice key={session.id} label={`Resume ${session.name??'freestyle workout'}`} selected={false} onPress={()=>choose(current=>resumeWorkout(current,session.id))}/>)}
      {error?<Txt tone="danger">{error}</Txt>:null}
    </Sheet>
  </View>;
}
