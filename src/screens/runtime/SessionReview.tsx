import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { commitRuntimeSession, discardRuntimeSession, getRuntimeSessionDiff, getRuntimeWeekView } from '../../runtime';
import type { ExerciseDiff, RuntimeState } from '../../runtime';
import { colors, radius, space } from './theme';
import { ScreenBrand, ScreenTitle, Txt } from './ui';
import { describeRuntimeError, muscleLabel, setsWord } from './copy';
import type { ApplyResult } from './useRuntimeController';
import type { Notify } from './constants';

type Props = {
  state: RuntimeState;
  apply: (transform: (current: RuntimeState) => RuntimeState) => ApplyResult;
  notify: Notify;
  onOpenWeek: () => void;
};

type Look = { text: string; bg: string };
const LOOK = {
  add: { text: colors.diffGreen, bg: colors.diffGreenBg },
  remove: { text: colors.diffRed, bg: colors.diffRedBg },
  hold: { text: colors.textSecondary, bg: 'transparent' },
  stall: { text: colors.orange, bg: '#2A1D10' },
  base: { text: colors.violet, bg: '#1B1730' },
} satisfies Record<string, Look>;
const TAG_TONE = { progressed: colors.diffGreen, held: colors.orange, stalled: colors.diffRed, baseline: colors.violet } as const;

const dose = (sets: number | undefined, value: { loadKg: number; reps: number }) =>
  `${sets ? `${sets} × ` : ''}${value.reps}${sets ? '' : ' reps'}  @ ${Number(value.loadKg.toFixed(2))} kg`;

/** The short right-hand tag for a lift: what beat last time, or why it didn't. */
const tagOf = (item: ExerciseDiff): { label: string; kind: keyof typeof TAG_TONE } => {
  if (!item.previous) return { label: 'baseline', kind: 'baseline' };
  if (item.outcome === 'progressed') return { label: item.change.toLowerCase().includes('reserve') ? '+rir' : item.change, kind: 'progressed' };
  if (item.outcome === 'stalled') return { label: item.change.replace(/^(\d+) reps below target$/, '−$1 reps'), kind: 'stalled' };
  return { label: 'held', kind: 'held' };
};

const DiffRow = ({ sign, look, text, tag, tagColor }: { sign: '+' | '-' | ' '; look: Look; text: string; tag?: string; tagColor?: string }) => (
  <View style={[styles.row, { backgroundColor: look.bg }]}>
    <Txt variant="mono" style={{ color: look.text }}>{sign} {text}</Txt>
    {tag ? <Txt variant="code" style={[styles.tag, { color: tagColor ?? look.text }]}>{tag}</Txt> : null}
  </View>
);

