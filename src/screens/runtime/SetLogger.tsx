import { completeRuntimeExercise } from '../../runtime/completeExercise';
import { WorkoutCelebration } from './WorkoutCelebration';
import { matchesGroup, workoutGroup } from '../../runtime/exercisePools';
import { removeSessionExercise, restoreSessionExercise, type RemovedExercise } from '../../runtime/removeExercise';
import { SwipeDeleteCard } from './SwipeDeleteCard';
import { WorkoutElapsed, type WorkoutDockState } from './WorkoutTimers';
export type { WorkoutDockState } from './WorkoutTimers';
import { useWeightSettings, WeightRangeSheet } from './WeightSettings';
import { toKg, weightText } from '../../runtime/weights';
import { exerciseAlternatives } from '../../runtime/recommendations';
import { suggestWorkoutLoad } from '../../runtime/progression';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addRuntimeExercise, commitRuntimeSession, correctRuntimeSet, getSwapCandidates, skipRemainingRuntimeSets, skipRuntimeExercise,
  restSecondsFor, substituteRuntimeExercise,
} from '../../runtime';
import type { ExerciseDefinition, RuntimeState, SessionPrescription, SetPrescription } from '../../runtime';
import { colors, radius, space, TOUCH } from './theme';
import { Button, IconButton, Sheet, Txt } from './ui';
import { describeRuntimeError, muscleList, setsWord } from './copy';
import { ExerciseDetailsSheet, ExerciseMuscleDetails, ExerciseTargetPreview } from './ExerciseMuscles';
import { useLayoutMotion } from './useLayoutMotion';
import { ExerciseSectionHeader } from './ExerciseCard';
import { EditableSetRow, SetTableHeader, setRowValues, validSetRow, type SetRowValues } from './EditableSetRow';
import { EmptyWorkoutLogger } from './EmptyWorkoutLogger';
import { TodayExercisePicker } from './TodayExercisePicker';
import { sessionProgress } from './selectors';
import type { ApplyResult } from './useRuntimeController';
import type { Notify } from './constants';

type Props = {
  state: RuntimeState;
  apply: (transform: (current: RuntimeState) => RuntimeState) => ApplyResult;
  notify: Notify;
  onDockChange: (dock: WorkoutDockState | null) => void;
};

type RestState = { until:number; durationSeconds:number; exerciseId:string };

/** What the engine uses as a replacement's first load. Mirrors substituteRuntimeExercise. */
const startingLoad = (state: RuntimeState, exercise: ExerciseDefinition, target: SessionPrescription['exercises'][number]) => {
  const pending=target.sets.filter(s=>s.status==='pending'); const first=pending[0];
  if(state.source?.routine && first) return suggestWorkoutLoad(exercise,{exerciseId:exercise.id,sets:pending.length,minReps:first.minReps,maxReps:first.maxReps,targetRir:first.targetRir},state.source,state.sessions,state.activeSession?.context.date).loadKg;
  return state.workingSets[exercise.id]?.loadKg ?? state.source?.seedWorkingSets.find(item=>item.exerciseId===exercise.id)?.loadKg ?? (exercise.compound?20:10);
};

