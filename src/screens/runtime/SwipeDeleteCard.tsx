import { type ReactNode, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';

/** Short swipe exposes Delete; a deliberate full swipe commits only on release. */
export const SwipeDeleteCard=({children,onDelete,onComplete,label,style,contentStyle}:{children:ReactNode;onDelete:()=>void;onComplete?:()=>void;label:string;style?:StyleProp<ViewStyle>;contentStyle?:StyleProp<ViewStyle>})=>{
  const x=useRef(new Animated.Value(0)).current;
  const width=useRef(320),offset=useRef(0),start=useRef(0),armedRef=useRef(false);
  const [open,setOpen]=useState(false);
  const remove=useRef(onDelete);remove.current=onDelete;
  const complete=useRef(onComplete);complete.current=onComplete;
  const mark=(value:boolean)=>{armedRef.current=value;};
  const settle=(value:number)=>{offset.current=value;setOpen(value<0);mark(false);Animated.spring(x,{toValue:value,useNativeDriver:true,bounciness:0}).start();};
  const pan=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.7&&(g.dx<0||offset.current<0||Boolean(complete.current)),
    onPanResponderGrant:()=>{x.stopAnimation();start.current=offset.current;},
    onPanResponderMove:(_,g)=>{const value=Math.max(-width.current,Math.min(complete.current?width.current:0,start.current+g.dx));offset.current=value;x.setValue(value);mark(-value>=width.current*0.65);},
    onPanResponderRelease:()=>{if(offset.current>=width.current*0.65&&complete.current){settle(0);complete.current();}else if(armedRef.current){settle(0);remove.current();}else settle(offset.current < -40 ? -88 : 0);},
    onPanResponderTerminate:()=>settle(0),
    onPanResponderTerminationRequest:()=>true,
  })).current;
  return <View style={[s.frame,style]} onLayout={e=>{width.current=e.nativeEvent.layout.width;}}>
    <Animated.View style={[s.actionLayer,{opacity:x.interpolate({inputRange:[-1,0],outputRange:[1,0],extrapolate:'clamp'})}]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${label}`} accessibilityElementsHidden={!open} importantForAccessibility={open?'auto':'no-hide-descendants'} onPress={()=>{settle(0);remove.current();}} style={s.delete}>
      <Ionicons name="close" size={28} color={colors.textMuted}/>
    </Pressable>
    </Animated.View>
    {onComplete?<Animated.View pointerEvents="none" style={[s.complete,{opacity:x.interpolate({inputRange:[0,1],outputRange:[0,1],extrapolate:'clamp'})}]}><Ionicons name="checkmark" size={28} color={colors.success}/></Animated.View>:null}
    <Animated.View {...pan.panHandlers} accessibilityActions={[{name:'delete',label:`Delete ${label}`},...(onComplete?[{name:'completeWorkout',label:`Complete ${label}`}]:[])]} onAccessibilityAction={e=>{if(e.nativeEvent.actionName==='delete')remove.current();if(e.nativeEvent.actionName==='completeWorkout')complete.current?.();}} style={[s.content,contentStyle,{transform:[{translateX:x}]}]}>{children}</Animated.View>
  </View>;
};
const s=StyleSheet.create({frame:{overflow:'hidden',borderRadius:14},actionLayer:{...StyleSheet.absoluteFillObject},delete:{...StyleSheet.absoluteFillObject,backgroundColor:colors.surface,alignItems:'flex-end',justifyContent:'center',paddingRight:24},complete:{position:'absolute',left:0,top:0,bottom:0,width:60,alignItems:'center',justifyContent:'center'},content:{backgroundColor:colors.surface}});
