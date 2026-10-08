import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NextWorkout } from '../../runtime/nextWorkout';
import type { ExerciseDefinition } from '../../runtime/types';
import { ExerciseDetailsSheet } from './ExerciseMuscles';
import { MuscleMap } from './MuscleMap';
import { preferredTargetView } from './muscleTargeting';
import { muscleList, slotPlain } from './copy';
import { Button, IconButton, Txt } from './ui';
import { colors, space } from './theme';
import { CompletedWorkoutMuscleMap } from './CompletedWorkoutMuscleMap';

export const NextWorkoutPreview=({workout,today,celebrationId,onAddExercise,onUse}:{workout:NextWorkout;today:string;celebrationId?:string|null;onAddExercise:()=>void;onUse:()=>void})=>{
  const [inspected,setInspected]=useState<ExerciseDefinition|null>(null);
  const name=slotPlain({label:workout.name});
  const muscles=workout.exercises.flatMap(({exercise})=>exercise.primaryMuscles);
  const upper=muscles.some(m=>['chest','back','delts','biceps','triceps'].includes(m));
  const lower=muscles.some(m=>['quads','hamstrings','glutes','calves'].includes(m));
  const suggestedGroup=upper&&lower?'Full body':upper?'Upper':lower?'Lower':muscles.includes('core')?'Core':'';
  const group=/^(your )?next workout$/i.test(name)?suggestedGroup:name;
  const heading=group?`Next session: ${group}`:'Next session';
  return <View style={s.root}>
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.header}><Txt variant="title" style={s.title}>Today</Txt><IconButton icon="add" label="Add exercise to next session" onPress={onAddExercise}/></View>
      {workout.finishedToday?<View style={s.done}><Ionicons name="checkmark-circle" size={22} color={colors.success}/><Txt variant="heading" tone="success">Today’s workout complete</Txt></View>:null}
      {workout.finishedToday?<CompletedWorkoutMuscleMap workout={workout} celebrationId={celebrationId}/>:null}
      <Txt variant="heading" style={s.heading}>{heading}</Txt>
      {workout.exercises.map(({exercise,sets,minReps,maxReps})=><Pressable key={exercise.id} accessibilityRole="button" accessibilityLabel={`Preview ${exercise.name}`} onPress={()=>setInspected(exercise)} style={s.row}>
        <View style={s.muscle} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><MuscleMap view={preferredTargetView(exercise)} targets={exercise} height={60} showZoom={false} focusTargets/></View>
        <View style={s.copy}><Txt variant="heading">{exercise.name}</Txt><Txt variant="caption" tone="muted">{muscleList(exercise.primaryMuscles)} · {sets} × {minReps===maxReps?minReps:`${minReps}–${maxReps}`}</Txt></View>
        <Ionicons name="chevron-forward" size={17} color={colors.textDim}/>
      </Pressable>)}
      {!workout.exercises.length?<Txt variant="caption" tone="secondary">Update your routine or equipment to find exercises that fit.</Txt>:null}
      {workout.kind==='suggested'&&workout.date<=today&&workout.exercises.length?<Button label="Use this workout" onPress={onUse}/>:null}
    </ScrollView>
    <ExerciseDetailsSheet exercise={inspected} onClose={()=>setInspected(null)}/>
  </View>;
};
const s=StyleSheet.create({root:{flex:1},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},title:{flex:1},page:{padding:space.lg,gap:10},done:{flexDirection:'row',gap:8,alignItems:'center',paddingVertical:14},heading:{marginTop:10,marginBottom:8},row:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderWidth:1,borderColor:colors.border,borderRadius:14,backgroundColor:colors.surface},muscle:{width:48,height:60,overflow:'hidden',borderRadius:10},copy:{flex:1,gap:4}});
