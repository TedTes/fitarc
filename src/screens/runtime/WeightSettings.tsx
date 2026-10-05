import { createContext, useContext, useState } from 'react';
import { View } from 'react-native';
import { PlanButton, PlanGroup, PlanInput, PlanOptions, PlanText, planStyles } from './PlanKit';
import { Sheet } from './ui';
import { toKg, weightText, type WeightRange, type WeightUnit } from '../../runtime/weights';

export const WeightSettingsContext=createContext<{unit:WeightUnit;ranges:Record<string,WeightRange>;save:(patch:{weightUnit?:WeightUnit;exerciseId?:string;range?:WeightRange|null})=>string|undefined}>({unit:'kg',ranges:{},save:()=>undefined});
export const useWeightSettings=()=>useContext(WeightSettingsContext);
export const WeightUnitOptions=()=>{
  const {unit,save}=useWeightSettings();
  const [error,setError]=useState('');
  return <View style={planStyles.section}><PlanOptions segments options={[{value:'kg',label:'kg'},{value:'lb',label:'lb'}]} value={unit} onChange={weightUnit=>setError(save({weightUnit})??'')}/>{error?<PlanText kind="meta">{error}</PlanText>:null}</View>;
};
export const WeightRangeSheet=({exerciseId,name,onClose}:{exerciseId:string;name:string;onClose:(applied?:boolean)=>void})=>{
  const {unit,ranges,save}=useWeightSettings(),range=ranges[exerciseId];
  const [minimum,setMinimum]=useState(range?weightText(range.minKg,unit):''),[maximum,setMaximum]=useState(range?weightText(range.maxKg,unit):''),[error,setError]=useState('');
  const apply=()=>{
    if(!minimum.trim()||!maximum.trim()){setError('Enter both weights.');return;}
    const error=save({exerciseId,range:{minKg:toKg(Number(minimum),unit),maxKg:toKg(Number(maximum),unit)}});
    if(error)setError(error);else onClose(true);
  };
  return <Sheet visible title="Weight range" onClose={()=>onClose()}>
    <PlanText bold>{name}</PlanText>
    <View style={planStyles.row}>
      <View style={planStyles.flex}><PlanGroup label={`MIN · ${unit.toUpperCase()}`}><PlanInput accessibilityLabel={`Minimum weight in ${unit}`} value={minimum} onChangeText={setMinimum} keyboardType="decimal-pad" inputMode="decimal"/></PlanGroup></View>
      <View style={planStyles.flex}><PlanGroup label={`MAX · ${unit.toUpperCase()}`}><PlanInput accessibilityLabel={`Maximum weight in ${unit}`} value={maximum} onChangeText={setMaximum} keyboardType="decimal-pad" inputMode="decimal"/></PlanGroup></View>
    </View>
    {error?<PlanText kind="meta">{error}</PlanText>:null}
    <PlanButton label="Fill sets" onPress={apply}/>
    {range?<PlanButton variant="ghost" label="Remove range" onPress={()=>{const error=save({exerciseId,range:null});if(error)setError(error);else onClose();}}/>:null}
  </Sheet>;
};
