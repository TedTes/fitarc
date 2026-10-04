import type { ExerciseDefinition, TrainingSource } from '../../runtime/types';
import { defaultRoutine } from '../../runtime/routine';
import { EQUIPMENT } from '../../runtime/catalogValidation';
import { ProgressionFields } from './ProgressionFields';
import { Button, Choice, Disclosure, Txt } from './ui';
import { LIMITATIONS } from './constants';
import { View } from 'react-native';
import { space } from './theme';

export const TrainingSettings=({source,catalog,onChange}:{source:TrainingSource;catalog:ExerciseDefinition[];onChange:(source:TrainingSource)=>void})=>{
  const toggle=(items:string[],item:string)=>items.includes(item)?items.filter(x=>x!==item):[...items,item];
  return <View style={{gap:space.md}}>
    <Disclosure title="Available equipment" summary={source.equipment.join(', ')||'Bodyweight'}>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:space.sm}}>{EQUIPMENT.map(item=><Choice key={item} compact role="checkbox" label={item.replaceAll('_',' ')} selected={source.equipment.includes(item)} onPress={()=>onChange({...source,equipment:toggle(source.equipment,item)})} />)}</View>
    </Disclosure>
    <Disclosure title="Limitations and excluded exercises" summary={`${source.limitations.length} limitations · ${source.excludedExerciseIds.length} excluded`}>
      {LIMITATIONS.map(item=><Choice key={item} role="checkbox" label={item} selected={source.limitations.includes(item)} onPress={()=>onChange({...source,limitations:toggle(source.limitations,item)})} />)}
      {source.excludedExerciseIds.map(id=><Button key={id} label={`Allow ${catalog.find(e=>e.id===id)?.name??id} again`} variant="secondary" onPress={()=>onChange({...source,excludedExerciseIds:source.excludedExerciseIds.filter(e=>e!==id)})} />)}
      <Txt variant="caption">Existing exclusions remain active unless you remove them.</Txt>
    </Disclosure>
    <Disclosure title="Weight progression" summary={(source.routine??defaultRoutine()).progression.mode==='manual'?'You choose weight changes':'Suggestions based on completed workouts'}>
      <ProgressionFields value={(source.routine??defaultRoutine()).progression} onChange={progression=>onChange({...source,routine:{...(source.routine??defaultRoutine()),progression}})} catalog={catalog} />
    </Disclosure>
  </View>;
};
