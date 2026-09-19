import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { previewTrainingSessionDetailed, solveTrainingSession } from '../../runtime';
import type { PrescribedExercise, RecoveryState, RuntimeState, SessionContext } from '../../runtime';
import { colors, space, TOUCH } from './theme';
import { Button, Card, Choice, Divider, Pill, ScreenBrand, ScreenTitle, Sheet, Txt } from './ui';
import {
  describeExerciseReason, describeFit, describeRuntimeError, describeSlotChoice, equipmentLabel, estimateExerciseMinutes,
  exerciseName, formatDay, formatKg, muscleLabel, RECOVERY_OPTIONS, setsWord, slotPlain,
} from './copy';
import { MINUTE_OPTIONS, Notify } from './constants';
import { nextPendingSet, phaseOfWeek, todayISO } from './selectors';
import { useFirstVisit } from './useFirstVisit';
import { SetLogger } from './SetLogger';
import { SessionReview } from './SessionReview';
import type { ApplyResult } from './useRuntimeController';

type Props = {
  state: RuntimeState;
  apply: (transform: (current: RuntimeState) => RuntimeState) => ApplyResult;
  notify: Notify;
  onOpenSource: () => void;
  onOpenWeek: () => void;
};

const PlannedRow = ({ entry, index, flag }: { entry: PrescribedExercise; index: number; flag?: string }) => {
  const [open, setOpen] = useState(false);
  const first = entry.sets[0];
  const why = describeExerciseReason(entry.reason);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${index + 1}. ${entry.exercise.name}. ${setsWord(entry.sets.length)} of ${first.minReps} to ${first.maxReps} reps at ${formatKg(first.loadKg)}, RIR ${first.targetRir}. About ${estimateExerciseMinutes(entry)} minutes.${flag ? ` ${flag}.` : ''}`}
        accessibilityHint={open ? 'Hides the reason' : 'Shows why it is in the solve'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Txt variant="number" tone="accent" style={styles.index}>{index + 1}</Txt>
        <View style={styles.flex}>
          <Txt variant="heading">{entry.exercise.name}</Txt>
          <Txt variant="code" tone="secondary">{entry.sets.length}×{first.minReps}–{first.maxReps} @ RIR {first.targetRir} · {formatKg(first.loadKg)}</Txt>
          {flag ? <Txt variant="caption" tone="warning">△ {flag}</Txt> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.why}>
          {why.map((line) => <Txt key={line} variant="caption" tone="secondary">• {line}</Txt>)}
          <Txt variant="caption" tone="secondary">• ~{estimateExerciseMinutes(entry)} min</Txt>
        </View>
      ) : null}
    </View>
  );
};

/** solver(): today's solve → active set.log → session diff. One destination, three states. */
export const TodaySurface = ({ state, apply, notify, onOpenSource, onOpenWeek }: Props) => {
  const [minutes, setMinutes] = useState<30 | 45 | 60 | 75>(state.source?.sessionMinutes ?? 45);
  const [recovery, setRecovery] = useState<RecoveryState>('yes');
  const [noEquipment, setNoEquipment] = useState<string[]>([]);
  const [skipToday, setSkipToday] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [delta, setDelta] = useState<string | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [picker, setPicker] = useState<null | 'time' | 'recovery'>(null);
  const previous = useRef<{ key: string; sets: number; count: number; minutes: number } | null>(null);
  const firstVisit = useFirstVisit('solver');
  const session = state.activeSession;
  const date = todayISO();
  const painIds = useMemo(() => state.source?.excludedExerciseIds ?? [], [state.source]);

  // Pain exclusions live in source, and the solver reads exclusions from the session context.
  const context = useMemo<SessionContext>(() => ({
    date, minutesAvailable: minutes, recovery,
    unavailableExerciseIds: [...new Set([...painIds, ...skipToday])], unavailableEquipment: noEquipment,
  }), [date, minutes, recovery, painIds, skipToday, noEquipment]);

  const result = useMemo(() => {
    if (session) return null;
    try { return { ok: true as const, ...previewTrainingSessionDetailed(state, context) }; } catch (error) { return { ok: false as const, error }; }
    // `attempt` lets "Solve again" force a fresh solve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, session, state, attempt]);

  const prescription = result && result.ok ? result.prescription : null;
  const totalSets = prescription?.exercises.reduce((sum, entry) => sum + entry.sets.length, 0) ?? 0;
  const count = prescription?.exercises.length ?? 0;
  const estimated = prescription?.estimatedMinutes ?? 0;
  const solveKey = `${minutes}|${recovery}|${noEquipment.join()}|${skipToday.join()}`;

  // Cause and effect: when an input changes, say what the solve did in response.
  useEffect(() => {
    const before = previous.current;
    if (before && before.key !== solveKey) {
      const dSets = totalSets - before.sets;
      const dCount = count - before.count;
      const dMin = estimated - before.minutes;
      const sign = (n: number) => (n > 0 ? '+' : '');
      setDelta(dSets === 0 && dCount === 0 && dMin === 0
        ? 'no change'
        : `${sign(dSets)}${dSets} sets · ${sign(dCount)}${dCount} lifts · ${sign(dMin)}${dMin} min`);
    }
    previous.current = { key: solveKey, sets: totalSets, count, minutes: estimated };
  }, [solveKey, totalSets, count, estimated]);

  if (session) {
    return nextPendingSet(state)
      ? <SetLogger state={state} apply={apply} notify={notify} />
      : <SessionReview state={state} apply={apply} notify={notify} onOpenWeek={onOpenWeek} />;
  }
  if (!result || !state.source || !state.block) return null;

  const changeCount = noEquipment.length + skipToday.length;
  const toggle = (list: string[], set: (next: string[]) => void, item: string) =>
    set(list.includes(item) ? list.filter((value) => value !== item) : [...list, item]);
  const clearToday = () => { setNoEquipment([]); setSkipToday([]); };

  const usable = Boolean(prescription && prescription.exercises.length > 0);
  const deloadWeek = result.ok && phaseOfWeek(state.block, result.weekNumber).kind === 'deload';
  const fit = result.ok ? describeFit(result.slot, result.prescription.exercises, context, painIds) : [];
  const removed = fit.filter((item) => item.kind === 'removed');
  const optionIds = [...new Set([
    ...(result.ok ? (result.slot?.plannedExercises.map((plan) => plan.exerciseId) ?? []) : []),
    ...(prescription?.exercises.map((entry) => entry.exercise.id) ?? []),
    ...skipToday,
  ])].filter((id) => !painIds.includes(id));

  const start = () => {
    const outcome = apply((current) => solveTrainingSession(current, context));
    if (!outcome.ok) {
      const problem = describeRuntimeError(outcome.error);
      notify({ tone: 'error', title: problem.title, message: problem.message, sticky: true });
      return;
    }
    notify({ tone: 'info', title: `active · ${result.ok ? result.slot?.label : 'session'} frozen · ${setsWord(totalSets)}` });
  };

  const recoveryOption = RECOVERY_OPTIONS.find((option) => option.value === recovery)!;
  const recoveryEffect = recoveryOption.effect(deloadWeek);
  const slotLabel = result.ok ? (result.slot?.label ?? 'slot') : 'slot';

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.head}>
          <ScreenBrand name="solver()" sub={result.ok ? `○ proposed · ${slotLabel}` : '○ proposed'} />
          <ScreenTitle title="Today's workout" text={result.ok ? `${slotPlain(result.slot)} · ${(result.slot?.targetMuscles ?? []).slice(0, 2).map((muscle) => muscleLabel(muscle).toLowerCase()).join(' / ')} · ${formatDay(date)}` : formatDay(date)} />
          {result.ok && usable ? <Txt variant="mono" tone="secondary">↳ {describeSlotChoice(result.slotChoice)}</Txt> : null}
          {firstVisit ? <Txt variant="caption" tone="muted">A block slot, fitted to your time, recovery and availability right now.</Txt> : null}
        </View>

        {!result.ok ? (
          <Card tone="danger">
            <Txt variant="heading" tone="danger">solver() could not produce a session</Txt>
            <Txt variant="caption" tone="secondary">{describeRuntimeError(result.error).message} Your block and history are unchanged.</Txt>
            <View style={styles.buttons}>
              <Button label="Solve again" variant="secondary" onPress={() => setAttempt((value) => value + 1)} grow={1} />
              <Button label="Review source" variant="secondary" onPress={onOpenSource} grow={1} />
            </View>
          </Card>
        ) : null}

        <View style={styles.pills}>
          <Pill label={`${minutes}m`} onPress={() => setPicker('time')} hint="Change the time available today" />
          <Pill label={`recovery · ${recoveryOption.label}`} highlight={recovery !== 'yes'} onPress={() => setPicker('recovery')} hint="Change how recovered you feel" />
          <Pill icon="ellipsis-horizontal" label={changeCount ? `${changeCount}` : undefined} accessibilityLabel={changeCount ? `Availability, ${changeCount} excluded today` : 'Availability'} highlight={changeCount > 0} onPress={() => setAvailabilityOpen(true)} hint="Mark gear or exercises unavailable today" />
        </View>

        {result.ok && !usable ? (
          <Card tone="warning">
            <Txt variant="heading" tone="warning">No valid session under these inputs</Txt>
            <Txt variant="caption" tone="secondary">
              {changeCount ? "Today's exclusions removed every exercise in this slot." : 'No exercise in this slot fits your time and constraints.'}
            </Txt>
            <View style={styles.buttons}>
              {changeCount ? <Button label="Clear exclusions" variant="secondary" onPress={clearToday} grow={1} /> : null}
              <Button label="Review source" variant="secondary" onPress={onOpenSource} grow={1} />
            </View>
          </Card>
        ) : null}

        {result.ok && usable ? (
          <View style={styles.result} accessibilityLiveRegion="polite">
            <Txt variant="code">→ ~{estimated} min · {setsWord(totalSets)} · {count} lifts</Txt>
            {delta ? <Txt variant="code" tone="accent">↻ {delta}</Txt> : null}
            {recovery !== 'yes' || deloadWeek ? <Txt variant="caption" tone="secondary">{recoveryEffect}</Txt> : null}
            {result.deloadTriggered ? <Txt variant="caption" tone="warning">△ deload triggered: about half the sets, no load progression.</Txt> : null}
          </View>
        ) : null}

        {usable ? (
          <Card style={styles.list}>
            {prescription!.exercises.map((entry, index) => {
              const change = fit.find((item) => item.exerciseName === entry.exercise.name);
              return (
                <View key={entry.id}>
                  {index > 0 ? <Divider /> : null}
                  <PlannedRow
                    entry={entry} index={index}
                    flag={change?.kind === 'reduced' ? change.note : entry.reason.includes('pain report') ? 'replaces a lift flagged for pain' : undefined}
                  />
                </View>
              );
            })}
            {removed.map((item) => (
              <View key={item.exerciseName}>
                <Divider />
                <View style={styles.removed} accessible accessibilityLabel={`${item.exerciseName} removed. ${item.note}`}>
                  <Txt variant="code" tone="muted" style={styles.index}>✕</Txt>
                  <View style={styles.flex}>
                    <Txt variant="caption" tone="muted" style={styles.strike}>{item.exerciseName}</Txt>
                    <Txt variant="caption" tone="muted">{item.note}</Txt>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Start session" icon="play" onPress={start} disabled={!usable}
          hint={usable ? 'Freezes this solve into an active prescription' : 'Not available until a valid session exists'}
        />
      </View>

      <Sheet visible={picker === 'time'} onClose={() => setPicker(null)} title="time available">
        {MINUTE_OPTIONS.map((value) => (
          <Choice key={value} label={`${value} min`} code selected={minutes === value} onPress={() => { setMinutes(value); setPicker(null); }} />
        ))}
      </Sheet>

      <Sheet visible={picker === 'recovery'} onClose={() => setPicker(null)} title="recovery today">
        {RECOVERY_OPTIONS.map((option) => (
          <Choice key={option.value} label={option.label} code description={option.effect(deloadWeek)} selected={recovery === option.value} onPress={() => { setRecovery(option.value); setPicker(null); }} />
        ))}
      </Sheet>

      <Sheet visible={availabilityOpen} onClose={() => setAvailabilityOpen(false)} title="availability today">
        <Txt variant="label" tone="muted">equipment</Txt>
        <View style={styles.wrap}>
          {state.source.equipment.map((item) => (
            <Choice key={item} compact role="checkbox" label={`no ${equipmentLabel(item).toLowerCase()}`} selected={noEquipment.includes(item)} onPress={() => toggle(noEquipment, setNoEquipment, item)} />
          ))}
        </View>
        <Txt variant="label" tone="muted">skip exercise</Txt>
        <View style={styles.wrap}>
          {optionIds.map((id) => (
            <Choice key={id} compact role="checkbox" label={`skip ${exerciseName(id).toLowerCase()}`} selected={skipToday.includes(id)} onPress={() => toggle(skipToday, setSkipToday, id)} />
          ))}
        </View>
        {painIds.length ? <Txt variant="caption" tone="warning">△ also excluded, from source (pain): {painIds.map(exerciseName).join(', ')}</Txt> : null}
        <View style={styles.buttons}>
          {changeCount ? <Button label="Clear" variant="secondary" onPress={clearToday} grow={1} /> : null}
          <Button label="Done" onPress={() => setAvailabilityOpen(false)} grow={1} />
        </View>
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: space.lg, paddingBottom: space.xl, gap: space.lg },
  head: { gap: space.md },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  result: { gap: 2 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  list: { paddingVertical: space.xs, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TOUCH + 12, paddingVertical: space.sm },
  removed: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.sm },
  strike: { textDecorationLine: 'line-through' },
  index: { width: 22 },
  pressed: { opacity: 0.75 },
  why: { gap: space.xs, paddingLeft: 22 + space.md, paddingBottom: space.md },
  footer: { padding: space.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.ground },
});
