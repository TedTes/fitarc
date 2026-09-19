import { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import type { RuntimeState } from '../../runtime';
import { space } from './theme';
import { Button, Card, Divider, ScreenBrand, ScreenTitle, Txt } from './ui';
import { describeSwap, exerciseName, formatKg, goalLabel, goalPlain, limitationLabel } from './copy';
import { useFirstVisit } from './useFirstVisit';
import type { SyncStatus } from './useRuntimeController';

type Props = {
  state: RuntimeState;
  sync: SyncStatus;
  onEdit: () => void;
  onLogout: () => void | Promise<void>;
};

const Fact = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
    <Txt variant="label" tone="muted" style={styles.factLabel}>{label}</Txt>
    <Txt variant="code" style={styles.flex}>{value}</Txt>
  </View>
);

/** The compiled source: what the block was built from, and why the selector swapped what it did. */
export const SourceSurface = ({ state, sync, onEdit, onLogout }: Props) => {
  const firstVisit = useFirstVisit('source');
  const { source, block } = state;
  const swaps = useMemo(() => {
    const unique = new Map<string, ReturnType<typeof describeSwap> & { from: string; to: string }>();
    block?.slots.flatMap((slot) => slot.plannedExercises ?? []).forEach((plan) => {
      const selection = plan.selection;
      if (!selection.substituted) return;
      unique.set(`${selection.originalExerciseId}:${selection.selectedExerciseId}`, {
        ...describeSwap(selection), from: selection.originalExerciseName, to: selection.selectedExerciseName,
      });
    });
    return [...unique.values()];
  }, [block]);
  if (!source || !block) return null;

  const confirmSignOut = () => Alert.alert(
    'Sign out?',
    sync === 'synced'
      ? 'Your source, block and history are saved. Sign back in any time.'
      : 'Some changes are on this device only and have not synced yet. They sync the next time you are signed in here with a connection.',
    [{ text: 'Stay signed in', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void onLogout() }]
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.head}>
        <ScreenBrand name="source" sub="compiled" />
        <ScreenTitle title={`source v${source.version}`} text={`→ block v${block.version}${firstVisit ? '. Your goal and constraints: what the current block was compiled from.' : ''}`} />
      </View>

      <Card>
        <Fact label="goal" value={`${goalLabel(source.goal)} (${goalPlain(source.goal)})`} />
        <Fact label="schedule" value={`${source.daysPerWeek} days · ${source.sessionMinutes} min cap`} />
        <Fact label="equipment" value={source.equipment.includes('barbell') ? 'full gym' : 'dumbbells + bench'} />
        <Fact label="limits" value={source.limitations.length ? source.limitations.map(limitationLabel).join(', ') : 'none'} />
        <Fact label="seeds" value={source.seedWorkingSets.length ? source.seedWorkingSets.map((seed) => `${exerciseName(seed.exerciseId)} ${formatKg(seed.loadKg)}`).join(', ') : 'none'} />
        {source.excludedExerciseIds.length ? <Fact label="excluded" value={source.excludedExerciseIds.map(exerciseName).join(', ')} /> : null}
        <Button label="Edit source" icon="create-outline" onPress={onEdit} />
      </Card>

      <View style={styles.section}>
        <Txt variant="mono" tone="muted" header>@@ selection trace @@</Txt>
        <Card style={styles.table}>
          {swaps.length === 0 ? <Txt variant="caption" tone="secondary">No substitutions. Every preferred lift fits your source.</Txt> : swaps.map((swap, index) => (
            <View key={`${swap.from}:${swap.to}`}>
              {index > 0 ? <Divider /> : null}
              <View accessible accessibilityLabel={`${swap.to} replaces ${swap.from}. ${swap.label}. ${swap.detail}`} style={styles.swap}>
                <Txt variant="heading">{swap.to} <Txt variant="caption" tone="secondary">← {swap.from}</Txt></Txt>
                <Txt variant="code" tone={swap.category === 'preference' ? 'muted' : 'warning'}>{swap.category === 'preference' ? '◇' : '△'} {swap.label}</Txt>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <Button label="Sign out" variant="secondary" icon="log-out-outline" onPress={confirmSignOut} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.lg },
  head: { gap: space.md },
  section: { gap: space.sm },
  fact: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  factLabel: { width: 72 },
  table: { paddingVertical: space.xs, gap: 0 },
  swap: { gap: 2, paddingVertical: space.sm },
});
