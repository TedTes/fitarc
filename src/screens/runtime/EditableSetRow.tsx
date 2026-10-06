import { useWeightSettings } from './WeightSettings';
import { weightText, type WeightUnit } from '../../runtime/weights';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SetPrescription } from '../../runtime/types';
import { Txt } from './ui';
import { SetNumberPicker } from './SetNumberPicker';
import { colors } from './theme';

export type SetRowValues={load:string;reps:string;rir:string};
export const setRowValues=(set:SetPrescription,needsBaseline:boolean,unit:WeightUnit='kg'):SetRowValues=>({
  load:set.result?weightText(set.result.actualLoadKg??set.result.prescribedLoadKg,unit):needsBaseline?'':weightText(set.loadKg,unit),
  reps:String(set.result?.completedReps??set.maxReps),rir:String(set.result?.reportedRir??set.targetRir),
});
export const validSetRow=(value:SetRowValues)=>value.load.trim()!==''&&Number.isFinite(Number(value.load))&&Number(value.load)>=0
  &&/^\d+$/.test(value.reps)&&Number(value.reps)<=99&&/^\d+$/.test(value.rir)&&Number(value.rir)<=5;

export const SetTableHeader=()=> {const {unit}=useWeightSettings();return <View style={s.row}>
  <Txt variant="mono" tone="muted" style={[s.label,s.number]}>SET</Txt>
  <Txt variant="mono" tone="muted" style={[s.label,s.value]}>{unit.toUpperCase()}</Txt>
  <Txt variant="mono" tone="muted" style={[s.label,s.value]}>REPS</Txt>
  <Txt variant="mono" tone="muted" style={[s.label,s.rir]}>RIR</Txt>
  <View style={s.confirm}/>
</View>;};

export const EditableSetRow=({set,value,current,busy,onChange,onConfirm}:{set:SetPrescription;value:SetRowValues;current:boolean;busy:boolean;onChange:(patch:Partial<SetRowValues>)=>void;onConfirm:()=>void})=>{
  const {unit}=useWeightSettings();
  const [pickerOpen,setPickerOpen]=useState(false);
  const done=set.status==='completed',skipped=set.status==='skipped';
  const changed=Boolean(set.result&&(Number(value.load)!==Number(weightText(set.result.actualLoadKg??set.result.prescribedLoadKg,unit))||Number(value.reps)!==set.result.completedReps||Number(value.rir)!==set.result.reportedRir));
  const enabled=!busy&&!skipped&&validSetRow(value)&&(!done||changed);
  return <><View style={[s.row,s.set,current&&s.current,done&&s.done]}>
    <Txt variant="code" tone={done?'success':current?'accent':'muted'} style={s.number}>{set.setNumber}</Txt>
    {skipped?<Txt variant="mono" tone="muted" style={s.value}>Skipped</Txt>:<>
      {(['load','reps','rir'] as const).map(field=><Pressable key={field} accessibilityRole="button"
        accessibilityLabel={`Set ${set.setNumber} ${field==='load'?`weight in ${unit==='kg'?'kilograms':'pounds'}`:field==='reps'?'reps':'reps in reserve'}`}
        accessibilityHint={`Current value ${value[field]||'unset'}. Opens scrolling number pickers.`}
        onPress={()=>{Keyboard.dismiss();setPickerOpen(true);}} style={[s.input,field==='rir'?s.rir:s.value,s.numberButton]}>
        <Txt variant="code" style={s.numberValue}>{value[field]||'—'}</Txt>
      </Pressable>)}
    </>}
    <Pressable accessibilityRole="button" accessibilityLabel={done?changed?`Save changes to set ${set.setNumber}`:`Set ${set.setNumber} recorded`:`Log set ${set.setNumber}`} accessibilityState={{disabled:!enabled}} disabled={!enabled} onPress={onConfirm}
      style={({pressed})=>[s.confirm,s.confirmButton,enabled&&(current||done)&&s.confirmActive,!enabled&&!done&&s.disabled,pressed&&s.pressed]}>
      <Ionicons name={skipped?'remove-outline':'checkmark'} size={22} color={enabled&&(current||done)?colors.ground:colors.success}/>
    </Pressable>
  </View>
    {pickerOpen?<SetNumberPicker setNumber={set.setNumber} value={value} unit={unit} onClose={()=>setPickerOpen(false)} onSave={next=>{onChange(next);setPickerOpen(false);}}/>:null}
  </>;
};
const s=StyleSheet.create({
  row:{flexDirection:'row',alignItems:'center',gap:5},set:{paddingVertical:5,borderRadius:8},current:{backgroundColor:colors.surfaceRaised},done:{backgroundColor:colors.successSoft},
  label:{fontSize:9,lineHeight:14,textAlign:'center'},number:{width:23,textAlign:'center',fontSize:11},value:{flex:1,minWidth:0},rir:{width:44,textAlign:'center'},
  numberButton:{alignItems:'center',justifyContent:'center'},numberValue:{fontSize:14},
  input:{height:44,padding:0,textAlign:'center',fontSize:14,fontFamily:'JetBrainsMono-SemiBold',color:colors.text,backgroundColor:colors.ground,borderWidth:1,borderColor:colors.borderStrong,borderRadius:7},
  confirm:{width:44,height:44,alignItems:'center',justifyContent:'center'},confirmButton:{borderRadius:7,borderWidth:1,borderColor:colors.successSoft},confirmActive:{backgroundColor:colors.success},disabled:{opacity:0.3},pressed:{opacity:0.7},
});
