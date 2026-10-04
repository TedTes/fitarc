import { exerciseAlternatives } from '../../runtime/recommendations';
import { suggestWorkoutLoad } from '../../runtime/progression';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addRuntimeExercise, commitRuntimeSession, discardRuntimeSession, getSwapCandidates, recordRuntimeSet, reorderRuntimeExercises, skipRemainingRuntimeSets, skipRuntimeExercise,
  restSecondsFor, substituteRuntimeExercise, undoLastRuntimeSet,
} from '../../runtime';
import type { ExerciseDefinition, RuntimeState, SessionPrescription } from '../../runtime';
import { colors, radius, space, TOUCH } from './theme';
import { Button, Divider, IconButton, Sheet, Txt } from './ui';
import { describeRuntimeError, formatKg, muscleList, setsWord } from './copy';
import { ExerciseDetailsSheet, ExerciseMuscleDetails, ExerciseTargetPreview } from './ExerciseMuscles';
import { useLayoutMotion } from './useLayoutMotion';
import { ExerciseSectionHeader } from './ExerciseCard';
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
  phase: 'ready' | 'set' | 'rest';
  seconds: number;
  primaryDisabled: boolean;
  onPrimary: () => void;
  onReset: () => void;
};

type RestState = { until:number; durationSeconds:number };

/** What the engine uses as a replacement's first load. Mirrors substituteRuntimeExercise. */
const startingLoad = (state: RuntimeState, exercise: ExerciseDefinition, target: SessionPrescription['exercises'][number]) => {
  const pending=target.sets.filter(s=>s.status==='pending'); const first=pending[0];
  if(state.source?.routine && first) return suggestWorkoutLoad(exercise,{exerciseId:exercise.id,sets:pending.length,minReps:first.minReps,maxReps:first.maxReps,targetRir:first.targetRir},state.source,state.sessions,state.activeSession?.context.date).loadKg;
  return state.workingSets[exercise.id]?.loadKg ?? state.source?.seedWorkingSets.find(item=>item.exerciseId===exercise.id)?.loadKg ?? (exercise.compound?20:10);
};

