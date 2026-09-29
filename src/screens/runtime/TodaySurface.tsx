import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { previewTrainingSessionDetailed, solveTrainingSession } from '../../runtime';
import type { ExerciseDefinition, RecoveryState, RuntimeState, SessionContext } from '../../runtime';
import { nextRoutineSlot } from '../../runtime/sequence';
import { colors, radius, space, TOUCH } from './theme';
import { Banner, Button, Choice, IconButton, ScreenBrand, Sheet, Txt } from './ui';
import { describeRuntimeError, equipmentLabel, formatKg, slotPlain } from './copy';
import { nextPendingSet, todayISO } from './selectors';
import { SetLogger, type WorkoutDockState } from './SetLogger';
import { SessionReview } from './SessionReview';
import { ExerciseMuscleDetails } from './ExerciseMuscles';
import { WorkoutAlternatives } from './WorkoutAlternatives';
import type { ApplyResult } from './useRuntimeController';
import { type Notify } from './constants';

type Props = {
  state: RuntimeState; apply: (transform: (current: RuntimeState) => RuntimeState) => ApplyResult;
  notify: Notify; active: boolean; onDockChange: (dock: WorkoutDockState | null) => void;
  onOpenSource: () => void; onOpenWeek: () => void;
};
type Panel='conditions'|'workout'|'omitted'|'more'|null;

