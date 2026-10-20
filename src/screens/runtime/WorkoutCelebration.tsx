import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useLayoutMotion } from './useLayoutMotion';
import { colors } from './theme';

const PARTICLES=Array.from({length:28},(_,index)=>({
  x:Math.cos(index*2.4)*(70+(index%5)*20),
  rise:45+(index%7)*13,
  fall:150+(index%6)*22,
  rotation:(index%2?1:-1)*(180+(index%4)*90),
  color:[colors.success,colors.accent,colors.warning,colors.text][index%4],
}));

/** One brief burst on Finish, or (`exercise`) a short green wash over the row that was just completed.
 *  Never blocks touch, never replays when viewing saved training, and shows nothing under Reduce Motion. */
export const WorkoutCelebration=({variant='workout'}:{variant?:'workout'|'exercise'})=>{
  const progress=useRef(new Animated.Value(0)).current;
  const {ready,reduced}=useLayoutMotion();
  const [playing,setPlaying]=useState(false);
  useEffect(()=>{
    if(!ready||reduced){setPlaying(false);return;}
    progress.setValue(0);setPlaying(true);
    const burst=Animated.timing(progress,{toValue:1,duration:variant==='exercise'?900:1800,easing:variant==='exercise'?Easing.out(Easing.quad):Easing.linear,useNativeDriver:true});
    burst.start(({finished})=>{if(finished)setPlaying(false);});
    return ()=>burst.stop();
  },[progress,ready,reduced,variant]);
  if(!playing)return null;
  if(variant==='exercise')return <Animated.View testID="exercise-complete-flash" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[s.flash,{opacity:progress.interpolate({inputRange:[0,0.15,1],outputRange:[0,1,0]})}]}/>;
  return <View testID="workout-confetti" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.overlay}>
    {PARTICLES.map((particle,index)=><Animated.View key={index} style={[s.particle,{
      backgroundColor:particle.color,width:index%3?6:9,height:index%3?10:6,
      opacity:progress.interpolate({inputRange:[0,0.08,0.7,1],outputRange:[0,1,1,0]}),
      transform:[
        {translateX:progress.interpolate({inputRange:[0,0.3,1],outputRange:[0,particle.x*0.8,particle.x]})},
        {translateY:progress.interpolate({inputRange:[0,0.3,0.6,1],outputRange:[0,-particle.rise,-particle.rise*0.5,particle.fall]})},
        {rotate:progress.interpolate({inputRange:[0,1],outputRange:['0deg',`${particle.rotation}deg`]})},
      ],
    }]}/>)}
  </View>;
};
const s=StyleSheet.create({
  overlay:{...StyleSheet.absoluteFillObject,overflow:'hidden',borderRadius:16},
  particle:{position:'absolute',left:'50%',top:'35%',borderRadius:2},
  flash:{...StyleSheet.absoluteFillObject,borderRadius:12,borderWidth:1,borderColor:colors.success,backgroundColor:'rgba(91,224,138,0.12)'},
});