/** Routine-backed exercise dock. Done confirms all displayed sets together. */
export const SetLogger = ({ state, apply, notify, onDockChange }: Props) => {
  useEffect(() => () => onDockChange(null), [onDockChange]);
  const { animate } = useLayoutMotion();
  const {unit,ranges}=useWeightSettings();
  const formatKg=(kg:number)=>`${weightText(kg,unit)} ${unit}`;
  const [rangeOpen,setRangeOpen]=useState(false);
  const session=state.activeSession;
  const results=useMemo(()=>session?state.setResults.filter(result=>result.prescriptionId===session.id):[],[state.setResults,session]);
  const lastResult=results[results.length-1];
  // Undefined uses the initial dock; null means the user explicitly collapsed it.
  const [selectedExerciseId,setSelectedExerciseId]=useState<string|null|undefined>(undefined);
  const [drafts,setDrafts]=useState<Record<string,Partial<SetRowValues>>>({});
  const [submitting,setSubmitting]=useState(false);
  const [celebration,setCelebration]=useState(0);
  useEffect(()=>{if(!celebration)return;const timer=setTimeout(()=>setCelebration(0),2000);return()=>clearTimeout(timer);},[celebration]);
  const [sheet,setSheet]=useState<null|'menu'|'swap'|'details'|'swapDetails'|'add'>(null);
  const [inspectedExercise,setInspectedExercise]=useState<ExerciseDefinition|null>(null);
  const [swapPreview,setSwapPreview]=useState<ExerciseDefinition|null>(null);
  const [rest,setRest]=useState<RestState|null>(()=>{
    if(!lastResult)return null;
    const lift=session?.exercises.find(item=>item.exercise.id===lastResult.exerciseId);
    if(!lift?.sets.some(set=>set.status==='pending'))return null;
    const duration=restSecondsFor(state.source?.goal??'hypertrophy',lift?.exercise.compound??false);
    const until=Date.parse(lastResult.completedAt)+duration*1000;
    return until>Date.now()?{until,durationSeconds:duration,exerciseId:lift.exercise.id}:null;
  });
  const currentApply=useRef(apply); currentApply.current=apply;
  const confirming=useRef(false);
  const previousUnit=useRef(unit);
  useEffect(()=>{
    const old=previousUnit.current;if(old===unit)return;
    previousUnit.current=unit;
    setDrafts(current=>Object.fromEntries(Object.entries(current).map(([id,draft])=>[id,draft.load?.trim()&&Number.isFinite(Number(draft.load))?{...draft,load:weightText(toKg(Number(draft.load),old),unit)}:draft])));
  },[unit]);
  const defaultEntry=session?.exercises.find(item=>item.sets.some(set=>set.status==='pending'))??session?.exercises[0];
  const chosen=selectedExerciseId===null?undefined:session?.exercises.find(item=>item.exercise.id===selectedExerciseId)??defaultEntry;
  useEffect(()=>{confirming.current=false;},[session?.id,chosen?.id]);
  const entry=chosen??session?.exercises[0];
  const pendingSet=entry?.sets.find(item=>item.status==='pending');
  const set=pendingSet??entry?.sets[entry.sets.length-1];
  const restHasNextSet=Boolean(rest&&session?.exercises.find(entry=>entry.exercise.id===rest.exerciseId)?.sets.some(set=>set.status==='pending'));
  useEffect(()=>{if(rest&&!restHasNextSet)setRest(null);},[rest,restHasNextSet]);
  const skipRest=useCallback(()=>setRest(null),[]);
  useEffect(()=>{
    onDockChange(session&&restHasNextSet&&rest?{until:rest.until,durationSeconds:rest.durationSeconds,onSkip:skipRest}:null);
  },[onDockChange,session?.id,restHasNextSet,rest,skipRest]);
  const progress=sessionProgress(state);
  if(session&&!session.exercises.length)return <EmptyWorkoutLogger state={state} apply={apply}/>;
  if(!session||!entry||!set||!progress)return null;
  const exercise=entry.exercise;
  const remainingHere=entry.sets.filter(item=>item.status==='pending').length;
  const completedExercise=remainingHere===0&&entry.sets.some(item=>item.status==='completed');
  const rowValue=(item:SetPrescription)=>({...setRowValues(item,unit),...drafts[item.id]});
  const startFromScratch=()=>{
    const outcome=currentApply.current(current=>{
      if(current.activeSession?.id!==session.id||current.setResults.some(result=>result.prescriptionId===session.id))throw Error('This workout has already started.');
      return current.activeSession.exercises.reduce((next,item)=>removeSessionExercise(next,item.id),current);
    });
    if(outcome.ok){animate();confirming.current=false;setSelectedExerciseId(undefined);setSheet(null);setDrafts({});setRest(null);}
    else notify({tone:'error',title:'Could not clear workout',message:describeRuntimeError(outcome.error).message});
  };
  const selectExercise=(id:string|null)=>{
    animate();
    confirming.current=false;
    setSelectedExerciseId(id);
  };

  const report = (outcome: ApplyResult, onSuccess: () => void) => {
    if (outcome.ok) { onSuccess(); return true; }
    const problem = describeRuntimeError(outcome.error);
    const duplicate = outcome.error instanceof Error && outcome.error.message === 'set_already_recorded';
    notify({ tone: duplicate ? 'warning' : 'error', title: problem.title, message: problem.message, sticky: !duplicate });
    return false;
  };

  const deleteExercise = (entryId: string) => {
    let removed: RemovedExercise | undefined;
    const outcome = currentApply.current(current => {
      const active = current.activeSession;
      if (!active || active.id !== session.id) throw Error('This workout has ended.');
      const index = active.exercises.findIndex(item => item.id === entryId);
      if (index < 0) throw Error('Exercise already removed.');
      removed = { sessionId: active.id, index, entry: active.exercises[index] };
      return removeSessionExercise(current, entryId);
    });
    report(outcome,()=>{
      if (!removed) return;
      const snapshot = removed;
      setRest(current=>current?.exerciseId===snapshot.entry.exercise.id?null:current);
      setSelectedExerciseId(undefined);
      const logged=snapshot.entry.sets.filter(set=>set.result).length;
      notify({tone:'info',title:`${snapshot.entry.exercise.name} deleted`,message:logged?`${logged} logged sets removed from today.`:undefined,
        action:{label:'Undo',run:()=>{report(currentApply.current(current=>restoreSessionExercise(current,snapshot)),()=>setSelectedExerciseId(snapshot.entry.exercise.id));}}});
    });
  };

  const done = () => {
    if(confirming.current||!remainingHere)return;
    const rows=entry.sets.filter(item=>item.status!=='skipped');
    if(!rows.length||rows.some(item=>!validSetRow(rowValue(item)))){
      notify({tone:'info',title:'Check the weight and reps before marking Done'});return;
    }
    confirming.current=true;setSubmitting(true);
    const values=rows.map(item=>{
      const value=rowValue(item);
      return {setId:item.id,actualLoadKg:item.result&&value.load===weightText(item.result.actualLoadKg??item.result.prescribedLoadKg,unit)
        ?(item.result.actualLoadKg??item.result.prescribedLoadKg):value.load===weightText(item.loadKg,unit)?item.loadKg:toKg(Number(value.load),unit),completedReps:Number(value.reps),reportedRir:Number(value.rir)};
    });
    animate();
    const outcome=currentApply.current(current=>completeRuntimeExercise(current,session.id,entry.id,values));
    if(report(outcome,()=>{
      Keyboard.dismiss();setRest(null);setSheet(null);
      const next=outcome.ok?outcome.state.activeSession?.exercises.find(item=>item.sets.some(set=>set.status==='pending')):undefined;
      setSelectedExerciseId(next?.exercise.id??null);
      setDrafts(previous=>{const next={...previous};rows.forEach(item=>delete next[item.id]);return next;});
      setCelebration(value=>value+1);
    })) {
      // Keep repeated taps locked until the dock switches to the next exercise.
      setSubmitting(false);
    } else {confirming.current=false;setSubmitting(false);}
  };

  const changeRow = (item:SetPrescription,patch:Partial<SetRowValues>) => {
    if(item.status!=='completed'){
      setDrafts(previous=>({...previous,[item.id]:{...previous[item.id],...patch}}));return;
    }
    // Number-picker confirmation saves a correction directly, without completing
    // the exercise again, advancing the dock, or replaying its celebration.
    report(currentApply.current(current=>{
      const active=current.activeSession;
      const recorded=active?.exercises.find(candidate=>candidate.id===entry.id)?.sets.find(set=>set.id===item.id);
      if(active?.id!==session.id||recorded?.status!=='completed'||!recorded.result)throw Error('This workout changed. Reopen the exercise.');
      const value={...setRowValues(recorded,unit),...patch};
      if(!validSetRow(value))throw Error('Check weight, repetitions and effort.');
      const load=recorded.result.actualLoadKg??recorded.result.prescribedLoadKg;
      return correctRuntimeSet(current,item.id,{
        actualLoadKg:value.load===weightText(load,unit)?load:toKg(Number(value.load),unit),
        completedReps:Number(value.reps),reportedRir:Number(value.rir),
      });
    }),()=>{});
  };

  const skipExercise = () => Alert.alert(
    `Skip ${exercise.name}?`,
    `Skips the remaining ${setsWord(remainingHere)} of ${exercise.name}. They won't count. Sets already logged stay. Skipped sets can't be restored in this session.`,
    [{ text: 'Keep going', style: 'cancel' }, {
      text: 'Skip exercise', style: 'destructive', onPress: () => {
        setSheet(null);
        report(apply((current) => skipRuntimeExercise(current, exercise.id, false)), () => notify({ tone: 'info', title: `skipped ${exercise.name} · ${setsWord(remainingHere)}` }));
      },
    }]
  );

  const reportPain = () => Alert.alert(
    `Report pain on ${exercise.name}?`,
    `Skips the remaining ${setsWord(remainingHere)} and adds ${exercise.name} to your excluded exercises. Today stops prescribing it. Update your plan after this workout to get a replacement, or allow it again in training preferences. If pain is sharp or lasting, stop training and get it checked.`,
    [{ text: 'Cancel', style: 'cancel' }, {
      text: 'Exclude it', style: 'destructive', onPress: () => {
        setSheet(null);
        report(apply((current) => skipRuntimeExercise(current, exercise.id, true)), () => notify({
          tone: 'warning', title: `pain → ${exercise.name} excluded from future workouts`,
          message: 'Today will not prescribe it. Update your plan after finishing this workout to get a replacement.', sticky: true,
        }));
      },
    }]
  );

  const swapTo = (replacement: ExerciseDefinition) => Alert.alert(
    `Swap to ${replacement.name}?`,
    `Replaces the remaining ${setsWord(remainingHere)} of ${exercise.name} with ${replacement.name}, starting at ${formatKg(startingLoad(state, replacement, entry))}. Sets already logged stay. A swap can't be undone.`,
    [{ text: 'Cancel', style: 'cancel' }, {
      text: 'Swap', onPress: () => {
        setSheet(null);
        report(apply((current) => substituteRuntimeExercise(current, exercise.id, replacement.id)), () => notify({
          tone: 'success', title: `swap → ${replacement.name} replaces ${exercise.name} · ${setsWord(remainingHere)}`,
        }));
      },
    }]
  );

  const finishEarly = () => {
    if(!results.length){notify({tone:'info',title:'Log a set before completing the workout'});return;}
    report(apply(current=>commitRuntimeSession(skipRemainingRuntimeSets(current))),()=>{
      setSheet(null);setRest(null);
    });
  };

  const sessionSlot=state.block?.slots.find(slot=>slot.id===session.slotId);
  const sessionGroup=workoutGroup(sessionSlot?.label??'');
  const candidates = sheet === 'swap' ? getSwapCandidates(state, exercise.id, 4) : [];
  const closeSheet = () => setSheet(sheet === 'swapDetails' ? 'swap' : sheet === 'swap' ? 'menu' : null);
  const sheetTitle = sheet === 'add' ? 'Add exercise' : sheet === 'swap' ? `Swap ${exercise.name}` : sheet === 'swapDetails' && swapPreview ? swapPreview.name : exercise.name;
  const allSets=session.exercises.flatMap(item=>item.sets);
  const completed=allSets.filter(item=>item.status==='completed').length;
  const startedAt=session.startedAt??results[0]?.completedAt;
  const upcoming=session.exercises.filter(item=>item.exercise.id!==chosen?.exercise.id&&item.sets.some(s=>s.status==='pending'));
  const finished=session.exercises.filter(item=>item.exercise.id!==chosen?.exercise.id&&!item.sets.some(set=>set.status==='pending')&&item.sets.some(set=>set.result));
  const targetRest=restSecondsFor(state.source?.goal??'hypertrophy',exercise.compound);
  return (<View style={styles.page}>
    <View style={styles.workoutHeader}>
      <View style={styles.titleRow}>
        <Txt variant="heading" style={styles.flex}>Today’s workout</Txt>
        <IconButton icon="add" label="Add exercise" onPress={()=>setSheet('add')}/>
      </View>
      <WorkoutElapsed startedAt={startedAt} completed={completed} total={allSets.length}/>
      {state.source?.routine?.selectionMode==='pools'?<Txt variant="caption" tone="secondary">{state.block?.slots.find(slot=>slot.id===session.slotId)?.label}</Txt>:null}
      <View style={styles.progressRow} accessibilityLabel={`${completed} of ${allSets.length} sets completed`}>
        {allSets.map(item=><View key={item.id} style={[styles.segment,item.status==='completed'&&styles.segmentDone]}/>)}
      </View>
    </View>
    <View style={styles.workoutBody}>
    <ScrollView testID="exercise-queue" style={styles.workoutContentScroll} contentContainerStyle={styles.workoutContent} keyboardShouldPersistTaps="handled">
    {upcoming.length?<View style={styles.upcoming}>
      {chosen&&upcoming.length?<Txt variant="label" tone="muted" style={styles.meta}>UP NEXT</Txt>:null}
      <View style={styles.queue}>
        {upcoming.map(item=><SwipeDeleteCard key={item.id} label={item.exercise.name} onDelete={()=>deleteExercise(item.id)} style={styles.queueCard} contentStyle={styles.queueCardContent}>
          <ExerciseSectionHeader entry={item} active={false} expanded={false} onPress={()=>selectExercise(item.exercise.id)} onMusclePress={()=>setInspectedExercise(item.exercise)}/>
        </SwipeDeleteCard>)}
      </View>
    </View>:null}
    {finished.length?<View style={styles.completedSection}>
      <Txt variant="label" tone="muted" style={styles.meta}>COMPLETED · {finished.length}</Txt>
      {finished.map(item=><SwipeDeleteCard key={item.id} label={item.exercise.name} onDelete={()=>deleteExercise(item.id)} style={styles.queueCard} contentStyle={styles.queueCardContent}>
        <ExerciseSectionHeader entry={item} active={false} expanded={false} onPress={()=>selectExercise(item.exercise.id)} onMusclePress={()=>setInspectedExercise(item.exercise)}/>
      </SwipeDeleteCard>)}
    </View>:null}
    </ScrollView>
    {chosen?<>
      <View key={entry.id} style={[styles.activeCard,{maxHeight:upcoming.length||finished.length?'78%':'100%'}]} testID="active-exercise-card">
        <SwipeDeleteCard key={`header-${entry.id}`} label={exercise.name} onDelete={()=>deleteExercise(entry.id)} onComplete={remainingHere?done:undefined}><View style={styles.activeHeader}>
          <View style={styles.flex}><ExerciseSectionHeader entry={entry} active={true} ready={!startedAt} expanded onPress={()=>selectExercise(null)} onMusclePress={()=>setInspectedExercise(exercise)}/></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Exercise options" onPress={()=>setSheet('menu')} style={styles.smallAction}><Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted}/></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Collapse current exercise" onPress={()=>selectExercise(null)} style={styles.smallAction}><Ionicons name="chevron-up" size={16} color={colors.textMuted}/></Pressable>
        </View></SwipeDeleteCard>
        <ScrollView key={entry.id} testID="active-set-list" style={styles.setList} contentContainerStyle={styles.historyContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          <View style={styles.targets}>
            <View style={styles.targetCell}><Txt variant="label" tone="muted" style={styles.meta}>SETS</Txt><Txt variant="code">{entry.sets.length}</Txt></View>
            <View style={styles.targetCell}><Txt variant="label" tone="muted" style={styles.meta}>TARGET REPS</Txt><Txt variant="code">{set.minReps===set.maxReps?set.maxReps:`${set.minReps}–${set.maxReps}`}</Txt></View>
            <View style={styles.targetCell}><Txt variant="label" tone="muted" style={styles.meta}>REST</Txt><Txt variant="code">{formatTime(targetRest)}</Txt></View>
          </View>
          <SetTableHeader/>
          {entry.sets.map(item=><EditableSetRow key={item.id} set={item} value={rowValue(item)} busy={submitting}
            onChange={patch=>changeRow(item,patch)}/>)}
        </ScrollView>
        {remainingHere?<Pressable accessibilityRole="button" accessibilityLabel={`Done with ${exercise.name}`} accessibilityHint="Records this exercise’s sets and opens the next unfinished exercise."
          disabled={submitting} accessibilityState={{disabled:submitting}} onPress={done} style={({pressed})=>[styles.doneAction,pressed&&styles.pressed]}>
          <Txt variant="mono" tone="secondary" style={styles.meta}>Done</Txt>
        </Pressable>:<View style={styles.doneAction} testID="completed-exercise-status">
          <Txt variant="mono" tone={completedExercise?'success':'muted'} style={styles.meta}>{completedExercise?'Completed':'Skipped'}</Txt>
        </View>}
      </View>
    </>:null}
    {celebration?<WorkoutCelebration key={celebration}/>:null}
    </View>

      {rangeOpen?<WeightRangeSheet exerciseId={exercise.id} name={exercise.name} onClose={applied=>{setRangeOpen(false);if(applied)setDrafts(previous=>{const next={...previous};entry.sets.filter(set=>set.status==='pending').forEach(set=>{if(next[set.id]){const {load,...rest}=next[set.id];next[set.id]=rest;}});return next;});}}/>:null}
      <ExerciseDetailsSheet exercise={inspectedExercise} onClose={()=>setInspectedExercise(null)}/>
      {sheet==='add'?<TodayExercisePicker
        title={sessionGroup?`Add to ${sessionGroup.name}`:'Add exercise'}
        initialMuscles={state.source?.routine?.selectionMode==='pools'?state.block?.slots.find(slot=>slot.id===session.slotId)?.targetMuscles:undefined}
        catalog={(state.block?.catalog ?? state.catalog ?? []).filter(x=>(!sessionGroup||matchesGroup(x,sessionGroup)) && !session.exercises.some(e=>e.exercise.id===x.id) && !state.source?.excludedExerciseIds.includes(x.id) && !session.context.unavailableExerciseIds.includes(x.id) && !x.contraindications.some(tag=>state.source?.limitations.includes(tag)) && x.equipment.every(eq=>state.source?.equipment.includes(eq)&&!session.context.unavailableEquipment.includes(eq))).sort((a,b)=>{const pool=state.source?.routine?.selectionMode==='pools'?state.block?.slots.find(slot=>slot.id===session.slotId)?.plannedExercises:[];return Number(pool?.some(p=>p.exerciseId===b.id))-Number(pool?.some(p=>p.exerciseId===a.id));})}
        onClose={closeSheet}
        onAdd={exercise=>report(apply(current=>addRuntimeExercise(current,{exerciseId:exercise.id,...(current.source?.routine?.setDefaults??{sets:3,minReps:8,maxReps:12,targetRir:2})})),()=>{setSheet(null);notify({tone:'info',title:`${exercise.name} added`});})}
      />:null}
      <Sheet visible={sheet !== null && sheet !== 'add'} onClose={closeSheet} title={sheetTitle}>
        {sheet === 'menu' ? <>
        <OptionRow icon="barbell-outline" title="Weight range" detail={ranges[exercise.id]?`${weightText(ranges[exercise.id].minKg,unit)}–${weightText(ranges[exercise.id].maxKg,unit)} ${unit}`:undefined} onPress={()=>{setSheet(null);setRangeOpen(true);}}/>
        <OptionRow icon="swap-horizontal" title="Swap exercise" onPress={() => setSheet('swap')} />
        <OptionRow icon="play-skip-forward" title="Skip exercise" onPress={skipExercise} />
        {!results.length?<OptionRow icon="create-outline" title="Start from scratch" onPress={startFromScratch}/>:null}
        <OptionRow icon="flag-outline" title="Finish session" onPress={finishEarly} />
        <OptionRow icon="bandage" tone="danger" title="Report pain" onPress={reportPain} />
        </> : null}
        {sheet === 'details' ? <ExerciseMuscleDetails key={exercise.id} exercise={exercise} reason={entry.reason} /> : null}
        {sheet === 'swap' ? <>
        <Txt variant="caption" tone="secondary">Compare muscle targets before choosing a replacement. Your logged sets stay.</Txt>
        <ExerciseTargetPreview exercise={exercise} label={`Current · ${exercise.name}`} onPress={() => setSheet('details')} />
        <Txt variant="label" tone="muted">Available replacements</Txt>
        {candidates.length ? candidates.map((candidate) => (
          <ExerciseTargetPreview
            key={candidate.id} exercise={candidate} label={candidate.name}
            onPress={() => { setSwapPreview(candidate); setSheet('swapDetails'); }}
          />
        )) : (
          <>
            <Txt>No other exercise fits your equipment and limitations for this movement.</Txt>
            <Button label="Skip this exercise instead" variant="secondary" onPress={skipExercise} />
          </>
        )}
        <Button label="Back" variant="ghost" onPress={() => setSheet('menu')} />
        </> : null}
        {sheet === 'swapDetails' && swapPreview ? <>
          <Txt variant="caption" tone="secondary">Replacing {exercise.name} · primary: {muscleList(exercise.primaryMuscles)}</Txt>
          <ExerciseMuscleDetails key={swapPreview.id} exercise={swapPreview} />
          <Txt variant="caption">{state.source ? exerciseAlternatives(exercise,state.block?.catalog ?? [],state.source,state.sessions,session.context).find(x=>x.exercise.id===swapPreview.id)?.explanation : ''}</Txt>
          <Txt variant="code" tone="secondary">Starts at {formatKg(startingLoad(state, swapPreview, entry))} · {setsWord(remainingHere)} remaining</Txt>
          <Button label={`Use ${swapPreview.name} today`} onPress={() => swapTo(swapPreview)} />
          <Button label="Compare other lifts" variant="ghost" onPress={() => setSheet('swap')} />
        </> : null}
      </Sheet>
    </View>
  );
};

const formatTime = (seconds: number) => `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;

const OptionRow = ({ icon, title, detail, onPress, tone, disabled }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; detail?: string; onPress: () => void; tone?: 'danger'; disabled?: boolean;
}) => (
  <Pressable
    accessibilityRole="button" accessibilityLabel={detail ? `${title}. ${detail}` : title} accessibilityState={{ disabled: Boolean(disabled) }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.option, tone === 'danger' && styles.optionDanger, disabled && styles.optionDisabled, pressed && styles.pressed]}
  >
    <Ionicons name={icon} size={24} color={tone === 'danger' ? colors.danger : colors.accent} />
    <View style={styles.flex}>
      <Txt variant="heading" tone={tone === 'danger' ? 'danger' : 'primary'}>{title}</Txt>
      {detail ? <Txt variant="caption" tone="secondary">{detail}</Txt> : null}
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  flex:{flex:1,minWidth:0},page:{flex:1,minHeight:0,paddingHorizontal:16,paddingTop:8,paddingBottom:8,gap:10},
  workoutHeader:{gap:7},titleRow:{flexDirection:'row',alignItems:'center',gap:8,minHeight:36},
  meta:{fontSize:10,lineHeight:15,letterSpacing:0.3},progressRow:{flexDirection:'row',gap:3},segment:{flex:1,height:4,borderRadius:3,backgroundColor:colors.border},segmentDone:{backgroundColor:colors.success},
  upcoming:{flexShrink:1,gap:5},queue:{gap:6},queueCardContent:{paddingHorizontal:8,paddingVertical:7},queueCard:{borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surface},
  workoutBody:{flex:1,minHeight:0,gap:10},setList:{flexGrow:0,flexShrink:1,minHeight:0},
  activeCard:{flexShrink:1,minHeight:0,overflow:'hidden',borderWidth:1,borderColor:colors.borderStrong,borderRadius:16,padding:12,backgroundColor:colors.surface},
  workoutContentScroll:{flex:1,minHeight:0},workoutContent:{gap:10},
  completedSection:{gap:6},
  activeHeader:{flexShrink:0,flexDirection:'row',alignItems:'center',gap:3},smallAction:{width:32,height:32,alignItems:'center',justifyContent:'center'},
  historyContent:{paddingTop:8,gap:5},
  targets:{flexDirection:'row',gap:8,paddingVertical:6,marginBottom:4,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.border},targetCell:{flex:1,gap:1},
  doneAction:{minHeight:44,alignSelf:'flex-start',justifyContent:'center',minWidth:56},
  exerciseHeader:{flexDirection:'row',alignItems:'center',gap:8},pressed:{opacity:0.7},
  option:{flexDirection:'row',gap:space.md,alignItems:'center',padding:space.lg,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.surface,minHeight:TOUCH},optionDanger:{borderColor:colors.danger,backgroundColor:colors.dangerSoft},optionDisabled:{opacity:0.5},
});
