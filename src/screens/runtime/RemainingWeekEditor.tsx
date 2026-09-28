import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { applyRemainingWeek, previewRemainingWeek, remainingDates, type WeekProposal } from '../../runtime/remainingWeek';
import { localDate } from '../../runtime/planDates';
import type { RuntimeState, SessionContext } from '../../runtime/types';
import { Button, Card, Choice, Segmented, Txt } from './ui';
import { equipmentLabel, slotPlain } from './copy';
import { space } from './theme';
import type { ApplyResult } from './useRuntimeController';
import type { Notify } from './constants';

export const RemainingWeekEditor = ({ state, apply, notify }: {
  state: RuntimeState; apply: (transform: (state: RuntimeState) => RuntimeState) => ApplyResult; notify: Notify;
}) => {
  const [editing, setEditing] = useState(false);
  const [windows, setWindows] = useState<SessionContext[]>([]);
  const [proposal, setProposal] = useState<WeekProposal | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setProposal(null); setEditing(false); setError(''); }, [state.block?.id]);
  if (!state.block || !state.source) return null;
  const plan = state.block;
  const dates = remainingDates(plan);
  const update = (date: string, changes: Partial<SessionContext>) => {
    setProposal(null); setError(''); setWindows((current) => current.map((item) => item.date === date ? { ...item, ...changes } : item));
  };
  const preview = () => {
    try { setProposal(previewRemainingWeek(state, windows)); setError(''); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not preview this week.'); }
  };
  const accept = () => {
    if (!proposal) return;
    const outcome = apply((current) => applyRemainingWeek(current, proposal));
    if (!outcome.ok) { setError(outcome.error instanceof Error ? outcome.error.message : 'Preview again before applying.'); return; }
    setEditing(false); setProposal(null);
    notify({ tone: 'success', title: 'Remaining week updated', message: 'Your completed workouts are kept. Open Today on a selected day to start.' });
  };
  return <Card>
    <Txt variant="heading">Plans changed this week?</Txt>
    <Txt variant="caption" tone="secondary">Choose the days you can still train. Review the workouts and any weekly targets that will remain short.</Txt>
    {plan.remainingWeek?.week === plan.currentWeek ? <>
      {plan.remainingWeek.explanation.map((line) => <Txt key={line} variant="caption" tone="secondary">{line}</Txt>)}
      {plan.remainingWeek.windows.map((item) => <Txt key={item.date} variant="caption">{item.date} · {slotPlain(plan.slots.find((slot) => slot.id === item.slotId))} · about {item.workout.estimatedMinutes} min</Txt>)}
    </> : null}
    {state.activeSession ? <Txt variant="caption">Finish or discard your active workout before changing the week.</Txt> : null}
    {!editing ? <Button label="Change remaining week" variant="secondary" disabled={!!state.activeSession || dates.length === 0} onPress={() => {
      setEditing(true); setWindows(plan.remainingWeek?.windows.filter((item) => item.date >= localDate()).map(({ workout: _workout, slotId: _slotId, ...context }) => context) ?? []);
    }} /> : <>
      <Txt variant="caption">Select each available day. No days selected means no more workouts this week.</Txt>
      {dates.map((date) => {
        const window = windows.find((item) => item.date === date);
        return <View key={date} style={{ gap: space.sm }}>
          <Choice role="checkbox" label={date === localDate() ? `Today · ${date}` : date} selected={!!window} onPress={() => {
            setProposal(null); setError(''); setWindows((current) => window ? current.filter((item) => item.date !== date) : [...current, { date, minutesAvailable: state.source!.sessionMinutes, recovery: 'yes', unavailableEquipment: [], unavailableExerciseIds: [] }]);
          }} />
          {window ? <>
            <Segmented options={[30,35,45,60,75]} label={`Time on ${date}`} value={window.minutesAvailable} onChange={(minutesAvailable) => update(date, { minutesAvailable })} format={(value) => `${value}m`} />
            <Segmented options={['yes','meh','no'] as const} label={`Recovery on ${date}`} value={window.recovery} onChange={(recovery) => update(date,{recovery})} format={(value) => value === 'yes' ? 'Ready' : value === 'meh' ? 'Tired' : 'Very tired'} />
            <Txt variant="caption">Unavailable equipment</Txt>
            <View style={{ flexDirection:'row',flexWrap:'wrap',gap:space.xs }}>{state.source!.equipment.map((equipment) => <Choice key={equipment} role="checkbox" compact label={equipmentLabel(equipment)} selected={window.unavailableEquipment.includes(equipment)} onPress={() => update(date, { unavailableEquipment: window.unavailableEquipment.includes(equipment) ? window.unavailableEquipment.filter((item) => item !== equipment) : [...window.unavailableEquipment,equipment] })} />)}</View>
          </> : null}
        </View>;
      })}
      {error ? <Txt variant="caption" tone="danger">{error}</Txt> : null}
      {proposal ? <>
        <Txt variant="heading">Proposed remaining week</Txt>
        {proposal.explanation.map((line) => <Txt key={line} variant="caption">{line}</Txt>)}
        {proposal.plan.remainingWeek?.windows.map((item) => <View key={item.date} style={{ gap: space.xs }}>
          <Txt variant="label">{item.date} · about {item.workout.estimatedMinutes} minutes</Txt>
          {item.workout.exercises.map((entry) => <Txt key={entry.id} variant="caption">{entry.exercise.name} · {entry.sets.length} sets</Txt>)}
        </View>)}
        <Button label="Apply changes" onPress={accept} />
      </> : <Button label="Preview changes" onPress={preview} />}
      <Button label="Cancel" variant="ghost" onPress={() => { setEditing(false); setProposal(null); setError(''); }} />
    </>}
  </Card>;
};
