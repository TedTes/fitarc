import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExerciseDefinition, RuntimeState, SessionContext, TrainingSlot } from '../../runtime/types';
import { exerciseAlternatives } from '../../runtime/recommendations';
import { Button, Txt } from './ui';
import { colors, radius, space, TOUCH } from './theme';

/** One exercise's alternatives, opened deliberately from its row on Today. */
export const WorkoutAlternatives=({state,slot,target,context,onChange}:{
  state:RuntimeState;slot:TrainingSlot;target:ExerciseDefinition;context:SessionContext;
  onChange:(replacements:Record<string,string>)=>void;
})=>{
  if(!state.source||!state.block)return null;
  const catalog=state.block.catalog??state.catalog??[];
  const replacement=context.exerciseReplacements?.[target.id];
  const excluded=slot.plannedExercises.filter(x=>x.exerciseId!==target.id).map(x=>context.exerciseReplacements?.[x.exerciseId]??x.exerciseId);
  const options=exerciseAlternatives(target,catalog,state.source,state.sessions,context,excluded).slice(0,5);
  return <View style={styles.group}>
    {replacement?<Button label={`Restore ${target.name}`} variant="secondary" onPress={()=>{const next={...context.exerciseReplacements};delete next[target.id];onChange(next);}} />:null}
    {options.map(option=>{
      const familiar=state.sessions.some(s=>s.status==='committed'&&s.context.date<=context.date&&s.exercises.some(e=>e.exercise.id===option.exercise.id&&e.sets.some(set=>set.status==='completed')));
      return <View key={option.exercise.id} style={styles.option}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Use ${option.exercise.name} today`} onPress={()=>onChange({...context.exerciseReplacements,[target.id]:option.exercise.id})} style={styles.row}>
          <View style={styles.copy}><Txt variant="heading">{option.exercise.name}</Txt><Txt variant="caption" tone="secondary">{familiar?'Uses your history':'Weight unset'}</Txt></View>
          <Ionicons name={replacement===option.exercise.id?'checkmark':'swap-horizontal'} size={20} color={colors.accent}/>
        </Pressable>
      </View>;
    })}
    {!options.length?<Txt tone="secondary">No alternatives fit today’s equipment and preferences.</Txt>:null}
  </View>;
};
const styles=StyleSheet.create({group:{gap:space.md},option:{gap:space.xs},row:{flexDirection:'row',alignItems:'center',gap:space.md,minHeight:TOUCH,padding:space.md,borderRadius:radius.md,backgroundColor:colors.surfaceRaised},copy:{flex:1,gap:space.xs}});
