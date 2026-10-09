import { datePlusDays } from '../../runtime/planDates';
import { saveWorkoutSchedule } from '../../runtime/workoutSchedule';
import { WorkoutCalendar } from './WorkoutCalendar';
import { TodayExercisePicker } from './TodayExercisePicker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { previewTrainingSessionDetailed } from '../../runtime';
import type { ExerciseDefinition, RecoveryState, RuntimeState, SessionContext } from '../../runtime';
import { nextRoutineSlot } from '../../runtime/sequence';
import { colors, radius, space, TOUCH } from './theme';
import { Banner, Button, Choice, IconButton, ScreenBrand, Sheet, Txt } from './ui';
import { describeRuntimeError, equipmentLabel, slotPlain } from './copy';
import { weightText } from '../../runtime/weights';
import { todayISO } from './selectors';
import { SetLogger, type WorkoutDockState } from './SetLogger';
import { ExerciseCardHeader, ExerciseSetRows } from './ExerciseCard';
import { ExerciseMuscleDetails } from './ExerciseMuscles';
import { EmptyToday } from './EmptyToday';
import { addNextWorkoutExercise, nextWorkoutCandidates, nextWorkoutPreview } from '../../runtime/nextWorkout';
import { startAdditionalWorkout } from '../../runtime/freeWorkout';
import { NextWorkoutPreview } from './NextWorkoutPreview';
import { useLayoutMotion } from './useLayoutMotion';
import { WorkoutAlternatives } from './WorkoutAlternatives';
import type { ApplyResult } from './useRuntimeController';
import { type Notify } from './constants';

type Props = {
  state: RuntimeState; apply: (transform: (current: RuntimeState) => RuntimeState) => ApplyResult;
  notify: Notify; active: boolean; onDockChange: (dock: WorkoutDockState | null) => void;
  onOpenSource: () => void; onOpenWeek: () => void; onNewWorkout: () => void;
};
type Panel='calendar'|'next-add'|'conditions'|'workout'|'omitted'|'more'|null;

