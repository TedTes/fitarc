import { useRef, useState, type ReactNode } from 'react';
import { useFlushOnLeave } from '../../hooks/useFlushOnLeave';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExerciseDefinition, RuntimeState } from '../../runtime/types';
import { styleSessionCount } from '../../runtime/trainingStyles';
import { previewTrainingSession } from '../../runtime/runtimeService';
import { localDate } from '../../runtime/planDates';
import { nextWorkoutPreview } from '../../runtime/nextWorkout';
import { nextRoutineSlot } from '../../runtime/sequence';
import { savedRoutines, routineName } from '../../runtime/savedRoutines';
import { Txt } from './ui';
import { MuscleMap } from './MuscleMap';
import { preferredTargetView } from './muscleTargeting';
import { dayLabel, muscleList } from './copy';
import { ExerciseDetailsSheet } from './ExerciseMuscles';
import { PlanText } from './PlanKit';
import { colors, planTokens as t } from './theme';

export function SavedRoutines({ state, onRenameRoutine, onBack, header, actions, active = true }: {
  active?: boolean;
  /** Icon buttons shown at the end of the routine-name row (or alone when there is no routine yet). */
  actions?: ReactNode;
  state: RuntimeState;
  onBack?: () => void;
  header?: ReactNode;
  onRenameRoutine: (id: string, name: string) => string | undefined;
}) {
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const pendingName = useRef<{ id: string; value: string } | null>(null);
  const nameInputs = useRef(new Map<string, TextInput>());
  const [inspected, setInspected] = useState<ExerciseDefinition | null>(null);
  const routines = savedRoutines(state);
  const selected = routines.find(plan => plan.id === state.block?.id) ?? routines[0];
  // Read-only preview of each group's next session: the same contiguous batch Today would draw from the queue.
  const nextBatch = (slot: NonNullable<typeof selected>['slots'][number]) => {
    if (!state.source || selected?.id !== state.block?.id) return [];
    if(state.activeSession?.slotId===slot.id)return state.activeSession.exercises.map(e=>e.exercise.id);
    try {
      return previewTrainingSession(state, { date: localDate(), minutesAvailable: state.source.sessionMinutes, recovery: 'yes', unavailableEquipment: [], unavailableExerciseIds: [],workoutId:slot.id,extraWorkout:true })
        .exercises.map(entry => entry.exercise.id);
    } catch { return []; }
  };
  // The group Today will open next: the workout in progress, else the routine's next slot and its scheduled day.
  const today = localDate();
  const isActive = Boolean(selected && selected.id === state.block?.id);
  const preview = (() => { try { return isActive ? nextWorkoutPreview(state, today) : null; } catch { return null; } })();
  const upNextId = !isActive || !state.block ? undefined
    : state.activeSession?.slotId ?? preview?.slotId ?? (state.block.slots.length ? nextRoutineSlot(state.block, state.sessions)?.id : undefined);
  const upNext = selected?.slots.find(slot => slot.id === upNextId);
  const inProgress = Boolean(upNextId && state.activeSession?.slotId === upNextId);
  const when = inProgress ? null : preview && !preview.needsSchedule ? dayLabel(preview.date, today) : null;

  const finishEditing = (dismiss = true) => {
    const pending = pendingName.current;
    if (!pending) return;
    // Clear first: blur and outside-tap callbacks must not save the same edit twice.
    pendingName.current = null;
    setEditing(null);
    if (dismiss) {
      nameInputs.current.get(pending.id)?.blur();
      Keyboard.dismiss();
    }
    setError(onRenameRoutine(pending.id, pending.value) ?? '');
  };
  useFlushOnLeave(() => finishEditing(), active);

  return <View style={styles.screen} onTouchStart={() => finishEditing()}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      {header ?? <View style={styles.header}>
        {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Back to Plan" onPress={onBack} style={styles.back}><Ionicons name="chevron-back" size={24} color={colors.text}/></Pressable> : null}
        <PlanText kind="title">Plan</PlanText>
      </View>}
      {error?<Txt tone="danger" accessibilityLiveRegion="polite" style={styles.inset}>{error}</Txt>:null}
      {!selected&&actions?<View style={[styles.nameRow,styles.inset]}><View style={styles.content}/>{actions}</View>:null}
      {selected?<View style={styles.overview}>
        <View style={styles.nameRow}>
        <TextInput selectTextOnFocus selectionColor={colors.accent} underlineColorAndroid="transparent"
          value={editing===selected.id?name:routineName(selected)}
          ref={input=>{if(input)nameInputs.current.set(selected.id,input);else nameInputs.current.delete(selected.id);}}
          onTouchStart={event=>event.stopPropagation()} onPressIn={event=>event.stopPropagation()}
          onChangeText={value=>{pendingName.current={id:selected.id,value};setName(value);}}
          onFocus={()=>{pendingName.current={id:selected.id,value:routineName(selected)};setName(routineName(selected));setEditing(selected.id);setError('');}}
          onEndEditing={()=>{if(pendingName.current?.id===selected.id)finishEditing(false);}}
          accessibilityLabel={`Routine name: ${routineName(selected)}`} maxLength={80} returnKeyType="done" style={styles.nameInput}/>
        {actions}
        </View>
        <View style={styles.metaRow}>
          {upNext?<Txt variant="caption" tone="muted" numberOfLines={1} style={styles.metaText}>{inProgress?`Now: ${upNext.label}`:`Next: ${upNext.label}${when?` · ${when}`:''}`}</Txt>
            :<Txt variant="caption" tone="muted" numberOfLines={1} style={styles.metaText}>{selected.slots.length} groups · {selected.slots.reduce((sum,slot)=>sum+slot.plannedExercises.length,0)} exercises{styleSessionCount(state,selected)>0?` · ${styleSessionCount(state,selected)} sessions`:''}</Txt>}
        </View>
      </View>:null}
      {selected?.slots.map((slot,groupIndex)=>{
        const total=slot.plannedExercises.length;
        const fetched=nextBatch(slot);
        // A session that takes the whole queue has no rotation to show: no rail, just a note.
        const partial=fetched.length>0&&fetched.length<total;
        const batch=partial?fetched:[];
        const isNext=slot.id===upNextId;
        const inBatch=(index:number)=>{const id=slot.plannedExercises[index]?.exerciseId;return id!==undefined&&batch.includes(id);};
        return <View key={slot.id} style={styles.section}>
        <View style={styles.groupHeading}>
          <Txt variant="mono" tone={isNext?'accent':'muted'} style={styles.groupNumber}>{String(groupIndex+1).padStart(2,'0')}</Txt>
          <Txt variant="heading" style={styles.content}>{slot.label}</Txt>
          {isNext?<View style={styles.nextPill} accessibilityLabel={`${inProgress?'In progress':'Up next'}${partial?`, takes ${batch.length} of ${total} exercises`:''}`}>
            <Txt variant="mono" tone="accent" style={styles.nextText}>{inProgress?'in progress':'up next'}{partial?<Txt variant="mono" tone="muted" style={styles.nextText}> · {batch.length} of {total}</Txt>:null}</Txt>
          </View>:<Txt variant="mono" tone="muted" style={styles.nextText}>{partial?`next ${batch.length} of ${total}`:fetched.length?`all ${total} each session`:total}</Txt>}
        </View>
        {slot.plannedExercises.map((item,index)=>{
          const order=batch.indexOf(item.exerciseId);
          const next=order>=0&&inBatch(index);
          const exercise=selected.catalog?.find(entry=>entry.id===item.exerciseId);
          const min=item.prescription?.minReps??selected.phases[0]?.minReps;
          const max=item.prescription?.maxReps??selected.phases[0]?.maxReps;
          return <Pressable key={`${item.exerciseId}:${index}`} accessibilityRole="button" disabled={!exercise}
            accessibilityLabel={`Preview ${exercise?.name??item.exerciseId}${next?`, number ${order+1} next session`:''}`} onPress={()=>exercise&&setInspected(exercise)}
            style={({pressed})=>[styles.row,pressed&&styles.pressed]}>
            {/* The rail joins the exercises the next session will take, so a batch that wraps past the end reads as two runs. */}
            {partial?<View style={styles.order} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {next?<View style={[styles.rail,!isNext&&styles.railQuiet,inBatch(index-1)&&styles.railUp,inBatch(index+1)&&styles.railDown]}/>:null}
              {next?<View style={[styles.orderDot,!isNext&&styles.orderDotQuiet]}><Txt variant="mono" style={[styles.orderText,!isNext&&styles.orderTextQuiet]}>{order+1}</Txt></View>:<View style={styles.idle}/>}
            </View>:null}
            {exercise?<View style={styles.muscle} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <MuscleMap view={preferredTargetView(exercise)} targets={exercise} height={48} showZoom={false} focusTargets/>
            </View>:null}
            <View style={styles.content}>
              <Txt>{exercise?.name??item.exerciseId}</Txt>
              <Txt variant="caption" tone="muted">{exercise?`${muscleList(exercise.primaryMuscles)} · `:''}{item.sets} × {min===max?min:`${min}–${max}`}</Txt>
            </View>
            {exercise?<Ionicons name="chevron-forward" size={16} color={colors.textDim}/>:null}
          </Pressable>;
        })}
      </View>;})}
      {!routines.length?<Txt tone="secondary" style={styles.inset}>Choose a training style to begin.</Txt>:null}
    </ScrollView>
    <ExerciseDetailsSheet exercise={inspected} onClose={()=>setInspected(null)}/>
  </View>;
}

const styles = StyleSheet.create({
  screen:{flex:1}, page:{paddingBottom:32}, inset:{paddingHorizontal:t.gutter},
  header:{flexDirection:'row',alignItems:'center',padding:t.gutter},
  back:{width:t.touch,height:t.touch,alignItems:'center',justifyContent:'center'},
  overview:{paddingHorizontal:t.gutter,paddingTop:t.gutter,paddingBottom:4,gap:0},
  metaRow:{flexDirection:'row',alignItems:'center',gap:6,minHeight:28},metaText:{flexShrink:1},
  nameRow:{flexDirection:'row',alignItems:'center',gap:12},
  nameInput:{flex:1,minWidth:0,color:colors.text,fontSize:22,minHeight:40,paddingHorizontal:0,paddingVertical:4,borderWidth:0,backgroundColor:'transparent'},
  section:{paddingHorizontal:t.gutter,paddingTop:20},
  nextPill:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8,paddingVertical:3,borderRadius:999,backgroundColor:colors.accentSoft,borderWidth:1,borderColor:colors.accentBorder},
  nextText:{fontSize:11},
  order:{width:18,alignSelf:'stretch',alignItems:'center',justifyContent:'center'},
  rail:{position:'absolute',width:2,top:0,bottom:0,backgroundColor:colors.accentBorder},
  railUp:{top:-9},railDown:{bottom:-9},
  orderDot:{width:18,height:18,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:colors.accent},
  orderText:{fontSize:10,lineHeight:12,color:colors.accentText,fontWeight:'700'},
  orderDotQuiet:{backgroundColor:colors.surfaceRaised,borderWidth:1,borderColor:colors.borderStrong},orderTextQuiet:{color:colors.textMuted},railQuiet:{backgroundColor:colors.border},
  idle:{width:5,height:5,borderRadius:3,backgroundColor:colors.borderStrong},
  groupHeading:{flexDirection:'row',alignItems:'center',gap:12,paddingBottom:10,borderBottomWidth:1,borderBottomColor:colors.border},
  groupNumber:{fontSize:12}, content:{flex:1,gap:4},
  muscle:{width:40,height:48,borderRadius:9,overflow:'hidden'},
  row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:9,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},
  pressed:{opacity:0.7},
});
