import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { commitRuntimeSession, finishAndUpdateRoutine, discardRuntimeSession } from '../../runtime';
import type { RuntimeState } from '../../runtime';
import { colors, space } from './theme';
import { Button, ScreenBrand, Txt } from './ui';
import { describeRuntimeError, setsWord, slotPlain } from './copy';
import { finishAndSaveNewWorkout } from '../../runtime/freeWorkout';
import { WorkoutResults } from './WorkoutResults';
import type { ApplyResult } from './useRuntimeController';
import type { Notify } from './constants';

type Props={state:RuntimeState;apply:(transform:(current:RuntimeState)=>RuntimeState)=>ApplyResult;notify:Notify;onOpenWeek:()=>void};
export const SessionReview=({state,apply,notify,onOpenWeek}:Props)=>{
  const session=state.activeSession;
  if(!session)return null;
  const slot=state.block?.slots.find(item=>item.id===session.slotId);
  const setsDone=session.exercises.flatMap(entry=>entry.sets).filter(set=>set.status==='completed'&&set.result).length;
  const finish=(saveRoutine=false)=>{
    const outcome=apply(saveRoutine?(slot&&state.block?.kind!=='workout'?finishAndUpdateRoutine:finishAndSaveNewWorkout):commitRuntimeSession);
    if(!outcome.ok){notify({tone:'error',...describeRuntimeError(outcome.error),sticky:true});return;}
    notify({tone:'success',title:'Workout finished',action:{label:'Progress',run:onOpenWeek}});
  };
  const discard=()=>Alert.alert('Discard this workout?',`Removes ${setsWord(setsDone)} recorded in this workout.`,[
    {text:'Keep workout',style:'cancel'},
    {text:'Discard',style:'destructive',onPress:()=>{const result=apply(discardRuntimeSession);if(!result.ok)notify({tone:'error',...describeRuntimeError(result.error)});}},
  ]);
  return <View style={styles.root}>
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenBrand name="Today" chip=""/>
      <Txt variant="title">{session.name??slotPlain(slot)}</Txt>
      <WorkoutResults session={session}/>
      {!setsDone?<Txt tone="muted">No sets recorded</Txt>:null}
      {setsDone>0?<Button label={slot&&state.block?.kind!=='workout'?'Save changes to routine':state.block?.kind==='workout'?'Save as routine':'Add to routine'} variant="ghost" onPress={()=>Alert.alert('Save to your routine?', state.source?.routine?.selectionMode==='pools'?'Update these exercises in your pool. Other pool exercises stay available.':'Use today’s completed exercises and set targets in your routine.',[
        {text:'Cancel',style:'cancel'},{text:'Save and finish',onPress:()=>finish(true)},
      ])}/>:null}
      <Button label="Discard workout" variant="ghost" onPress={discard}/>
    </ScrollView>
    <View style={styles.footer}><Button label="Finish workout" disabled={!setsDone} onPress={()=>finish()}/></View>
  </View>;
};
const styles=StyleSheet.create({root:{flex:1},page:{padding:space.lg,gap:space.lg},footer:{padding:space.lg,borderTopWidth:1,borderTopColor:colors.border}});
