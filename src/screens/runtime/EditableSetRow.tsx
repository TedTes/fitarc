import { useWeightSettings } from './WeightSettings';
import { weightText, type WeightUnit } from '../../runtime/weights';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SetPrescription } from '../../runtime/types';
import { Sheet, Txt } from './ui';
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
  const [rirOpen,setRirOpen]=useState(false);
  const done=set.status==='completed',skipped=set.status==='skipped';
  const changed=Boolean(set.result&&(Number(value.load)!==Number(weightText(set.result.actualLoadKg??set.result.prescribedLoadKg,unit))||Number(value.reps)!==set.result.completedReps||Number(value.rir)!==set.result.reportedRir));
  const enabled=!busy&&!skipped&&validSetRow(value)&&(!done||changed);
  return <><View style={[s.row,s.set,current&&s.current,done&&s.done]}>
    <Txt variant="code" tone={done?'success':current?'accent':'muted'} style={s.number}>{set.setNumber}</Txt>
    {skipped?<Txt variant="mono" tone="muted" style={s.value}>Skipped</Txt>:<>
      <TextInput value={value.load} onChangeText={load=>onChange({load})} style={[s.input,s.value]} inputMode="decimal" keyboardType="decimal-pad" selectTextOnFocus accessibilityLabel={`Set ${set.setNumber} weight in ${unit==='kg'?'kilograms':'pounds'}`}/>
      <TextInput value={value.reps} onChangeText={reps=>onChange({reps:reps.replace(/[^0-9]/g,'').slice(0,2)})} style={[s.input,s.value]} inputMode="numeric" keyboardType="number-pad" selectTextOnFocus accessibilityLabel={`Set ${set.setNumber} reps`}/>
      <Pressable accessibilityRole="button" accessibilityLabel={`Set ${set.setNumber} reps in reserve`} accessibilityHint={`Current value ${value.rir}. Opens quick choices.`} onPress={()=>{Keyboard.dismiss();setRirOpen(true);}} style={[s.input,s.rir,s.rirButton]}>
        <Txt variant="code" style={s.rirValue}>{value.rir}</Txt>
      </Pressable>
    </>}
    <Pressable accessibilityRole="button" accessibilityLabel={done?changed?`Save changes to set ${set.setNumber}`:`Set ${set.setNumber} recorded`:`Log set ${set.setNumber}`} accessibilityState={{disabled:!enabled}} disabled={!enabled} onPress={onConfirm}
      style={({pressed})=>[s.confirm,s.confirmButton,enabled&&(current||done)&&s.confirmActive,!enabled&&!done&&s.disabled,pressed&&s.pressed]}>
      <Ionicons name={skipped?'remove-outline':'checkmark'} size={22} color={enabled&&(current||done)?colors.ground:colors.success}/>
    </Pressable>
  </View>
    {rirOpen?<Sheet visible title={`Set ${set.setNumber} · Reps in reserve`} onClose={()=>setRirOpen(false)}>
      <View style={s.rirChoices}>{[0,1,2,3,4,5].map(rir=><Pressable key={rir} accessibilityRole="button" accessibilityLabel={`${rir} reps in reserve`} accessibilityState={{selected:Number(value.rir)===rir}} onPress={()=>{onChange({rir:String(rir)});setRirOpen(false);}} style={[s.rirChoice,Number(value.rir)===rir&&s.rirSelected]}>
        <Txt variant="code" tone={Number(value.rir)===rir?'success':'secondary'}>{rir}</Txt>
      </Pressable>)}</View>
    </Sheet>:null}
  </>;
};
const s=StyleSheet.create({
  row:{flexDirection:'row',alignItems:'center',gap:5},set:{paddingVertical:5,borderRadius:8},current:{backgroundColor:colors.surfaceRaised},done:{backgroundColor:colors.successSoft},
  label:{fontSize:9,lineHeight:14,textAlign:'center'},number:{width:23,textAlign:'center',fontSize:11},value:{flex:1,minWidth:0},rir:{width:44,textAlign:'center'},
  rirButton:{alignItems:'center',justifyContent:'center'},rirValue:{fontSize:14},rirChoices:{flexDirection:'row',flexWrap:'wrap',gap:8},rirChoice:{flexBasis:'30%',flexGrow:1,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:8,borderWidth:1,borderColor:colors.borderStrong,backgroundColor:colors.surfaceRaised},rirSelected:{borderColor:colors.success,backgroundColor:colors.successSoft},
  input:{height:44,padding:0,textAlign:'center',fontSize:14,fontFamily:'JetBrainsMono-SemiBold',color:colors.text,backgroundColor:colors.ground,borderWidth:1,borderColor:colors.borderStrong,borderRadius:7},
  confirm:{width:44,height:44,alignItems:'center',justifyContent:'center'},confirmButton:{borderRadius:7,borderWidth:1,borderColor:colors.successSoft},confirmActive:{backgroundColor:colors.success},disabled:{opacity:0.3},pressed:{opacity:0.7},
});
