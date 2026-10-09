import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NextWorkout } from '../../runtime/nextWorkout';
import type { ExerciseDefinition, Muscle } from '../../runtime/types';
import { ExerciseDetailsSheet } from './ExerciseMuscles';
import { MuscleMap } from './MuscleMap';
import { preferredTargetView } from './muscleTargeting';
import { muscleList, slotPlain } from './copy';
import { Txt } from './ui';
import { StartSessionCard } from './StartSessionCard';
import { colors, space } from './theme';
import { CompletedWorkoutMuscleMap, SessionMuscleChips, type TodayStats } from './CompletedWorkoutMuscleMap';

/** Compact relative days; include the date for sessions more than a week away. */
const dayLabel=(date:string,today:string)=>{
  const days=Math.round((Date.parse(`${date}T12:00:00`)-Date.parse(`${today}T12:00:00`))/86400000);
  if(days<=0)return 'Today';
  if(days===1)return 'Tmrw';
  if(days<7)return new Date(`${date}T12:00:00`).toLocaleDateString('en',{weekday:'short'});
  return new Date(`${date}T12:00:00`).toLocaleDateString('en',{month:'short',day:'numeric'});
};

export const NextWorkoutPreview=({workout,today,stats,celebrationId,onAddExercise,onCalendar,onUse}:{workout:NextWorkout;today:string;stats?:TodayStats;celebrationId?:string|null;onAddExercise:()=>void;onCalendar:()=>void;onUse:()=>void})=>{
  const [inspected,setInspected]=useState<ExerciseDefinition|null>(null);
  const [selected,setSelected]=useState<Muscle|null>(null);
  const toggleMuscle=(muscle:Muscle)=>setSelected(current=>current===muscle?null:muscle);
  const name=slotPlain({label:workout.name});
  const muscles=workout.exercises.flatMap(({exercise})=>exercise.primaryMuscles);
  const upper=muscles.some(m=>['chest','back','delts','biceps','triceps'].includes(m));
  const lower=muscles.some(m=>['quads','hamstrings','glutes','calves'].includes(m));
  const suggestedGroup=upper&&lower?'Full body':upper?'Upper':lower?'Lower':muscles.includes('core')?'Core':'';
  const group=/^(your )?next workout$/i.test(name)?suggestedGroup:name;
  const canStart=!workout.needsSchedule&&workout.kind==='suggested'&&workout.date<=today&&workout.exercises.length>0;
  return <View style={s.root}>
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.header}>
        <Txt variant="title" style={s.title}>Today</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel="Add exercise to next session" onPress={onAddExercise} hitSlop={10}
          style={({pressed})=>[s.add,pressed&&s.pressed]}>
          <Ionicons name="add" size={18} color={colors.accent}/><Txt variant="label" tone="accent">ADD</Txt>
        </Pressable>
      </View>
      {workout.finishedToday?<CompletedWorkoutMuscleMap workout={workout} stats={stats} celebrationId={celebrationId} selected={selected} onSelect={toggleMuscle}/>:null}
      <StartSessionCard title={group||'Your workout'} exercises={workout.exercises.length}
            sets={workout.exercises.reduce((sum,item)=>sum+item.sets,0)} muscles={muscles}
            onStart={canStart?onUse:undefined} onCalendar={onCalendar} when={workout.needsSchedule?'choose a day':dayLabel(workout.date,today)} showMuscles={false}>
      {muscles.length ? <View style={s.chips}><SessionMuscleChips muscles={[...new Set(muscles)]} tone="next" selected={selected} onSelect={toggleMuscle}/></View> : null}
      {workout.exercises.map(({exercise,sets,minReps,maxReps})=><Pressable key={exercise.id} accessibilityRole="button" accessibilityLabel={`Preview ${exercise.name}`} onPress={()=>setInspected(exercise)} style={s.row}>
        <View style={s.muscle} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><MuscleMap view={preferredTargetView(exercise)} targets={exercise} height={60} showZoom={false} focusTargets/></View>
        <View style={s.copy}><Txt variant="heading">{exercise.name}</Txt><Txt variant="caption" tone="muted">{muscleList(exercise.primaryMuscles)} · {sets} × {minReps===maxReps?minReps:`${minReps}–${maxReps}`}</Txt></View>
        <Ionicons name="chevron-forward" size={17} color={colors.textDim}/>
      </Pressable>)}
      {!workout.exercises.length?<Txt variant="caption" tone="secondary">Add exercises or update your routine to prepare this session.</Txt>:null}
      </StartSessionCard>
    </ScrollView>
    <ExerciseDetailsSheet exercise={inspected} onClose={()=>setInspected(null)}/>
  </View>;
};
const s=StyleSheet.create({root:{flex:1},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},title:{flex:1},page:{padding:space.lg,gap:10},add:{flexDirection:'row',alignItems:'center',gap:2,paddingHorizontal:space.sm,height:30,borderRadius:15,backgroundColor:colors.accentSoft},pressed:{opacity:0.7},chips:{flexDirection:'row',flexWrap:'wrap',gap:6},row:{flexDirection:'row',alignItems:'center',gap:12,paddingTop:12,borderTopWidth:1,borderColor:colors.border},muscle:{width:48,height:60,overflow:'hidden',borderRadius:10},copy:{flex:1,gap:4}});
