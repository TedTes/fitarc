import { View } from 'react-native';
import type { Muscle, RoutineFocus, RoutineSetDefaults } from '../../runtime/types';
import { PlanGroup, PlanOptions, planStyles } from './PlanKit';

export const MUSCLE_OPTIONS: readonly {value:Muscle;label:string}[] = [
  {value:'chest',label:'Chest'},{value:'back',label:'Back'},{value:'delts',label:'Shoulders'},
  {value:'quads',label:'Quads'},{value:'hamstrings',label:'Hamstrings'},{value:'glutes',label:'Glutes'},
  {value:'biceps',label:'Biceps'},{value:'triceps',label:'Triceps'},{value:'calves',label:'Calves'},{value:'core',label:'Core'},
];
export const GOAL_OPTIONS:readonly {value:RoutineFocus;label:string}[]=[{value:'build_muscle',label:'Build muscle'},{value:'lose_fat',label:'Lose fat'},{value:'strength',label:'Strength'},{value:'maintain',label:'Maintain'}];
export const EQUIPMENT_OPTIONS=[{value:'barbell',label:'Barbell'},{value:'dumbbell',label:'Dumbbell'},{value:'machine',label:'Machine'},{value:'cable',label:'Cable'},{value:'bands',label:'Bands'},{value:'bodyweight',label:'Bodyweight'}];
export const numberOptions=(values:readonly number[])=>values.map(value=>({value,label:String(value)}));
export const toggleValue=<T,>(values:readonly T[],value:T)=>values.includes(value)?values.filter(item=>item!==value):[...values,value];
export const SetTargetControls=({value,onChange}:{value:RoutineSetDefaults;onChange:(value:RoutineSetDefaults)=>void})=>{
  const range=`${value.minReps}–${value.maxReps}`;
  const ranges=[...new Set(['6–8','8–12','12–15',range])];
  return <View style={planStyles.section}>
    <PlanGroup label="SETS"><PlanOptions segments options={numberOptions([...new Set([2,3,4,5,value.sets])].sort((a,b)=>a-b))} value={value.sets} onChange={sets=>onChange({...value,sets})}/></PlanGroup>
    <PlanGroup label="REP RANGE"><PlanOptions segments options={ranges.map(value=>({value,label:value}))} value={range} onChange={next=>{const [minReps,maxReps]=next.split('–').map(Number);onChange({...value,minReps,maxReps});}}/></PlanGroup>
    <PlanGroup label="RIR"><PlanOptions segments options={numberOptions([...new Set([0,1,2,3,4,value.targetRir])].sort((a,b)=>a-b))} value={value.targetRir} onChange={targetRir=>onChange({...value,targetRir})}/></PlanGroup>
  </View>;
};
