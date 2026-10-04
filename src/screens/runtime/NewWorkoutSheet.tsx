import { useState } from 'react';
import { View } from 'react-native';
import { solveTrainingSession } from '../../runtime';
import { repeatWorkoutExercises, startAdditionalWorkout } from '../../runtime/freeWorkout';
import { localDate } from '../../runtime/planDates';
import type { RuntimeState, SessionPrescription, TrainingSource } from '../../runtime/types';
import { Button, Sheet, Txt } from './ui';
import { QuickWorkout } from './QuickWorkout';
import { RUNTIME_EXERCISES } from '../../runtime/exerciseCatalog';
import { slotPlain } from './copy';
import { space } from './theme';
import type { ApplyResult } from './useRuntimeController';

type Props={state:RuntimeState;defaults:TrainingSource;apply:(fn:(state:RuntimeState)=>RuntimeState)=>ApplyResult;onClose:()=>void;onStarted:()=>void;onAddRoutine:()=>void};
export const NewWorkoutSheet=({state,defaults,apply,onClose,onStarted,onAddRoutine}:Props)=>{
  const [route,setRoute]=useState<'choose'|'empty'|'repeat'|'routine'>('choose');
  const [error,setError]=useState('');
  const start=(fn:(state:RuntimeState)=>RuntimeState)=>{
    const result=apply(fn);
    if(!result.ok){const message=result.error instanceof Error?result.error.message:'Could not start workout';setError(message);return message;}
    onStarted();return undefined;
  };
  const source=state.source??defaults;
  const history=[...state.sessions].reverse().filter(s=>s.status==='committed'&&repeatWorkoutExercises(s).length>0);
  const nameOf=(session:SessionPrescription)=>session.name??slotPlain([...(state.block?.slots??[]),...(state.blockHistory??[]).flatMap(block=>block.slots)].find(slot=>slot.id===session.slotId));
  const routine=state.block?.kind!=='workout'?state.block:undefined;
  return <Sheet visible onClose={onClose} title={route==='choose'?'New workout':route==='empty'?'Empty workout':route==='repeat'?'Repeat previous':'From routine'} avoidKeyboard>
    {route==='choose'?<>
      <Button label="Empty workout" icon="add" onPress={()=>setRoute('empty')}/>
      <Button label="Repeat previous" icon="repeat" variant="secondary" onPress={()=>setRoute('repeat')}/>
      <Button label="From routine" icon="layers-outline" variant="secondary" onPress={()=>setRoute('routine')}/>
    </>:null}
    {route==='empty'?<QuickWorkout source={source} catalog={state.block?.catalog??state.catalog??RUNTIME_EXERCISES}
      onStart={id=>start(current=>startAdditionalWorkout(current,defaults,[{exerciseId:id,sets:3,minReps:8,maxReps:12,targetRir:2}]))}/>:null}
    {route==='repeat'?<>
      {!history.length?<Txt tone="muted">No completed workouts yet</Txt>:null}
      {history.map(session=><View key={session.id} style={{gap:space.xs}}>
        <Button variant="secondary" label={`${nameOf(session)} · ${session.context.date}`}
          onPress={()=>start(current=>startAdditionalWorkout(current,defaults,repeatWorkoutExercises(session),nameOf(session)))}/>
        <Txt variant="caption" tone="muted">{repeatWorkoutExercises(session).length} exercises</Txt>
      </View>)}
    </>:null}
    {route==='routine'?<>
      {routine?.slots.map(slot=><Button key={slot.id} label={slotPlain(slot)} variant="secondary" onPress={()=>start(current=>solveTrainingSession(current,{
        date:localDate(),minutesAvailable:source.sessionMinutes,recovery:'yes',unavailableEquipment:[],unavailableExerciseIds:source.excludedExerciseIds,workoutId:slot.id,extraWorkout:true,
      }))}/>)}
      {!routine?<Button label="Add your routine" onPress={onAddRoutine}/>:null}
    </>:null}
    {error&&route!=='empty'?<Txt tone="danger">{error}</Txt>:null}
    {route!=='choose'?<Button label="Back" variant="ghost" onPress={()=>{setRoute('choose');setError('');}}/>:null}
  </Sheet>;
};
