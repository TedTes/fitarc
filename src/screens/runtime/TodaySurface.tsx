import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { solveTrainingSession } from '../../runtime';
import type { RuntimeState, SessionContext } from '../../runtime';
import { colors, space } from './theme';
import { Txt } from './ui';
import { describeRuntimeError } from './copy';
import { nextPendingSet, todayISO } from './selectors';
import { SetLogger } from './SetLogger';
import type { WorkoutDockState } from './SetLogger';
import { SessionReview } from './SessionReview';
import type { ApplyResult } from './useRuntimeController';
import type { Notify } from './constants';

type Props = {
  state: RuntimeState;
  apply: (transform: (current: RuntimeState) => RuntimeState) => ApplyResult;
  notify: Notify;
  active: boolean;
  onDockChange: (dock: WorkoutDockState | null) => void;
  onOpenSource: () => void;
  onOpenWeek: () => void;
};

/**
 * solver() has no pre-session preview. Entering it compiles today's prescription
 * from the saved source and opens the active STACK + FRAME runtime immediately.
 */
export const TodaySurface = ({ state, apply, notify, active, onDockChange, onOpenSource, onOpenWeek }: Props) => {
  const attempted = useRef<string | null>(null);
  const session = state.activeSession;
  const date = todayISO();
  const startKey = state.source && state.block
    ? `${state.block.id}:${state.block.version}:${state.block.currentWeek}:${date}:${state.committedSessionIds.length}`
    : null;

  useEffect(() => {
    if (!active || session || !state.source || !state.block || !startKey || attempted.current === startKey) return;
    attempted.current = startKey;
    const context: SessionContext = {
      date,
      minutesAvailable: state.source.sessionMinutes,
      recovery: 'yes',
      unavailableExerciseIds: [...state.source.excludedExerciseIds],
      unavailableEquipment: [],
    };
    const outcome = apply((current) => solveTrainingSession(current, context));
    if (!outcome.ok) {
      const problem = describeRuntimeError(outcome.error);
      notify({
        tone: 'error', title: problem.title, message: problem.message, sticky: true,
        action: { label: 'account', run: onOpenSource },
      });
    }
  }, [active, apply, date, notify, onOpenSource, session, startKey, state.block, state.source]);

  if (session) {
    return nextPendingSet(state)
      ? <SetLogger state={state} apply={apply} notify={notify} onDockChange={onDockChange} />
      : <SessionReview state={state} apply={apply} notify={notify} onOpenWeek={onOpenWeek} />;
  }

  return (
    <View style={styles.loading} accessible accessibilityLabel="Solving today's workout">
      <ActivityIndicator color={colors.accent} />
      <Txt variant="code" tone="secondary">solving today…</Txt>
    </View>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, backgroundColor: colors.ground },
});
