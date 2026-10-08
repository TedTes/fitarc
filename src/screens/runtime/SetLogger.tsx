import { useWeightSettings, WeightRangeSheet } from './WeightSettings';
import { toKg, weightText } from '../../runtime/weights';
import { exerciseAlternatives } from '../../runtime/recommendations';
import { suggestWorkoutLoad } from '../../runtime/progression';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addRuntimeExercise, correctRuntimeSet, commitRuntimeSession, discardRuntimeSession, getSwapCandidates, recordRuntimeSet, reorderRuntimeExercises, skipRemainingRuntimeSets, skipRuntimeExercise,
  restSecondsFor, substituteRuntimeExercise, undoLastRuntimeSet,
} from '../../runtime';
import type { ExerciseDefinition, RuntimeState, SessionPrescription, SetPrescription } from '../../runtime';
import { colors, radius, space, TOUCH } from './theme';
import { Button, Divider, IconButton, Sheet, Txt } from './ui';
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

export type WorkoutDockState = {
  seconds: number;
  durationSeconds: number;
  onSkip: () => void;
};

type RestState = { until:number; durationSeconds:number; exerciseId:string };

/** What the engine uses as a replacement's first load. Mirrors substituteRuntimeExercise. */
const startingLoad = (state: RuntimeState, exercise: ExerciseDefinition, target: SessionPrescription['exercises'][number]) => {
  const pending=target.sets.filter(s=>s.status==='pending'); const first=pending[0];
  if(state.source?.routine && first) return suggestWorkoutLoad(exercise,{exerciseId:exercise.id,sets:pending.length,minReps:first.minReps,maxReps:first.maxReps,targetRir:first.targetRir},state.source,state.sessions,state.activeSession?.context.date).loadKg;
  return state.workingSets[exercise.id]?.loadKg ?? state.source?.seedWorkingSets.find(item=>item.exerciseId===exercise.id)?.loadKg ?? (exercise.compound?20:10);
};

