import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NextWorkout } from '../../runtime/nextWorkout';
import type { ExerciseDefinition } from '../../runtime/types';
import { datePlusDays } from '../../runtime/planDates';
import { ExerciseDetailsSheet } from './ExerciseMuscles';
import { MuscleMap } from './MuscleMap';
import { preferredTargetView } from './muscleTargeting';
import { muscleList, slotPlain } from './copy';
import { Button, Txt } from './ui';
import { colors, space } from './theme';

export const NextWorkoutPreview=({workout,today,onRoutine,onNewWorkout,onUse}:{workout:NextWorkout;today:string;onRoutine:()=>void;onNewWorkout:()=>void;onUse:()=>void})=>{
  const [inspected,setInspected]=useState<ExerciseDefinition|null>(null);
  const when=workout.date===today?'Today':workout.date===datePlusDays(today,1)?'Tomorrow':new Date(`${workout.date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  return <View style={s.root}>
    <ScrollView contentContainerStyle={s.page}>
      <Txt variant="title">Today</Txt>
      {workout.finishedToday?<View style={s.done}><Ionicons name="checkmark-circle" size={22} color={colors.success}/><Txt variant="heading" tone="success">Today’s workout complete</Txt></View>:null}
      <View style={s.heading}><Txt variant="label" tone="muted">NEXT WORKOUT · {when.toUpperCase()}</Txt><Txt variant="heading">{slotPlain({label:workout.name})}</Txt>
        <Txt variant="caption" tone="secondary">{workout.kind==='routine'?'From your routine':'Suggested from your recent training and equipment'}</Txt></View>
      {workout.exercises.map(({exercise,sets,minReps,maxReps})=><Pressable key={exercise.id} accessibilityRole="button" accessibilityLabel={`Preview ${exercise.name}`} onPress={()=>setInspected(exercise)} style={s.row}>
        <View style={s.muscle} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><MuscleMap view={preferredTargetView(exercise)} targets={exercise} height={60} showZoom={false} focusTargets/></View>
        <View style={s.copy}><Txt variant="heading">{exercise.name}</Txt><Txt variant="caption" tone="muted">{muscleList(exercise.primaryMuscles)} · {sets} × {minReps===maxReps?minReps:`${minReps}–${maxReps}`}</Txt></View>
        <Ionicons name="chevron-forward" size={17} color={colors.textDim}/>
      </Pressable>)}
      {!workout.exercises.length?<Txt variant="caption" tone="secondary">Update your routine or equipment to find exercises that fit.</Txt>:null}
      <View style={s.actions}>
        {workout.kind==='suggested'&&workout.date<=today&&workout.exercises.length?<Button label="Use this workout" onPress={onUse}/>:null}
        <Button variant="ghost" label={workout.kind==='routine'?'Edit routine':'Add your routine'} onPress={onRoutine}/>
        <Button variant="ghost" label="New workout" onPress={onNewWorkout}/>
      </View>
    </ScrollView>
    <ExerciseDetailsSheet exercise={inspected} onClose={()=>setInspected(null)}/>
  </View>;
};
const s=StyleSheet.create({root:{flex:1},page:{padding:space.lg,gap:10},done:{flexDirection:'row',gap:8,alignItems:'center',paddingVertical:14},heading:{gap:6,marginTop:10,marginBottom:8},row:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderWidth:1,borderColor:colors.border,borderRadius:14,backgroundColor:colors.surface},muscle:{width:48,height:60,overflow:'hidden',borderRadius:10},copy:{flex:1,gap:4},actions:{marginTop:12,gap:8}});
