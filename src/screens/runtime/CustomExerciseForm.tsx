import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { MUSCLES } from '../../runtime/trainingPolicy';
import { createRuntimeId } from '../../runtime/id';
import { EQUIPMENT, MOVEMENT_PATTERNS, validateExercise } from '../../runtime/catalogValidation';
import type { ExerciseDefinition, MovementPattern, Muscle } from '../../runtime/types';
import { Button, Choice, Txt } from './ui';
import { colors, space } from './theme';
export const CustomExerciseForm=({onAdd}:{onAdd:(exercise:ExerciseDefinition)=>void})=>{
  const [open,setOpen]=useState(false),[name,setName]=useState(''),[error,setError]=useState('');
  const [primary,setPrimary]=useState<Muscle[]>([]),[secondary,setSecondary]=useState<Muscle[]>([]);
  const [equipment,setEquipment]=useState<string[]>([]),[pattern,setPattern]=useState<MovementPattern>('isolation');
  const [compound,setCompound]=useState(false),[increment,setIncrement]=useState('1');
  const toggle=<T,>(items:T[],item:T)=>items.includes(item)?items.filter(x=>x!==item):[...items,item];
  return <View style={{gap:space.sm}}>
    <Button variant="ghost" label={open?'Close custom exercise':'Exercise missing? Add your own'} onPress={()=>setOpen(!open)} />
    {open?<>
      <Txt variant="caption">Private to your routine. Muscle coverage uses your tags. Setup time and fatigue use simple defaults; they are estimates.</Txt>
      <TextInput style={{color:colors.text,minHeight:44}} placeholder="Exercise name / equipment variant" placeholderTextColor={colors.textMuted} value={name} maxLength={100} onChangeText={setName} accessibilityLabel="Custom exercise name" />
      <Txt variant="label">Primary muscles</Txt>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:space.xs}}>{MUSCLES.map(m=><Choice key={m} compact role="checkbox" label={m} selected={primary.includes(m)} onPress={()=>{setPrimary(toggle(primary,m));setSecondary(secondary.filter(x=>x!==m));}} />)}</View>
      <Txt variant="label">Secondary muscles (optional)</Txt>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:space.xs}}>{MUSCLES.filter(m=>!primary.includes(m)).map(m=><Choice key={m} compact role="checkbox" label={m} selected={secondary.includes(m)} onPress={()=>setSecondary(toggle(secondary,m))} />)}</View>
      <Txt variant="label">Required equipment (none for bodyweight)</Txt>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:space.xs}}>{EQUIPMENT.map(e=><Choice key={e} compact role="checkbox" label={e.replaceAll('_',' ')} selected={equipment.includes(e)} onPress={()=>setEquipment(toggle(equipment,e))} />)}</View>
      <Txt variant="label">Movement</Txt>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:space.xs}}>{MOVEMENT_PATTERNS.map(p=><Choice key={p} compact label={p.replaceAll('_',' ')} selected={pattern===p} onPress={()=>setPattern(p as MovementPattern)} />)}</View>
      <Choice role="checkbox" label="Compound movement (multiple joints)" selected={compound} onPress={()=>setCompound(!compound)} />
      <Txt variant="caption">Smallest weight increase, kg</Txt>
      <TextInput style={{color:colors.text,minHeight:44}} value={increment} onChangeText={setIncrement} keyboardType="decimal-pad" accessibilityLabel="Custom exercise weight increment" />
      {error?<Txt tone="danger">{error}</Txt>:null}
      <Button label="Add private exercise" onPress={()=>{
        const exercise:ExerciseDefinition={id:`user_${createRuntimeId()}`,name:name.trim(),primaryMuscles:primary,secondaryMuscles:secondary,equipment,movementPattern:pattern,compound,
          incrementKg:Number(increment.replace(',','.')),fatigueCost:compound?3:1,setupMinutes:1,substitutionGroup:pattern,contraindications:[]};
        const errors=validateExercise(exercise);if(errors.length){setError(errors.join(' '));return;}onAdd(exercise);setOpen(false);setName('');setError('');
      }} />
    </>:null}
  </View>;
};