/** set.log: one prescription, one signal, the runtime's reply. Everything else is behind the menu. */
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
  const [sheet,setSheet]=useState<null|'menu'|'swap'|'details'|'swapDetails'|'add'|'order'>(null);
  const [inspectedExercise,setInspectedExercise]=useState<ExerciseDefinition|null>(null);
  const [swapPreview,setSwapPreview]=useState<ExerciseDefinition|null>(null);
  const [clockNow,setClockNow]=useState(Date.now);
  const [rest,setRest]=useState<RestState|null>(()=>{
    if(!lastResult)return null;
    const lift=session?.exercises.find(item=>item.exercise.id===lastResult.exerciseId);
    if(!lift?.sets.some(set=>set.status==='pending'))return null;
    const duration=restSecondsFor(state.source?.goal??'hypertrophy',lift?.exercise.compound??false);
    const until=Date.parse(lastResult.completedAt)+duration*1000;
    return until>Date.now()?{until,durationSeconds:duration,exerciseId:lift.exercise.id}:null;
  });
  const confirming=useRef(false);
  const previousUnit=useRef(unit);
  useEffect(()=>{
    const old=previousUnit.current;if(old===unit)return;
    previousUnit.current=unit;
    setDrafts(current=>Object.fromEntries(Object.entries(current).map(([id,draft])=>[id,draft.load?.trim()&&Number.isFinite(Number(draft.load))?{...draft,load:weightText(toKg(Number(draft.load),old),unit)}:draft])));
  },[unit]);
  const defaultEntry=session?.exercises.find(item=>item.exercise.id===lastResult?.exerciseId)??session?.exercises[0];
  const chosen=selectedExerciseId===null?undefined:session?.exercises.find(item=>item.exercise.id===selectedExerciseId)??defaultEntry;
  const entry=chosen??session?.exercises[0];
  const pendingSet=entry?.sets.find(item=>item.status==='pending');
  const set=pendingSet??entry?.sets[entry.sets.length-1];
  useEffect(()=>{const timer=setInterval(()=>setClockNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const restHasNextSet=Boolean(rest&&session?.exercises.find(entry=>entry.exercise.id===rest.exerciseId)?.sets.some(set=>set.status==='pending'));
  useEffect(()=>{if(rest&&(clockNow>=rest.until||!restHasNextSet))setRest(null);},[clockNow,rest,restHasNextSet]);
  const resting=Boolean(rest&&rest.until>clockNow&&restHasNextSet);
  const secondsLeft=rest?Math.max(0,Math.ceil((rest.until-clockNow)/1000)):0;
  const skipRest=useCallback(()=>setRest(null),[]);
  useEffect(()=>{
    onDockChange(session&&resting&&rest?{seconds:secondsLeft,durationSeconds:rest.durationSeconds,onSkip:skipRest}:null);
  },[onDockChange,session?.id,resting,secondsLeft,rest?.durationSeconds,skipRest]);
  const progress=sessionProgress(state);
  if(session&&!session.exercises.length)return <EmptyWorkoutLogger state={state} apply={apply}/>;
  if(!session||!entry||!set||!progress)return null;
  const exercise=entry.exercise;
  const lastOfExercise=[...results].reverse().find(result=>result.exerciseId===exercise.id);
  const canUndo=Boolean(lastOfExercise&&lastResult?.setId===lastOfExercise.setId);
  const remainingHere=entry.sets.filter(item=>item.status==='pending').length;
  const rowValue=(item:SetPrescription)=>({...setRowValues(item,Boolean(entry.needsBaseline&&!entry.sets[entry.sets.indexOf(item)-1]?.result),unit),...drafts[item.id]});
  const selectExercise=(id:string|null)=>{
    animate();
    setSelectedExerciseId(id);
  };

  const report = (outcome: ApplyResult, onSuccess: () => void) => {
    if (outcome.ok) { onSuccess(); return true; }
    const problem = describeRuntimeError(outcome.error);
    const duplicate = outcome.error instanceof Error && outcome.error.message === 'set_already_recorded';
    notify({ tone: duplicate ? 'warning' : 'error', title: problem.title, message: problem.message, sticky: !duplicate });
    return false;
  };

  const moveExercise = (exerciseId: string, direction: -1 | 1) => {
    const ids = session.exercises.map((item) => item.exercise.id);
    const from = ids.indexOf(exerciseId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    report(apply((current) => reorderRuntimeExercises(current, ids)), () => setSelectedExerciseId(exerciseId));
  };

  const undoSet = () => {
    const outcome = apply((current) => {
      const latest = [...current.setResults].reverse().find((item) => item.prescriptionId === current.activeSession?.id);
      if (!latest) throw new Error('nothing_to_undo');
      return undoLastRuntimeSet(current);
    });
    report(outcome, () => { setRest(null); if(lastResult)setSelectedExerciseId(lastResult.exerciseId); });
  };

  const submit = (item:SetPrescription) => {
    const value=rowValue(item);
    if(confirming.current||item.status==='skipped'||!validSetRow(value))return;
    confirming.current=true;setSubmitting(true);
    const values={actualLoadKg:item.result&&value.load===weightText(item.result.actualLoadKg??item.result.prescribedLoadKg,unit)?(item.result.actualLoadKg??item.result.prescribedLoadKg):toKg(Number(value.load),unit),completedReps:Number(value.reps),reportedRir:Number(value.rir)};
    const correction=item.status==='completed';
    const outcome=apply(current=>correction?correctRuntimeSet(current,item.id,values):recordRuntimeSet(current,{
      ...values,prescriptionId:session.id,setId:item.id,exerciseId:exercise.id,
      prescribedLoadKg:item.loadKg,prescribedMinReps:item.minReps,prescribedMaxReps:item.maxReps,targetRir:item.targetRir,completedAt:new Date().toISOString(),
    }));
    report(outcome,()=>{
      Keyboard.dismiss();
      setDrafts(previous=>{const next={...previous};delete next[item.id];return next;});
      if(!correction){
        const duration=restSecondsFor(state.source?.goal??'hypertrophy',exercise.compound);
        const hasNextSet=outcome.ok&&outcome.state.activeSession?.exercises.find(entry=>entry.exercise.id===exercise.id)?.sets.some(set=>set.status==='pending');
        setClockNow(Date.now());setRest(hasNextSet?{until:Date.now()+duration*1000,durationSeconds:duration,exerciseId:exercise.id}:null);
      }
    });
    confirming.current=false;setSubmitting(false);
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
    if(!results.length)return;
    report(apply(current=>commitRuntimeSession(skipRemainingRuntimeSets(current))),()=>{
      setSheet(null);setRest(null);
    });
  };

  const discard = () => Alert.alert(
    'Discard this session?',
    `Rolls back the ${setsWord(results.length)} you logged and restores your previous working weights. Can't be undone.`,
    [{ text: 'Keep session', style: 'cancel' }, {
      text: 'Discard session', style: 'destructive', onPress: () => {
        setSheet(null);
        report(apply(discardRuntimeSession), () => notify({ tone: 'info', title: 'discarded → working weights restored' }));
      },
    }]
  );

  const candidates = sheet === 'swap' ? getSwapCandidates(state, exercise.id, 4) : [];
  const closeSheet = () => setSheet(sheet === 'swapDetails' ? 'swap' : sheet === 'swap' || sheet === 'order' ? 'menu' : null);
  const sheetTitle = sheet === 'add' ? 'Add exercise' : sheet === 'order' ? 'Exercise order' : sheet === 'swap' ? `Swap ${exercise.name}` : sheet === 'swapDetails' && swapPreview ? swapPreview.name : exercise.name;
  const allSets=session.exercises.flatMap(item=>item.sets);
  const completed=allSets.filter(item=>item.status==='completed').length;
  const startedAt=session.startedAt??results[0]?.completedAt;
  const elapsed=startedAt?Math.max(0,Math.floor((clockNow-Date.parse(startedAt))/1000)):0;
  const upcoming=session.exercises.filter(item=>item.exercise.id!==chosen?.exercise.id&&item.sets.some(s=>s.status==='pending'));
  const finished=session.exercises.filter(item=>item.exercise.id!==chosen?.exercise.id&&!item.sets.some(set=>set.status==='pending')&&item.sets.some(set=>set.result));
  const logged=entry.sets.filter(item=>item.result);
  const targetRest=restSecondsFor(state.source?.goal??'hypertrophy',exercise.compound);
  return (<View style={styles.page}>
    <View style={styles.workoutHeader}>
      <View style={styles.titleRow}>
        <Txt variant="heading" style={styles.flex}>Today’s workout</Txt>
        {startedAt?<Pressable accessibilityRole="button" accessibilityLabel="Finish workout" disabled={!results.length} onPress={finishEarly} style={styles.finish}>
          <Txt variant="caption" style={styles.finishText}>Finish</Txt>
        </Pressable>:<IconButton icon="add" label="Add exercise" onPress={()=>setSheet('add')}/>}
      </View>
      <Txt variant="mono" tone="muted" style={styles.meta}>
        <Txt variant="mono" style={[styles.meta,{color:startedAt?colors.success:colors.accent}]}>{startedAt?`● ${formatTime(elapsed).padStart(5,'0')} elapsed`:'Ready'}</Txt>{` · ${completed} of ${allSets.length} sets`}
      </Txt>
      {state.source?.routine?.selectionMode==='pools'?<Txt variant="caption" tone="secondary">{state.block?.slots.find(slot=>slot.id===session.slotId)?.label} · Changes here are for today</Txt>:null}
      <View style={styles.progressRow} accessibilityLabel={`${completed} of ${allSets.length} sets completed`}>
        {allSets.map(item=><View key={item.id} style={[styles.segment,item.status==='completed'&&styles.segmentDone]}/>)}
      </View>
    </View>
    <View style={styles.workoutBody}>
    <ScrollView testID="exercise-queue" style={styles.workoutContentScroll} contentContainerStyle={styles.workoutContent} keyboardShouldPersistTaps="handled">
    {upcoming.length?<View style={styles.upcoming}>
      {chosen&&upcoming.length?<Txt variant="label" tone="muted" style={styles.meta}>UP NEXT</Txt>:null}
      <View style={styles.queue}>
        {upcoming.map(item=><View key={item.id} style={styles.queueCard}>
          <ExerciseSectionHeader entry={item} active={false} expanded={false} onPress={()=>selectExercise(item.exercise.id)} onMusclePress={()=>setInspectedExercise(item.exercise)}/>
        </View>)}
      </View>
    </View>:null}
    {finished.length?<View style={styles.completedSection}>
      <Txt variant="label" tone="muted" style={styles.meta}>COMPLETED · {finished.length}</Txt>
      {finished.map(item=><View key={item.id} style={styles.queueCard}>
        <ExerciseSectionHeader entry={item} active={false} expanded={false} onPress={()=>selectExercise(item.exercise.id)} onMusclePress={()=>setInspectedExercise(item.exercise)}/>
      </View>)}
    </View>:null}
    </ScrollView>
    {chosen?<>
      <View style={[styles.activeCard,{maxHeight:upcoming.length||finished.length?'78%':'100%'}]} testID="active-exercise-card">
        <View style={styles.activeHeader}>
          <View style={styles.flex}><ExerciseSectionHeader entry={entry} active={true} ready={!startedAt} expanded onPress={()=>selectExercise(null)} onMusclePress={()=>setInspectedExercise(exercise)}/></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Workout options" onPress={()=>setSheet('menu')} style={styles.smallAction}><Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted}/></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Collapse current exercise" onPress={()=>selectExercise(null)} style={styles.smallAction}><Ionicons name="chevron-up" size={16} color={colors.textMuted}/></Pressable>
        </View>
        <ScrollView key={entry.id} testID="active-set-list" style={styles.setList} contentContainerStyle={styles.historyContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          <View style={styles.targets}>
            <View style={styles.targetCell}><Txt variant="label" tone="muted" style={styles.meta}>SETS</Txt><Txt variant="code">{entry.sets.length}</Txt></View>
            <View style={styles.targetCell}><Txt variant="label" tone="muted" style={styles.meta}>TARGET REPS</Txt><Txt variant="code">{set.minReps===set.maxReps?set.maxReps:`${set.minReps}–${set.maxReps}`}</Txt></View>
            <View style={styles.targetCell}><Txt variant="label" tone="muted" style={styles.meta}>REST</Txt><Txt variant="code">{formatTime(targetRest)}</Txt></View>
          </View>
          <SetTableHeader/>
          {entry.sets.map(item=><EditableSetRow key={item.id} set={item} value={rowValue(item)} current={item.id===pendingSet?.id} busy={submitting}
            onChange={patch=>setDrafts(previous=>({...previous,[item.id]:{...previous[item.id],...patch}}))} onConfirm={()=>submit(item)}/>)}
          {logged.length?<View style={styles.historyFooter}>
            {logged.length?<Txt variant="mono" tone="muted" style={styles.meta}>{remainingHere?`${remainingHere} sets left`:'All sets logged'}</Txt>:null}
            {canUndo?<Pressable accessibilityRole="button" accessibilityLabel="Undo last recorded set" onPress={undoSet} style={styles.smallAction}><Ionicons name="arrow-undo" size={15} color={colors.textMuted}/></Pressable>:null}
          </View>:null}
        </ScrollView>
      </View>
    </>:null}
    </View>

      {rangeOpen?<WeightRangeSheet exerciseId={exercise.id} name={exercise.name} onClose={applied=>{setRangeOpen(false);if(applied)setDrafts(previous=>{const next={...previous};entry.sets.filter(set=>set.status==='pending').forEach(set=>{if(next[set.id]){const {load,...rest}=next[set.id];next[set.id]=rest;}});return next;});}}/>:null}
      <ExerciseDetailsSheet exercise={inspectedExercise} onClose={()=>setInspectedExercise(null)}/>
      {sheet==='add'?<TodayExercisePicker
        initialMuscles={state.source?.routine?.selectionMode==='pools'?state.block?.slots.find(slot=>slot.id===session.slotId)?.targetMuscles:undefined}
        catalog={(state.block?.catalog ?? state.catalog ?? []).filter(x=>!session.exercises.some(e=>e.exercise.id===x.id) && !state.source?.excludedExerciseIds.includes(x.id) && !session.context.unavailableExerciseIds.includes(x.id) && !x.contraindications.some(tag=>state.source?.limitations.includes(tag)) && x.equipment.every(eq=>state.source?.equipment.includes(eq)&&!session.context.unavailableEquipment.includes(eq))).sort((a,b)=>{const pool=state.source?.routine?.selectionMode==='pools'?state.block?.slots.find(slot=>slot.id===session.slotId)?.plannedExercises:[];return Number(pool?.some(p=>p.exerciseId===b.id))-Number(pool?.some(p=>p.exerciseId===a.id));})}
        onClose={closeSheet}
        onAdd={exercise=>report(apply(current=>addRuntimeExercise(current,{exerciseId:exercise.id,sets:3,minReps:8,maxReps:12,targetRir:2})),()=>{setSheet(null);notify({tone:'info',title:`${exercise.name} added for today`});})}
      />:null}
      <Sheet visible={sheet !== null && sheet !== 'add'} onClose={closeSheet} title={sheetTitle}>
        {sheet === 'menu' ? <>
        <Txt variant="label" tone="muted">this lift</Txt>
        <OptionRow icon="barbell-outline" title="Weight range" detail={ranges[exercise.id]?`${weightText(ranges[exercise.id].minKg,unit)}–${weightText(ranges[exercise.id].maxKg,unit)} ${unit}`:undefined} onPress={()=>{setSheet(null);setRangeOpen(true);}}/>
        <OptionRow icon="swap-horizontal" title="Swap lift" onPress={() => setSheet('swap')} />
        <OptionRow icon="reorder-three" title="Exercise order" onPress={() => setSheet('order')} />
        <OptionRow icon="play-skip-forward" title="Skip exercise" onPress={skipExercise} />
        <OptionRow icon="bandage" tone="danger" title="Report pain" onPress={reportPain} />
        <Divider />
        <Txt variant="label" tone="muted">session · {results.length} logged · {progress.pending} pending</Txt>
        <OptionRow icon="add" title="Add exercise for today" onPress={()=>setSheet('add')} />
        <OptionRow icon="flag" title="Finish workout" disabled={results.length === 0} onPress={finishEarly} />
        <OptionRow icon="trash" tone="danger" title="Discard session" onPress={discard} />
        </> : null}
        {sheet === 'order' ? session.exercises.map((item, index) => <View key={item.id} style={styles.exerciseHeader}>
          <Txt variant="caption" style={styles.flex}>{item.exercise.name}</Txt>
          <IconButton icon="chevron-up" label={`Move ${item.exercise.name} earlier`} disabled={index === 0} onPress={() => moveExercise(item.exercise.id, -1)} />
          <IconButton icon="chevron-down" label={`Move ${item.exercise.name} later`} disabled={index === session.exercises.length - 1} onPress={() => moveExercise(item.exercise.id, 1)} />
        </View>) : null}
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
  finish:{borderWidth:1,borderColor:colors.borderStrong,borderRadius:20,paddingHorizontal:14,minHeight:36,justifyContent:'center'},finishText:{fontSize:12},
  meta:{fontSize:10,lineHeight:15,letterSpacing:0.3},progressRow:{flexDirection:'row',gap:3},segment:{flex:1,height:4,borderRadius:3,backgroundColor:colors.border},segmentDone:{backgroundColor:colors.success},
  upcoming:{flexShrink:1,gap:5},queue:{gap:6},queueCard:{paddingHorizontal:8,paddingVertical:7,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surface},
  workoutBody:{flex:1,minHeight:0,gap:10},setList:{flexGrow:0,flexShrink:1,minHeight:0},
  activeCard:{flexShrink:1,minHeight:0,overflow:'hidden',borderWidth:1,borderColor:colors.borderStrong,borderRadius:16,padding:12,backgroundColor:colors.surface},
  workoutContentScroll:{flex:1,minHeight:0},workoutContent:{gap:10},
  completedSection:{gap:6},
  activeHeader:{flexShrink:0,flexDirection:'row',alignItems:'center',gap:3},smallAction:{width:32,height:32,alignItems:'center',justifyContent:'center'},
  historyContent:{paddingTop:8,gap:5},
  targets:{flexDirection:'row',gap:8,paddingVertical:6,marginBottom:4,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.border},targetCell:{flex:1,gap:1},
  historyFooter:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:8},
  exerciseHeader:{flexDirection:'row',alignItems:'center',gap:8},pressed:{opacity:0.7},
  option:{flexDirection:'row',gap:space.md,alignItems:'center',padding:space.lg,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.surface,minHeight:TOUCH},optionDanger:{borderColor:colors.danger,backgroundColor:colors.dangerSoft},optionDisabled:{opacity:0.5},
});
