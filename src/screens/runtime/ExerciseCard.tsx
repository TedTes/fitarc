import { useWeightSettings } from './WeightSettings';
import { weightText } from '../../runtime/weights';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PrescribedExercise } from '../../runtime/types';
import { MuscleMap } from './MuscleMap';
import { preferredTargetView } from './muscleTargeting';
import { muscleList } from './copy';
import { colors, radius, space } from './theme';
import { Txt } from './ui';
import Svg, { Circle } from 'react-native-svg';
import { exerciseColor, tint } from './muscleColors';

/** Fills as sets are logged; the count sits in the middle. */
const ProgressRing=({done,total,color}:{done:number;total:number;color:string})=>{
  const size=30,stroke=3,r=(size-stroke)/2,c=2*Math.PI*r,fraction=total?done/total:0;
  return <View style={styles.ring} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size/2} cy={size/2} r={r} stroke={tint(color,0.18)} strokeWidth={stroke} fill="none"/>
      {done>0?<Circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${c*fraction} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`}/>:null}
    </Svg>
    {done===total&&total>0
      ?<Ionicons name="checkmark" size={14} color={color}/>
      :<Txt variant="mono" style={{color,fontSize:10,lineHeight:12}}>{done}/{total}</Txt>}
  </View>;
};

export const ExerciseCardHeader=({entry,expanded,onPress,onMusclePress,onMenu}: {entry:PrescribedExercise;expanded:boolean;onPress:()=>void;onMusclePress:()=>void;onMenu?:()=>void})=>{
  const done=entry.sets.filter(set=>set.status==='completed').length;
  const pending=entry.sets.find(set=>set.status==='pending');
  const color=exerciseColor(entry.exercise);
  return <View style={styles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Muscles worked: ${entry.exercise.name}`}
      onPress={onMusclePress} style={({pressed})=>[styles.thumbnail,pressed&&styles.pressed]}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <MuscleMap view={preferredTargetView(entry.exercise)} targets={entry.exercise} height={64} showZoom={false} focusTargets/>
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`${entry.exercise.name}, ${done} of ${entry.sets.length} sets recorded`}
      accessibilityState={{expanded}} aria-expanded={expanded} onPress={onPress} style={({pressed})=>[styles.expand,pressed&&styles.pressed]}>
    <View style={styles.copy}>
      <Txt variant="heading" numberOfLines={1}>{entry.exercise.name}</Txt>
      <Txt variant="caption" style={{color}} numberOfLines={1}>
        {muscleList(entry.exercise.primaryMuscles)}<Txt variant="caption" tone="muted">{pending?`  ·  ${entry.sets.length} × ${pending.minReps===pending.maxReps?pending.maxReps:`${pending.minReps}–${pending.maxReps}`}`:done?'  ·  done':'  ·  skipped'}</Txt>
      </Txt>
    </View>
    <ProgressRing done={done} total={entry.sets.length} color={color}/>
    </Pressable>
    {onMenu?<Pressable accessibilityRole="button" accessibilityLabel="Menu: swap, skip, pain, finish, discard" onPress={onMenu} hitSlop={8}
      style={({pressed})=>[styles.menu,pressed&&styles.pressed]}>
      <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary}/>
    </Pressable>:<Ionicons name={expanded?'chevron-up':'chevron-down'} size={16} color={colors.textMuted}/>}
  </View>;
};

