import { isPoolPattern } from '../../runtime/exercisePools';
import { groupDraft, suggestPoolExercises } from '../../routineSetup/pools';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { ExerciseDefinition, TrainingSource } from '../../runtime/types';
import { DEFAULT_SET_TARGETS, draftCatalog, exerciseFromDefaults, sourceFromDraft, unknownValue, valueOf, type DraftExercise, type RoutineDraft } from '../../routineSetup/draft';
import { CustomExerciseForm } from './CustomExerciseForm';
import { colors, radius, space } from './theme';
import { defaultRoutine } from '../../runtime/routine';
import { PlanButton, PlanGroup, PlanInput, PlanOptions, PlanPanel, PlanText, PlanTile, planStyles, usePlanMotion } from './PlanKit';
import { EQUIPMENT_OPTIONS, GOAL_OPTIONS, MUSCLE_OPTIONS, SetTargetControls, numberOptions, toggleValue } from './RoutinePlanControls';
import { ExercisePicker, RoutineWorkoutSheet } from './RoutineWorkoutSheet';
import { muscleList } from './copy';

export const setupInputStyle = { color:colors.text, backgroundColor:colors.surface, borderColor:colors.borderStrong, borderWidth:1, borderRadius:radius.sm, padding:space.sm, minHeight:48, fontSize:16 };
const numberValue=(text:string)=>text.trim()?valueOf(Number(text.replace(',','.'))):unknownValue<number>();
const move=<T,>(items:T[],index:number)=>{const next=[...items];[next[index-1],next[index]]=[next[index],next[index-1]];return next;};

const ExerciseEditor=({item,catalog,onChange,onPrivate}:{item:DraftExercise;catalog:ExerciseDefinition[];onChange:(value:DraftExercise)=>void;onPrivate:(exercise:ExerciseDefinition)=>void})=>{
  const [choosing,setChoosing]=useState(!item.exerciseId);
  const definition=catalog.find(x=>x.id===item.exerciseId);
  return <View style={planStyles.section}>
    <PlanButton label={choosing?'Close exercise search':'Change exercise'} variant="ghost" onPress={()=>setChoosing(!choosing)}/>
    {choosing?<><ExercisePicker catalog={catalog} selectedIds={[]} onAdd={exercise=>{onChange({...item,exerciseId:exercise.id,name:exercise.name,basis:null});setChoosing(false);}}/><CustomExerciseForm onAdd={exercise=>{onPrivate(exercise);setChoosing(false);}}/></>:null}
    <SetTargetControls value={{sets:item.sets.value??3,minReps:item.minReps.value??8,maxReps:item.maxReps.value??12,targetRir:item.targetRir.value??2}} onChange={value=>onChange({...item,sets:valueOf(value.sets),minReps:valueOf(value.minReps),maxReps:valueOf(value.maxReps),targetRir:valueOf(value.targetRir)})}/>
    <PlanGroup label="STARTING WEIGHT"><PlanInput accessibilityLabel={`${item.name} Starting weight`} value={item.weight.value===null?'':String(item.weight.value)} keyboardType="decimal-pad" onChangeText={text=>onChange({...item,weight:numberValue(text),unit:item.unit??'kg'})}/></PlanGroup>
    {item.weight.value!==null?<>
      <PlanOptions segments options={[{value:'kg' as const,label:'kg'},{value:'lb' as const,label:'lb'}]} value={item.unit??'kg'} onChange={unit=>onChange({...item,unit})}/>
      {definition?.equipment.includes('dumbbell')&&item.weight.value>0?<PlanOptions options={[{value:'per_hand' as const,label:'Each dumbbell'},{value:'total' as const,label:'Both combined'}]} value={item.basis??[]} onChange={basis=>onChange({...item,basis})}/>:null}
      <PlanButton label="Clear starting weight" variant="ghost" onPress={()=>onChange({...item,weight:unknownValue(),unit:null,basis:null})}/>
    </>:null}
  </View>;
};

