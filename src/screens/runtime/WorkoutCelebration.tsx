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

/** One brief burst on Finish. Never blocks touch or replays when viewing saved training. */
export const WorkoutCelebration=()=>{
  const progress=useRef(new Animated.Value(0)).current;
  const {ready,reduced}=useLayoutMotion();
  const [playing,setPlaying]=useState(false);
  useEffect(()=>{
    if(!ready||reduced){setPlaying(false);return;}
    progress.setValue(0);setPlaying(true);
    const burst=Animated.timing(progress,{toValue:1,duration:1800,easing:Easing.linear,useNativeDriver:true});
    burst.start(({finished})=>{if(finished)setPlaying(false);});
    return ()=>burst.stop();
  },[progress,ready,reduced]);
  if(!playing)return null;
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
});
