import { scheduledOccurrences } from '../../runtime/sequence';
import { belongsToPlan, datePlusDays } from '../../runtime/planDates';
import { RemainingWeekEditor } from './RemainingWeekEditor';
import type { ApplyResult } from './useRuntimeController';
import type { Notify } from './constants';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { computeWeeklyStatus, RUNTIME_EXERCISES } from '../../runtime';
import type { ExerciseDefinition, Muscle, RuntimeState, TrainingBlock, WeeklyMuscleStatus, WeeklyStatus } from '../../runtime';
import { colors, radius, space, TOUCH } from './theme';
import { Card, Choice, Divider, Meter, ScreenBrand, Txt } from './ui';
import { formatSets, goalLabel, slotPlain, muscleLabel, PHASE_COPY } from './copy';
import { phaseOfWeek } from './selectors';
import { MuscleMap, type MuscleMapTone } from './MuscleMap';
import { liftsForPart, partLabel } from './muscleParts';
import { ExerciseDetailsSheet } from './ExerciseMuscles';
import { isMuscleVisible, viewForMuscle } from './muscleTargeting';

type Props = {
  state: RuntimeState;
  block: TrainingBlock;
  status: WeeklyStatus;
  apply: (transform: (state: RuntimeState) => RuntimeState) => ApplyResult;
  notify: Notify;
};

const DELOAD_CHECK = 80;
type WeekDisplayState = 'closed' | 'live' | 'upcoming';

const rowStatus = (item: WeeklyMuscleStatus, value: number) => {
  if (value > item.max) return { label: `${formatSets(value - item.max)} over`, tone: 'danger' as const, icon: 'arrow-up-circle' as const };
  if (value < item.min) return { label: `${formatSets(item.min - value)} under`, tone: 'warning' as const, icon: 'arrow-down-circle' as const };
  if (value >= item.max) return { label: 'high', tone: 'warning' as const, icon: 'arrow-up-circle-outline' as const };
  return { label: 'in range', tone: 'success' as const, icon: 'checkmark-circle-outline' as const };
};

