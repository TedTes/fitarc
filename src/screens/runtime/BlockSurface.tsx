import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { RuntimeState, TrainingBlock } from '../../runtime';
import { colors, space } from './theme';
import { Button, Divider, ScreenBrand, Txt } from './ui';
import { exerciseName, muscleList, PHASE_COPY } from './copy';
import { committedSlotIds, phaseOfWeek } from './selectors';

type Props = {
  state: RuntimeState;
  block: TrainingBlock;
  sessionActive: boolean;
  onNextBlock: () => void;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const PHASE_SHORT = { accumulate: 'acc', intensify: 'int', peak: 'peak', deload: 'deload' } as const;

/** build.block: the compiled artifact. Inspectable, versioned, never edited by hand. */
export const BlockSurface = ({ state, block, sessionActive, onNextBlock }: Props) => {
  const { height: windowHeight } = useWindowDimensions();
  const slotReel = useRef<ScrollView>(null);
  const details = useRef<ScrollView>(null);
  const current = phaseOfWeek(block, block.currentWeek);
  const committed = committedSlotIds(state, block);
  const atEnd = current.kind === 'deload';
  const rowHeight = Math.round(clamp(windowHeight * 0.075, 52, 70));
  const exerciseRowHeight = Math.round(clamp(windowHeight * 0.09, 58, 82));
  const focusSlotId = state.activeSession?.slotId
    ?? block.slots.find((slot) => !committed.has(slot.id))?.id
    ?? [...state.sessions].reverse().find((session) => session.blockId === block.id && session.status === 'committed')?.slotId
    ?? block.slots[0]?.id;
  const [selectedSlotId, setSelectedSlotId] = useState(focusSlotId);
  const selectedIndex = Math.max(0, block.slots.findIndex((slot) => slot.id === selectedSlotId));
  const selectedSlot = block.slots[selectedIndex] ?? block.slots[0];
  const reelRows = Math.min(3, block.slots.length);
  const selectedSets = selectedSlot?.plannedExercises.reduce((sum, plan) => sum + plan.sets, 0) ?? 0;

  const reelOffset = useMemo(() => {
    const firstVisible = clamp(selectedIndex - 1, 0, Math.max(0, block.slots.length - reelRows));
    return firstVisible * rowHeight;
  }, [block.slots.length, reelRows, rowHeight, selectedIndex]);

  useEffect(() => {
    setSelectedSlotId(focusSlotId);
  }, [block.id, focusSlotId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      slotReel.current?.scrollTo({ y: reelOffset, animated: true });
      details.current?.scrollTo({ y: 0, animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [reelOffset, selectedSlotId]);

  const confirmNextBlock = () => Alert.alert(
    'Compile the next block?',
    'Your current working weights become the new baseline. The pipeline restarts at accumulate, week 1. Committed history is kept.',
    [{ text: 'Not yet', style: 'cancel' }, { text: 'Compile next block', onPress: onNextBlock }]
  );

  if (!selectedSlot) return null;

  return (
    <View style={styles.page}>
      <ScreenBrand name="build.block" />

      <View style={styles.phaseStrip}>
        {block.phases.map((phase) => {
          const isCurrent = block.currentWeek >= phase.startWeek && block.currentWeek <= phase.endWeek;
          const weeks = phase.startWeek === phase.endWeek ? `W${phase.startWeek}` : `W${phase.startWeek}–${phase.endWeek}`;
          return (
            <View key={`${phase.kind}:${phase.startWeek}`} style={styles.phaseItem} accessible accessibilityLabel={`${weeks}, ${PHASE_COPY[phase.kind].name}${isCurrent ? ', current phase' : ''}`}>
              {isCurrent ? <View style={styles.phaseDot} /> : null}
              <Txt variant="mono" tone={isCurrent ? 'accent' : 'secondary'}>{weeks} {PHASE_SHORT[phase.kind]}</Txt>
            </View>
          );
        })}
      </View>

      <View style={styles.workspace}>
        <View style={styles.sessionsSection}>
          <View style={styles.reelMeta}>
            <Txt variant="label" tone="muted">SLOTS</Txt>
            <Txt variant="mono" tone="secondary">{selectedIndex + 1} / {block.slots.length}</Txt>
          </View>
          <ScrollView
            ref={slotReel}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            decelerationRate="fast"
            snapToInterval={rowHeight}
            style={[styles.slotViewport, { height: reelRows * rowHeight }]}
            accessibilityLabel="Weekly sessions. Scroll vertically and select a training day."
          >
            {block.slots.map((slot) => {
              const selected = slot.id === selectedSlot.id;
              const active = state.activeSession?.slotId === slot.id;
              const done = committed.has(slot.id);
              const stateLabel = active ? '▶ active' : selected ? '▶ view' : done ? '✓ done' : 'planned';
              const stateTone = active || selected ? 'accent' : done ? 'success' : 'secondary';
              const visibleMuscles = slot.targetMuscles.slice(0, 3);
              const hiddenMuscles = slot.targetMuscles.length - visibleMuscles.length;
              return (
                <Pressable
                  key={slot.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${slot.label}, ${done ? 'completed' : active ? 'active' : 'planned'}`}
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedSlotId(slot.id)}
                  style={({ pressed }) => [styles.slotRow, { height: rowHeight }, selected && styles.slotRowSelected, pressed && styles.pressed]}
                >
                  <Txt variant="label" tone={stateTone} style={styles.slotState}>{stateLabel}</Txt>
                  <View style={styles.slotName}>
                    <Txt variant="code" numberOfLines={1}>{slot.label}</Txt>
                    <Txt variant="caption" tone="muted" numberOfLines={1}>{muscleList(visibleMuscles)}{hiddenMuscles > 0 ? ` +${hiddenMuscles}` : ''}</Txt>
                  </View>
                  {selected && done ? <Txt variant="label" tone="success" accessibilityLabel="Completed">✓</Txt> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <Divider />

        <View style={styles.detailsSection}>
          <ScrollView
            ref={details}
            style={styles.detailsViewport}
            contentContainerStyle={styles.detailsContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <View style={styles.workoutMeta}>
              <Txt variant="label" tone="muted">{selectedSlot.plannedExercises.length} LIFTS</Txt>
              <Txt variant="mono" tone="secondary">{selectedSets} sets</Txt>
            </View>
            {selectedSlot.plannedExercises.map((plan, index) => (
              <View key={`${plan.exerciseId}:${index}`} style={[styles.exerciseRow, { minHeight: exerciseRowHeight }]}>
                <Txt variant="mono" tone="muted" style={styles.exerciseNumber}>{index + 1}</Txt>
                <View style={styles.exerciseIdentity}>
                  <Txt variant="caption">{exerciseName(plan.exerciseId)}</Txt>
                  <Txt variant="mono" tone="muted">{plan.sets} × {current.minReps}–{current.maxReps} · RIR {current.targetRir}</Txt>
                </View>
                {plan.selection.substituted ? <Txt variant="heading" tone="warning" accessible accessibilityLabel="Substituted exercise">↔</Txt> : null}
              </View>
            ))}
            {atEnd ? (
              <Button
                label="Compile next block"
                onPress={confirmNextBlock}
                disabled={sessionActive}
                hint={sessionActive ? 'Commit or discard the active session first' : undefined}
                style={styles.nextBlockButton}
              />
            ) : null}
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0, padding: space.lg, paddingBottom: space.md, gap: space.md },
  phaseStrip: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  phaseItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  phaseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  workspace: { flex: 1, minHeight: 0 },
  sessionsSection: { gap: space.xs },
  reelMeta: { minHeight: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  slotViewport: { backgroundColor: colors.surface },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  slotRowSelected: { backgroundColor: colors.accentSoft, borderLeftWidth: 4, borderLeftColor: colors.accent },
  slotState: { width: 64 },
  slotName: { flex: 1, minWidth: 0 },
  detailsSection: { flex: 1, minHeight: 0 },
  detailsViewport: { flex: 1 },
  detailsContent: { flexGrow: 1 },
  workoutMeta: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  exerciseNumber: { width: 20 },
  exerciseIdentity: { flex: 1, minWidth: 0, gap: 2 },
  nextBlockButton: { marginTop: space.md },
  pressed: { opacity: 0.7 },
});