export const TodaySurface = ({ state, apply, notify, active, onDockChange, onOpenSource, onOpenWeek }: Props) => {
  const [minutes, setMinutes] = useState<SessionContext['minutesAvailable']>(state.source?.sessionMinutes ?? 60);
  const [recovery, setRecovery] = useState<RecoveryState>('yes');
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [replacements,setReplacements]=useState<Record<string,string>>({});
  const [workoutId, setWorkoutId] = useState<string | undefined>();
  const [extraWorkout, setExtraWorkout] = useState(false);
  const [panel,setPanel]=useState<Panel>(null);
  const [inspected,setInspected]=useState<string|null>(null);
  const [swapTarget,setSwapTarget]=useState<ExerciseDefinition|null>(null);
  const date = todayISO();
  const session = state.activeSession;
  useEffect(() => {
    const window = state.block?.remainingWeek?.windows.find((item) => item.date === date);
    setReplacements({}); setWorkoutId(undefined); setExtraWorkout(false);
    setPanel(null);setInspected(null);setSwapTarget(null);
    setMinutes(window?.minutesAvailable ?? state.source?.sessionMinutes ?? 60);
    setRecovery(window?.recovery ?? 'yes'); setUnavailable(window?.unavailableEquipment ?? []);
  }, [state.block?.id, state.source?.sessionMinutes, date]);
  useEffect(()=>{if(!active){setPanel(null);setInspected(null);setSwapTarget(null);}},[active]);
  useEffect(() => { if (!session && active) onDockChange(null); }, [session, active, onDockChange]);
  const context = useMemo<SessionContext>(() => ({ date, minutesAvailable: minutes, recovery, workoutId, extraWorkout, exerciseReplacements: replacements,
    unavailableEquipment: unavailable, unavailableExerciseIds: state.source?.excludedExerciseIds ?? [] }), [date, minutes, recovery, unavailable, state.source, workoutId, extraWorkout, replacements]);
  const preview = useMemo(() => {
    if (session || !state.block || !state.source) return null;
    try { return { value: previewTrainingSessionDetailed(state, context), error: null }; }
    catch (error) { return { value: null, error: describeRuntimeError(error).message }; }
  }, [state, context, session]);
  const start = () => {
    const result = apply((current) => solveTrainingSession(current, context));
    if (!result.ok) notify({ tone: 'error', ...describeRuntimeError(result.error) });
  };
  if (session) return nextPendingSet(state)
    ? <SetLogger state={state} apply={apply} notify={notify} onDockChange={onDockChange} />
    : <SessionReview state={state} apply={apply} notify={notify} onOpenWeek={onOpenWeek} />;
  const proposal = preview?.value;
  const chosenSlot = proposal?.slot ?? (state.block ? (state.block.slots.find(x=>x.id===workoutId) ?? nextRoutineSlot(state.block,state.sessions,date)) : undefined);
  const entries=proposal?.prescription.exercises??[];
  const catalog=state.block?.catalog??state.catalog??[];
  const originalFor=(exerciseId:string)=>{
    const plan=chosenSlot?.plannedExercises.find(p=>(replacements[p.exerciseId]??p.exerciseId)===exerciseId);
    return plan?catalog.find(e=>e.id===plan.exerciseId):undefined;
  };
  const omitted=chosenSlot?.plannedExercises.filter(p=>!entries.some(e=>e.exercise.id===(replacements[p.exerciseId]??p.exerciseId)))??[];
  const inspectedEntry=entries.find(e=>e.exercise.id===inspected);
  const recoveryLabel=recovery==='yes'?'Ready':recovery==='meh'?'Tired':'Very tired';
  return <View style={styles.root}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ScreenBrand name="Today" />
      <View style={styles.hero}>
        <View style={styles.copy}>
          <Txt variant="title">{chosenSlot?slotPlain(chosenSlot):'Your workout'}</Txt>
          {proposal?<Txt variant="caption" tone="secondary">{proposal.prescription.estimatedMinutes} min · {entries.length} exercises · {entries.reduce((sum,e)=>sum+e.sets.length,0)} sets{extraWorkout?' · Extra workout':''}</Txt>:null}
        </View>
        {state.block?.scheduling?<IconButton label="Change today’s workout" icon="swap-horizontal" onPress={()=>setPanel('workout')}/>:null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Adjust today’s conditions" accessibilityHint={`${minutes} minutes available. ${recoveryLabel}. ${unavailable.length} equipment unavailable.`} style={styles.conditions} onPress={()=>setPanel('conditions')}>
        <Ionicons name="options-outline" size={20} color={colors.accent}/>
        <Txt variant="caption" tone="secondary" style={styles.copy}>{minutes} min available · {recoveryLabel} · {unavailable.length?`${unavailable.length} unavailable`:'All equipment'}</Txt>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted}/>
      </Pressable>
      {preview?.error?<Banner tone="warning" title="No workout fits today" message={preview.error} action={{label:'Adjust today',onPress:()=>setPanel('conditions')}} secondaryAction={state.block?.scheduling?{label:'Choose workout',onPress:()=>setPanel('workout')}:undefined}/>:null}
      {entries.length?<View style={styles.list}>
        {entries.map((entry,index)=>{
          const original=originalFor(entry.exercise.id);
          const first=entry.sets[0];
          return <View key={entry.exercise.id} style={[styles.exerciseRow,index>0&&styles.rowBorder]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Details for ${entry.exercise.name}`} accessibilityHint="View muscles and workout details" onPress={()=>setInspected(entry.exercise.id)} style={styles.exerciseMain}>
              <Txt variant="caption" tone="muted" style={styles.index}>{index+1}</Txt>
              <View style={styles.copy}>
                <Txt variant="heading">{entry.exercise.name}</Txt>
                <Txt variant="caption" tone="secondary">{entry.sets.length} × {first?.minReps===first?.maxReps?first?.minReps:`${first?.minReps}–${first?.maxReps}`} · {entry.needsBaseline?'Set weight':formatKg(first?.loadKg??0)}{original&&original.id!==entry.exercise.id?' · Swapped':''}</Txt>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted}/>
            </Pressable>
            {state.block?.scheduling&&original?<Pressable accessibilityRole="button" accessibilityLabel={`Swap ${entry.exercise.name}`} onPress={()=>setSwapTarget(original)} style={styles.swap}><Ionicons name="swap-horizontal" size={20} color={colors.accent}/></Pressable>:null}
          </View>;
        })}
      </View>:null}
      {omitted.length?<Button label={`${omitted.length} ${omitted.length===1?'exercise':'exercises'} not included`} variant="ghost" onPress={()=>setPanel('omitted')} />:null}
      <Button label="More options" variant="ghost" onPress={()=>setPanel('more')} />
    </ScrollView>
    <View style={styles.startBar}><Button label="Start workout" onPress={start} disabled={!entries.length}/></View>

    <Sheet visible={active&&panel==='conditions'} onClose={()=>setPanel(null)} title="Adjust today">
      <Txt variant="label">Time available</Txt>
      <View style={styles.choices}>{[...new Set([30,35,45,60,75,minutes])].sort((a,b)=>a-b).map(value=><Choice key={value} compact label={`${value} min`} selected={minutes===value} onPress={()=>setMinutes(value)}/>)}</View>
      <Txt variant="label">How do you feel?</Txt>
      <View style={styles.choices}>{(['yes','meh','no'] as const).map(value=><Choice key={value} label={value==='yes'?'Ready':value==='meh'?'Tired':'Very tired'} compact selected={recovery===value} onPress={()=>setRecovery(value)}/>)}</View>
      <Txt variant="label">Unavailable equipment</Txt>
      <View style={styles.choices}>{state.source?.equipment.map(item=><Choice key={item} role="checkbox" compact label={equipmentLabel(item)} selected={unavailable.includes(item)} onPress={()=>setUnavailable(current=>current.includes(item)?current.filter(x=>x!==item):[...current,item])}/>)}</View>
      {Object.keys(replacements).length?<Button label="Reset today’s swaps" variant="secondary" onPress={()=>setReplacements({})}/>:null}
      <Button label="Done" onPress={()=>setPanel(null)}/>
    </Sheet>
    <Sheet visible={active&&panel==='workout'} onClose={()=>setPanel(null)} title="Choose workout">
      <Choice label="Next in my routine" selected={!workoutId} onPress={()=>{setWorkoutId(undefined);setReplacements({});}}/>
      {state.block?.slots.map(slot=><Choice key={slot.id} label={slotPlain(slot)} selected={workoutId===slot.id} onPress={()=>{setWorkoutId(slot.id);setReplacements({});}}/>)}
      <Choice role="checkbox" label="Extra workout this week" selected={extraWorkout} onPress={()=>setExtraWorkout(!extraWorkout)}/>
      <Button label="Done" onPress={()=>setPanel(null)}/>
    </Sheet>
    <Sheet visible={active&&panel==='omitted'} onClose={()=>setPanel(null)} title="Not included today">
      {omitted.map(plan=>{
        const original=catalog.find(e=>e.id===plan.exerciseId),chosen=catalog.find(e=>e.id===(replacements[plan.exerciseId]??plan.exerciseId));
        return original?<View key={plan.exerciseId} style={styles.omittedRow}><Txt style={styles.copy}>{chosen?.name??original.name}</Txt>{state.block?.scheduling?<IconButton label={`Swap ${chosen?.name??original.name}`} icon="swap-horizontal" onPress={()=>{setPanel(null);setSwapTarget(original);}}/>:null}</View>:null;
      })}
      <Button label="Adjust today" variant="secondary" onPress={()=>setPanel('conditions')}/>
    </Sheet>
    <Sheet visible={active&&panel==='more'} onClose={()=>setPanel(null)} title="Workout options">
      <Button label="Change remaining week" variant="secondary" onPress={()=>{setPanel(null);onOpenWeek();}}/>
      <Button label="Training preferences" variant="secondary" onPress={()=>{setPanel(null);onOpenSource();}}/>
    </Sheet>
    {inspectedEntry?<Sheet visible={active} onClose={()=>setInspected(null)} title={inspectedEntry.exercise.name}>
      <Txt variant="caption">{inspectedEntry.sets.length} sets · {inspectedEntry.sets[0]?.minReps}–{inspectedEntry.sets[0]?.maxReps} reps · {inspectedEntry.needsBaseline?'Weight unset':formatKg(inspectedEntry.sets[0]?.loadKg??0)}</Txt>
      <ExerciseMuscleDetails key={inspectedEntry.exercise.id} exercise={inspectedEntry.exercise} showNotes={false}/>
    </Sheet>:null}
    {swapTarget&&chosenSlot?<Sheet visible={active} onClose={()=>setSwapTarget(null)} title={`Swap ${swapTarget.name}`}>
      <WorkoutAlternatives state={state} slot={chosenSlot} target={swapTarget} context={context} onChange={next=>{setReplacements(next);setSwapTarget(null);}}/>
    </Sheet>:null}
  </View>;
};
const styles=StyleSheet.create({
  root:{flex:1},page:{padding:space.lg,paddingBottom:space.md,gap:space.lg},copy:{flex:1,minWidth:0,gap:space.xs},
  hero:{flexDirection:'row',alignItems:'center',gap:space.md},conditions:{flexDirection:'row',alignItems:'center',gap:space.sm,minHeight:TOUCH,paddingVertical:space.sm},
  list:{borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:colors.surface,overflow:'hidden'},
  exerciseRow:{flexDirection:'row',alignItems:'stretch'},rowBorder:{borderTopWidth:1,borderTopColor:colors.border},
  exerciseMain:{flex:1,flexDirection:'row',alignItems:'center',gap:space.sm,paddingVertical:space.md,paddingLeft:space.md,paddingRight:space.xs,minHeight:76},index:{width:16},
  swap:{width:TOUCH,minHeight:TOUCH,alignItems:'center',justifyContent:'center'},choices:{flexDirection:'row',flexWrap:'wrap',gap:space.sm},
  omittedRow:{flexDirection:'row',alignItems:'center',gap:space.md},
  startBar:{paddingHorizontal:space.lg,paddingVertical:space.md,borderTopWidth:1,borderTopColor:colors.border,backgroundColor:colors.ground},
});