/** Progress: a selectable block-week ledger of committed evidence and projected dose. */
export const WeekSurface = ({ state, block, status, apply, notify }: Props) => {
  const scroll = useRef<ScrollView>(null);
  const mapOffset = useRef(0);
  const [showForecast, setShowForecast] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(block.currentWeek);
  const [muscleView, setMuscleView] = useState<'front' | 'back'>('front');
  const [selectedMuscle, setSelectedMuscle] = useState<Muscle | null>(null);
  // One muscle inside the selected group (for example the lats within back). null means the whole group.
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [inspectedExercise, setInspectedExercise] = useState<ExerciseDefinition | null>(null);

  useEffect(() => {
    setSelectedWeek(block.currentWeek);
  }, [block.id, block.currentWeek]);

  const selectedStatus = useMemo(
    () => selectedWeek === block.currentWeek
      ? status
      : computeWeeklyStatus(block, state.sessions, state.setResults, selectedWeek),
    [block, selectedWeek, state.sessions, state.setResults, status]
  );
  const phase = phaseOfWeek(block, selectedWeek);
  const displayState: WeekDisplayState = selectedWeek < block.currentWeek
    ? 'closed'
    : selectedWeek > block.currentWeek ? 'upcoming' : selectedStatus.weekState === 'complete' ? 'closed' : 'live';
  const closed = displayState === 'closed';
  const relevant = new Set(block.slots.flatMap((slot) => slot.targetMuscles));
  const muscles = selectedStatus.muscles.filter((item) => block.scheduling || relevant.has(item.muscle));
  const highFatigue = selectedStatus.fatiguePercent >= DELOAD_CHECK;
  const sessionTone = closed ? colors.success : displayState === 'live' ? colors.accent : colors.textMuted;
  const sessionIcon = closed ? 'checkmark-circle' : displayState === 'live' ? 'radio-button-on' : 'time-outline';
  const muscleTones = useMemo(() => muscles.reduce<Partial<Record<Muscle, MuscleMapTone>>>((result, item) => {
    const value = closed || !showForecast ? item.completedSets : item.projectedSets ?? item.completedSets;
    result[item.muscle] = rowStatus(item, value).tone;
    return result;
  }, {}), [closed, muscles, showForecast]);
  const weekStart = datePlusDays(block.startedOn, (selectedWeek - 1) * 7);
  const completedSlots = new Set(state.sessions.filter((item) => belongsToPlan(item, block) && item.status === 'committed' && item.context.date >= weekStart && item.context.date < datePlusDays(weekStart, 7)).map((item) => item.slotId));
  const remainingWindows = block.remainingWeek?.week === selectedWeek ? block.remainingWeek.windows.filter((item) => !completedSlots.has(item.slotId)) : undefined;
  const plannedExerciseIds = new Set(block.scheduling ? scheduledOccurrences(block,state.sessions,selectedWeek).flatMap(({slot,workout})=>workout ? workout.exercises.map(x=>x.exercise.id) : slot.plannedExercises.map(x=>x.exerciseId)) : remainingWindows ? remainingWindows.flatMap((window) => window.workout.exercises.map((entry) => entry.exercise.id)) : block.slots.filter((slot) => !completedSlots.has(slot.id)).flatMap((slot) => slot.plannedExercises.map((item) => item.exerciseId)));
  const recordedExerciseIds = new Set(state.sessions.filter(item=>belongsToPlan(item,block) && item.context.date>=weekStart && item.context.date<datePlusDays(weekStart,7)).flatMap(item=>item.exercises.filter(entry=>entry.sets.some(set=>set.status==='completed' && (set.result?.completedReps ?? 0)>0)).map(entry=>entry.exercise.id)));
  const visibleExerciseIds = showForecast && !closed ? new Set([...recordedExerciseIds,...plannedExerciseIds]) : recordedExerciseIds;
  const selectedPartName = selectedPart ? partLabel(selectedPart) : null;
  const selectedExercises = useMemo(() => {
    if (!selectedMuscle) return [];
    if (selectedPart && selectedPartName) {
      return liftsForPart(selectedPart, visibleExerciseIds, block.catalog).flatMap((lift) => {
        const exercise = (block.catalog ?? RUNTIME_EXERCISES).find((item) => item.name === lift.name);
        return exercise ? [{ exercise, assist: lift.role === 'assist' }] : [];
      });
    }
    return (block.catalog ?? RUNTIME_EXERCISES).filter((exercise) => visibleExerciseIds.has(exercise.id)
      && (exercise.primaryMuscles.includes(selectedMuscle) || exercise.secondaryMuscles.includes(selectedMuscle)))
      .map((exercise) => ({ exercise, assist: !exercise.primaryMuscles.includes(selectedMuscle) }));
  }, [block.catalog, visibleExerciseIds, selectedMuscle, selectedPart, selectedPartName]);
  const selectedDose = muscles.find((item) => item.muscle === selectedMuscle);

  return (
    <ScrollView ref={scroll} contentContainerStyle={styles.page}>
      <ScreenBrand
        name="Progress"
        sub={block.scheduling ? `Routine · week ${displayState}` : `${PHASE_COPY[phase.kind].name} · week ${displayState}`}
        chip={`${goalLabel(block.goal)} · week ${selectedWeek}`}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekPicker}
        accessibilityRole="radiogroup"
        accessibilityLabel="Select training week"
      >
        {Array.from({ length: block.scheduling ? Math.max(6,block.currentWeek+1) : block.durationWeeks }, (_, index) => index + 1).map((week) => {
          const selected = week === selectedWeek;
          const current = week === block.currentWeek;
          return (
            <Pressable
              key={week}
              accessibilityRole="radio"
              accessibilityLabel={`Week ${week}${current ? ', current week' : ''}`}
              accessibilityState={{ checked: selected }}
              onPress={() => setSelectedWeek(week)}
              style={({ pressed }) => [styles.weekChoice, selected && styles.weekChoiceSelected, pressed && styles.pressed]}
            >
              <Txt variant="code" tone={selected ? 'accent' : 'secondary'}>W{week}</Txt>
              {current ? <View style={[styles.currentDot, selected && styles.currentDotSelected]} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Card style={styles.sessionSummary}>
        <Ionicons name={sessionIcon} size={25} color={sessionTone} />
        <Txt variant="heading" style={styles.flex}>
          {selectedStatus.sessionsLogged} of {selectedStatus.totalSessions} workouts finished
        </Txt>
        <Txt variant="label" tone={closed ? 'success' : displayState === 'live' ? 'accent' : 'muted'}>
          {displayState === 'closed' ? 'week closed' : displayState === 'live' ? 'week live' : 'upcoming'}
        </Txt>
      </Card>

      {selectedWeek === block.currentWeek ? <RemainingWeekEditor state={state} apply={apply} notify={notify} /> : null}
      {block.scheduling ? <Txt variant="caption" tone="secondary">Each recorded set with reps counts as 1 for primary muscles and 0.5 for secondary muscles. This shows training exposure, not measured recovery or growth. Weekly target ranges are estimates.</Txt> : null}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:space.sm}}>
        <Choice compact label="Completed" selected={!showForecast} onPress={()=>setShowForecast(false)} />
        <Choice compact label="Completed + planned" selected={showForecast} onPress={()=>setShowForecast(true)} />
      </View>
      <View onLayout={(event) => { mapOffset.current = event.nativeEvent.layout.y; }}>
      <Card style={styles.mapCard}>
        <View style={styles.mapHeader}>
          <View style={styles.flex}>
            <Txt variant="label" tone="muted">MUSCLE MAP</Txt>
            <Txt variant="caption" tone="secondary">{closed || !showForecast ? 'recorded training' : 'recorded + planned training'} · tap a muscle</Txt>
          </View>
          <View style={styles.viewSwitch} accessibilityRole="radiogroup" accessibilityLabel="Muscle map view">
            {(['front', 'back'] as const).map((view) => (
              <Pressable
                key={view}
                accessibilityRole="radio"
                accessibilityState={{ checked: muscleView === view }}
                onPress={() => {
                  setMuscleView(view);
                  if (selectedMuscle && !isMuscleVisible(selectedMuscle, view)) { setSelectedMuscle(null); setSelectedPart(null); }
                }}
                style={({ pressed }) => [styles.viewChoice, muscleView === view && styles.viewChoiceActive, pressed && styles.pressed]}
              >
                <Txt variant="label" tone={muscleView === view ? 'accent' : 'muted'}>{view}</Txt>
              </Pressable>
            ))}
          </View>
        </View>
        <MuscleMap
          view={muscleView} tones={muscleTones} selected={selectedMuscle} selectedPart={selectedPart}
          overview
          onSelect={(muscle, part) => { setSelectedMuscle(muscle); setSelectedPart(part === muscle ? null : part); }}
        />
        <View style={styles.mapLegend}>
          <Legend color={colors.success} label="in range" />
          <Legend color={colors.warning} label="under / high" />
          <Legend color={colors.danger} label="over" />
        </View>
        <Divider />
        <View style={styles.mapSelection}>
          <View style={styles.selectionHeader}>
          <Txt variant="label" tone={selectedMuscle ? 'accent' : 'muted'}>
            {selectedMuscle ? (selectedPartName ?? muscleLabel(selectedMuscle)).toUpperCase() : 'SELECT A MUSCLE'}
          </Txt>
          {selectedMuscle ? <Pressable accessibilityRole="button" accessibilityLabel="Show volume for all muscles"
            onPress={() => { setSelectedMuscle(null); setSelectedPart(null); }} style={styles.clearSelection}>
            <Txt variant="mono" tone="secondary">all muscles</Txt>
          </Pressable> : null}
          </View>
          {selectedDose ? <Txt variant="caption" tone="secondary">
            {formatSets(selectedDose.completedSets)} logged{closed ? '' : ` · ${formatSets(selectedDose.scheduledSets ?? 0)} remaining planned`} · range {selectedDose.min}–{selectedDose.max} set credits
          </Txt> : null}
          <Txt variant="caption" tone="secondary" numberOfLines={3}>
            {selectedMuscle
              ? selectedExercises.length
                ? 'Exercises in this view · tap to inspect'
                : selectedPartName ? 'No exercise in this view targets this muscle directly.' : 'No exercise in this view targets this muscle.'
              : 'See the recorded or planned exercises that train each region.'}
          </Txt>
          <Txt variant="caption" tone="muted">Set credits estimate training volume, not muscle growth or measured recovery.</Txt>
          {showForecast && selectedMuscle && remainingWindows ? remainingWindows.filter((window) => window.workout.exercises.some((entry) => entry.exercise.primaryMuscles.includes(selectedMuscle) || entry.exercise.secondaryMuscles.includes(selectedMuscle))).map((window) => <Txt key={window.date} variant="caption" tone="secondary">{window.date}: {window.workout.exercises.filter((entry) => entry.exercise.primaryMuscles.includes(selectedMuscle) || entry.exercise.secondaryMuscles.includes(selectedMuscle)).map((entry) => `${entry.exercise.name} (${entry.sets.length} sets)`).join(', ')}</Txt>) : null}
          {showForecast && selectedMuscle && !remainingWindows ? block.slots.filter((slot) => !completedSlots.has(slot.id) && slot.plannedExercises.some((item) => selectedExercises.some((entry) => entry.exercise.id === item.exerciseId))).map((slot) => <Txt key={slot.id} variant="caption" tone="secondary">{slotPlain(slot)}: {slot.plannedExercises.filter((item) => selectedExercises.some((entry) => entry.exercise.id === item.exerciseId)).map((item) => `${(block.catalog ?? RUNTIME_EXERCISES).find((exercise) => exercise.id === item.exerciseId)?.name} (${item.sets} sets)`).join(', ')}</Txt>) : null}
          {selectedExercises.map(({ exercise, assist }) => (
            <Pressable key={exercise.id} accessibilityRole="button" accessibilityLabel={`Inspect ${exercise.name}${assist ? ', assisting lift' : ''}`}
              onPress={() => setInspectedExercise(exercise)} style={({ pressed }) => [styles.relatedLift, pressed && styles.pressed]}>
              <Txt variant="caption" style={styles.flex}>{exercise.name}{assist ? ' · assist' : ''}</Txt>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
          {selectedPartName ? (
            <Txt variant="caption" tone="muted">Part of {muscleLabel(selectedMuscle as Muscle).toLowerCase()}. Sets are counted for the whole group.</Txt>
          ) : null}
        </View>
      </Card>
      </View>

      <Card style={styles.table}>
        <View style={styles.tableHeader} accessible>
          <Txt variant="label" tone="muted" style={styles.muscleName}>MUSCLE</Txt>
          <Txt variant="label" tone="muted" style={styles.doseColumn}>DOSE / PLAN</Txt>
          <Txt variant="label" tone="muted" style={styles.rangeColumn}>RANGE</Txt>
          <Txt variant="label" tone="muted" style={styles.stateHeader}>STATE</Txt>
        </View>
        <Divider />
        {muscles.map((item, index) => {
          const plan = block.weeklySetBudget[item.muscle] ?? 0;
          const value = closed || !showForecast ? item.completedSets : item.projectedSets ?? item.completedSets;
          const stateCopy = rowStatus(item, value);
          const doseTone = value > item.max ? 'danger' : value < plan ? 'warning' : 'success';
          return (
            <View key={item.muscle}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => {
                  setSelectedMuscle(item.muscle); setSelectedPart(null);
                  setMuscleView((view) => viewForMuscle(item.muscle, view));
                  scroll.current?.scrollTo({ y: mapOffset.current, animated: true });
                }}
                style={({ pressed }) => [styles.muscleRow, selectedMuscle === item.muscle && styles.muscleRowSelected, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${muscleLabel(item.muscle)}. ${formatSets(value)} of ${formatSets(plan)} planned set credits. Productive range ${item.min} to ${item.max}. ${stateCopy.label}.`}
              >
                <Txt variant="caption" style={[styles.muscleName, styles.muscleLabel]} numberOfLines={1}>{muscleLabel(item.muscle)}</Txt>
                <View style={styles.doseColumn}>
                  <Txt variant="mono" tone={doseTone} style={styles.doseValue}>{formatSets(value)}<Txt variant="mono" tone="muted"> / {formatSets(plan)}</Txt></Txt>
                  {!closed && item.completedSets > 0 ? <Txt variant="caption" tone="muted">{formatSets(item.completedSets)} done</Txt> : null}
                </View>
                <Txt variant="mono" tone="secondary" style={styles.rangeColumn}>{item.min}–{item.max}</Txt>
                <View style={styles.stateColumn}>
                  <Txt variant="label" tone={stateCopy.tone} numberOfLines={1}>{stateCopy.label}</Txt>
                  <Ionicons name={stateCopy.icon} size={19} color={colors[stateCopy.tone]} />
                </View>
              </Pressable>
            </View>
          );
        })}
      </Card>

      <Card tone={highFatigue ? 'warning' : undefined} style={styles.fatigueCard}>
        <View style={[styles.fatigueIcon, { borderColor: highFatigue ? colors.warning : colors.accent }]}>
          <Ionicons name="battery-half" size={22} color={highFatigue ? colors.warning : colors.accent} />
        </View>
        <View style={styles.fatigueCopy}>
          <View style={styles.fatigueTitle}>
            <Txt variant="display" tone={highFatigue ? 'warning' : 'accent'}>{selectedStatus.fatiguePercent}%</Txt>
            <Txt variant="label" tone={highFatigue ? 'warning' : 'secondary'}>workload estimate</Txt>
          </View>
          <Txt variant="caption" tone="secondary">
            {phase.kind === 'deload'
              ? 'Scheduled recovery week · load and volume are capped.'
              : selectedStatus.deloadRecommended
                ? 'Recovery threshold reached · deload rules apply next.'
                : displayState === 'upcoming'
                  ? 'No training workload recorded for this week yet.'
              : `${selectedStatus.headroomSessions} session${selectedStatus.headroomSessions === 1 ? '' : 's'} of headroom before this week closes.`}
          </Txt>
          <Meter
            max={100}
            fills={[{ value: selectedStatus.fatiguePercent, color: highFatigue ? colors.warning : colors.accent }]}
            ticks={[DELOAD_CHECK]}
            label="Fatigue budget used"
            valueText={`${selectedStatus.fatiguePercent} percent used`}
            height={7}
          />
        </View>
      </Card>
      <ExerciseDetailsSheet exercise={inspectedExercise} onClose={() => setInspectedExercise(null)} />
    </ScrollView>
  );
};

const Legend = ({ color, label }: { color: string; label: string }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendDot, { backgroundColor: color }]} />
    <Txt variant="caption" tone="muted">{label}</Txt>
  </View>
);

const styles = StyleSheet.create({
  selectionHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  clearSelection: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: space.sm },
  relatedLift: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: space.sm },
  flex: { flex: 1 },
  page: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.md },
  weekPicker: { gap: space.sm, paddingVertical: 2 },
  weekChoice: {
    minWidth: 54, minHeight: TOUCH, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, gap: 3,
  },
  weekChoiceSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  currentDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textMuted },
  currentDotSelected: { backgroundColor: colors.accent },
  sessionSummary: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  mapCard: { paddingBottom: space.md, gap: space.sm },
  mapHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  viewSwitch: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  viewChoice: { minWidth: 58, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  viewChoiceActive: { backgroundColor: colors.accentSoft },
  mapLegend: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  mapSelection: { gap: space.xs, minHeight: 42 },
  table: { paddingVertical: 0, gap: 0 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 38, gap: space.sm },
  muscleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 58, gap: space.sm },
  muscleRowSelected: { backgroundColor: colors.accentSoft, marginHorizontal: -space.md, paddingHorizontal: space.md },
  muscleName: { flex: 1, minWidth: 70 },
  muscleLabel: { fontWeight: '700' },
  doseValue: { fontWeight: '700' },
  doseColumn: { width: 76 },
  rangeColumn: { width: 42, textAlign: 'center' },
  stateHeader: { width: 86, textAlign: 'right' },
  stateColumn: { width: 86, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space.xs },
  fatigueCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  fatigueIcon: { width: 48, height: 48, borderWidth: 2, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  fatigueCopy: { flex: 1, gap: space.xs },
  fatigueTitle: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  pressed: { opacity: 0.7 },
});
