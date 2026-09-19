import { ScrollView, StyleSheet, View } from 'react-native';
import type { RuntimeState, TrainingBlock, WeeklyStatus } from '../../runtime';
import { colors, space } from './theme';
import { Button, Card, Divider, Meter, ScreenBrand, Txt } from './ui';
import { formatSets, formatShortDate, muscleLabel, muscleStateCopy, PHASE_COPY, slotPlain } from './copy';
import { phaseOfWeek } from './selectors';

type Props = {
  state: RuntimeState;
  block: TrainingBlock;
  status: WeeklyStatus;
  onOpenSolver: () => void;
  onOpenBlock: () => void;
};

const DELOAD_CHECK = 80;

/** status: observability. Committed facts, scheduled work and projected outcome, kept apart. */
export const WeekSurface = ({ state, block, status, onOpenSolver, onOpenBlock }: Props) => {
  const phase = phaseOfWeek(block, block.currentWeek);
  const complete = status.weekState === 'complete';
  const relevant = new Set(block.slots.flatMap((slot) => slot.targetMuscles));
  const muscles = status.muscles.filter((item) => relevant.has(item.muscle));
  const high = status.fatiguePercent >= DELOAD_CHECK;
  const recent = [...state.sessions].reverse().slice(0, 6);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenBrand name="status" sub={`observability · ${complete ? 'week closed' : 'week live'}`} />

      <View style={styles.heading}>
        <Txt variant="display">Week {block.currentWeek} of {block.durationWeeks}</Txt>
        <Txt tone="secondary">{PHASE_COPY[phase.kind].name} · {PHASE_COPY[phase.kind].plain}</Txt>
      </View>

      {status.deloadRecommended ? (
        <Card tone="warning">
          <Txt variant="label" tone="warning">NEXT DECISION · DELOAD</Txt>
          {status.reasons.map((reason) => <Txt key={reason} variant="caption">{reason}</Txt>)}
          <Txt variant="caption" tone="secondary">
            {block.currentWeek >= block.durationWeeks
              ? 'solver() is using deload rules. Compile the next block after this week closes.'
              : 'The next solve switches to deload rules automatically.'}
          </Txt>
          <View style={styles.buttons}>
            <Button label="Open solver()" variant="secondary" onPress={onOpenSolver} grow={1} />
            <Button label="Inspect block" variant="secondary" onPress={onOpenBlock} grow={1} />
          </View>
        </Card>
      ) : null}

      <View style={styles.section}>
        <Txt variant="label" tone="muted">WEEK STATE</Txt>
        <Card style={styles.summaryCard}>
          <View style={styles.gauge}>
            <View style={styles.between}>
              <View>
                <Txt variant="heading">Committed sessions</Txt>
                <Txt variant="caption" tone="secondary">accepted evidence this week</Txt>
              </View>
              <Txt variant="number">{status.sessionsLogged} / {status.totalSessions}</Txt>
            </View>
            <Meter max={Math.max(1, status.totalSessions)} fills={[{ value: status.sessionsLogged, color: colors.accent }]} label="Committed sessions this week" valueText={`${status.sessionsLogged} of ${status.totalSessions} sessions committed`} height={8} />
          </View>
          <Divider />
          <View style={styles.gauge}>
            <View style={styles.between}>
              <View>
                <Txt variant="heading">Fatigue budget</Txt>
                <Txt variant="caption" tone="secondary">estimated recovery cost from logged work</Txt>
              </View>
              <Txt variant="number" tone={high ? 'warning' : 'primary'}>{high ? '△ ' : ''}{status.fatiguePercent}%</Txt>
            </View>
            <Meter
              max={100} fills={[{ value: status.fatiguePercent, color: high ? colors.warning : colors.accent }]} ticks={[DELOAD_CHECK]}
              label="Fatigue budget used" valueText={`${status.fatiguePercent} percent used. Deload evaluation begins at ${DELOAD_CHECK} percent.`} height={8}
            />
            <Txt variant="caption" tone="muted">The marker at {DELOAD_CHECK}% is a deload check, not an automatic stop.</Txt>
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <Txt variant="label" tone="muted">VOLUME FORECAST</Txt>
        <Txt variant="caption" tone="secondary">
          {complete
            ? 'Final set credits from committed sessions.'
            : 'Completed work and remaining scheduled work are shown separately. Their sum is the current projection.'}
        </Txt>
        <Txt variant="caption" tone="muted">One exercise set may credit more than one muscle; these are muscle set credits, not physical sets.</Txt>
        <Card style={styles.table}>
          {muscles.map((item, index) => {
            const budget = block.weeklySetBudget[item.muscle] ?? 0;
            const projected = item.projectedSets ?? item.completedSets;
            const scheduled = Math.max(0, projected - item.completedSets);
            const copy = muscleStateCopy(item, complete);
            const scale = Math.max(item.max, projected, budget) + 2;
            const tone = copy.tone === 'warn' ? 'warning' : copy.tone === 'ok' ? 'success' : 'secondary';
            return (
              <View key={item.muscle}>
                {index > 0 ? <Divider /> : null}
                <View
                  style={styles.muscle} accessible
                  accessibilityLabel={`${muscleLabel(item.muscle)}. ${formatSets(item.completedSets)} completed, ${formatSets(scheduled)} scheduled, ${formatSets(projected)} projected set credits. Compiled target ${formatSets(budget)}. Productive range ${item.min} to ${item.max}. ${copy.label}.`}
                >
                  <View style={styles.between}>
                    <Txt variant="heading">{muscleLabel(item.muscle)}</Txt>
                    <Txt variant="label" tone={tone}>{copy.label}</Txt>
                  </View>
                  {complete ? (
                    <View style={styles.equation}>
                      <View><Txt variant="number">{formatSets(item.completedSets)}</Txt><Txt variant="caption" tone="muted">final</Txt></View>
                    </View>
                  ) : (
                    <View style={styles.equation}>
                      <View style={styles.metric}><Txt variant="number">{formatSets(item.completedSets)}</Txt><Txt variant="caption" tone="muted">done</Txt></View>
                      <Txt variant="number" tone="muted">+</Txt>
                      <View style={styles.metric}><Txt variant="number">{formatSets(scheduled)}</Txt><Txt variant="caption" tone="muted">scheduled</Txt></View>
                      <Txt variant="number" tone="muted">=</Txt>
                      <View style={styles.metric}><Txt variant="number" tone={tone}>{formatSets(projected)}</Txt><Txt variant="caption" tone="muted">projected</Txt></View>
                    </View>
                  )}
                  <Meter
                    max={scale}
                    fills={complete
                      ? [{ value: item.completedSets, color: colors.accent }]
                      : [{ value: projected, color: 'rgba(244,141,77,0.32)' }, { value: item.completedSets, color: colors.accent }]}
                    band={{ from: item.min, to: item.max }} ticks={[budget]}
                    label={`${muscleLabel(item.muscle)} set-credit forecast`}
                    valueText={`${formatSets(item.completedSets)} done, ${formatSets(scheduled)} scheduled, ${formatSets(projected)} projected. Target ${formatSets(budget)}. Range ${item.min} to ${item.max}.`}
                    height={8}
                  />
                  <View style={styles.between}>
                    <Txt variant="caption" tone="muted">compiled target {formatSets(budget)}</Txt>
                    <Txt variant="caption" tone="muted">productive range {item.min}–{item.max}</Txt>
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      </View>

      <View style={styles.section}>
        <Txt variant="label" tone="muted">SESSION LOG</Txt>
        <Card style={styles.table}>
          {recent.length === 0 ? <Txt variant="caption" tone="secondary">No sessions have been started in this block.</Txt> : recent.map((session, index) => {
            const sets = session.exercises.flatMap((entry) => entry.sets).filter((set) => set.status === 'completed').length;
            const committed = session.status === 'committed';
            const slot = state.block?.slots.find((item) => item.id === session.slotId);
            return (
              <View key={session.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.session} accessible accessibilityLabel={`${slot?.label ?? 'session'}, ${formatShortDate(session.context.date)}. ${committed ? 'Committed' : 'Active and not committed'}. ${sets} sets completed.`}>
                  <View style={styles.flex}>
                    <Txt variant="code">{slot?.label ?? 'session'}</Txt>
                    <Txt variant="caption" tone="secondary">{slotPlain(slot)} · {formatShortDate(session.context.date)} · {sets} sets completed</Txt>
                  </View>
                  <Txt variant="label" tone={committed ? 'success' : 'accent'}>{committed ? '✓ committed' : '● active'}</Txt>
                </View>
              </View>
            );
          })}
        </Card>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.xl },
  heading: { gap: space.xs },
  section: { gap: space.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  summaryCard: { gap: space.lg },
  gauge: { gap: space.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
  table: { paddingVertical: space.xs, gap: 0 },
  muscle: { gap: space.sm, paddingVertical: space.md },
  equation: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  metric: { minWidth: 58, gap: 1 },
  session: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});