export const TodaySurface = ({ state, apply, notify, active, onDockChange, onOpenSource, onOpenWeek, onNewWorkout }: Props) => {
  const formatKg=(kg:number)=>`${weightText(kg,state.source?.weightUnit??'kg')} ${state.source?.weightUnit??'kg'}`;
  const { animate } = useLayoutMotion();
  const [minutes, setMinutes] = useState<SessionContext['minutesAvailable']>(state.source?.sessionMinutes ?? 60);
  const [recovery, setRecovery] = useState<RecoveryState>('yes');
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [replacements,setReplacements]=useState<Record<string,string>>({});
  const [workoutId, setWorkoutId] = useState<string | undefined>();
  const [extraWorkout, setExtraWorkout] = useState(false);
  const [celebrationId, setCelebrationId] = useState<string|null>(null);
  const [panel,setPanel]=useState<Panel>(null);
  const [detailsId,setDetailsId]=useState<string|null>(null);
  const [inspected,setInspected]=useState<string|null>(null);
  const [swapTarget,setSwapTarget]=useState<ExerciseDefinition|null>(null);
  const date = todayISO();
  const session = state.activeSession;
  const previousSession = useRef(session?.id);
  useEffect(()=>{
    const previous=previousSession.current;
    previousSession.current=session?.id;
    if(previous&&!session&&active&&state.sessions.some(item=>item.id===previous&&item.status==='committed'))setCelebrationId(previous);
    if(session||!active)setCelebrationId(null);
  },[session?.id,state.sessions,active]);
  useEffect(()=>{
    if(!celebrationId)return;
    const timeout=setTimeout(()=>setCelebrationId(null),2600);
    return ()=>clearTimeout(timeout);
  },[celebrationId]);
  useEffect(() => {
    const window = state.block?.remainingWeek?.windows.find((item) => item.date === date);
    setReplacements({}); setWorkoutId(undefined); setExtraWorkout(false);
    setPanel(null);setInspected(null);setDetailsId(null);setSwapTarget(null);
    setMinutes(window?.minutesAvailable ?? state.source?.sessionMinutes ?? 60);
    setRecovery(window?.recovery ?? 'yes'); setUnavailable(window?.unavailableEquipment ?? []);
  }, [state.block?.id, state.source?.sessionMinutes, date]);
  useEffect(()=>{if(!active){setPanel(null);setInspected(null);setDetailsId(null);setSwapTarget(null);}},[active]);
  useEffect(() => { if (!session) { if (active) onDockChange(null); } }, [session, active, onDockChange]);
  const context = useMemo<SessionContext>(() => ({ date, minutesAvailable: minutes, recovery, workoutId, extraWorkout, exerciseReplacements: replacements,
    unavailableEquipment: unavailable, unavailableExerciseIds: state.source?.excludedExerciseIds ?? [] }), [date, minutes, recovery, unavailable, state.source, workoutId, extraWorkout, replacements]);
  const preview = useMemo(() => {
    if (session || !state.block || !state.source || state.block.kind === 'workout') return null;
    try { return { value: previewTrainingSessionDetailed(state, context), error: null }; }
    catch (error) { return { value: null, error: describeRuntimeError(error).message }; }
  }, [state, context, session]);
  const nextWorkout=useMemo(()=>nextWorkoutPreview(state,date),[state,date]);
  const todayStats=useMemo(()=>{
    const ids=new Set(state.sessions.filter(item=>item.status==='committed'&&item.context.date===date).map(item=>item.id));
    const done=state.setResults.filter(result=>ids.has(result.prescriptionId)&&result.completedReps>0);
    if(!done.length)return undefined;
    const times=done.map(result=>Date.parse(result.completedAt)).filter(Number.isFinite);
    const span=times.length>1?Math.round((Math.max(...times)-Math.min(...times))/60000):0;
    return {sets:done.length,volumeKg:done.reduce((sum,result)=>sum+(result.actualLoadKg??result.prescribedLoadKg)*result.completedReps,0),minutes:span>=5?span:null};
  },[state.sessions,state.setResults,date]);
  if(nextWorkout)return <><NextWorkoutPreview workout={nextWorkout} today={date} stats={todayStats} celebrationId={active?celebrationId:null} onAddExercise={()=>setPanel('next-add')} onCalendar={()=>setPanel('calendar')} onUse={()=>{
    const outcome=apply(current=>startAdditionalWorkout(current,current.source!,nextWorkout.exercises.map(({exercise,...item})=>({...item,exerciseId:exercise.id})),nextWorkout.name,date));
    if(!outcome.ok)notify({tone:'error',title:'Could not prepare workout',message:describeRuntimeError(outcome.error).message});
  }}/>
    {active&&panel==='calendar'?<WorkoutCalendar schedule={state.source?.workoutSchedule} today={nextWorkout.finishedToday?datePlusDays(date,1):date} onClose={()=>setPanel(null)} onSave={schedule=>{
      const outcome=apply(current=>saveWorkoutSchedule(current,schedule));
      if(outcome.ok)setPanel(null);
      else notify({tone:'error',title:'Could not save workout days',message:describeRuntimeError(outcome.error).message});
    }}/>:null}
    {active&&panel==='next-add'?<TodayExercisePicker
      title={/^(your )?next workout$/i.test(nextWorkout.name)?'Add to next session':`Add to ${slotPlain({label:nextWorkout.name})}`}
      catalog={nextWorkoutCandidates(state,nextWorkout)}
      selectedIds={nextWorkout.exercises.map(entry=>entry.exercise.id)}
      onClose={()=>setPanel(null)}
      onAdd={exercise=>{
        const outcome=apply(current=>addNextWorkoutExercise(current,exercise.id,date));
        if(outcome.ok){setPanel(null);notify({tone:'info',title:`${exercise.name} added to next session`});}
        else notify({tone:'error',title:'Could not add exercise',message:describeRuntimeError(outcome.error).message});
      }}/>:null}
  </>;
  if(!session&&state.block?.kind==='workout')return <EmptyToday onAddRoutine={onOpenSource} onLogWorkout={onNewWorkout}/>;
  const proposal = preview?.value;


  const chosenSlot = proposal?.slot ?? (state.block ? (state.block.slots.find(x=>x.id===workoutId) ?? nextRoutineSlot(state.block,state.sessions,date)) : undefined);
  const entries=proposal?.prescription.exercises??[];
  const catalog=state.block?.catalog??state.catalog??[];
  const originalFor=(exerciseId:string)=>{
    const plan=chosenSlot?.plannedExercises.find(p=>(replacements[p.exerciseId]??p.exerciseId)===exerciseId);
    return plan?catalog.find(e=>e.id===plan.exerciseId):undefined;
  };
  const omitted=chosenSlot?.plannedExercises.filter(p=>!entries.some(e=>e.exercise.id===(replacements[p.exerciseId]??p.exerciseId)))??[];
  const inspectedEntry=entries.find(e=>e.exercise.id===detailsId);
  const recoveryLabel=recovery==='yes'?'Ready':recovery==='meh'?'Tired':'Very tired';
  if(session||proposal) return <WorkoutWorkspace state={state} proposal={proposal} apply={apply} notify={notify} onDockChange={onDockChange}/>;
  return <View style={styles.root}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}><View style={styles.copy}><ScreenBrand name="Today" chip="" /></View><IconButton label="New workout" icon="add" onPress={onNewWorkout}/></View>
      <View style={styles.hero}>
        <View style={styles.copy}>
          <Txt variant="title">{chosenSlot?slotPlain(chosenSlot):'Your workout'}</Txt>
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
        {entries.map(entry=>{
          const original=originalFor(entry.exercise.id),expanded=inspected===entry.exercise.id;
          return <View key={entry.exercise.id} style={styles.exerciseCard}>
            <ExerciseCardHeader entry={entry} expanded={expanded} onMusclePress={()=>setDetailsId(entry.exercise.id)} onPress={()=>{animate();setInspected(expanded?null:entry.exercise.id);}}/>
            {expanded?<View style={styles.exercisePanel}>
              <ExerciseSetRows entry={entry}/>
              <View style={styles.hero}>

                {state.block?.scheduling&&original?<IconButton label={`Swap ${entry.exercise.name}`} icon="swap-horizontal" onPress={()=>setSwapTarget(original)}/>:null}
              </View>
            </View>:null}
          </View>;
        })}
      </View>:null}
      {omitted.length?<Button label={`${omitted.length} ${omitted.length===1?'exercise':'exercises'} not included`} variant="ghost" onPress={()=>setPanel('omitted')} />:null}
      <Button label="More options" variant="ghost" onPress={()=>setPanel('more')} />
    </ScrollView>

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
    {inspectedEntry?<Sheet visible={active} onClose={()=>setDetailsId(null)} title={inspectedEntry.exercise.name}>
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
  list:{gap:space.sm},
  exerciseCard:{borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:colors.surface,overflow:'hidden'},
  exercisePanel:{padding:space.md,paddingTop:0,gap:space.md},
  choices:{flexDirection:'row',flexWrap:'wrap',gap:space.sm},
  omittedRow:{flexDirection:'row',alignItems:'center',gap:space.md},
});

