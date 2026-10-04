import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { previewTrainingSessionDetailed, solveTrainingSession } from '../../runtime';
import { repeatWorkoutExercises, startAdditionalWorkout } from '../../runtime/freeWorkout';
import { localDate } from '../../runtime/planDates';
import { workoutStartChoices, type WorkoutStartSource } from '../../runtime/workoutStart';
import type { RuntimeState, SessionPrescription, TrainingSource } from '../../runtime/types';
import { Txt } from './ui';
import { PlanButton, PlanOptions } from './PlanKit';
import { ExerciseTile } from './RoutineWorkoutSheet';
import { slotPlain } from './copy';
import { colors, completeTokens as c, planTokens as t } from './theme';
import { useLayoutMotion } from './useLayoutMotion';
import type { ApplyResult } from './useRuntimeController';

type Props={state:RuntimeState;defaults:TrainingSource;apply:(fn:(state:RuntimeState)=>RuntimeState)=>ApplyResult;onClose:()=>void;onStarted:()=>void};
export const NewWorkoutSheet=({state,defaults,apply,onClose,onStarted}:Props)=>{
  const {height}=useWindowDimensions(),insets=useSafeAreaInsets(),{reduced,ready}=useLayoutMotion();
  const date=localDate(),choices=useMemo(()=>workoutStartChoices(state,date),[state,date]);
  const [source,setSource]=useState<WorkoutStartSource>(choices.source);
  const [routineId,setRoutineId]=useState(choices.scheduled?.id??choices.routine?.slots[0]?.id);
  const [previousId,setPreviousId]=useState(choices.previous[0]?.id);
  const [error,setError]=useState('');
  const closing=useRef(false),starting=useRef(false),position=useRef(new Animated.Value(height)).current;
  const sheetHeight=Math.min(height*.92,height-insets.top);
  const close=()=>{
    if(closing.current)return;closing.current=true;
    if(reduced){onClose();return;}
    Animated.timing(position,{toValue:height,duration:c.closeDuration,useNativeDriver:true}).start(()=>onClose());
  };
  useEffect(()=>{
    if(!ready)return;
    const animation=Animated.timing(position,{toValue:0,duration:reduced?0:c.openDuration,easing:Easing.bezier(.32,.72,0,1),useNativeDriver:true});
    animation.start();return()=>animation.stop();
  },[ready,reduced,position]);
  const gestures=PanResponder.create({
    onStartShouldSetPanResponder:()=>!closing.current,
    onMoveShouldSetPanResponder:(_,g)=>!closing.current&&g.dy>5&&Math.abs(g.dy)>Math.abs(g.dx),
    onPanResponderGrant:event=>{event.preventDefault();position.stopAnimation();},
    onPanResponderTerminationRequest:()=>false,
    onPanResponderMove:(_,g)=>{if(!reduced)position.setValue(Math.max(0,g.dy));},
    onPanResponderRelease:(_,g)=>{if(g.dy>sheetHeight*.25||(g.dy>10&&g.vy>.7)){close();return;}Animated.timing(position,{toValue:0,duration:reduced?0:200,useNativeDriver:true}).start();},
    onPanResponderTerminate:()=>Animated.timing(position,{toValue:0,duration:reduced?0:200,useNativeDriver:true}).start(),
  });
  const routine=choices.routine?.slots.find(slot=>slot.id===routineId);
  const previous=choices.previous.find(session=>session.id===previousId);
  const nameOf=(session:SessionPrescription)=>session.name??slotPlain([...(state.block?.slots??[]),...(state.blockHistory??[]).flatMap(block=>block.slots)].find(slot=>slot.id===session.slotId));
  const preferences=state.source??defaults;
  const window=choices.routine?.remainingWeek?.windows.find(item=>item.date===date&&item.slotId===routineId);
  const context=useMemo(()=>({date,minutesAvailable:window?.minutesAvailable??preferences.sessionMinutes,recovery:window?.recovery??'yes' as const,
    unavailableEquipment:window?.unavailableEquipment??[],unavailableExerciseIds:preferences.excludedExerciseIds,workoutId:routineId,extraWorkout:true}),[date,window,preferences,routineId]);
  const preview=useMemo(()=>{
    if(source!=='routine'||!routine)return null;
    try{return {session:previewTrainingSessionDetailed(state,context).prescription,error:''};}
    catch(error){return {session:null,error:error instanceof Error?error.message:'Could not load this workout'};}
  },[source,routine,state,context]);
  const repeated=previous?repeatWorkoutExercises(previous):[];
  const rows=source==='routine'?(preview?.session?.exercises??[]).map(entry=>({exercise:entry.exercise,sets:entry.sets.length,minReps:entry.sets[0]?.minReps,maxReps:entry.sets[0]?.maxReps}))
    :source==='previous'?repeated.map(item=>({...item,exercise:previous!.exercises.find(entry=>entry.exercise.id===item.exerciseId)!.exercise})):[];
  const name=source==='routine'?slotPlain(routine):source==='previous'&&previous?nameOf(previous):'';
  const available=source==='empty'||rows.length>0;
  const start=()=>{
    if(!available||starting.current||closing.current)return;
    starting.current=true;
    const result=apply(current=>source==='routine'?solveTrainingSession(current,context):startAdditionalWorkout(current,defaults,source==='previous'?repeated:[],source==='previous'?name:'Workout'));
    if(!result.ok){starting.current=false;setError(result.error instanceof Error?result.error.message:'Could not start workout');return;}
    onStarted();
  };
  return <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
    <View style={s.root}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss start workout" onPress={close} style={[StyleSheet.absoluteFill,s.scrim]}/>
      <Animated.View accessibilityViewIsModal accessibilityLabel="Start workout preview" onAccessibilityEscape={close} style={[s.sheet,{height:sheetHeight,paddingBottom:Math.max(insets.bottom,t.pad.medium),transform:[{translateY:position}]}]}>
        <View accessibilityLabel="Drag to dismiss start workout" style={s.handle} {...gestures.panHandlers}><View style={s.grip}/></View>
        <View style={s.header}><View style={s.titleDrag} {...gestures.panHandlers}><Txt variant="heading" style={s.title}>Start workout</Txt></View><Pressable accessibilityRole="button" accessibilityLabel="Close start workout" onPress={close} style={s.close}><View style={s.closeFace}><Ionicons name="close" size={t.icon} color={colors.textMuted}/></View></Pressable></View>
        <View style={s.segments}><PlanOptions segments options={[{value:'routine',label:'Routine'},{value:'previous',label:'Previous'},{value:'empty',label:'Empty'}]} value={source} onChange={value=>{setSource(value as WorkoutStartSource);setError('');}}/></View>
        <ScrollView style={s.scroll} contentContainerStyle={s.preview}>
          {source==='routine'&&choices.routine&&choices.routine.slots.length>1?<PlanOptions options={choices.routine.slots.map(slot=>({value:slot.id,label:slotPlain(slot)}))} value={routineId??''} onChange={id=>{setRoutineId(id);setError('');}}/>:null}
          {source==='previous'&&choices.previous.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false}><PlanOptions options={choices.previous.map(session=>({value:session.id,label:`${nameOf(session)} · ${session.context.date}`}))} value={previousId??''} onChange={id=>{setPreviousId(id);setError('');}}/></ScrollView>:null}
          {source==='empty'?<Txt variant="mono" tone="muted" style={s.hint}>Start blank, add exercises as you go</Txt>:rows.length?<>
            <View><Txt variant="heading" style={s.day}>{name}</Txt><Txt variant="mono" tone="muted" style={s.meta}>{rows.length} exercises · {rows.reduce((sum,item)=>sum+item.sets,0)} sets{source==='previous'?` · ${previous!.context.date}`:''}</Txt></View>
            {rows.map(row=><View key={row.exercise.id} style={s.row}><ExerciseTile exercise={row.exercise}/><View style={s.flex}><Txt variant="heading" style={s.exercise}>{row.exercise.name}</Txt><Txt variant="mono" tone="muted" style={s.meta}>{row.sets} × {row.minReps===row.maxReps?row.maxReps:`${row.minReps}–${row.maxReps}`}</Txt></View></View>)}
          </>:<Txt variant="mono" tone="muted" style={s.hint}>{preview?.error||(source==='routine'?'No routine yet':'No previous workouts')}</Txt>}
          {error?<Txt tone="danger" accessibilityRole="alert">{error}</Txt>:null}
        </ScrollView>
        <View style={s.footer}><PlanButton label={source==='empty'?'Start empty workout':available?`Start ${name}`:'Start workout'} disabled={!available} onPress={start}/></View>
      </Animated.View>
    </View>
  </Modal>;
};
const s=StyleSheet.create({
  root:{flex:1,justifyContent:'flex-end'},scrim:{backgroundColor:c.scrim},sheet:{backgroundColor:c.surface,borderTopWidth:t.border,borderColor:colors.borderCard,borderTopLeftRadius:24,borderTopRightRadius:24,overflow:'hidden'},
  handle:{height:24,alignItems:'center',paddingTop:10},grip:{width:38,height:4,borderRadius:2,backgroundColor:colors.borderStrong},header:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingBottom:12},title:{fontSize:20,letterSpacing:-.3},close:{width:t.touch,height:t.touch,alignItems:'center',justifyContent:'center'},closeFace:{width:30,height:30,alignItems:'center',justifyContent:'center',borderRadius:9,backgroundColor:colors.surfaceRaised,borderWidth:1,borderColor:colors.borderCard},
  titleDrag:{flex:1,minHeight:t.touch,justifyContent:'center'},segments:{paddingHorizontal:16},scroll:{flex:1,minHeight:0},preview:{padding:16,gap:9},day:{fontSize:16},meta:{fontSize:11,lineHeight:16,marginTop:2},hint:{fontSize:12,lineHeight:20,paddingVertical:8},row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:11,paddingHorizontal:14,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:t.radius.row},exercise:{fontSize:14.5},flex:{flex:1,minWidth:0},footer:{paddingTop:14,paddingHorizontal:16},
});
