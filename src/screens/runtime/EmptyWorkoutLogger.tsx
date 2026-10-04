import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { addRuntimeExercise, discardRuntimeSession } from '../../runtime';
import type { RuntimeState } from '../../runtime';
import { Button, IconButton, Txt } from './ui';
import { TodayExercisePicker } from './TodayExercisePicker';
import { colors, space } from './theme';
import type { ApplyResult } from './useRuntimeController';

/** A confirmed blank workout remains untimed until the first set is logged. */
export const EmptyWorkoutLogger=({state,apply}:{state:RuntimeState;apply:(fn:(state:RuntimeState)=>RuntimeState)=>ApplyResult})=>{
  const [adding,setAdding]=useState(false),[error,setError]=useState('');
  const catalog=(state.block?.catalog??state.catalog??[]).filter(exercise=>!state.source?.excludedExerciseIds.includes(exercise.id)
    && !exercise.contraindications.some(tag=>state.source?.limitations.includes(tag))
    && exercise.equipment.every(item=>state.source?.equipment.includes(item)));
  const update=(fn:(state:RuntimeState)=>RuntimeState)=>{
    const result=apply(fn);
    if(!result.ok){setError(result.error instanceof Error?result.error.message:'Could not update workout');return;}
    setError('');setAdding(false);
  };
  return <View style={s.page}>
    <View style={s.header}><Txt variant="heading" style={s.flex}>Today’s workout</Txt><IconButton icon="close" label="Cancel empty workout" onPress={()=>update(discardRuntimeSession)}/></View>
    <Txt variant="mono" tone="accent" style={s.meta}>Ready · 0 sets</Txt>
    <View style={s.body}><Button label="Add exercise" icon="add" onPress={()=>setAdding(true)}/></View>
    {error?<Txt tone="danger">{error}</Txt>:null}
    {adding?<TodayExercisePicker catalog={catalog} onClose={()=>setAdding(false)} onAdd={exercise=>update(current=>addRuntimeExercise(current,{exerciseId:exercise.id,sets:3,minReps:8,maxReps:12,targetRir:2}))}/>:null}
  </View>;
};
const s=StyleSheet.create({page:{flex:1,padding:space.lg,gap:space.md,backgroundColor:colors.ground},header:{flexDirection:'row',alignItems:'center'},flex:{flex:1},meta:{fontSize:12},body:{flex:1,justifyContent:'center'}});