/** Compact accordion header; the thumbnail keeps the original mapped athlete artwork. */
export const ExerciseSectionHeader=({entry,active,expanded,ready=false,onMusclePress,onPress}:{entry:PrescribedExercise;active:boolean;expanded:boolean;ready?:boolean;onMusclePress:()=>void;onPress:()=>void})=>{
  const done=entry.sets.filter(set=>set.status==='completed').length;
  const pending=entry.sets.find(set=>set.status==='pending');
  const prescription=pending??entry.sets[0];
  return <View style={styles.sectionHeader}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Muscles worked: ${entry.exercise.name}`}
      onPress={onMusclePress} style={({pressed})=>[styles.sectionThumb,pressed&&styles.pressed]}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <MuscleMap view={preferredTargetView(entry.exercise)} targets={entry.exercise} height={44} showZoom={false} focusTargets/>
      </View>
    </Pressable>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{expanded}} aria-expanded={expanded}
      accessibilityLabel={`${entry.exercise.name}, ${done} of ${entry.sets.length} sets recorded`}
      style={({pressed})=>[styles.sectionTap,pressed&&styles.pressed]}>
      <View style={styles.copy}>
        <Txt variant="heading" style={styles.sectionName} numberOfLines={2}>{entry.exercise.name}</Txt>
        <Txt variant="mono" tone="secondary" style={styles.sectionMeta} numberOfLines={2}>
          {muscleList(entry.exercise.primaryMuscles)}{prescription?` · ${entry.sets.length} × ${prescription.minReps===prescription.maxReps?prescription.maxReps:`${prescription.minReps}–${prescription.maxReps}`}`:''}
        </Txt>
      </View>
      {active&&pending?<View style={[styles.setBadge,ready&&{backgroundColor:colors.accentSoft,borderColor:colors.accentSoft}]}><Txt variant="mono" tone={ready?'accent':'success'} style={styles.sectionMeta}>set {pending.setNumber}/{entry.sets.length}</Txt></View>
        :<Txt variant="mono" tone="muted" style={styles.sectionMeta}>{done}/{entry.sets.length}</Txt>}
      {!active?<Ionicons name={expanded?'chevron-up':'chevron-forward'} size={14} color={colors.textMuted}/>:null}
    </Pressable>
  </View>;
};

/** Read-only sets for previews and completed or temporarily inactive cards. */
export const ExerciseSetRows=({entry}:{entry:PrescribedExercise})=>{const {unit}=useWeightSettings();const formatLoad=(kg:number)=>`${weightText(kg,unit)} ${unit}`;return <View style={styles.sets}>
  {entry.sets.map(set=><View key={set.id} style={styles.set}>
    <Txt variant="caption" tone="muted">Set {set.setNumber}</Txt>
    <Txt variant="caption" tone={set.status==='skipped'?'muted':'primary'}>{set.result
      ?`${formatLoad(set.result.actualLoadKg??set.result.prescribedLoadKg)} × ${set.result.completedReps}`
      :set.status==='skipped'?'Skipped':`${entry.needsBaseline?`— ${unit}`:formatLoad(set.loadKg)} × ${set.minReps===set.maxReps?set.maxReps:`${set.minReps}–${set.maxReps}`}`}</Txt>
    {set.result?<Ionicons name="checkmark" size={16} color={colors.success}/>:<Txt variant="caption" tone="muted">{set.status==='pending'?`RIR ${set.targetRir}`:'—'}</Txt>}
  </View>)}
</View>;};
const styles=StyleSheet.create({
  header:{minHeight:84,flexDirection:'row',alignItems:'center',gap:space.md,padding:space.md},
  sectionHeader:{flexDirection:'row',alignItems:'center',gap:space.sm},
  sectionTap:{flex:1,minHeight:44,flexDirection:'row',alignItems:'center',gap:space.sm},
  sectionName:{fontSize:14,lineHeight:19},
  sectionMeta:{fontSize:10,lineHeight:15},
  setBadge:{alignSelf:'flex-start',marginTop:3,paddingHorizontal:6,paddingVertical:3,borderRadius:6,backgroundColor:colors.successSoft,borderWidth:1,borderColor:'#244333'},
  sectionThumb:{width:34,height:44,borderRadius:radius.sm,overflow:'hidden',backgroundColor:colors.ground},
  ring:{width:30,height:30,alignItems:'center',justifyContent:'center'},
  menu:{width:24,height:32,alignItems:'center',justifyContent:'center'},
  expand:{flex:1,minHeight:64,flexDirection:'row',alignItems:'center',gap:space.md},
  thumbnail:{width:46,height:64,borderRadius:radius.sm,overflow:'hidden',backgroundColor:colors.ground},
  copy:{flex:1,minWidth:0,gap:3},pressed:{opacity:0.7},sets:{gap:space.sm},
  set:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:space.sm,minHeight:28},
});
