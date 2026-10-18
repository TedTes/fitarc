import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useForegroundClock } from '../../hooks/useForegroundClock';
import { Txt } from './ui';
import { colors } from './theme';

export type WorkoutDockState = { until: number; durationSeconds: number; onSkip: () => void };
export const formatWorkoutTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const WorkoutElapsed = memo(function WorkoutElapsed({ startedAt, completed, total }: {
  startedAt?: string; completed: number; total: number;
}) {
  const now = useForegroundClock(Boolean(startedAt));
  const elapsed = startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)) : 0;
  return <Txt variant="mono" tone="muted" style={styles.meta}>
    <Txt variant="mono" style={[styles.meta, { color: startedAt ? colors.success : colors.accent }]}>
      {startedAt ? `● ${formatWorkoutTime(elapsed).padStart(5, '0')} elapsed` : 'Ready'}
    </Txt>{` · ${completed} of ${total} sets`}
  </Txt>;
});

/** Only this readout ticks; the parent and the exercise list receive no tick state. */
export const WorkoutRestDock = memo(function WorkoutRestDock({ dock }: { dock: WorkoutDockState }) {
  const now = useForegroundClock();
  const seconds = Math.max(0, Math.ceil((dock.until - now) / 1000));
  useEffect(() => { if (seconds === 0) dock.onSkip(); }, [seconds, dock]);
  return <>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Rest timer ${formatWorkoutTime(seconds)}. Skip rest`} onPress={dock.onSkip} style={({ pressed }) => [styles.readout, pressed && styles.pressed]}>
        <Ionicons name="timer-outline" size={22} color={colors.accent}/>
        <Txt variant="code" style={styles.time}>{formatWorkoutTime(seconds)}</Txt>
        <Txt variant="mono" tone="secondary" style={styles.label}>resting</Txt>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Skip rest" onPress={dock.onSkip} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
        <Txt variant="code" tone="accent">skip</Txt>
        <Ionicons name="chevron-forward" size={18} color={colors.accent}/>
      </Pressable>
    </View>
    <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, seconds / Math.max(1, dock.durationSeconds) * 100)}%` }]}/></View>
  </>;
});

const styles = StyleSheet.create({
  meta: { fontSize: 10, lineHeight: 15, letterSpacing: 0.3 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  track: { height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.border },
  fill: { height: 3, backgroundColor: colors.accent },
  readout: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 11, lineHeight: 14 },
  time: { color: colors.accent, fontSize: 27, lineHeight: 31, fontWeight: '800', fontVariant: ['tabular-nums'] },
  action: { minWidth: 64, minHeight: 44, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'flex-end' },
  pressed: { opacity: 0.7 },
});
