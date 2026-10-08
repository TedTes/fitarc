import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { NextWorkout } from '../../runtime/nextWorkout';
import type { Muscle } from '../../runtime/types';
import { MuscleMap } from './MuscleMap';
import { preferredTargetView, type BodyView } from './muscleTargeting';
import { muscleLabel, muscleList } from './copy';
import { Txt } from './ui';
import { colors } from './theme';
import { WorkoutCelebration } from './WorkoutCelebration';

export const CompletedWorkoutMuscleMap = ({ workout, celebrationId }: { workout: NextWorkout; celebrationId?:string|null }) => {
  const { height } = useWindowDimensions();
  const completed = workout.completedMuscles;
  const next = [...new Set(workout.exercises.filter(entry=>entry.sets>0)
    .flatMap(({ exercise })=>[...exercise.primaryMuscles,...exercise.secondaryMuscles]))];
  const [view, setView] = useState<BodyView>(()=>preferredTargetView({primaryMuscles:completed,secondaryMuscles:next}));
  const [selected, setSelected] = useState<Muscle|null>(null);
  const overlap = completed.some(muscle=>next.includes(muscle));
  const selectedStatus = selected ? [completed.includes(selected)&&'Completed today',next.includes(selected)&&'Next session'].filter(Boolean).join(' · ') : '';
  return <View style={s.card} testID="completed-workout-muscle-map">
    <MuscleMap view={view} onViewChange={setView} selected={selected}
      onSelect={muscle=>setSelected(current=>current===muscle?null:muscle)}
      sessionComparison={{completed,next}} height={Math.max(280,Math.min(370,height*0.44))}/>
    <View style={s.legend}>
      <View style={s.key} accessibilityLabel={`Completed today: ${muscleList(completed)||'None'}`}>
        <View style={[s.swatch,{backgroundColor:colors.success}]}/><Txt variant="caption">Completed today</Txt>
      </View>
      <View style={s.key} accessibilityLabel={`Next session: ${muscleList(next)||'None'}`}>
        <View style={[s.swatch,{backgroundColor:colors.danger}]}/><Txt variant="caption">Next session</Txt>
      </View>
      {overlap?<View style={s.key}><View style={[s.swatch,s.both]}/><Txt variant="caption">Both</Txt></View>:null}
    </View>
    {selected?<Txt variant="caption" tone="secondary" accessibilityLiveRegion="polite">{muscleLabel(selected)} · {selectedStatus||'Not included'}</Txt>:null}
    {celebrationId?<WorkoutCelebration key={celebrationId}/>:null}
  </View>;
};

const s=StyleSheet.create({
  card:{gap:10,padding:10,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},
  legend:{flexDirection:'row',flexWrap:'wrap',gap:12},key:{flexDirection:'row',alignItems:'center',gap:6},
  swatch:{width:12,height:12,borderRadius:4},both:{backgroundColor:colors.success,borderColor:colors.danger,borderWidth:2},
});