/** set.log: one prescription, one signal, the runtime's reply. Everything else is behind the menu. */
export const SetLogger = ({ state, apply, notify, onDockChange }: Props) => {
  useEffect(() => { onDockChange(null); }, [onDockChange]);
  const { animate } = useLayoutMotion();
  const session=state.activeSession;
  const results=useMemo(()=>session?state.setResults.filter(result=>result.prescriptionId===session.id):[],[state.setResults,session]);
  const lastResult=results[results.length-1];
  const [selectedExerciseId,setSelectedExerciseId]=useState<string|null>(()=>lastResult?.exerciseId??null);
  const [addQuery,setAddQuery]=useState('');
  const [reps,setReps]=useState('');
  const [load,setLoad]=useState('');
  const [rir,setRir]=useState<number|null>(null);
  const [submitting,setSubmitting]=useState(false);
  const [sheet,setSheet]=useState<null|'menu'|'swap'|'details'|'swapDetails'|'add'|'order'>(null);
  const [inspectedExercise,setInspectedExercise]=useState<ExerciseDefinition|null>(null);
  const [swapPreview,setSwapPreview]=useState<ExerciseDefinition|null>(null);
  const [clockNow,setClockNow]=useState(Date.now);
  const [availableHeight,setAvailableHeight]=useState(600);
  const [rest,setRest]=useState<RestState|null>(()=>{
    if(!lastResult)return null;
    const lift=session?.exercises.find(item=>item.exercise.id===lastResult.exerciseId);
    const duration=restSecondsFor(state.source?.goal??'hypertrophy',lift?.exercise.compound??false);
    const until=Date.parse(lastResult.completedAt)+duration*1000;
    return until>Date.now()?{until,durationSeconds:duration}:null;
  });
  const drafts=useRef<Record<string,{load:string;reps:string;rir:number|null}>>({});
  const chosen=session?.exercises.find(item=>item.exercise.id===selectedExerciseId);
  const entry=chosen??session?.exercises[0];
  const pendingSet=entry?.sets.find(item=>item.status==='pending');
  const set=pendingSet??entry?.sets[entry.sets.length-1];
  const needsBaseline=Boolean(entry?.needsBaseline&&!entry.sets.some(item=>item.status==='completed'));
  const setId=set?.id;
  useEffect(()=>{
    if(!set)return;
    const saved=drafts.current[set.id];
    setLoad(saved?.load??(needsBaseline?'':String(set.loadKg)));
    setReps(saved?.reps??String(set.maxReps));setRir(saved?saved.rir:set.targetRir);setSubmitting(false);
  },[setId,set?.loadKg,set?.maxReps,set?.targetRir,needsBaseline]);
  useEffect(()=>{const timer=setInterval(()=>setClockNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(rest&&clockNow>=rest.until)setRest(null);},[clockNow,rest]);
  const progress=sessionProgress(state);
  if(!session||!entry||!set||!progress)return null;
  const exercise=entry.exercise;
  const lastOfExercise=[...results].reverse().find(result=>result.exerciseId===exercise.id);
  const canUndo=Boolean(lastOfExercise&&lastResult?.setId===lastOfExercise.setId);
  const remainingHere=entry.sets.filter(item=>item.status==='pending').length;
  const repsValue=reps.trim()===''?null:Number(reps);
  const loadValue=Number(load);
  const loadValid=load.trim()!==''&&Number.isFinite(loadValue)&&loadValue>=0;
  const repsValid=repsValue!==null&&Number.isInteger(repsValue)&&repsValue>=0&&repsValue<=99;
  const selectExercise=(id:string|null)=>{
    if(chosen&&pendingSet)drafts.current[set.id]={load,reps,rir};
    animate();
    setSelectedExerciseId(id);
  };
  const resting=Boolean(rest&&rest.until>clockNow);
  const secondsLeft=rest?Math.max(0,Math.ceil((rest.until-clockNow)/1000)):0;
  const skipRest=()=>setRest(null);
  const beat=[...state.setResults].reverse().find(item=>item.exerciseId===exercise.id&&item.prescriptionId!==session.id);
  const previousSets=beat?state.setResults.filter(item=>item.exerciseId===exercise.id&&item.prescriptionId===beat.prescriptionId):[];

  const candidateResult = () => ({
    prescriptionId: session.id, setId: set.id, exerciseId: exercise.id,
    actualLoadKg: loadValue, prescribedLoadKg: set.loadKg, prescribedMinReps: set.minReps, prescribedMaxReps: set.maxReps,
    targetRir: set.targetRir, completedReps: repsValue ?? 0, reportedRir: rir ?? 0, completedAt: new Date().toISOString(),
  });
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

  const submit = () => {
    if (!pendingSet || resting || submitting || rir === null || !repsValid || !loadValid) return;
    setSubmitting(true);
    const result = candidateResult();
    const outcome = apply((current) => recordRuntimeSet(current, result));
    const ok = report(outcome, () => {
      if (!outcome.ok) return;
      delete drafts.current[set.id];
      const duration=restSecondsFor(outcome.state.source?.goal??'hypertrophy',exercise.compound);
      setClockNow(Date.now());
      setRest({until:Date.now()+duration*1000,durationSeconds:duration});
      setSubmitting(false);
    });
    if (!ok) setSubmitting(false);
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
  const upcoming=session.exercises.filter(item=>item.exercise.id!==selectedExerciseId&&item.sets.some(s=>s.status==='pending'));
  const logged=entry.sets.filter(item=>item.result);
  const cardMinimum=Math.min(330,Math.max(190,availableHeight-130));
  const targetRest=restSecondsFor(state.source?.goal??'hypertrophy',exercise.compound);
  const canConfirm=Boolean(pendingSet&&!resting&&loadValid&&repsValid&&rir!==null&&!submitting);
  return (<View style={styles.page} onLayout={event=>setAvailableHeight(event.nativeEvent.layout.height)}>
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
      <View style={styles.progressRow} accessibilityLabel={`${completed} of ${allSets.length} sets completed`}>
        {allSets.map(item=><View key={item.id} style={[styles.segment,item.status==='completed'&&styles.segmentDone]}/>)}
      </View>
    </View>
    {upcoming.length?<View style={[styles.upcoming,chosen?{maxHeight:Math.max(52,availableHeight-cardMinimum-120)}:styles.flex]}>
      {chosen&&upcoming.length?<Txt variant="label" tone="muted" style={styles.meta}>UP NEXT</Txt>:null}
      <ScrollView style={styles.queueScroll} contentContainerStyle={styles.queue} keyboardShouldPersistTaps="handled">
        {upcoming.map(item=><View key={item.id} style={styles.queueCard}>
          <ExerciseSectionHeader entry={item} active={false} expanded={false} onPress={()=>selectExercise(item.exercise.id)} onMusclePress={()=>setInspectedExercise(item.exercise)}/>
        </View>)}
      </ScrollView>
    </View>:null}
    {chosen?<>
      <View style={[styles.activeCard,{minHeight:cardMinimum}]}>
        <View style={styles.activeHeader}>
          <View style={styles.flex}><ExerciseSectionHeader entry={entry} active={true} ready={!startedAt} expanded onPress={()=>selectExercise(null)} onMusclePress={()=>setInspectedExercise(exercise)}/></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Collapse current exercise" onPress={()=>selectExercise(null)} style={styles.smallAction}><Ionicons name="chevron-up" size={16} color={colors.textMuted}/></Pressable>
        </View>
        <ScrollView style={styles.history} contentContainerStyle={styles.historyContent} keyboardShouldPersistTaps="handled">
          <View style={styles.targets}>
            <View style={styles.targetCell}><Txt variant="label" tone="muted" style={styles.meta}>SETS</Txt><Txt variant="code">{entry.sets.length}</Txt></View>
            <View style={styles.targetCell}><Txt variant="label" tone="muted" style={styles.meta}>TARGET REPS</Txt><Txt variant="code">{set.minReps===set.maxReps?set.maxReps:`${set.minReps}–${set.maxReps}`}</Txt></View>
            <View style={styles.targetCell}><Txt variant="label" tone="muted" style={styles.meta}>REST</Txt><Txt variant="code">{formatTime(targetRest)}</Txt></View>
          </View>
          {previousSets.length?<View style={styles.lastTime}>
            <Txt variant="label" tone="muted" style={styles.meta}>LAST TIME</Txt>
            <Txt variant="mono" tone="secondary" style={styles.reference}>{previousSets.every(result=>(result.actualLoadKg??result.prescribedLoadKg)===(previousSets[0].actualLoadKg??previousSets[0].prescribedLoadKg))
              ?`${formatKg(previousSets[0].actualLoadKg??previousSets[0].prescribedLoadKg)} · ${previousSets.map(result=>result.completedReps).join(' · ')}`
              :previousSets.map(result=>`${formatKg(result.actualLoadKg??result.prescribedLoadKg)} × ${result.completedReps}`).join(' · ')}</Txt>
          </View>:null}
          <View style={styles.setsHeading}><Txt variant="label" tone="muted" style={styles.meta}>THIS WORKOUT</Txt><Txt variant="mono" tone="muted" style={styles.meta}>{logged.length}/{entry.sets.length}</Txt></View>
          {entry.sets.map(item=>{
            const result=item.result;
            const current=item.id===pendingSet?.id;
            return <View key={item.id} style={[styles.historySet,current&&styles.nextHistorySet]}>
              <Txt variant="code" tone={result?'success':current?'accent':'muted'} style={styles.setNumber}>{item.setNumber}</Txt>
              {item.status==='skipped'?<Txt variant="mono" tone="muted" style={styles.flex}>Skipped</Txt>:<>
                <Txt variant="code" tone={result?'primary':'muted'} style={styles.historyValue}>{result?formatKg(result.actualLoadKg??result.prescribedLoadKg):needsBaseline||(entry.needsBaseline&&item.id!==pendingSet?.id)?'—':formatKg(item.loadKg)}</Txt>
                <Txt variant="code" tone={result?'primary':'muted'} style={styles.historyValue}>{result?result.completedReps:item.minReps===item.maxReps?item.maxReps:`${item.minReps}–${item.maxReps}`} reps</Txt>
                <Txt variant="mono" tone={result?'secondary':'muted'} style={styles.meta}>RIR {result?result.reportedRir:item.targetRir}</Txt>
              </>}
              <Ionicons name={result?'checkmark':current?'ellipse-outline':'remove-outline'} size={14} color={result?colors.success:colors.textMuted}/>
            </View>;
          })}
          <View style={styles.historyFooter}>
            {logged.length?<Txt variant="mono" tone="muted" style={styles.meta}>{remainingHere?`${remainingHere} sets left`:'All sets logged'}</Txt>:null}
            {canUndo?<Pressable accessibilityRole="button" accessibilityLabel="Undo last recorded set" onPress={undoSet} style={styles.smallAction}><Ionicons name="arrow-undo" size={15} color={colors.textMuted}/></Pressable>:null}
            <Pressable accessibilityRole="button" accessibilityLabel="Workout options" onPress={()=>setSheet('menu')} style={styles.smallAction}><Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted}/></Pressable>
          </View>
        </ScrollView>
        <View style={styles.controlSlot}>
          {resting?<Pressable accessibilityRole="button" accessibilityLabel="Skip rest" onPress={skipRest} style={styles.timerPanel}>
            <Txt variant="mono" tone="muted" style={styles.meta}>{pendingSet?`NEXT · set ${pendingSet.setNumber} of ${entry.sets.length} · target ${pendingSet.minReps}–${pendingSet.maxReps}`:'Exercise complete'}</Txt>
            <View style={styles.timerRow}>
              <Ionicons name="timer-outline" size={20} color={colors.accent}/>
              <Txt variant="number" tone="accent" style={styles.countdown}>{formatTime(secondsLeft)}</Txt>
              <Txt variant="mono" tone="secondary" style={[styles.meta,styles.flex]}>resting</Txt>
              <View style={styles.confirm}><Txt variant="code" tone="accent" style={styles.skipText}>skip ›</Txt></View>
            </View>
            <View style={styles.timerTrack}><View style={[styles.timerFill,{width:`${Math.min(100,secondsLeft/Math.max(1,rest!.durationSeconds)*100)}%`}]}/></View>
          </Pressable>:pendingSet?<View style={styles.inputPanel}>
            <View style={styles.inputHead}>
              <Txt variant="label" tone="muted" style={[styles.meta,styles.setNumber]}>SET</Txt>
              <Txt variant="label" tone="muted" style={[styles.meta,styles.flex]}>KG</Txt>
              <Txt variant="label" tone="muted" style={[styles.meta,styles.flex]}>REPS</Txt><View style={styles.confirmSpace}/>
            </View>
            <View style={styles.inputRow}>
              <Txt variant="code" style={[styles.setNumber,{color:startedAt?colors.success:colors.accent}]}>{set.setNumber}</Txt>
              <TextInput value={load} onChangeText={setLoad} style={styles.cellInput} inputMode="decimal" keyboardType="decimal-pad" selectTextOnFocus accessibilityLabel={`Set ${set.setNumber} weight in kilograms`}/>
              <TextInput value={reps} onChangeText={value=>setReps(value.replace(/[^0-9]/g,'').slice(0,2))} style={styles.cellInput} inputMode="numeric" keyboardType="number-pad" selectTextOnFocus accessibilityLabel={`Set ${set.setNumber} reps`}/>
              <Pressable accessibilityRole="button" accessibilityLabel={`Log set ${set.setNumber}`} accessibilityState={{disabled:!canConfirm}} aria-disabled={!canConfirm} disabled={!canConfirm} onPress={submit} style={[styles.confirm,styles.confirmButton,!canConfirm&&styles.disabled]}><Ionicons name="checkmark" size={24} color={colors.ground}/></Pressable>
            </View>
            <View style={styles.rirRow} accessibilityRole="radiogroup" accessibilityLabel="Reps in reserve">
              <Txt variant="label" tone="muted" style={[styles.meta,styles.setNumber]}>RIR</Txt>
              {[0,1,2,3,4].map(value=><Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value===4?'4 or more':value} reps in reserve`} aria-checked={rir===value} accessibilityState={{checked:rir===value}} onPress={()=>setRir(value)} style={[styles.rirPill,rir===value&&styles.rirSelected]}>
                <Txt variant="mono" style={[styles.meta,rir===value&&{color:colors.success}]}>{value===4?'4+':value}</Txt>
              </Pressable>)}
            </View>
          </View>:<View style={styles.completePanel}>
            <Ionicons name="checkmark-circle-outline" size={26} color={colors.success}/>
            <Txt variant="heading">{upcoming.length?'Exercise complete':'All sets logged'}</Txt>
          </View>}
        </View>
      </View>
    </>:null}

      <ExerciseDetailsSheet exercise={inspectedExercise} onClose={()=>setInspectedExercise(null)}/>
      <Sheet visible={sheet !== null} onClose={closeSheet} title={sheetTitle}>
        {sheet === 'menu' ? <>
        <Txt variant="label" tone="muted">this lift</Txt>
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
        {sheet === 'add' ? <>
          <TextInput value={addQuery} onChangeText={setAddQuery} placeholder="Search exercises" placeholderTextColor={colors.textMuted} style={{color:colors.text,minHeight:44}} accessibilityLabel="Search exercises to add today" />
          {(state.block?.catalog ?? state.catalog ?? []).filter(x=>!session.exercises.some(e=>e.exercise.id===x.id) && !state.source?.excludedExerciseIds.includes(x.id) && !session.context.unavailableExerciseIds.includes(x.id) && !x.contraindications.some(tag=>state.source?.limitations.includes(tag)) && x.equipment.every(eq=>state.source?.equipment.includes(eq)&&!session.context.unavailableEquipment.includes(eq)) && x.name.toLowerCase().includes(addQuery.toLowerCase())).map(x=><Button key={x.id} variant="ghost" label={x.name} onPress={()=>{
            report(apply(current=>addRuntimeExercise(current,{exerciseId:x.id,sets:3,minReps:8,maxReps:12,targetRir:2})),()=>{setSheet(null);notify({tone:'info',title:`${x.name} added for today`});});
          }} />)}
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
  finish:{borderWidth:1,borderColor:colors.borderStrong,borderRadius:20,paddingHorizontal:14,minHeight:36,justifyContent:'center'},finishText:{fontSize:12},
  meta:{fontSize:10,lineHeight:15,letterSpacing:0.3},progressRow:{flexDirection:'row',gap:3},segment:{flex:1,height:4,borderRadius:3,backgroundColor:colors.border},segmentDone:{backgroundColor:colors.success},
  upcoming:{flexShrink:1,gap:5},queueScroll:{flexGrow:0,flexShrink:1},queue:{gap:6},queueCard:{paddingHorizontal:8,paddingVertical:7,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surface},
  activeCard:{flex:1,minHeight:205,borderWidth:1,borderColor:colors.borderStrong,borderRadius:16,padding:12,backgroundColor:colors.surface},
  activeHeader:{flexDirection:'row',alignItems:'center',gap:3},smallAction:{width:32,height:32,alignItems:'center',justifyContent:'center'},
  history:{flex:1,minHeight:0},historyContent:{paddingTop:8,gap:5},lastTime:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center',justifyContent:'space-between'},reference:{fontSize:11,lineHeight:17,flexShrink:1},
  targets:{flexDirection:'row',gap:8,paddingVertical:6,marginBottom:4,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.border},targetCell:{flex:1,gap:1},
  setsHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingTop:4,paddingBottom:2},nextHistorySet:{backgroundColor:colors.surfaceRaised,borderRadius:6},
  historySet:{flexDirection:'row',alignItems:'center',gap:8,minHeight:32},historyValue:{flex:1,fontSize:12,lineHeight:18},setNumber:{width:24,textAlign:'center'},
  historyFooter:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:8},
  controlSlot:{height:142,flexShrink:0,paddingTop:8},inputPanel:{flex:1,gap:8},inputHead:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:6},inputRow:{flexDirection:'row',alignItems:'center',gap:8,padding:6,backgroundColor:colors.successSoft,borderRadius:10},
  cellInput:{flex:1,minWidth:0,height:42,textAlign:'center',color:colors.text,fontSize:16,fontFamily:'JetBrainsMono-SemiBold',backgroundColor:colors.ground,borderWidth:1,borderColor:colors.borderStrong,borderRadius:7,padding:0},
  confirm:{width:44,height:42,alignItems:'center',justifyContent:'center'},confirmSpace:{width:44},confirmButton:{borderRadius:8,backgroundColor:colors.success},disabled:{opacity:0.35},
  rirRow:{flexDirection:'row',alignItems:'center',gap:5},rirPill:{flex:1,height:36,borderWidth:1,borderColor:colors.borderStrong,borderRadius:8,alignItems:'center',justifyContent:'center'},rirSelected:{borderColor:colors.success,backgroundColor:colors.successSoft},
  timerPanel:{flex:1,paddingHorizontal:6,gap:8},timerRow:{flexDirection:'row',alignItems:'center',gap:8,height:54},countdown:{fontSize:28,lineHeight:36},skipText:{fontSize:12},timerTrack:{height:4,borderRadius:2,backgroundColor:colors.border,overflow:'hidden'},timerFill:{height:4,backgroundColor:colors.accent},
  completePanel:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  exerciseHeader:{flexDirection:'row',alignItems:'center',gap:8},pressed:{opacity:0.7},
  option:{flexDirection:'row',gap:space.md,alignItems:'center',padding:space.lg,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.surface,minHeight:TOUCH},optionDanger:{borderColor:colors.danger,backgroundColor:colors.dangerSoft},optionDisabled:{opacity:0.5},
});
