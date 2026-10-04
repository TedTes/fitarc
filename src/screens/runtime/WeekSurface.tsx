import { belongsToPlan, datePlusDays } from '../../runtime/planDates';
import { RemainingWeekEditor } from './RemainingWeekEditor';
import type { ApplyResult } from './useRuntimeController';
import type { Notify } from './constants';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { computeWeeklyStatus } from '../../runtime';
import type { ExerciseDefinition, Muscle, RuntimeState, TrainingBlock, WeeklyMuscleStatus, WeeklyStatus } from '../../runtime';
import { colors, radius, space, TOUCH } from './theme';
import { IconButton, ScreenBrand, Sheet, Txt } from './ui';
import { formatSets, muscleLabel } from './copy';
import { MuscleMap, type MuscleMapTone } from './MuscleMap';
import { liftsForPart, partLabel } from './muscleParts';
import { ExerciseDetailsSheet } from './ExerciseMuscles';
import { isMuscleVisible, viewForMuscle } from './muscleTargeting';

type Props = {
  state: RuntimeState; block: TrainingBlock; status: WeeklyStatus;
  apply: (transform: (state: RuntimeState) => RuntimeState) => ApplyResult; notify: Notify;
};
const rowStatus = (item: WeeklyMuscleStatus) => {
  const value = item.completedSets;
  if (value > item.max) return { label: `${formatSets(value - item.max)} over`, tone: 'danger' as const, icon: 'arrow-up-circle' as const };
  if (value < item.min) return { label: `${formatSets(item.min - value)} under`, tone: 'warning' as const, icon: 'arrow-down-circle' as const };
  if (value >= item.max) return { label: 'High', tone: 'warning' as const, icon: 'arrow-up-circle-outline' as const };
  return { label: 'In range', tone: 'success' as const, icon: 'checkmark-circle' as const };
};