/** overload: the commit boundary, laid out like a diff. Green beat last time; commit accepts it. */
export const SessionReview = ({ state, apply, notify, onOpenWeek }: Props) => {
  const session = state.activeSession;
  const diff = getRuntimeSessionDiff(state);
  if (!session || !diff) return null;
  const block = state.block;
  const slot = block?.slots.find((item) => item.id === session.slotId);
  const setsDoneFor = (exerciseId: string, from: { exercises: typeof session.exercises }) =>
    from.exercises.filter((entry) => entry.exercise.id === exerciseId).flatMap((entry) => entry.sets).filter((set) => set.status === 'completed').length;
  const previousSession = (exerciseId: string) =>
    [...state.sessions].reverse().find((item) => item.id !== session.id && item.status === 'committed' && item.exercises.some((entry) => entry.exercise.id === exerciseId));

  const allSets = session.exercises.flatMap((entry) => entry.sets);
  const setsDone = allSets.filter((set) => set.status === 'completed').length;
  const empty = setsDone === 0;
  const items = diff.exercises;
  const tags = items.map(tagOf);
  const up = tags.filter((tag) => tag.kind === 'progressed').length;
  const held = tags.filter((tag) => tag.kind === 'held').length;
  const down = tags.filter((tag) => tag.kind === 'stalled').length;
  const base = tags.filter((tag) => tag.kind === 'baseline').length;
  const comparable = items.length - base;
  const summary = base === items.length
    ? `${base} baseline · nothing to compare yet`
    : [`${up} of ${comparable} progressed`, held ? `${held} held` : '', down ? `${down} stalled` : '', base ? `${base} baseline` : ''].filter(Boolean).join(' · ');
  const headline = base === items.length ? { text: 'baseline', color: colors.violet } : up > 0 ? { text: `+${up} progressed`, color: colors.diffGreen } : down > 0 ? { text: `${down} stalled`, color: colors.diffRed } : { text: 'held', color: colors.orange };
  const muscles = (slot?.targetMuscles ?? []).slice(0, 2).map((muscle) => muscleLabel(muscle).toLowerCase()).join(' / ');

  const commit = () => {
    const outcome = apply(commitRuntimeSession);
    if (!outcome.ok) {
      notify({ tone: 'error', ...describeRuntimeError(outcome.error), sticky: true });
      return;
    }
    const week = getRuntimeWeekView(outcome.state);
    notify({
      tone: 'success',
      title: `committed ${slot?.label ?? 'session'}${week ? ` · ${week.status.sessionsLogged}/${week.status.totalSessions} slots this week` : ''}`,
      message: 'Now in history and shaping future prescriptions. The block was not recompiled.',
      action: { label: 'week', run: onOpenWeek },
    });
  };

  const discard = () => Alert.alert(
    'Discard this session?',
    `Rolls back the ${setsWord(setsDone)} logged in this session and restores your previous working weights. Can't be undone.`,
    [{ text: 'Keep session', style: 'cancel' }, {
      text: 'Discard session', style: 'destructive',
      onPress: () => {
        const outcome = apply(discardRuntimeSession);
        if (outcome.ok) notify({ tone: 'info', title: 'discarded → working weights restored' });
        else notify({ tone: 'error', ...describeRuntimeError(outcome.error), sticky: true });
      },
    }]
  );

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenBrand name="overload" sub={`${muscles}${slot ? ` · ${slot.label}` : ''}`} />

        <ScreenTitle title="Session diff" text="Today against your last results. Green beat it. A flat line at the same effort is a hold, not a win." />

        {empty ? (
          <Txt variant="code" tone="warning">⚠ nothing logged, nothing to commit</Txt>
        ) : (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Txt variant="mono" tone="muted" style={styles.flex}>@@ {slot?.label ?? 'session'} · {items.length} {items.length === 1 ? 'lift' : 'lifts'} @@</Txt>
              <Txt variant="code" style={{ color: headline.color }}>{headline.text}</Txt>
            </View>

            <View style={styles.lifts}>
              {items.map((item, index) => {
                const tag = tags[index];
                const prevSession = previousSession(item.exerciseId);
                const prevSets = prevSession ? setsDoneFor(item.exerciseId, prevSession) : undefined;
                const nowSets = setsDoneFor(item.exerciseId, session);
                const current = dose(nowSets || undefined, item.current);
                const previous = item.previous ? dose(prevSets || undefined, item.previous) : undefined;
                return (
                  <View
                    key={item.exerciseId} style={styles.lift} accessible
                    accessibilityLabel={`${item.exerciseName}. ${tag.kind === 'baseline' ? 'Baseline, no prior result' : tag.kind}. ${previous ? `Before ${previous}. ` : ''}Now ${current}. ${item.change}`}
                  >
                    <Txt variant="code" style={styles.liftName}>{item.exerciseId}</Txt>
                    {tag.kind === 'held' ? (
                      <DiffRow sign=" " look={LOOK.hold} text={current} tag="held" tagColor={colors.orange} />
                    ) : tag.kind === 'baseline' ? (
                      <DiffRow sign="+" look={LOOK.base} text={current} tag="baseline" />
                    ) : (
                      <>
                        {previous ? <DiffRow sign="-" look={LOOK.remove} text={previous} /> : null}
                        <DiffRow sign="+" look={tag.kind === 'stalled' ? LOOK.stall : LOOK.add} text={current} tag={tag.label} tagColor={TAG_TONE[tag.kind]} />
                      </>
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.cardFoot}>
              <View style={styles.segments} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {tags.map((tag, index) => <View key={index} style={[styles.segment, { backgroundColor: TAG_TONE[tag.kind] }]} />)}
              </View>
              <Txt variant="mono" tone="secondary" style={styles.flex}>{summary}</Txt>
            </View>
          </View>
        )}

        <Txt variant="caption" tone="muted" style={styles.caption}>
          A commit counts as progress only when load, reps, or effort beat last time. Matching last time at the same RIR is a hold.
        </Txt>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable accessibilityRole="button" accessibilityLabel="Discard session" onPress={discard} style={({ pressed }) => [styles.discard, pressed && styles.pressed]}>
          <Txt variant="code" style={{ color: colors.diffRed }}>discard</Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Commit session" accessibilityState={{ disabled: empty }}
          accessibilityHint={empty ? 'Nothing was logged' : undefined}
          disabled={empty} onPress={commit}
          style={({ pressed }) => [styles.commit, empty && styles.commitOff, pressed && styles.pressed]}
        >
          <Txt variant="code" style={[styles.commitText, empty && styles.commitTextOff]}>commit session  →</Txt>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: space.lg, paddingBottom: space.xl, gap: space.lg },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceRaised },
  lifts: { padding: space.md, gap: space.lg },
  lift: { gap: space.xs },
  liftName: { marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, borderRadius: 6, paddingHorizontal: space.sm, paddingVertical: 6, flexWrap: 'wrap' },
  tag: { textAlign: 'right' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderTopWidth: 1, borderTopColor: colors.border, flexWrap: 'wrap' },
  segments: { flexDirection: 'row', gap: 6 },
  segment: { width: 22, height: 6, borderRadius: 3 },
  footer: { flexDirection: 'row', gap: space.md, padding: space.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.ground },
  commit: { flex: 1, minHeight: 52, borderRadius: radius.md, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  commitOff: { backgroundColor: colors.surfaceRaised },
  commitText: { color: colors.orangeText, fontSize: 15 },
  commitTextOff: { color: colors.textMuted },
  pressed: { opacity: 0.8 },
  caption: { textAlign: 'center' },
  discard: { minHeight: 52, minWidth: 88, borderRadius: radius.md, borderWidth: 1, borderColor: colors.diffRed, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
});
