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

type Props = {
  state: RuntimeState; block: TrainingBlock; status: WeeklyStatus;
  apply: (transform: (state: RuntimeState) => RuntimeState) => ApplyResult; notify: Notify;
};
const rowStatus = (item: WeeklyMuscleStatus) => ({
  tone: item.completedSets > item.max ? 'danger' as const : item.completedSets >= item.min ? 'success' as const : 'warning' as const,
});

/** Only performed sets feed Progress. Keep the body and the first muscle rows visible together. */
export const WeekSurface = ({ state, block, apply, notify }: Props) => {
  const { height: windowHeight } = useWindowDimensions();
  const [availableHeight, setAvailableHeight] = useState(0);
  const list = useRef<ScrollView>(null);
  const [selectedWeek, setSelectedWeek] = useState(block.currentWeek);
  const [expanded, setExpanded] = useState<'front' | 'back' | null>(null);
  const [selectedMuscle, setSelectedMuscle] = useState<Muscle | null>(null);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [inspectedExercise, setInspectedExercise] = useState<ExerciseDefinition | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const mapHeight = Math.max(150, Math.min(220, (availableHeight || windowHeight - 160) * 0.3));

  useEffect(() => { setSelectedWeek(block.currentWeek); }, [block.id, block.currentWeek]);
  useEffect(() => {
    setSelectedMuscle(null); setSelectedPart(null); setInspectedExercise(null);
    list.current?.scrollTo({ y: 0, animated: false });
  }, [selectedWeek, block.id]);

  const weekData = (week: number) => {
    const start = datePlusDays(block.startedOn, (week - 1) * 7), end = datePlusDays(start, 7);
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
      muscles: computeWeeklyStatus(block, sessions, results, week).muscles };
  };
  const weekCount = Math.max(block.durationWeeks, block.currentWeek);
  const weeks = useMemo(() => Array.from({ length: weekCount }, (_, i) => weekData(i + 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block, state.sessions, state.setResults, weekCount]);
  const recorded = weeks[selectedWeek - 1] ?? weekData(selectedWeek);
  const onTarget = (item: WeeklyMuscleStatus) => item.completedSets >= item.min;
  /** Share of muscles that reached the bottom of their weekly range. */
  const weekScore = (week: number) => {
    const ms = weeks[week - 1]?.muscles ?? [];
    return ms.length ? ms.filter(onTarget).length / ms.length : 0;
  };

  const muscleTones = useMemo(() => recorded.muscles.reduce<Partial<Record<Muscle, MuscleMapTone>>>((tones, item) => {
    if (item.completedSets > 0) tones[item.muscle] = item.completedSets > item.max ? 'danger' : onTarget(item) ? 'success' : 'warning';
    return tones;
  }, {}), [recorded]);
  const progressOf = (item: WeeklyMuscleStatus) => item.min > 0 ? item.completedSets / item.min : 1;
  const muscles = [...recorded.muscles].sort((a, b) => Number(b.muscle === selectedMuscle) - Number(a.muscle === selectedMuscle) || progressOf(a) - progressOf(b));
  const hit = recorded.muscles.filter(onTarget).length;
  const behind = [...recorded.muscles].filter((item) => !onTarget(item)).sort((a, b) => progressOf(a) - progressOf(b))[0];
  const selectMuscle = (muscle: Muscle, part: string | null) => {
    setSelectedMuscle(muscle); setSelectedPart(part === muscle ? null : part);
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
        accessibilityRole="radio" accessibilityLabel={`Week ${week}${week === block.currentWeek ? ', current week' : ''}, ${Math.round(weekScore(week) * 100)} percent of muscles on target`}
        accessibilityState={{ checked: week === selectedWeek }} onPress={() => setSelectedWeek(week)}
        style={({ pressed }) => [styles.weekChoice, week === selectedWeek && styles.weekChoiceSelected, pressed && styles.pressed]}>
        <Txt variant="code" tone={week === selectedWeek ? 'accent' : week > block.currentWeek ? 'muted' : 'secondary'}>W{week}</Txt>
        <View style={styles.weekTrack}><View style={[styles.weekFill, { width: `${Math.round(weekScore(week) * 100)}%` }]} /></View>
      </Pressable>)}
    </ScrollView>

    {/* Both sides at once: no flip needed, and about half the height of one large body. */}
    <View style={[styles.body, styles.bodies]}>
      {(['front', 'back'] as const).map(view => <View key={view} style={styles.flex}>
        <MuscleMap view={view} tones={muscleTones} selected={selectedMuscle} selectedPart={selectedPart}
          height={mapHeight} overview showZoom={false} onSelect={selectMuscle} onBackgroundPress={() => setExpanded(view)} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Open the ${view} muscle map full screen`} onPress={() => setExpanded(view)}
          hitSlop={10} style={({ pressed }) => [styles.expand, pressed && styles.pressed]}>
          <Ionicons name="expand-outline" size={16} color={colors.text} />
        </Pressable>
      </View>)}
    </View>
    <View style={styles.key} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {([['On target', colors.success], ['In progress', colors.warning], ['Over', colors.danger]] as const).map(([label, color]) =>
        <View key={label} style={styles.keyItem}><View style={[styles.keyDot, { backgroundColor: color }]} /><Txt variant="mono" tone="muted">{label}</Txt></View>)}
      <View style={styles.keyItem}><View style={[styles.keyDot, styles.keyDim]} /><Txt variant="mono" tone="muted">Not trained</Txt></View>
    </View>

    <View style={styles.listHeading}>
      <View style={styles.flex}>
        <Txt variant="caption" tone="secondary">{recorded.workouts} {recorded.workouts === 1 ? 'workout' : 'workouts'} · {recorded.sets} {recorded.sets === 1 ? 'set' : 'sets'} · <Txt variant="caption" tone={hit === recorded.muscles.length ? 'success' : 'primary'}>{hit}/{recorded.muscles.length} on target</Txt></Txt>
        {behind ? <Txt variant="caption" tone="muted" numberOfLines={1}>{muscleLabel(behind.muscle)} needs the most work</Txt> : null}
      </View>
      {selectedMuscle ? <Pressable accessibilityRole="button" accessibilityLabel="Clear muscle selection" onPress={() => { setSelectedMuscle(null); setSelectedPart(null); }} style={styles.clear}>
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </Pressable> : null}
    </View>
    <ScrollView ref={list} style={styles.list} contentContainerStyle={styles.listContent} accessibilityLabel="Recorded muscle progress">
      <View style={styles.table}>
      {muscles.map((item, index) => {
        const selected = selectedMuscle === item.muscle, status = rowStatus(item);
        const scale = Math.max(item.max * 1.15, item.completedSets, 1);
        const plain = item.completedSets > item.max ? `${formatSets(item.completedSets - item.max)} over` : onTarget(item) ? 'on target' : item.completedSets === 0 ? 'not started' : `${formatSets(item.min - item.completedSets)} to go`;
        const fillColor = item.completedSets > item.max ? colors.danger : onTarget(item) ? colors.success : colors.warning;
        const target = block.kind === 'workout' ? 0 : block.weeklySetBudget[item.muscle] ?? 0;
        return <View key={item.muscle} style={[index > 0 && styles.rowDivider, selected && styles.muscleSelected]}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected }}
            accessibilityLabel={`${muscleLabel(item.muscle)}. ${formatSets(item.completedSets)} sets this week. Target ${item.min} to ${item.max}. ${plain}.`}
            onPress={() => selectMuscle(item.muscle, null)} style={styles.muscleRow}>
            <View style={styles.flex}>
              <View style={styles.rowTop}>
                <Txt variant="caption" tone={selected ? 'accent' : 'primary'} numberOfLines={1} style={[styles.muscleName, styles.flex]}>{muscleLabel(item.muscle)}</Txt>
                <Txt variant="mono" tone={status.tone} style={styles.statusText}>{plain}</Txt>
              </View>
              {selected && selectedPart && partLabel(selectedPart) ? <Txt variant="caption" tone="secondary">{partLabel(selectedPart)}</Txt> : null}
              <View style={styles.barRow}>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${Math.min(1, item.completedSets / scale) * 100}%`, backgroundColor: fillColor }]} />
                  <View style={[styles.tick, { left: `${(item.min / scale) * 100}%` }]} />
                  <View style={[styles.tick, styles.tickMax, { left: `${(item.max / scale) * 100}%` }]} />
                </View>
                <Txt variant="mono" tone="muted" style={styles.metric}>{formatSets(item.completedSets)} / {item.min}–{item.max}{target > 0 ? ` · plan ${formatSets(target)}` : ''}</Txt>
              </View>
            </View>
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
    <Sheet visible={expanded !== null} onClose={() => setExpanded(null)} title="Muscle map" scrollable={false}>
      {expanded ? <MuscleMap view={expanded} onViewChange={setExpanded} tones={muscleTones} selected={selectedMuscle} selectedPart={selectedPart}
        height={Math.round(windowHeight * 0.62)} overview onSelect={selectMuscle} /> : null}
    </Sheet>
    <Sheet visible={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Change remaining week">
      <RemainingWeekEditor state={state} apply={apply} notify={notify} />
    </Sheet>
  </View>;
};

