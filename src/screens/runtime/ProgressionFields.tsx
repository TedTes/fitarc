import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { ExerciseDefinition, ProgressionSettings } from '../../runtime/types';
import { Button, Choice, Segmented, Txt } from './ui';
import { colors, space } from './theme';
export const ProgressionFields=({value,onChange,catalog}:{value:ProgressionSettings;onChange:(value:ProgressionSettings)=>void;catalog:ExerciseDefinition[]})=>{
  const [expanded,setExpanded]=useState(false);
  return <View style={{gap:space.md}}>
    <Txt variant="heading">Weight suggestions</Txt>
    <Choice label="Suggest increases from completed workouts" selected={value.mode==='double_progression'} onPress={()=>onChange({...value,mode:'double_progression'})} />
    <Choice label="I’ll choose my own progression" selected={value.mode==='manual'} onPress={()=>onChange({...value,mode:'manual'})} />
    {value.mode==='double_progression' ? <>
      <Txt variant="caption">Increase only after all working sets reach the top of the rep range in this many comparable sessions:</Txt>
      <Segmented label="Successful sessions before increasing weight" options={[1,2,3,4,5]} value={value.successfulSessions} onChange={successfulSessions=>onChange({...value,successfulSessions})} format={String} />
      <Txt variant="caption">Minimum reps left at the end of each set (the exercise’s effort target also applies):</Txt>
      <Segmented label="Minimum reps in reserve for progression" options={[0,1,2,3,4,5]} value={value.minimumRir} onChange={minimumRir=>onChange({...value,minimumRir})} format={String} />
      <Choice role="checkbox" label="Also adjust weight between sets today" selected={value.adjustDuringWorkout} onPress={()=>onChange({...value,adjustDuringWorkout:!value.adjustDuringWorkout})} />
    </> : null}
    <Button variant="ghost" label={expanded?'Hide weight increments':'Set available weight increments'} onPress={()=>setExpanded(!expanded)} />
    {expanded?catalog.map(exercise=><View key={exercise.id} style={{gap:space.xs}}>
      <Txt variant="caption">{exercise.name} · increment in kg</Txt>
      <TextInput style={{color:colors.text,borderWidth:1,borderColor:colors.border,minHeight:44,paddingHorizontal:space.sm}} keyboardType="decimal-pad" accessibilityLabel={`${exercise.name} weight increment in kg`}
        placeholder={String(exercise.incrementKg)} placeholderTextColor={colors.textMuted} value={value.increments[exercise.id]===undefined?'':String(value.increments[exercise.id])}
        onChangeText={raw=>{const increments={...value.increments};if(!raw.trim())delete increments[exercise.id];else increments[exercise.id]=Number(raw.replace(',','.'));onChange({...value,increments});}} />
    </View>):null}
  </View>;
};
