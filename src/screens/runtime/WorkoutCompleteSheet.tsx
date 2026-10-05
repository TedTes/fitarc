import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SessionPrescription } from '../../runtime/types';
import { localDate } from '../../runtime/planDates';
import { workoutSummary, type WorkoutUnit } from '../../runtime/workoutSummary';
import { weightText } from '../../runtime/weights';
import { colors, completeTokens as c, planTokens as t } from './theme';
import { Txt } from './ui';
import { useLayoutMotion } from './useLayoutMotion';

type Props = { session:SessionPrescription; history:SessionPrescription[]; name:string; unit?:WorkoutUnit; onDismiss:()=>void; onProgress:()=>void };
export const WorkoutCompleteSheet = ({session,history,name,unit='kg',onDismiss,onProgress}:Props) => {
  const {height}=useWindowDimensions(),insets=useSafeAreaInsets(),{reduced,ready}=useLayoutMotion();
  const position=useRef(new Animated.Value(height)).current,opacity=useRef(new Animated.Value(0)).current;
  const sheetHeight=useRef(height*c.heightFraction),closing=useRef(false);
  const summary=useMemo(()=>workoutSummary(session,history),[session,history]);
  const load=(kg:number)=>Number(weightText(kg,unit)).toLocaleString();
  const close=(progress=false)=>{
    if(closing.current)return;
    closing.current=true;
    const done=()=>{onDismiss();if(progress)onProgress();};
    if(reduced){done();return;}
    Animated.parallel([
      Animated.timing(position,{toValue:sheetHeight.current,duration:c.closeDuration,easing:Easing.in(Easing.cubic),useNativeDriver:true}),
      Animated.timing(opacity,{toValue:0,duration:c.fadeDuration,useNativeDriver:true}),
    ]).start(({finished})=>{if(finished)done();});
  };
  useEffect(()=>{
    if(!ready)return;
    if(reduced){position.setValue(0);opacity.setValue(1);return;}
    const animation=Animated.parallel([
      Animated.timing(position,{toValue:0,duration:c.openDuration,easing:Easing.bezier(.32,.72,0,1),useNativeDriver:true}),
      Animated.timing(opacity,{toValue:1,duration:c.fadeDuration,useNativeDriver:true}),
    ]);
    animation.start();
    return()=>animation.stop();
  },[ready,reduced,position,opacity]);
  const gestures=PanResponder.create({
    onStartShouldSetPanResponder:()=>!closing.current,
    onMoveShouldSetPanResponder:(_,gesture)=>!closing.current&&gesture.dy>5&&Math.abs(gesture.dy)>Math.abs(gesture.dx),
    onPanResponderGrant:()=>{position.stopAnimation();},
    onPanResponderMove:(_,gesture)=>{if(!reduced)position.setValue(Math.max(0,gesture.dy));},
    onPanResponderRelease:(_,gesture)=>{
      if(gesture.dy>sheetHeight.current*c.swipeFraction||(gesture.dy>10&&gesture.vy>c.swipeVelocity)){close();return;}
      Animated.timing(position,{toValue:0,duration:reduced?0:c.closeDuration,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();
    },
    onPanResponderTerminate:()=>Animated.timing(position,{toValue:0,duration:reduced?0:c.closeDuration,useNativeDriver:true}).start(),
  });
  const time=summary.seconds===null?'—':`${Math.floor(summary.seconds/60)}:${String(summary.seconds%60).padStart(2,'0')}`;
  const pr=summary.bestRecord;
  const exerciseCount=session.exercises.filter(entry=>entry.sets.some(set=>set.status==='completed'&&set.result)).length;
  const dateLabel=session.context.date===localDate(new Date())?'today':new Date(`${session.context.date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  return <Modal transparent visible animationType="none" onRequestClose={()=>close()} statusBarTranslucent>
    <View style={s.root}>
      <Animated.View style={[StyleSheet.absoluteFill,{opacity}]}><Pressable style={s.scrim} accessibilityRole="button" accessibilityLabel="Dismiss workout summary" onPress={()=>close()}/></Animated.View>
      <Animated.View accessibilityViewIsModal accessibilityLabel="Completed workout summary" onAccessibilityEscape={()=>close()} onLayout={event=>{sheetHeight.current=event.nativeEvent.layout.height;}}
        style={[s.sheet,{height:Math.min(height*c.heightFraction,height-insets.top),paddingBottom:insets.bottom,transform:[{translateY:position}]}]}>
        <View>
          <View style={s.handle}><View style={s.dragHandle} {...gestures.panHandlers}><View style={s.grip}/></View><Pressable accessibilityRole="button" accessibilityLabel="Close workout summary" onPress={()=>close()} style={s.close}><View style={s.closeFace}><Ionicons name="close" size={t.icon} color={colors.textSecondary}/></View></Pressable></View>
          <View style={s.hero} {...gestures.panHandlers}>
            <View style={s.check}><Ionicons name="checkmark" size={t.tile} color={colors.successInk}/></View>
            <View style={s.flex}><Txt variant="heading" style={s.title}>Workout complete</Txt><Txt variant="mono" tone="muted" style={s.subtitle}>{name} · {dateLabel}</Txt></View>
          </View>
        </View>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} bounces={false}>
          <View style={s.stats}>
            <Stat value={time} label="TIME"/>
            <Stat value={summary.volumeKg>0?load(summary.volumeKg):String(summary.reps)} unit={summary.volumeKg>0?unit:undefined} label={summary.volumeKg>0?'VOLUME':'REPS'}/>
            <Stat value={String(summary.sets)} label="SETS"/>
          </View>
          {pr?<View style={s.record}>
            <Ionicons name="star-outline" size={t.icon} color={colors.success}/>
            <View style={s.flex}><Txt variant="heading" tone="success" style={s.recordTitle}>New best · {pr.exerciseName}</Txt><Txt variant="mono" tone="muted" style={s.recordMeta}>{load(pr.loadKg)} {unit} × {pr.reps} · up from {load(pr.previousKg)}</Txt></View>
          </View>:null}
          <Pressable accessibilityRole="button" accessibilityLabel="View progress" onPress={()=>close(true)} style={s.link}><Txt variant="heading" tone="accent" style={s.linkLabel}>View progress</Txt><Ionicons name="arrow-forward" size={t.icon} color={colors.accent}/></Pressable>
          <View style={s.recap}><Txt variant="label" tone="muted" style={s.overline}>SUMMARY · {exerciseCount} {exerciseCount===1?'exercise':'exercises'} · {summary.sets} {summary.sets===1?'set':'sets'}</Txt>
            {session.exercises.map(entry=>{
              const sets=entry.sets.filter(set=>set.status==='completed'&&set.result);
              if(!sets.length)return null;
              return <View key={entry.id} style={s.recapCard}><Txt variant="heading" style={s.exerciseName}>{entry.exercise.name}</Txt>
                {sets.map(set=>{
                  const result=set.result!,weight=result.actualLoadKg??result.prescribedLoadKg,isPr=summary.records.some(record=>record.setId===set.id);
                  return <View key={set.id} style={s.set}><Txt variant="mono" style={[s.setText,s.setNumber]}>Set {set.setNumber}</Txt><Txt variant="mono" tone="secondary" style={[s.setText,s.flex]}>{weight>0?`${load(weight)} ${unit} × `:''}{result.completedReps}{weight===0?' reps':''}</Txt><Txt variant="mono" tone={isPr?'success':'muted'} style={s.setText}>RIR {result.reportedRir}{isPr?' · PR':''}</Txt></View>;
                })}
              </View>;
            })}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  </Modal>;
};
const Stat=({value,label,unit}:{value:string;label:string;unit?:string})=><View style={s.stat} accessible accessibilityLabel={`${label}: ${value}${unit?` ${unit}`:''}`}><Txt variant="code" style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{value}{unit?<Txt variant="mono" tone="muted" style={s.statUnit}> {unit}</Txt>:null}</Txt><Txt variant="label" style={s.statLabel}>{label}</Txt></View>;
const s=StyleSheet.create({
  root:{flex:1,justifyContent:'flex-end'},scrim:{flex:1,backgroundColor:c.scrim},sheet:{backgroundColor:c.surface,borderTopWidth:t.border,borderTopColor:colors.borderCard,borderTopLeftRadius:c.radius,borderTopRightRadius:c.radius,overflow:'hidden',shadowColor:colors.ground,shadowOffset:{width:0,height:-18},shadowOpacity:0.55,shadowRadius:25,elevation:12},
  handle:{height:c.headerHeight},dragHandle:{height:c.headerHeight,alignItems:'center',paddingTop:t.pad.medium},grip:{width:c.gripWidth,height:c.gripHeight,borderRadius:c.gripHeight,backgroundColor:colors.borderStrong},close:{position:'absolute',right:t.pad.field,top:0,width:t.touch,height:t.touch,alignItems:'center',justifyContent:'center'},
  closeFace:{width:t.tile,height:t.tile,borderRadius:t.radius.segment,backgroundColor:colors.surfaceRaised,borderWidth:t.border,borderColor:colors.borderCard,alignItems:'center',justifyContent:'center'},
  hero:{flexDirection:'row',alignItems:'center',gap:t.pad.field,paddingHorizontal:t.pad.header,paddingBottom:t.pad.medium},check:{width:c.checkSize,height:c.checkSize,borderRadius:c.checkSize/2,alignItems:'center',justifyContent:'center',backgroundColor:colors.success},flex:{flex:1,minWidth:0},title:{fontSize:c.titleSize,lineHeight:t.lineHeight.title},subtitle:{fontSize:t.type.meta,lineHeight:t.lineHeight.meta,marginTop:t.pad.tiny},
  scroll:{flex:1,minHeight:0},content:{paddingBottom:t.pad.header},stats:{flexDirection:'row',gap:t.gap,paddingHorizontal:t.gutter,paddingTop:t.pad.small},stat:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface,borderWidth:t.border,borderColor:colors.borderCard,borderRadius:t.radius.card,paddingVertical:t.pad.medium},statValue:{fontSize:c.statSize},statUnit:{fontSize:t.type.meta},statLabel:{fontSize:c.statLabel,letterSpacing:t.tracking.label,color:colors.textDim,marginTop:t.pad.tiny},
  record:{marginTop:t.pad.medium,marginHorizontal:t.gutter,paddingVertical:t.pad.small,paddingHorizontal:t.pad.field,flexDirection:'row',alignItems:'center',gap:t.pad.medium,backgroundColor:colors.successSoft,borderWidth:t.border,borderColor:colors.successBorder,borderRadius:t.radius.row},recordTitle:{fontSize:t.type.dashed,lineHeight:t.lineHeight.body},recordMeta:{fontSize:t.type.meta,lineHeight:t.lineHeight.meta},
  link:{minHeight:t.touch,marginHorizontal:t.pad.header,flexDirection:'row',alignItems:'center',gap:t.pad.small,alignSelf:'flex-start'},linkLabel:{fontSize:t.type.row},recap:{paddingHorizontal:t.gutter,gap:t.gap},overline:{fontSize:t.type.overline,letterSpacing:t.tracking.label,color:colors.textDim},recapCard:{paddingVertical:c.recapPadding,paddingHorizontal:t.pad.row,borderWidth:t.border,borderColor:colors.border,borderRadius:t.radius.card,backgroundColor:colors.surface},exerciseName:{fontSize:t.type.button,lineHeight:t.lineHeight.body,marginBottom:t.gap},set:{flexDirection:'row',alignItems:'center',paddingVertical:c.setPadding,gap:t.pad.tiny},setText:{fontSize:c.setSize,lineHeight:t.lineHeight.meta+c.setPadding},setNumber:{width:c.setColumn,color:colors.textDim},
});