export const RoutineDraftReview=({draft,initial,catalog,onChange,onSettingsChange,scheduleRequest=0,embedded=false}:{draft:RoutineDraft;initial:TrainingSource;catalog:ExerciseDefinition[];onChange:(draft:RoutineDraft)=>void;onSettingsChange:(source:TrainingSource)=>void;scheduleRequest?:number;embedded?:boolean})=>{
  const all=draftCatalog(draft,catalog),{animate}=usePlanMotion();
  const [open,setOpen]=useState<string|null>(null),[newWorkout,setNewWorkout]=useState(false),[pickerFor,setPickerFor]=useState<string|null>(null),[noteOpen,setNoteOpen]=useState(Boolean(draft.limitationNote));
  const pools=draft.selectionMode==='pools';
  const defaults=draft.setDefaults??DEFAULT_SET_TARGETS;
  const focus=draft.focus??((draft.goal.value??initial.goal)==='strength'?'strength':'build_muscle');
  const equipment=draft.equipment??initial.equipment;
  const progression=initial.routine?.progression??defaultRoutine().progression;
  useEffect(()=>{if(scheduleRequest)setOpen('schedule');},[scheduleRequest]);
  const toggle=(id:string)=>{animate();setOpen(current=>current===id?null:id);};
  const changeWorkout=(id:string,patch:Partial<RoutineDraft['workouts'][number]>)=>onChange({...draft,workouts:draft.workouts.map(w=>w.id===id?{...w,...patch}:w)});
  let complete=true;
  try{sourceFromDraft(draft,initial,catalog);}catch{complete=false;}
  const days=draft.days.value??initial.daysPerWeek,minutes=draft.minutes.value??initial.sessionMinutes;
  const equipmentSummary=equipment.map(value=>EQUIPMENT_OPTIONS.find(option=>option.value===value)?.label.toLowerCase()??value.replaceAll('_',' ')).join(', ');
  const advancedSummary=[equipmentSummary,draft.limitationNote?.trim()?'note added':'',progression.mode==='manual'?'manual':'auto'].filter(Boolean).join(' · ');
  return <View style={planStyles.root}>
    <PlanGroup label="WORKOUT STRUCTURE">
      <PlanOptions options={[{value:'upper_lower' as const,label:'Upper / lower'},{value:'push_pull_legs' as const,label:'Push / pull / legs'},{value:'full_body' as const,label:'Full body'},{value:'custom' as const,label:'Custom groups'}]} value={pools?(draft.preferredSplit??'custom'):[]} onChange={pattern=>{animate();onChange(isPoolPattern(pattern)?groupDraft(draft,pattern,all):{...draft,selectionMode:'pools',preferredSplit:'custom'});}}/>
      <PlanText kind="meta">{pools?`${draft.workouts.map(w=>w.name).join(' → ')} → repeat. Add exercises to each pool. Today prepares a session; Finish moves to the next group.`:'Choose a pattern to organize your exercises into pools. Existing fixed workouts stay as they are until you choose.'}</PlanText>
      {pools?<PlanText kind="meta">The first compound lift stays for progression. Other choices adapt to recent training and time. Today’s edits affect today only.</PlanText>:null}
      {pools?<PlanButton label="Use as fixed workouts instead" variant="ghost" onPress={()=>onChange({...draft,selectionMode:'fixed'})}/>:null}
    </PlanGroup>
    {!embedded?<><PlanText kind="overline">PLAN</PlanText>
    <PlanPanel title="Schedule & goal" summary={`${days} days/week · ${minutes} min · ${GOAL_OPTIONS.find(option=>option.value===focus)?.label.toLowerCase()}`} open={open==='schedule'} onToggle={()=>toggle('schedule')}>
      <PlanGroup label="DAYS/WEEK"><PlanOptions segments options={numberOptions([...new Set([3,4,5,6,days])].sort((a,b)=>a-b))} value={days} onChange={days=>onChange({...draft,days:valueOf(days)})}/></PlanGroup>
      <PlanGroup label="SESSION LENGTH"><PlanOptions segments options={[...new Set([45,60,75,90,minutes])].sort((a,b)=>a-b).map(value=>({value,label:`${value}m`}))} value={minutes} onChange={minutes=>onChange({...draft,minutes:valueOf(minutes)})}/></PlanGroup>
      <PlanGroup label="GOAL"><PlanOptions options={GOAL_OPTIONS} value={focus} onChange={focus=>onChange({...draft,focus,goal:valueOf(focus==='strength'?'strength':'hypertrophy')})}/></PlanGroup>
    </PlanPanel>
    </>:null}
    <PlanPanel title="Set defaults" summary={`${defaults.sets} sets · ${defaults.minReps}–${defaults.maxReps} reps · ${defaults.targetRir} rir`} open={open==='defaults'} onToggle={()=>toggle('defaults')}>
      <SetTargetControls value={defaults} onChange={setDefaults=>onChange({...draft,setDefaults})}/>
    </PlanPanel>
    <PlanPanel title="Advanced" summary={advancedSummary} open={open==='advanced'} onToggle={()=>toggle('advanced')}>
      <PlanGroup label="EQUIPMENT"><PlanOptions options={EQUIPMENT_OPTIONS} value={equipment} onChange={value=>onChange({...draft,equipment:toggleValue(equipment,value)})}/></PlanGroup>
      <PlanGroup label="LIMITATIONS">{noteOpen?<PlanInput multiline accessibilityLabel="Limitations note" value={draft.limitationNote??''} maxLength={1000} onChangeText={limitationNote=>onChange({...draft,limitationNote})} style={planStyles.note}/>:<PlanButton variant="ghost" label="Add note" onPress={()=>{animate();setNoteOpen(true);}}/>}</PlanGroup>
      <PlanGroup label="PROGRESSION"><PlanOptions segments options={[{value:'double_progression' as const,label:'Auto'},{value:'manual' as const,label:'Manual'}]} value={progression.mode} onChange={mode=>onSettingsChange({...initial,routine:{...(initial.routine??defaultRoutine()),progression:{...progression,mode}}})}/></PlanGroup>
    </PlanPanel>
    <View style={planStyles.count}><PlanText kind="overline">{pools?'EXERCISE POOLS':'WORKOUTS'} · {draft.workouts.length}</PlanText><PlanText kind="meta" success={complete}>{complete?'✓ complete':'incomplete'}</PlanText></View>
    {draft.workouts.map((workout,index)=><PlanPanel key={workout.id} leading={<PlanTile letter={String.fromCharCode(65+index)}/>} title={workout.name||'Unnamed workout'} summary={`${muscleList(workout.targetMuscles?.length?workout.targetMuscles:[...new Set(workout.exercises.flatMap(item=>all.find(exercise=>exercise.id===item.exerciseId)?.primaryMuscles??[]))]).toLowerCase().replaceAll(', ',' · ')} · ${workout.exercises.length} exercises`} open={open===workout.id} onToggle={()=>toggle(workout.id)}>
      <PlanInput value={workout.name} maxLength={80} onChangeText={name=>changeWorkout(workout.id,{name})} accessibilityLabel={`Workout ${index+1} name`} />
      {!workout.name.trim()?<PlanText kind="meta">Enter a workout name</PlanText>:null}
      <PlanGroup label="TARGET MUSCLES"><PlanOptions options={MUSCLE_OPTIONS} value={workout.targetMuscles??[]} onChange={muscle=>changeWorkout(workout.id,{targetMuscles:toggleValue(workout.targetMuscles??[],muscle)})}/></PlanGroup>
      {pools?<PlanButton label="Suggest exercises for this pool" variant="ghost" onPress={()=>onChange(suggestPoolExercises(draft,workout.id,initial,all))}/>:null}
      {workout.exercises.map((item,itemIndex)=><PlanPanel key={item.id} title={all.find(x=>x.id===item.exerciseId)?.name||item.name||'Choose an exercise'} summary={`${item.sets.value??3} × ${item.minReps.value??8}–${item.maxReps.value??12} · ${item.targetRir.value??2} RIR`} open={pickerFor===item.id} onToggle={()=>{animate();setPickerFor(current=>current===item.id?null:item.id);}}>
        <ExerciseEditor item={item} catalog={all} onChange={value=>changeWorkout(workout.id,{exercises:workout.exercises.map(e=>e.id===item.id?value:e)})} onPrivate={exercise=>onChange({...draft,customExercises:[...draft.customExercises,exercise],workouts:draft.workouts.map(w=>w.id===workout.id?{...w,exercises:w.exercises.map(e=>e.id===item.id?{...e,exerciseId:exercise.id,name:exercise.name,basis:null}:e)}:w)})} />
        {itemIndex>0?<PlanButton label="Move exercise up" variant="ghost" onPress={()=>changeWorkout(workout.id,{exercises:move(workout.exercises,itemIndex)})} />:null}
        <PlanButton label="Remove exercise" variant="ghost" onPress={()=>changeWorkout(workout.id,{exercises:workout.exercises.filter(e=>e.id!==item.id)})} />
      </PlanPanel>)}
      {pickerFor===workout.id?<><ExercisePicker catalog={all} selectedIds={workout.exercises.map(item=>item.exerciseId!)} initialMuscles={workout.targetMuscles} onAdd={exercise=>{changeWorkout(workout.id,{exercises:[...workout.exercises,exerciseFromDefaults(exercise,defaults)]});setPickerFor(null);}}/><PlanButton label="Close search" variant="ghost" onPress={()=>setPickerFor(null)}/></>:<PlanButton label="Add exercise" variant="dashed" onPress={()=>setPickerFor(workout.id)} disabled={workout.exercises.length>=(pools?500:20)}/>}
      {!workout.exercises.length?<PlanText kind="meta">Add an exercise</PlanText>:null}
      {index>0?<PlanButton label={pools?"Move group earlier":"Move workout up"} variant="ghost" onPress={()=>onChange({...draft,workouts:move(draft.workouts,index)})} />:null}
      <PlanButton label={pools?"Remove group":"Remove workout"} variant="ghost" onPress={()=>onChange({...draft,workouts:draft.workouts.filter(w=>w.id!==workout.id)})} />
    </PlanPanel>)}
    <PlanButton label={pools?"Add group":"Add workout"} variant="dashed" disabled={draft.workouts.length>=14} onPress={()=>setNewWorkout(true)}/>
    {newWorkout?<RoutineWorkoutSheet catalog={all} defaults={defaults} position={draft.workouts.length} onCancel={()=>setNewWorkout(false)} onAdd={workout=>{onChange({...draft,workouts:[...draft.workouts,workout]});setNewWorkout(false);setOpen(null);}}/>:null}
  </View>;
};