const styles = StyleSheet.create({
  root:{flex:1,paddingTop:space.lg},flex:{flex:1,minWidth:0},heading:{flexDirection:'row',alignItems:'center',paddingHorizontal:space.lg,gap:space.sm},
  weeks:{flexGrow:0,flexShrink:0,marginTop:space.sm},weekPicker:{paddingHorizontal:space.lg,gap:space.sm},
  weekChoice:{minWidth:50,minHeight:TOUCH,gap:4,paddingHorizontal:space.sm,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface},
  weekChoiceSelected:{borderColor:colors.accent,backgroundColor:colors.accentSoft},
  weekTrack:{width:28,height:3,borderRadius:2,overflow:'hidden',backgroundColor:colors.border},weekFill:{height:'100%',backgroundColor:colors.success},
  rowTop:{flexDirection:'row',alignItems:'center',gap:space.sm},barRow:{flexDirection:'row',alignItems:'center',gap:space.sm,marginTop:6},
  bar:{flex:1,height:6,borderRadius:3,backgroundColor:colors.surfaceRaised},
  barFill:{height:'100%',borderRadius:3},
  tick:{position:'absolute',top:-2,bottom:-2,width:2,marginLeft:-1,borderRadius:1,backgroundColor:colors.success},tickMax:{opacity:0.45},
  bodies:{flexDirection:'row',gap:space.sm},
  expand:{position:'absolute',top:6,right:6,width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(9,11,15,0.72)'},
  key:{flexDirection:'row',flexWrap:'wrap',gap:space.md,paddingHorizontal:space.lg,marginTop:space.sm},
  keyItem:{flexDirection:'row',alignItems:'center',gap:5},keyDot:{width:8,height:8,borderRadius:4},keyDim:{backgroundColor:colors.surfaceRaised,borderWidth:1,borderColor:colors.borderStrong},
  body:{marginTop:space.xs,paddingHorizontal:space.lg},
  listHeading:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:space.lg,paddingVertical:space.sm},clear:{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'},
  list:{flex:1},listContent:{paddingHorizontal:space.lg,paddingBottom:space.lg},
  table:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.surface,overflow:'hidden'},
  rowDivider:{borderTopWidth:1,borderTopColor:colors.border},muscleSelected:{backgroundColor:colors.accentSoft},
  muscleRow:{minHeight:56,flexDirection:'row',alignItems:'center',paddingHorizontal:space.md,paddingVertical:space.sm,gap:6},
  muscleName:{fontSize:13,lineHeight:18,fontWeight:'700'},metric:{fontSize:11,lineHeight:16},
  statusText:{fontSize:11,lineHeight:16,fontWeight:'700'},
  exerciseRow:{minHeight:44,flexDirection:'row',alignItems:'center',paddingHorizontal:space.md,paddingVertical:space.sm,gap:space.sm,borderTopWidth:1,borderTopColor:colors.border},
  pressed:{opacity:0.7},
});
