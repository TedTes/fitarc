import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { RuntimeState, TrainingBlock } from '../../runtime';
import { colors, space } from './theme';
import { Button, Card, Divider, ScreenBrand, Txt } from './ui';
import { exerciseName, muscleList, PHASE_COPY, slotPlain } from './copy';
import { committedSlotIds, phaseOfWeek } from './selectors';

type Props = {
  state: RuntimeState;
  block: TrainingBlock;
  sessionActive: boolean;
  onNextBlock: () => void;
};

const SlotDetails = ({ slot, width }: { slot: TrainingBlock['slots'][number]; width: number }) => {
  const sets = slot.plannedExercises.reduce((sum, plan) => sum + plan.sets, 0);
  return (
    <Card style={[styles.slotCard, { width }]}>
      <View style={styles.between} accessible accessibilityLabel={`${slot.label}, ${slotPlain(slot)}. ${slot.plannedExercises.length} exercises, ${sets} physical sets.`}>
        <View style={styles.slotIdentity}>
          <Txt variant="code">{slot.label} · {slotPlain(slot)}</Txt>
          <Txt variant="caption" tone="secondary">{muscleList(slot.targetMuscles)} · {sets} sets</Txt>
        </View>
      </View>
      <Divider />
      {slot.plannedExercises.map((plan, index) => (
        <View key={`${plan.exerciseId}:${index}`} style={styles.exerciseRow}>
          <Txt variant="mono" tone="muted" style={styles.exerciseNumber}>{index + 1}</Txt>
          <Txt variant="caption" style={styles.flex}>{exerciseName(plan.exerciseId)}</Txt>
          {plan.selection.substituted ? <Txt variant="label" tone="warning">swapped</Txt> : null}
          <Txt variant="mono" tone="secondary">{plan.sets} sets</Txt>
        </View>
      ))}
    </Card>
  );
};

/** build.block: the compiled artifact. Inspectable, versioned, never edited by hand. */
export const BlockSurface = ({ state, block, sessionActive, onNextBlock }: Props) => {
  const { width: windowWidth } = useWindowDimensions();
  const carousel = useRef<ScrollView>(null);
  const [visibleSlot, setVisibleSlot] = useState(0);
  const source = state.source;
  const current = phaseOfWeek(block, block.currentWeek);
  const committed = committedSlotIds(state, block);
  const atEnd = current.kind === 'deload';
  const cardWidth = Math.max(280, windowWidth - space.lg * 2);
  const focusSlotId = state.activeSession?.slotId
    ?? block.slots.find((slot) => !committed.has(slot.id))?.id
    ?? [...state.sessions].reverse().find((session) => session.blockId === block.id && session.status === 'committed')?.slotId
    ?? block.slots[0]?.id;
  const orderedSlots = useMemo(() => {
    const focus = block.slots.find((slot) => slot.id === focusSlotId);
    return focus ? [focus, ...block.slots.filter((slot) => slot.id !== focus.id)] : block.slots;
  }, [block.slots, focusSlotId]);

  useEffect(() => {
    setVisibleSlot(0);
    carousel.current?.scrollTo({ x: 0, animated: false });
  }, [block.id, focusSlotId]);

  const updateVisibleSlot = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + space.md));
    setVisibleSlot(Math.max(0, Math.min(orderedSlots.length - 1, index)));
  };

  const confirmNextBlock = () => Alert.alert(
    'Compile the next block?',
    'Your current working weights become the new baseline. The pipeline restarts at accumulate, week 1. Committed history is kept.',
    [{ text: 'Not yet', style: 'cancel' }, { text: 'Compile next block', onPress: onNextBlock }]
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenBrand name="build.block" sub={`compiled artifact · v${block.version} · ${source?.daysPerWeek}d · ${source?.sessionMinutes}m`} />
      {(block.version > 1 ? state.lastBlockDiff.slice(0, 2) : []).map((line) => <Txt key={line} variant="mono" tone="muted">↻ {line}</Txt>)}

      <View style={styles.section}>
        <Txt variant="label" tone="muted">PHASE PIPELINE</Txt>
        <Card style={styles.phaseStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.phaseStripContent}>
            {block.phases.map((phase) => {
              const isCurrent = block.currentWeek >= phase.startWeek && block.currentWeek <= phase.endWeek;
              const weeks = phase.startWeek === phase.endWeek ? `W${phase.startWeek}` : `W${phase.startWeek}–${phase.endWeek}`;
              return (
                <View key={`${phase.kind}:${phase.startWeek}`} style={styles.phaseItem} accessible accessibilityLabel={`${weeks}, ${PHASE_COPY[phase.kind].name}${isCurrent ? ', current phase' : ''}`}>
                  {isCurrent ? <View style={styles.phaseDot} /> : null}
                  <Txt variant="mono" tone={isCurrent ? 'accent' : 'secondary'}>{weeks} {PHASE_COPY[phase.kind].name}</Txt>
                </View>
              );
            })}
          </ScrollView>
        </Card>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Txt variant="label" tone="muted">SESSIONS THIS WEEK</Txt>
          <Txt variant="caption" tone="muted">{visibleSlot + 1} / {orderedSlots.length} · swipe</Txt>
        </View>
        <ScrollView
          ref={carousel}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + space.md}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          onMomentumScrollEnd={updateVisibleSlot}
          contentContainerStyle={styles.carousel}
          accessibilityLabel="Weekly sessions. Swipe horizontally for another training day."
        >
          {orderedSlots.map((slot) => <SlotDetails key={slot.id} slot={slot} width={cardWidth} />)}
        </ScrollView>
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
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
  phaseStrip: { paddingVertical: space.md, paddingHorizontal: 0 },
  phaseStripContent: { paddingHorizontal: space.lg, alignItems: 'center', gap: space.lg },
  phaseItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  phaseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  carousel: { gap: space.md },
  slotCard: { gap: space.md },
  slotIdentity: { flex: 1, gap: 2 },
  exerciseRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  exerciseNumber: { width: 18 },
});
