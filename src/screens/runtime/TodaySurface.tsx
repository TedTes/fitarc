import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { previewTrainingSessionDetailed, solveTrainingSession } from '../../runtime';
import type { ExerciseDefinition, RecoveryState, RuntimeState, SessionContext } from '../../runtime';
import { space } from './theme';
import { Banner, Button, Card, Choice, ScreenBrand, ScreenTitle, Segmented, Txt } from './ui';
import { describeRuntimeError, describeSlotChoice, equipmentLabel, formatKg, slotPlain } from './copy';
import { nextPendingSet, todayISO } from './selectors';
import { SetLogger, type WorkoutDockState } from './SetLogger';
import { SessionReview } from './SessionReview';
import { ExerciseDetailsSheet, ExerciseTargetPreview } from './ExerciseMuscles';
import type { ApplyResult } from './useRuntimeController';
import { type Notify } from './constants';

type Props = {
  state: RuntimeState; apply: (transform: (current: RuntimeState) => RuntimeState) => ApplyResult;
  notify: Notify; active: boolean; onDockChange: (dock: WorkoutDockState | null) => void;
  onOpenSource: () => void; onOpenWeek: () => void;
};

export const TodaySurface = ({ state, apply, notify, active, onDockChange, onOpenSource, onOpenWeek }: Props) => {
  const [minutes, setMinutes] = useState<SessionContext['minutesAvailable']>(state.source?.sessionMinutes ?? 60);
  const [recovery, setRecovery] = useState<RecoveryState>('yes');
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [inspected, setInspected] = useState<ExerciseDefinition | null>(null);
  const date = todayISO();
  const session = state.activeSession;
  useEffect(() => {
    const window = state.block?.remainingWeek?.windows.find((item) => item.date === date);
    setMinutes(window?.minutesAvailable ?? state.source?.sessionMinutes ?? 60);
    setRecovery(window?.recovery ?? 'yes'); setUnavailable(window?.unavailableEquipment ?? []);
  }, [state.block?.id, state.source?.sessionMinutes, date]);
  useEffect(() => { if (!session && active) onDockChange(null); }, [session, active, onDockChange]);
  const context = useMemo<SessionContext>(() => ({ date, minutesAvailable: minutes, recovery,
    unavailableEquipment: unavailable, unavailableExerciseIds: state.source?.excludedExerciseIds ?? [] }), [date, minutes, recovery, unavailable, state.source]);
  const preview = useMemo(() => {
    if (session || !state.block || !state.source) return null;
    try { return { value: previewTrainingSessionDetailed(state, context), error: null }; }
    catch (error) { return { value: null, error: describeRuntimeError(error).message }; }
  }, [state, context, session]);
  const start = () => {
    const result = apply((current) => solveTrainingSession(current, context));
    if (!result.ok) notify({ tone: 'error', ...describeRuntimeError(result.error) });
  };
  if (session) return nextPendingSet(state)
    ? <SetLogger state={state} apply={apply} notify={notify} onDockChange={onDockChange} />
    : <SessionReview state={state} apply={apply} notify={notify} onOpenWeek={onOpenWeek} />;
  const proposal = preview?.value;
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <ScreenBrand name="Today" />
    <ScreenTitle title="Make today’s workout fit" text="Check your time, recovery and available equipment before you start." />
    <Txt variant="label">Time available</Txt>
    <Segmented options={[30, 35, 45, 60, 75]} value={minutes} onChange={setMinutes} label="Time available" format={(value) => `${value} min`} />
    <Txt variant="label">How do you feel?</Txt>
    <View style={styles.choices}>{(['yes','meh','no'] as const).map((value) => <Choice key={value}
      label={value === 'yes' ? 'Ready' : value === 'meh' ? 'Tired' : 'Very tired'} compact selected={recovery === value} onPress={() => setRecovery(value)} />)}</View>
    <Txt variant="label">Unavailable today</Txt>
    <View style={styles.choices}>{state.source?.equipment.map((item) => <Choice key={item} role="checkbox" compact label={equipmentLabel(item)}
      selected={unavailable.includes(item)} onPress={() => setUnavailable((current) => current.includes(item) ? current.filter((x) => x !== item) : [...current,item])} />)}</View>
    {preview?.error ? <Banner tone="warning" title="No suitable workout" message={preview.error} /> : null}
    {proposal ? <>
      <Card><ScreenTitle title={slotPlain(proposal.slot)} text={`About ${proposal.prescription.estimatedMinutes} minutes · ${proposal.prescription.exercises.reduce((sum,entry)=>sum+entry.sets.length,0)} sets`} />
        <Txt variant="caption" tone="secondary">Priority: {describeSlotChoice(proposal.slotChoice)}.</Txt>
        {recovery !== 'yes' ? <Txt variant="caption">Set counts account for your recovery today.</Txt> : null}
        {unavailable.length ? <Txt variant="caption">Uses equipment available today. Your usual equipment preferences stay saved.</Txt> : null}
      </Card>
      {proposal.prescription.exercises.map((entry) => <Card key={entry.id}>
        <Txt variant="heading">{entry.exercise.name}</Txt>
        <Txt variant="caption">{entry.sets.length} sets · {entry.sets[0]?.minReps}–{entry.sets[0]?.maxReps} reps · suggested {formatKg(entry.sets[0]?.loadKg ?? 0)}</Txt>
        <ExerciseTargetPreview exercise={entry.exercise} compact label="Muscles worked" onPress={() => setInspected(entry.exercise)} />
      </Card>)}
      <Button label="Start workout" onPress={start} disabled={!proposal.prescription.exercises.length} />
    </> : null}
    <Button label="Change remaining week" variant="secondary" onPress={onOpenWeek} />
    <Button label="Training preferences" variant="secondary" onPress={onOpenSource} />
    <ExerciseDetailsSheet exercise={inspected} onClose={() => setInspected(null)} />
  </ScrollView>;
};
const styles = StyleSheet.create({ page: { padding: space.lg, paddingBottom: space.xl, gap: space.md }, choices: { flexDirection:'row', flexWrap:'wrap', gap: space.sm } });
