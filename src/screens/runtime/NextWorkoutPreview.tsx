import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NextWorkout } from '../../runtime/nextWorkout';
import type { ExerciseDefinition } from '../../runtime/types';
import { ExerciseDetailsSheet } from './ExerciseMuscles';
import { MuscleMap } from './MuscleMap';
import { preferredTargetView } from './muscleTargeting';
import { muscleList, slotPlain } from './copy';
import { Txt } from './ui';
import { StartSessionCard } from './StartSessionCard';
import { colors, space } from './theme';
import { CompletedWorkoutMuscleMap, type TodayStats } from './CompletedWorkoutMuscleMap';

/** "today", "tomorrow", or a weekday for anything later this week; ISO dates otherwise. */
const dayLabel=(date:string,today:string)=>{
  const days=Math.round((Date.parse(`${date}T12:00:00`)-Date.parse(`${today}T12:00:00`))/86400000);
  if(days<=0)return 'today';
  if(days===1)return 'tomorrow';
  if(days<7)return new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:'long'}).toLowerCase();
  return date;
};

export const NextWorkoutPreview=({workout,today,stats,celebrationId,onAddExercise,onUse}:{workout:NextWorkout;today:string;stats?:TodayStats;celebrationId?:string|null;onAddExercise:()=>void;onUse:()=>void})=>{
  const [inspected,setInspected]=useState<ExerciseDefinition|null>(null);
  const name=slotPlain({label:workout.name});
  const muscles=workout.exercises.flatMap(({exercise})=>exercise.primaryMuscles);
  const upper=muscles.some(m=>['chest','back','delts','biceps','triceps'].includes(m));
  const lower=muscles.some(m=>['quads','hamstrings','glutes','calves'].includes(m));
  const suggestedGroup=upper&&lower?'Full body':upper?'Upper':lower?'Lower':muscles.includes('core')?'Core':'';
  const group=/^(your )?next workout$/i.test(name)?suggestedGroup:name;
  const heading=group?`Next session: ${group}`:'Next session';
  const canStart=workout.kind==='suggested'&&workout.date<=today&&workout.exercises.length>0;
  return <View style={s.root}>
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.header}>
        <Txt variant="title" style={s.title}>Today</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel="Add exercise to next session" onPress={onAddExercise} hitSlop={10}
          style={({pressed})=>[s.add,pressed&&s.pressed]}>
          <Ionicons name="add" size={18} color={colors.accent}/><Txt variant="label" tone="accent">ADD</Txt>
        </Pressable>
      </View>
      {workout.finishedToday?<CompletedWorkoutMuscleMap workout={workout} stats={stats} celebrationId={celebrationId}/>:null}
      {workout.exercises.length
        ? <StartSessionCard title={group||'Next session'} exercises={workout.exercises.length}
            sets={workout.exercises.reduce((sum,item)=>sum+item.sets,0)} muscles={muscles}
            onStart={canStart?onUse:undefined} when={dayLabel(workout.date,today)} showMuscles={!workout.finishedToday}/>
        : null}
      <Txt variant="heading" style={s.heading}>{workout.exercises.length?'Exercises':heading}</Txt>
      {workout.exercises.map(({exercise,sets,minReps,maxReps})=><Pressable key={exercise.id} accessibilityRole="button" accessibilityLabel={`Preview ${exercise.name}`} onPress={()=>setInspected(exercise)} style={s.row}>
        <View style={s.muscle} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><MuscleMap view={preferredTargetView(exercise)} targets={exercise} height={60} showZoom={false} focusTargets/></View>
        <View style={s.copy}><Txt variant="heading">{exercise.name}</Txt><Txt variant="caption" tone="muted">{muscleList(exercise.primaryMuscles)} · {sets} × {minReps===maxReps?minReps:`${minReps}–${maxReps}`}</Txt></View>
        <Ionicons name="chevron-forward" size={17} color={colors.textDim}/>
      </Pressable>)}
      {!workout.exercises.length?<Txt variant="caption" tone="secondary">Update your routine or equipment to find exercises that fit.</Txt>:null}
    </ScrollView>
    <ExerciseDetailsSheet exercise={inspected} onClose={()=>setInspected(null)}/>
  </View>;
};
const s=StyleSheet.create({root:{flex:1},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},title:{flex:1},page:{padding:space.lg,gap:10},add:{flexDirection:'row',alignItems:'center',gap:2,paddingHorizontal:space.sm,height:30,borderRadius:15,backgroundColor:colors.accentSoft},pressed:{opacity:0.7},heading:{marginTop:10,marginBottom:8},row:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderWidth:1,borderColor:colors.border,borderRadius:14,backgroundColor:colors.surface},muscle:{width:48,height:60,overflow:'hidden',borderRadius:10},copy:{flex:1,gap:4}});