/** Only performed sets feed Progress. Keep the body and the first muscle rows visible together. */
export const WeekSurface = ({ state, block, apply, notify }: Props) => {
  const { height: windowHeight } = useWindowDimensions();
  const [availableHeight, setAvailableHeight] = useState(0);
  const list = useRef<ScrollView>(null);
  const [selectedWeek, setSelectedWeek] = useState(block.currentWeek);
  const [muscleView, setMuscleView] = useState<'front' | 'back'>('front');
  const [selectedMuscle, setSelectedMuscle] = useState<Muscle | null>(null);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [inspectedExercise, setInspectedExercise] = useState<ExerciseDefinition | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const mapHeight = Math.max(150, Math.min(300, (availableHeight || windowHeight - 160) * 0.4));

  useEffect(() => { setSelectedWeek(block.currentWeek); }, [block.id, block.currentWeek]);
  useEffect(() => {
    setSelectedMuscle(null); setSelectedPart(null); setInspectedExercise(null);
    list.current?.scrollTo({ y: 0, animated: false });
  }, [selectedWeek, block.id]);

  const recorded = useMemo(() => {
    const start = datePlusDays(block.startedOn, (selectedWeek - 1) * 7), end = datePlusDays(start, 7);
    const sessions = state.sessions.filter(session => belongsToPlan(session, block) && session.context.date >= start && session.context.date < end);
    const exercises = new Map<string, { exercise: ExerciseDefinition; sets: number }>();
    const setIds = new Set<string>();
    let workouts = 0;
    for (const session of sessions) {
      let performed = false;
      for (const entry of session.exercises) {
        const sets = entry.sets.filter(set => set.status === 'completed' && set.result && set.result.completedReps > 0);
        if (!sets.length) continue;
        performed = true;
        sets.forEach(set => setIds.add(set.id));
        const previous = exercises.get(entry.exercise.id);
        exercises.set(entry.exercise.id, { exercise: entry.exercise, sets: (previous?.sets ?? 0) + sets.length });
      }
      if (performed) workouts++;
    }
    const results = state.setResults.filter(result => setIds.has(result.setId));
    return { exercises: [...exercises.values()], workouts, sets: setIds.size,
      muscles: computeWeeklyStatus(block, sessions, results, selectedWeek).muscles };
  }, [block, state.sessions, state.setResults, selectedWeek]);

  const muscleTones = useMemo(() => recorded.muscles.reduce<Partial<Record<Muscle, MuscleMapTone>>>((tones, item) => {
    if (item.completedSets > 0) tones[item.muscle] = rowStatus(item).tone as MuscleMapTone;
    return tones;
  }, {}), [recorded]);
  const muscles = [...recorded.muscles].sort((a,b) => Number(b.muscle === selectedMuscle) - Number(a.muscle === selectedMuscle));
  const selectMuscle = (muscle: Muscle, part: string | null) => {
    setSelectedMuscle(muscle); setSelectedPart(part === muscle ? null : part);
    setMuscleView(view => viewForMuscle(muscle, view));
    list.current?.scrollTo({ y: 0, animated: true });
  };
  const selectedExercises = useMemo(() => {
    if (!selectedMuscle) return [];
    const ids = new Set(recorded.exercises.map(item => item.exercise.id));
    const partLifts = selectedPart ? liftsForPart(selectedPart, ids, recorded.exercises.map(item => item.exercise)) : null;
    return recorded.exercises.filter(({ exercise }) => partLifts
      ? partLifts.some(lift => lift.name === exercise.name)
      : exercise.primaryMuscles.includes(selectedMuscle) || exercise.secondaryMuscles.includes(selectedMuscle));
  }, [recorded, selectedMuscle, selectedPart]);

  return <View style={styles.root} onLayout={event => setAvailableHeight(event.nativeEvent.layout.height)}>
    <View style={styles.heading}>
      <View style={styles.flex}><ScreenBrand name="Progress" chip="" /></View>
      {block.kind !== 'workout' ? <IconButton icon="calendar-outline" label="Change remaining week" onPress={() => setScheduleOpen(true)} /> : null}
    </View>
    <ScrollView horizontal style={styles.weeks} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekPicker} accessibilityRole="radiogroup" accessibilityLabel="Select training week">
      {Array.from({ length: Math.max(block.durationWeeks, block.currentWeek) }, (_, i) => i + 1).map(week => <Pressable key={week}
        accessibilityRole="radio" accessibilityLabel={`Week ${week}${week === block.currentWeek ? ', current week' : ''}`}
        accessibilityState={{ checked: week === selectedWeek }} onPress={() => setSelectedWeek(week)}
        style={({ pressed }) => [styles.weekChoice, week === selectedWeek && styles.weekChoiceSelected, pressed && styles.pressed]}>
        <Txt variant="code" tone={week === selectedWeek ? 'accent' : 'secondary'}>W{week}</Txt>
      </Pressable>)}
    </ScrollView>

    <View style={styles.body}>
      <MuscleMap view={muscleView} onViewChange={view => {
        setMuscleView(view);
        if (selectedMuscle && !isMuscleVisible(selectedMuscle, view)) { setSelectedMuscle(null); setSelectedPart(null); }
      }} tones={muscleTones} selected={selectedMuscle} selectedPart={selectedPart}
        height={mapHeight} overview onSelect={selectMuscle} />
    </View>

    <View style={styles.listHeading}>
      <Txt variant="caption" tone="secondary">{recorded.workouts} {recorded.workouts === 1 ? 'workout' : 'workouts'} · {recorded.sets} {recorded.sets === 1 ? 'set' : 'sets'}</Txt>
      {selectedMuscle ? <Pressable accessibilityRole="button" accessibilityLabel="Clear muscle selection" onPress={() => { setSelectedMuscle(null); setSelectedPart(null); }} style={styles.clear}>
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </Pressable> : null}
    </View>
    <ScrollView ref={list} style={styles.list} contentContainerStyle={styles.listContent} accessibilityLabel="Recorded muscle progress">
      <View style={styles.table}>
      {muscles.map((item, index) => {
        const selected = selectedMuscle === item.muscle, status = rowStatus(item);
        const target = block.kind === 'workout' ? 0 : block.weeklySetBudget[item.muscle] ?? 0;
        return <View key={item.muscle} style={[index > 0 && styles.rowDivider, selected && styles.muscleSelected]}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected }}
            accessibilityLabel={`${muscleLabel(item.muscle)}. ${formatSets(item.completedSets)} recorded set credits. Plan ${formatSets(target)}. Range ${item.min} to ${item.max}. ${status.label}.`}
            onPress={() => selectMuscle(item.muscle, null)} style={styles.muscleRow}>
            <View style={styles.flex}>
              <Txt variant="caption" tone={selected ? 'accent' : 'primary'} numberOfLines={1} style={styles.muscleName}>{muscleLabel(item.muscle)}</Txt>
              {selected && selectedPart && partLabel(selectedPart) ? <Txt variant="caption" tone="secondary">{partLabel(selectedPart)}</Txt> : null}
            </View>
            <Txt variant="mono" tone={item.completedSets > item.max ? 'danger' : 'success'} style={styles.dose}>{formatSets(item.completedSets)}<Txt variant="mono" tone="muted" style={styles.metric}> / {formatSets(target)}</Txt></Txt>
            <Txt variant="mono" tone="secondary" style={styles.range}>{item.min}–{item.max}</Txt>
            <View style={styles.status}><Txt variant="mono" tone={status.tone} style={styles.statusText}>{status.label}</Txt><Ionicons name={status.icon} size={14} color={colors[status.tone]} /></View>
          </Pressable>
          {selected ? selectedExercises.map(({ exercise, sets }) => <Pressable key={exercise.id} accessibilityRole="button" accessibilityLabel={`Inspect ${exercise.name}`}
            onPress={() => setInspectedExercise(exercise)} style={styles.exerciseRow}>
            <Txt variant="caption" style={styles.flex}>{exercise.name}</Txt>
            <Txt variant="caption" tone="muted">{sets} {sets === 1 ? 'set' : 'sets'}</Txt>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>) : null}
        </View>;
      })}
      </View>
    </ScrollView>
    <ExerciseDetailsSheet exercise={inspectedExercise} onClose={() => setInspectedExercise(null)} />
    <Sheet visible={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Change remaining week">
      <RemainingWeekEditor state={state} apply={apply} notify={notify} />
    </Sheet>
  </View>;
};

