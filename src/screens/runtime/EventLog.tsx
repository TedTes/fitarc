import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, TOUCH } from './theme';
import { Sheet, Txt } from './ui';

export type RuntimeEvent = {
  id: number;
  at: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
};

const SYMBOL = { info: '↳', success: '✓', warning: '△', error: '⚠' } as const;
const TONE = { info: 'secondary', success: 'success', warning: 'warning', error: 'danger' } as const;
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/**
 * The runtime's last event, always one line. Tapping opens the recent trail: every solve,
 * decision, commit and recompile with its cause. Errors stay until dismissed.
 */
export const EventLine = ({ events, fresh, action, dismissed, onDismiss }: {
  events: RuntimeEvent[];
  /** An error the person has already dismissed. It stays in the log but stops shouting. */
  dismissed?: boolean;
  /** True for a few seconds after an event, so it reads louder and offers its action. */
  fresh: boolean;
  action?: { label: string; run: () => void };
  onDismiss: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const last = events[events.length - 1];
  if (!last) return null;
  const isError = last.tone === 'error' && !dismissed;
  const tone = fresh || isError ? TONE[last.tone] : 'muted';
  return (
    <>
      <View style={[styles.line, isError && styles.lineError]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Runtime log. Latest: ${last.title}`}
          accessibilityHint="Opens the recent events"
          onPress={() => setOpen(true)}
          style={styles.main}
        >
          <Txt variant="code" tone={tone} numberOfLines={1} ellipsizeMode="tail" accessibilityLiveRegion="polite" style={styles.text}>{SYMBOL[last.tone]} {last.title}</Txt>
        </Pressable>
        {fresh && action ? (
          <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.run} style={styles.action}>
            <Txt variant="code" tone="accent">{action.label}</Txt>
          </Pressable>
        ) : null}
        {isError ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} style={styles.action}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title="runtime log">
        {[...events].reverse().map((event) => (
          <View key={event.id} style={styles.entry} accessible accessibilityLabel={`${clock(event.at)}. ${event.title}. ${event.message ?? ''}`}>
            <Txt variant="label" tone="muted">{clock(event.at)}</Txt>
            <Txt variant="code" tone={TONE[event.tone]}>{SYMBOL[event.tone]} {event.title}</Txt>
            {event.message ? <Txt variant="caption" tone="secondary">{event.message}</Txt> : null}
          </View>
        ))}
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: 40 },
  lineError: { backgroundColor: colors.dangerSoft },
  main: { flex: 1, minHeight: TOUCH - 8, justifyContent: 'center', paddingVertical: space.xs },
  text: { flexShrink: 1 },
  action: { minHeight: TOUCH - 8, minWidth: TOUCH - 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  entry: { gap: 2, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: radius.sm },
});
