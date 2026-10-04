import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RoutineDefinition, TrainingSource } from '../../runtime/types';
import { SPLIT_LABELS, type RoutineInputContext } from '../../routineSetup/context';
import { Choice, Sheet, Txt } from './ui';
import { colors, radius, space } from './theme';

export const RoutineContextChips=({value,initial,disabled,onChange}:{value:RoutineInputContext;initial:TrainingSource;disabled:boolean;onChange:(value:RoutineInputContext)=>void})=>{
  const [open,setOpen]=useState<'split'|'days'|'minutes'|null>(null);
  const chip=(key:'split'|'days'|'minutes',label:string,accessibilityLabel:string)=><Pressable key={key} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{disabled,expanded:open===key}} disabled={disabled} onPress={()=>{Keyboard.dismiss();setOpen(key);}} style={[styles.chip,disabled&&styles.disabled]}>
    <Txt variant="caption" numberOfLines={1} style={styles.label}>{label}</Txt><Ionicons name="chevron-down" size={14} color={colors.textMuted}/>
  </Pressable>;
  const choose=(patch:RoutineInputContext)=>{onChange({...value,...patch});setOpen(null);};
  const days=value.days??initial.daysPerWeek,minutes=value.minutes??initial.sessionMinutes;
  return <>
    <View style={styles.constraintRow}>
      {chip('split',value.split&&value.split!=='auto'?(value.split==='push_pull_legs'?'PPL':SPLIT_LABELS[value.split]):'Split','Training split')}
      {chip('days',`${days} days/wk`,'Days per week')}
      {chip('minutes',`${minutes} min`,'Workout time')}
    </View>
    <Sheet visible={open!==null} onClose={()=>setOpen(null)} title={open==='split'?'Training split':open==='days'?'Days per week':'Workout time'}>
      {open==='split'?(Object.keys(SPLIT_LABELS) as RoutineDefinition['split'][]).map(split=><Choice key={split} label={SPLIT_LABELS[split]} selected={(value.split??'auto')===split} onPress={()=>choose({split})}/>):null}
      {open==='days'?<View style={styles.chips}>{([1,2,3,4,5,6,7] as const).map(day=><Choice key={day} compact label={`${day} ${day===1?'day':'days'}`} selected={days===day} onPress={()=>choose({days:day})}/>)}</View>:null}
      {open==='minutes'?<View style={styles.chips}>{[...new Set([20,30,45,60,75,90,minutes])].sort((a,b)=>a-b).map(time=><Choice key={time} compact label={`${time} min`} selected={minutes===time} onPress={()=>choose({minutes:time})}/>)}</View>:null}
    </Sheet>
  </>;
};
const styles=StyleSheet.create({constraintRow:{flexDirection:'row',gap:6},chips:{flexDirection:'row',flexWrap:'wrap',gap:space.sm},chip:{minHeight:40,flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8,paddingVertical:6,borderWidth:1,borderColor:colors.borderStrong,borderRadius:radius.sm,backgroundColor:colors.surface},label:{flexShrink:1,fontSize:11,lineHeight:15,fontWeight:'600'},disabled:{opacity:0.5}});