const styles = StyleSheet.create({
  root:{flex:1,paddingTop:space.lg},flex:{flex:1,minWidth:0},heading:{flexDirection:'row',alignItems:'center',paddingHorizontal:space.lg,gap:space.sm},
  weeks:{flexGrow:0,flexShrink:0,marginTop:space.sm},weekPicker:{paddingHorizontal:space.lg,gap:space.sm},
  weekChoice:{minWidth:54,minHeight:TOUCH,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface},
  weekChoiceSelected:{borderColor:colors.accent,backgroundColor:colors.accentSoft},
  body:{marginTop:space.xs,paddingHorizontal:space.lg},
  listHeading:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:space.lg},clear:{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'},
  list:{flex:1},listContent:{paddingHorizontal:space.lg,paddingBottom:space.lg},
  table:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.surface,overflow:'hidden'},
  rowDivider:{borderTopWidth:1,borderTopColor:colors.border},muscleSelected:{backgroundColor:colors.accentSoft},
  muscleRow:{minHeight:48,flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:8,gap:6},
  muscleName:{fontSize:13,lineHeight:18,fontWeight:'700'},metric:{fontSize:11,lineHeight:16},
  dose:{width:48,fontSize:11,lineHeight:16},range:{width:40,fontSize:11,lineHeight:16,textAlign:'right'},
  status:{width:78,flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:4},statusText:{fontSize:11,lineHeight:16,fontWeight:'700'},
  exerciseRow:{minHeight:44,flexDirection:'row',alignItems:'center',paddingHorizontal:space.md,paddingVertical:space.sm,gap:space.sm,borderTopWidth:1,borderTopColor:colors.border},
  pressed:{opacity:0.7},
});