/** A prepared workout is local until its first confirmed set. Browsing never calls apply. */
const WorkoutWorkspace = ({state,proposal,apply,notify,onDockChange}: Pick<Props,'state'|'apply'|'notify'|'onDockChange'> & {
  proposal: ReturnType<typeof previewTrainingSessionDetailed> | null | undefined;
}) => {
  const prepared = useMemo<RuntimeState>(() => proposal ? {
    ...state, block: state.block ? {...state.block,currentWeek:proposal.weekNumber} : null,
    activeSession: {...proposal.prescription,status:'active'},
    sessions:[...state.sessions,{...proposal.prescription,status:'active'}],
  } : state,[state,proposal]);
  const [draft,setDraft]=useState<{base:string;state:RuntimeState}|null>(null);
  const workspace=state.activeSession?state:draft&&draft.base===prepared.activeSession?.id?draft.state:prepared;
  const update:Props['apply'] = transform => {
    if(state.activeSession) return apply(transform);
    try {
      const next=transform(workspace);
      const hasLogged=next.setResults.some(result=>result.prescriptionId===workspace.activeSession?.id);
      if(!hasLogged){setDraft(next.activeSession?{base:prepared.activeSession!.id,state:next}:null);return {ok:true,state:next};}
      return apply(current=>{
        if(current.activeSession||current.updatedAt!==state.updatedAt||current.block?.id!==state.block?.id) throw Error('Your workout changed. Reopen Today and try again.');
        return next;
      });
    } catch(error){return {ok:false,error};}
  };
  return <SetLogger state={workspace} apply={update} notify={notify} onDockChange={onDockChange}/>;
};
