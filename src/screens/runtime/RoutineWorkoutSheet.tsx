import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { createRuntimeId } from '../../runtime/id';
import type { ExerciseDefinition, Muscle, RoutineSetDefaults } from '../../runtime/types';
import { exerciseFromDefaults, valueOf, type DraftExercise, type RoutineDraft } from '../../routineSetup/draft';
import { PlanButton, PlanFooter, PlanGroup, PlanInput, PlanOptions, PlanPanel, PlanText, PlanTile, planStyles as s, usePlanMotion } from './PlanKit';
import { MUSCLE_OPTIONS, SetTargetControls, toggleValue } from './RoutinePlanControls';
import { MuscleMap } from './MuscleMap';
import { preferredTargetView } from './muscleTargeting';
import { colors, planTokens as t } from './theme';

export const ExerciseTile=({exercise}:{exercise:ExerciseDefinition})=><View style={s.muscleTile} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><MuscleMap view={preferredTargetView(exercise)} targets={exercise} height={t.muscleTile} showZoom={false} focusTargets/></View>;
export const ExercisePicker=({catalog,selectedIds,onAdd,initialMuscles=[]}:{catalog:ExerciseDefinition[];selectedIds:string[];onAdd:(exercise:ExerciseDefinition)=>void;initialMuscles?:Muscle[]})=>{
  const [query,setQuery]=useState(''),[muscles,setMuscles]=useState<Muscle[]>(initialMuscles);
  const matches=catalog.filter(exercise=>(!muscles.length||exercise.primaryMuscles.some(m=>muscles.includes(m)))&&exercise.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <View style={s.section}>
    <PlanInput accessibilityLabel="Search exercises" placeholder="Search exercises" value={query} onChangeText={setQuery}/>
    <PlanOptions options={MUSCLE_OPTIONS} value={muscles} onChange={muscle=>setMuscles(current=>toggleValue(current,muscle))}/>
    {matches.length?matches.map(exercise=>{const selected=selectedIds.includes(exercise.id);return <Pressable key={exercise.id} accessibilityRole="button" accessibilityLabel={`Add ${exercise.name}`} accessibilityState={{disabled:selected}} disabled={selected} onPress={()=>onAdd(exercise)} style={[s.pickerRow,selected&&s.disabled]}>
      <ExerciseTile exercise={exercise}/><View style={s.flex}><PlanText bold>{exercise.name}</PlanText><PlanText kind="meta">{exercise.primaryMuscles.map(m=>MUSCLE_OPTIONS.find(option=>option.value===m)?.label.toLowerCase()).join(' · ')}</PlanText></View><Ionicons name={selected?'checkmark':'add'} size={t.icon} color={selected?colors.success:colors.accent}/>
    </Pressable>;}):<PlanText kind="meta">No exercises found</PlanText>}
  </View>;
};

type Props={catalog:ExerciseDefinition[];defaults:RoutineSetDefaults;position:number;onCancel:()=>void;onAdd:(workout:RoutineDraft['workouts'][number])=>void};
export const RoutineWorkoutSheet=({catalog,defaults,position,onCancel,onAdd}:Props)=>{
  const insets=useSafeAreaInsets(),{reduced,animate}=usePlanMotion();
  const [name,setName]=useState(''),[muscles,setMuscles]=useState<Muscle[]>([]),[exercises,setExercises]=useState<DraftExercise[]>([]),[picker,setPicker]=useState(false),[open,setOpen]=useState<string|null>(null),[nameTouched,setNameTouched]=useState(false);
  const valid=Boolean(name.trim())&&exercises.length>0;
  const confirm=()=>{if(valid)onAdd({id:createRuntimeId(),name:name.trim(),targetMuscles:muscles,exercises});};
  return <Modal visible animationType={reduced?'none':'slide'} onRequestClose={picker?()=>setPicker(false):onCancel}>
    <KeyboardAvoidingView style={[s.sheet,{paddingTop:insets.top,paddingBottom:insets.bottom}]} behavior={Platform.OS==='ios'?'padding':undefined} accessibilityViewIsModal>
      <View style={s.header}><PlanTile letter={String.fromCharCode(65+position)}/><View style={s.flex}><PlanText kind="title">{picker?'Add exercise':'New workout'}</PlanText></View><PlanButton variant="ghost" label={picker?'Back':'Cancel'} onPress={picker?()=>setPicker(false):onCancel}/></View>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {picker?<ExercisePicker catalog={catalog} selectedIds={exercises.map(item=>item.exerciseId!)} initialMuscles={muscles} onAdd={exercise=>{setExercises(current=>[...current,exerciseFromDefaults(exercise,defaults)]);setPicker(false);}}/>:<>
          <PlanGroup label="NAME"><PlanInput accessibilityLabel="Workout name" placeholder="Name this workout (e.g. Push)" value={name} maxLength={80} onChangeText={setName} onBlur={()=>setNameTouched(true)}/>{nameTouched&&!name.trim()?<PlanText kind="meta">Enter a workout name</PlanText>:null}</PlanGroup>
          <PlanGroup label="TARGET MUSCLES"><PlanOptions options={MUSCLE_OPTIONS} value={muscles} onChange={muscle=>setMuscles(current=>toggleValue(current,muscle))}/></PlanGroup>
          <PlanGroup label={`EXERCISES · ${exercises.length}`}>
            {exercises.map(item=>{
              const exercise=catalog.find(exercise=>exercise.id===item.exerciseId)!;
              const targets={sets:item.sets.value!,minReps:item.minReps.value!,maxReps:item.maxReps.value!,targetRir:item.targetRir.value!};
              return <PlanPanel key={item.id} leading={<ExerciseTile exercise={exercise}/>} title={item.name} summary={`${targets.sets} × ${targets.minReps}–${targets.maxReps} · ${targets.targetRir} RIR`} open={open===item.id} onToggle={()=>{animate();setOpen(current=>current===item.id?null:item.id);}}>
                <SetTargetControls value={targets} onChange={next=>setExercises(current=>current.map(entry=>entry.id===item.id?{...entry,sets:valueOf(next.sets),minReps:valueOf(next.minReps),maxReps:valueOf(next.maxReps),targetRir:valueOf(next.targetRir)}:entry))}/>
                <PlanButton label="Remove exercise" variant="ghost" onPress={()=>setExercises(current=>current.filter(entry=>entry.id!==item.id))}/>
              </PlanPanel>;
            })}
            <PlanButton label="Add exercise" variant="dashed" disabled={exercises.length>=20} onPress={()=>setPicker(true)}/>
          </PlanGroup>
        </>}
      </ScrollView>
      {!picker?<PlanFooter secondary="Cancel" primary="Add to routine" onSecondary={onCancel} onPrimary={confirm} disabled={!valid}/>:null}
    </KeyboardAvoidingView>
  </Modal>;
};
