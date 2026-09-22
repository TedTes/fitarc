import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { computeWeeklyStatus, RUNTIME_EXERCISES } from '../../runtime';
import type { Muscle, RuntimeState, TrainingBlock, WeeklyMuscleStatus, WeeklyStatus } from '../../runtime';
import { colors, radius, space, TOUCH } from './theme';
import { Card, Divider, Meter, ScreenBrand, Txt } from './ui';
import { formatSets, goalLabel, muscleLabel, PHASE_COPY } from './copy';
import { phaseOfWeek } from './selectors';
import { MuscleMap, type MuscleMapTone } from './MuscleMap';
import { liftsForPart, partLabel } from './muscleParts';

type Props = {
  state: RuntimeState;
  block: TrainingBlock;
  status: WeeklyStatus;
};

const DELOAD_CHECK = 80;
type WeekDisplayState = 'closed' | 'live' | 'upcoming';

const rowStatus = (item: WeeklyMuscleStatus, value: number) => {
  if (value > item.max) return { label: `${formatSets(value - item.max)} over`, tone: 'danger' as const, icon: 'arrow-up-circle' as const };
  if (value < item.min) return { label: `${formatSets(item.min - value)} under`, tone: 'warning' as const, icon: 'arrow-down-circle' as const };
  if (value >= item.max) return { label: 'high', tone: 'warning' as const, icon: 'arrow-up-circle-outline' as const };
  return { label: 'in range', tone: 'success' as const, icon: 'checkmark-circle-outline' as const };
};

/** status/week: a selectable block-week ledger of committed evidence and projected dose. */
export const WeekSurface = ({ state, block, status }: Props) => {
  const [selectedWeek, setSelectedWeek] = useState(block.currentWeek);
  const [muscleView, setMuscleView] = useState<'front' | 'back'>('front');
  const [selectedMuscle, setSelectedMuscle] = useState<Muscle | null>(null);
  // One muscle inside the selected group (for example the lats within back). null means the whole group.
  const [selectedPart, setSelectedPart] = useState<string | null>(null);

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
  const muscles = selectedStatus.muscles.filter((item) => relevant.has(item.muscle));
  const highFatigue = selectedStatus.fatiguePercent >= DELOAD_CHECK;
  const sessionTone = closed ? colors.success : displayState === 'live' ? colors.accent : colors.textMuted;
  const sessionIcon = closed ? 'checkmark-circle' : displayState === 'live' ? 'radio-button-on' : 'time-outline';
  const muscleTones = useMemo(() => muscles.reduce<Partial<Record<Muscle, MuscleMapTone>>>((result, item) => {
    const value = closed ? item.completedSets : item.projectedSets ?? item.completedSets;
    result[item.muscle] = rowStatus(item, value).tone;
    return result;
  }, {}), [closed, muscles]);
  const plannedExerciseIds = useMemo(
    () => new Set(block.slots.flatMap((slot) => slot.plannedExercises.map((item) => item.exerciseId))),
    [block]
  );
  const selectedPartName = selectedPart ? partLabel(selectedPart) : null;
  const selectedExercises = useMemo(() => {
    if (!selectedMuscle) return [];
    if (selectedPart && selectedPartName) {
      return liftsForPart(selectedPart, plannedExerciseIds).map((lift) => (lift.role === 'assist' ? `${lift.name} (assist)` : lift.name));
    }
    return RUNTIME_EXERCISES.filter((exercise) => plannedExerciseIds.has(exercise.id)
      && (exercise.primaryMuscles.includes(selectedMuscle) || exercise.secondaryMuscles.includes(selectedMuscle)))
      .map((exercise) => exercise.name);
  }, [plannedExerciseIds, selectedMuscle, selectedPart, selectedPartName]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenBrand
        name="status/week"
        sub={`${PHASE_COPY[phase.kind].name} · week ${displayState}`}
        chip={`${goalLabel(block.goal)} · wk ${selectedWeek}/${block.durationWeeks}`}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekPicker}
        accessibilityRole="radiogroup"
        accessibilityLabel="Select block week"
      >
        {Array.from({ length: block.durationWeeks }, (_, index) => index + 1).map((week) => {
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
          {selectedStatus.sessionsLogged} of {selectedStatus.totalSessions} sessions logged
        </Txt>
        <Txt variant="label" tone={closed ? 'success' : displayState === 'live' ? 'accent' : 'muted'}>
          {displayState === 'closed' ? 'week closed' : displayState === 'live' ? 'week live' : 'upcoming'}
        </Txt>
      </Card>

      <Card style={styles.mapCard}>
        <View style={styles.mapHeader}>
          <View style={styles.flex}>
            <Txt variant="label" tone="muted">MUSCLE MAP</Txt>
            <Txt variant="caption" tone="secondary">weekly dose · tap a muscle</Txt>
          </View>
          <View style={styles.viewSwitch} accessibilityRole="radiogroup" accessibilityLabel="Muscle map view">
            {(['front', 'back'] as const).map((view) => (
              <Pressable
                key={view}
                accessibilityRole="radio"
                accessibilityState={{ checked: muscleView === view }}
                onPress={() => setMuscleView(view)}
                style={({ pressed }) => [styles.viewChoice, muscleView === view && styles.viewChoiceActive, pressed && styles.pressed]}
              >
                <Txt variant="label" tone={muscleView === view ? 'accent' : 'muted'}>{view}</Txt>
              </Pressable>
            ))}
          </View>
        </View>
        <MuscleMap
          view={muscleView} tones={muscleTones} selected={selectedMuscle} selectedPart={selectedPart}
          onSelect={(muscle, part) => { setSelectedMuscle(muscle); setSelectedPart(part === muscle ? null : part); }}
        />
        <View style={styles.mapLegend}>
          <Legend color={colors.success} label="in range" />
          <Legend color={colors.warning} label="under" />
          <Legend color={colors.danger} label="over" />
        </View>
        <Divider />
        <View style={styles.mapSelection}>
          <Txt variant="label" tone={selectedMuscle ? 'accent' : 'muted'}>
            {selectedMuscle ? (selectedPartName ?? muscleLabel(selectedMuscle)).toUpperCase() : 'SELECT A MUSCLE'}
          </Txt>
          <Txt variant="caption" tone="secondary" numberOfLines={3}>
            {selectedMuscle
              ? selectedExercises.length
                ? selectedExercises.join(' · ')
                : selectedPartName ? 'No compiled lift targets this muscle directly.' : 'No compiled lift targets this muscle.'
              : 'See the lifts in this block that train each region.'}
          </Txt>
          {selectedPartName ? (
            <Txt variant="caption" tone="muted">Part of {muscleLabel(selectedMuscle as Muscle).toLowerCase()}. Sets are counted for the whole group.</Txt>
          ) : null}
        </View>
      </Card>

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
          const value = closed ? item.completedSets : item.projectedSets ?? item.completedSets;
          const stateCopy = rowStatus(item, value);
          const doseTone = value > item.max ? 'danger' : value < plan ? 'warning' : 'success';
          return (
            <View key={item.muscle}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => { setSelectedMuscle(item.muscle); setSelectedPart(null); }}
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
            <Txt variant="label" tone={highFatigue ? 'warning' : 'secondary'}>fatigue</Txt>
          </View>
          <Txt variant="caption" tone="secondary">
            {phase.kind === 'deload'
              ? 'Scheduled recovery week · load and volume are capped.'
              : selectedStatus.deloadRecommended
                ? 'Recovery threshold reached · deload rules apply next.'
                : displayState === 'upcoming'
                  ? 'No fatigue recorded for this week yet.'
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
