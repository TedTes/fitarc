import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { addRuntimeExercise } from '../../runtime';
import { GROUP_TEMPLATES, matchesGroup, preferredWorkoutPattern, workoutGroup } from '../../runtime/exercisePools';
import type { ExerciseDefinition, Muscle, RuntimeState } from '../../runtime';
import { IconButton, Sheet, Txt } from './ui';
import { TodayExercisePicker } from './TodayExercisePicker';
import { MuscleMap } from './MuscleMap';
import { ExercisePickerRow } from './RoutineWorkoutSheet';
import { colors, space } from './theme';
import type { ApplyResult } from './useRuntimeController';

/** Empty sessions offer relevant exercises without silently undoing a removal. */
export const EmptyWorkoutLogger=({state,apply}:{state:RuntimeState;apply:(fn:(state:RuntimeState)=>RuntimeState)=>ApplyResult})=>{
  const [error,setError]=useState(''),[adding,setAdding]=useState(false);
  const [expanded,setExpanded]=useState<'front'|'back'|null>(null);
  const [selected,setSelected]=useState<Muscle|null>(null);
  const {height:screenHeight}=useWindowDimensions();
  const slot=state.block?.slots.find(item=>item.id===state.activeSession?.slotId);
  const pattern=state.source?preferredWorkoutPattern(state.source):undefined;
  const group=workoutGroup(slot?.label??'')??(pattern?GROUP_TEMPLATES[pattern][0]:undefined);
  const catalog=useMemo(()=>{
    const source=state.source,context=state.activeSession?.context;
    const eligible=(state.block?.catalog??state.catalog??[]).filter(exercise=>(!group||matchesGroup(exercise,group))
      && !source?.excludedExerciseIds.includes(exercise.id)
      && !context?.unavailableExerciseIds.includes(exercise.id)
      && !exercise.contraindications.some(tag=>source?.limitations.includes(tag))
      && exercise.equipment.every(item=>source?.equipment.includes(item)&&!context?.unavailableEquipment.includes(item)));
    return eligible;
  },[state.block?.catalog,state.catalog,state.source,state.activeSession?.context,group]);
  const suggestions=useMemo(()=>{
    const eligible=[...catalog];
    for(let i=eligible.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[eligible[i],eligible[j]]=[eligible[j],eligible[i]];}
    return eligible.slice(0,6);
  },[catalog]);
  const add=(exercise:ExerciseDefinition)=>{
    const result=apply(current=>addRuntimeExercise(current,{exerciseId:exercise.id,sets:3,minReps:8,maxReps:12,targetRir:2}));
    setError(result.ok?'':result.error instanceof Error?result.error.message:'Could not add exercise');
    if(result.ok)setAdding(false);
  };
  const muscles=[...new Set(suggestions.flatMap(exercise=>exercise.primaryMuscles))];
  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <View style={s.header}><Txt variant="heading" style={s.flex}>Today’s workout</Txt><IconButton icon="add" label="Add exercise" onPress={()=>setAdding(true)}/></View>
    <Txt tone="secondary">{group?.name??slot?.label??'Your workout'}</Txt>
    <View style={s.bodies}>{(['front','back'] as const).map(view=><Pressable key={view} style={s.body}
      accessibilityRole="button" accessibilityLabel={`Open the ${view} muscle map full screen`} onPress={()=>setExpanded(view)}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <MuscleMap view={view} sessionComparison={{completed:[],next:muscles}} height={240} showZoom={false}/>
      </View>
    </Pressable>)}</View>
    <Sheet visible={expanded!==null} onClose={()=>setExpanded(null)} title="Muscle map" scrollable={false}>
      {expanded?<MuscleMap view={expanded} onViewChange={setExpanded} selected={selected}
        onSelect={muscle=>setSelected(current=>current===muscle?null:muscle)}
        sessionComparison={{completed:[],next:muscles}} height={Math.round(screenHeight*0.6)}/>:null}
    </Sheet>
    <Txt variant="heading">Suggested exercises</Txt>
    {error?<Txt tone="danger">{error}</Txt>:null}
    {suggestions.map(exercise=><ExercisePickerRow key={exercise.id} exercise={exercise} onAdd={add}/>)}
    {adding?<TodayExercisePicker catalog={catalog} title={group?`Add to ${group.name}`:'Add exercise'} onAdd={add} onClose={()=>setAdding(false)}/>:null}
    {!suggestions.length?<Txt tone="secondary">No matching exercises for your equipment and preferences. Update them in Profile.</Txt>:null}
  </ScrollView>;
};
const s=StyleSheet.create({header:{flexDirection:'row',alignItems:'center'},flex:{flex:1},page:{flex:1,backgroundColor:colors.ground},content:{padding:space.lg,gap:space.md},bodies:{flexDirection:'row',gap:space.sm},body:{flex:1,overflow:'hidden',borderRadius:14}});
