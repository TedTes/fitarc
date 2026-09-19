import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BlockPhase, Muscle, RuntimeState, TrainingBlock } from '../../runtime';
import { colors, space, TOUCH } from './theme';
import { Button, Card, Divider, Meter, ScreenBrand, Txt } from './ui';
import { exerciseName, formatSets, goalLabel, goalPlain, muscleLabel, muscleList, PHASE_COPY, slotPlain } from './copy';
import { committedSlotIds, phaseOfWeek } from './selectors';

type Props = {
  state: RuntimeState;
  block: TrainingBlock;
  sessionActive: boolean;
  onNextBlock: () => void;
};

type SlotState = 'committed' | 'active' | 'pending';

const SlotRow = ({ slot, state }: { slot: TrainingBlock['slots'][number]; state: SlotState }) => {
  const [open, setOpen] = useState(false);
  const sets = slot.plannedExercises.reduce((sum, plan) => sum + plan.sets, 0);
  const stateCopy = state === 'committed' ? '✓ committed' : state === 'active' ? '● active' : '○ pending';
  const tone = state === 'committed' ? 'success' : state === 'active' ? 'accent' : 'muted';
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${slot.label}, ${slotPlain(slot)}. ${stateCopy}. ${slot.plannedExercises.length} exercises, ${sets} physical sets.`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.slotRow, pressed && styles.pressed]}
      >
        <View style={styles.slotIdentity}>
          <Txt variant="code">{slot.label}</Txt>
          <Txt variant="caption" tone="secondary">{slotPlain(slot)} · {slot.plannedExercises.length} exercises · {sets} sets</Txt>
        </View>
        <Txt variant="label" tone={tone}>{stateCopy}</Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.slotBody}>
          <Txt variant="caption" tone="muted">emphasis · {muscleList(slot.targetMuscles)}</Txt>
          {slot.plannedExercises.map((plan) => (
            <View key={plan.exerciseId} style={styles.exerciseRow}>
              <Txt variant="caption" style={styles.flex}>{exerciseName(plan.exerciseId)}</Txt>
              <Txt variant="mono" tone="secondary">{plan.sets} sets</Txt>
              {plan.selection.substituted ? <Txt variant="label" tone="warning">swapped</Txt> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const PhaseRow = ({ phase, currentWeek }: { phase: BlockPhase; currentWeek: number }) => {
  const current = currentWeek >= phase.startWeek && currentWeek <= phase.endWeek;
  const past = currentWeek > phase.endWeek;
  const weeks = phase.startWeek === phase.endWeek ? `W${phase.startWeek}` : `W${phase.startWeek}–${phase.endWeek}`;
  const copy = PHASE_COPY[phase.kind];
  return (
    <View style={[styles.phaseRow, current && styles.phaseCurrent]} accessible accessibilityLabel={`${weeks}, ${copy.name}, ${current ? 'current' : past ? 'complete' : 'queued'}`}>
      <Txt variant="code" tone={current ? 'accent' : past ? 'success' : 'muted'} style={styles.phaseWeeks}>{weeks}</Txt>
      <View style={styles.flex}>
        <Txt variant="heading">{copy.name}</Txt>
        <Txt variant="caption" tone="secondary">{copy.plain}</Txt>
      </View>
      <Txt variant="label" tone={current ? 'accent' : past ? 'success' : 'muted'}>{current ? '● current' : past ? '✓ done' : '○ queued'}</Txt>
    </View>
  );
};

/** build.block: the compiled artifact. Inspectable, versioned, never edited by hand. */
export const BlockSurface = ({ state, block, sessionActive, onNextBlock }: Props) => {
  const [doseOpen, setDoseOpen] = useState(true);
  const source = state.source;
  const current = phaseOfWeek(block, block.currentWeek);
  const committed = committedSlotIds(state, block);
  const muscles = (Object.entries(block.weeklySetBudget) as Array<[Muscle, number]>).filter(([, sets]) => sets > 0);
  const atEnd = current.kind === 'deload';

  const confirmNextBlock = () => Alert.alert(
    'Compile the next block?',
    'Your current working weights become the new baseline. The pipeline restarts at accumulate, week 1. Committed history is kept.',
    [{ text: 'Not yet', style: 'cancel' }, { text: 'Compile next block', onPress: onNextBlock }]
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenBrand name="build.block" sub={`compiled artifact · v${block.version}`} />

      <View style={styles.section}>
        <Txt variant="label" tone="muted">SOURCE</Txt>
        <Card style={styles.sourceCard}>
          <Txt variant="heading">{goalLabel(block.goal)} <Txt variant="caption" tone="secondary">({goalPlain(block.goal)})</Txt></Txt>
          <Txt variant="code" tone="secondary">{source?.daysPerWeek} days/week · {source?.sessionMinutes} min/session</Txt>
        </Card>
        {(block.version > 1 ? state.lastBlockDiff.slice(0, 3) : []).map((line) => <Txt key={line} variant="mono" tone="muted">↻ {line}</Txt>)}
      </View>

      <View style={styles.section}>
        <Txt variant="label" tone="muted">PHASE PIPELINE</Txt>
        <Card style={styles.table}>
          {block.phases.map((phase, index) => (
            <View key={`${phase.kind}:${phase.startWeek}`}>
              {index > 0 ? <Divider /> : null}
              <PhaseRow phase={phase} currentWeek={block.currentWeek} />
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Txt variant="label" tone="muted">SESSION GRAPH</Txt>
          <Txt variant="caption" tone="muted">one slot per training day</Txt>
        </View>
        <Card style={styles.table}>
          {block.slots.map((slot, index) => {
            const slotState: SlotState = committed.has(slot.id) ? 'committed' : state.activeSession?.slotId === slot.id ? 'active' : 'pending';
            return (
              <View key={slot.id}>
                {index > 0 ? <Divider /> : null}
                <SlotRow slot={slot} state={slotState} />
              </View>
            );
          })}
        </Card>
      </View>

      <View style={styles.section}>
        <Pressable
          accessibilityRole="button" accessibilityState={{ expanded: doseOpen }}
          accessibilityLabel={`Volume contract for ${muscles.length} muscles`}
          onPress={() => setDoseOpen((value) => !value)} style={styles.doseHead}
        >
          <View style={styles.flex}>
            <Txt variant="label" tone="muted">VOLUME CONTRACT</Txt>
            <Txt variant="caption" tone="secondary">set credits per muscle · not total physical sets</Txt>
          </View>
          <Ionicons name={doseOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>
        {doseOpen ? (
          <Card style={styles.table}>
            {muscles.map(([muscle, sets], index) => {
              const target = block.weeklyTargets[muscle];
              const relation = sets < target.min
                ? `below range by ${formatSets(target.min - sets)}`
                : sets > target.max ? `above range by ${formatSets(sets - target.max)}` : 'inside range';
              const tone = sets < target.min || sets > target.max ? 'warning' : 'success';
              return (
                <View key={muscle}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.dose} accessible accessibilityLabel={`${muscleLabel(muscle)}: compiled target ${formatSets(sets)} set credits. Productive range ${target.min} to ${target.max}. ${relation}.`}>
                    <View style={styles.between}>
                      <Txt variant="heading">{muscleLabel(muscle)}</Txt>
                      <Txt variant="number">{formatSets(sets)} credits</Txt>
                    </View>
                    <Meter max={Math.max(target.max, sets) + 2} fills={[{ value: sets, color: colors.accent }]} band={{ from: target.min, to: target.max }} label={`${muscleLabel(muscle)} weekly set credits`} valueText={`Compiled target ${formatSets(sets)}. Productive range ${target.min} to ${target.max}.`} height={8} />
                    <View style={styles.between}>
                      <Txt variant="caption" tone="muted">productive range {target.min}–{target.max}</Txt>
                      <Txt variant="label" tone={tone}>{relation}</Txt>
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
        ) : null}
      </View>

      {atEnd ? <Button label="Compile next block" onPress={confirmNextBlock} disabled={sessionActive} hint={sessionActive ? 'Commit or discard the active session first' : undefined} /> : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.xl },
  section: { gap: space.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  sourceCard: { gap: space.xs },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
  table: { paddingVertical: space.xs, gap: 0 },
  phaseRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.xs },
  phaseCurrent: { borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: space.md, backgroundColor: colors.accentSoft },
  phaseWeeks: { width: 52 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: TOUCH + 12, paddingVertical: space.sm },
  slotIdentity: { flex: 1, gap: 2 },
  slotBody: { gap: space.xs, paddingBottom: space.md, paddingLeft: space.md, borderLeftWidth: 1, borderLeftColor: colors.borderStrong },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pressed: { opacity: 0.7 },
  doseHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: TOUCH },
  dose: { gap: space.sm, paddingVertical: space.md },
});
