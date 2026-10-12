import { type ReactNode, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';

/** Short swipe exposes Delete; a deliberate full swipe commits only on release. */
export const SwipeDeleteCard=({children,onDelete,label,style,contentStyle}:{children:ReactNode;onDelete:()=>void;label:string;style?:StyleProp<ViewStyle>;contentStyle?:StyleProp<ViewStyle>})=>{
  const x=useRef(new Animated.Value(0)).current;
  const width=useRef(320),offset=useRef(0),start=useRef(0),armedRef=useRef(false);
  const [open,setOpen]=useState(false);
  const remove=useRef(onDelete);remove.current=onDelete;
  const mark=(value:boolean)=>{armedRef.current=value;};
  const settle=(value:number)=>{offset.current=value;setOpen(value<0);mark(false);Animated.spring(x,{toValue:value,useNativeDriver:true,bounciness:0}).start();};
  const pan=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.7&&(g.dx<0||offset.current<0),
    onPanResponderGrant:()=>{x.stopAnimation();start.current=offset.current;},
    onPanResponderMove:(_,g)=>{const value=Math.max(-width.current,Math.min(0,start.current+g.dx));offset.current=value;x.setValue(value);mark(-value>=width.current*0.65);},
    onPanResponderRelease:()=>{if(armedRef.current){settle(0);remove.current();}else settle(offset.current < -40 ? -88 : 0);},
    onPanResponderTerminate:()=>settle(0),
    onPanResponderTerminationRequest:()=>true,
  })).current;
  return <View style={[s.frame,style]} onLayout={e=>{width.current=e.nativeEvent.layout.width;}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${label}`} accessibilityElementsHidden={!open} importantForAccessibility={open?'auto':'no-hide-descendants'} onPress={()=>{settle(0);remove.current();}} style={s.delete}>
      <Ionicons name="close" size={28} color={colors.textMuted}/>
    </Pressable>
    <Animated.View {...pan.panHandlers} accessibilityActions={[{name:'delete',label:`Delete ${label}`}]} onAccessibilityAction={e=>{if(e.nativeEvent.actionName==='delete')remove.current();}} style={[s.content,contentStyle,{transform:[{translateX:x}]}]}>{children}</Animated.View>
  </View>;
};
const s=StyleSheet.create({frame:{overflow:'hidden',borderRadius:14},delete:{...StyleSheet.absoluteFillObject,backgroundColor:colors.surface,alignItems:'flex-end',justifyContent:'center',paddingRight:24},content:{backgroundColor:colors.surface}});
