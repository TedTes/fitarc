import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  discardRuntimeSession, getSwapCandidates, recordRuntimeSet, skipRemainingRuntimeSets, skipRuntimeExercise,
  solveNextSet, substituteRuntimeExercise, undoLastRuntimeSet,
} from '../../runtime';
import type { ExerciseDefinition, RuntimeState } from '../../runtime';
import { colors, radius, space, TOUCH } from './theme';
import { Button, Divider, IconButton, ScreenBrand, Sheet, Txt } from './ui';
import { describeRuntimeError, equipmentLabel, formatKg, muscleList, setsWord } from './copy';
import { nextPendingSet, sessionProgress } from './selectors';
import type { ApplyResult } from './useRuntimeController';
import type { Notify } from './constants';

type Props = {
  state: RuntimeState;
  apply: (transform: (current: RuntimeState) => RuntimeState) => ApplyResult;
  notify: Notify;
};

const RIR_VALUES = [0, 1, 2, 3, 4];
const ACTION_SYMBOL = { increase: '▲', hold: '＝', decrease: '▼', stop: '■' } as const;

/** What the engine uses as a replacement's first load. Mirrors substituteRuntimeExercise. */
const startingLoad = (state: RuntimeState, exercise: ExerciseDefinition) =>
  state.workingSets[exercise.id]?.loadKg
  ?? state.source?.seedWorkingSets.find((item) => item.exerciseId === exercise.id)?.loadKg
  ?? (exercise.compound ? 20 : 10);

/** set.log: one prescription, one signal, the runtime's reply. Everything else is behind the menu. */
export const SetLogger = ({ state, apply, notify }: Props) => {
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState<null | 'menu' | 'swap'>(null);
  const pending = nextPendingSet(state);
  const progress = sessionProgress(state);
  const setId = pending?.set.id;
  const maxReps = pending?.set.maxReps;

  useEffect(() => {
    if (maxReps !== undefined) { setReps(`${maxReps}`); setRir(null); setSubmitting(false); }
  }, [setId, maxReps]);

  const session = state.activeSession;
  const results = useMemo(() => session ? state.setResults.filter((result) => result.prescriptionId === session.id) : [], [state.setResults, session]);
  if (!session || !pending || !progress) return null;

  const { entry, set, exerciseIndex, exerciseCount } = pending;
  const exercise = entry.exercise;
  const lastResult = results[results.length - 1];
  const lastOfExercise = [...results].reverse().find((result) => result.exerciseId === exercise.id);
  const lastDecision = lastOfExercise && lastResult?.setId === lastOfExercise.setId ? state.decisions[state.decisions.length - 1] : undefined;
  const remainingHere = entry.sets.filter((item) => item.status === 'pending').length;
  const isLastSetHere = remainingHere === 1;
  const repsValue = reps.trim() === '' ? null : Number.parseInt(reps, 10);
  const repsValid = repsValue !== null && Number.isFinite(repsValue) && repsValue >= 0 && repsValue <= 99;
  const belowTarget = repsValid && repsValue < set.minReps;
  const adjustedBy = lastOfExercise && lastOfExercise.prescribedLoadKg !== set.loadKg ? set.loadKg - lastOfExercise.prescribedLoadKg : 0;

  // What to beat: the most recent result for this lift from an earlier session, the same reference the diff uses.
  const beat = [...state.setResults].reverse().find((item) => item.exerciseId === exercise.id && item.prescriptionId !== session.id);

  const candidateResult = () => ({
    prescriptionId: session.id, setId: set.id, exerciseId: exercise.id,
    prescribedLoadKg: set.loadKg, prescribedMinReps: set.minReps, prescribedMaxReps: set.maxReps,
    targetRir: set.targetRir, completedReps: repsValue ?? 0, reportedRir: rir ?? 0, completedAt: new Date().toISOString(),
  });
  const preview = rir !== null && repsValid
    ? solveNextSet({ result: candidateResult(), phase: session.phase, incrementKg: exercise.incrementKg, previous: state.workingSets[exercise.id] })
    : null;

  const report = (outcome: ApplyResult, onSuccess: () => void) => {
    if (outcome.ok) { onSuccess(); return true; }
    const problem = describeRuntimeError(outcome.error);
    const duplicate = outcome.error instanceof Error && outcome.error.message === 'set_already_recorded';
    notify({ tone: duplicate ? 'warning' : 'error', title: problem.title, message: problem.message, sticky: !duplicate });
    return false;
  };

  const undoSet = () => {
    const outcome = apply((current) => {
      const latest = [...current.setResults].reverse().find((item) => item.prescriptionId === current.activeSession?.id);
      if (!latest) throw new Error('nothing_to_undo');
      return undoLastRuntimeSet(current);
    });
    report(outcome, () => notify({ tone: 'info', title: 'undo → last set pending again', message: 'Its decision and working weight are rolled back.' }));
  };

  const submit = () => {
    if (submitting || rir === null || !repsValid) return;
    setSubmitting(true);
    const result = candidateResult();
    const outcome = apply((current) => recordRuntimeSet(current, result));
    const ok = report(outcome, () => {
      if (!outcome.ok) return;
      const decision = outcome.state.decisions[outcome.state.decisions.length - 1];
      const done = !outcome.state.activeSession?.exercises.some((item) => item.sets.some((candidate) => candidate.status === 'pending'));
      notify({
        tone: 'success',
        title: `${formatKg(result.prescribedLoadKg)} × ${result.completedReps} @ ${result.reportedRir} → ${decision.action}, ${isLastSetHere ? 'next session' : 'next set'} ${formatKg(decision.nextLoadKg)}`,
        message: `${decision.explanation}${done ? ' All sets logged: review the diff.' : ''}`,
      });
    });
    if (!ok) setSubmitting(false);
  };

  const skipExercise = () => Alert.alert(
    `Skip ${exercise.name}?`,
    `Skips the remaining ${setsWord(remainingHere)} of ${exercise.name}. They won't count. Sets already logged stay. Skipped sets can't be restored in this session.`,
    [{ text: 'Keep going', style: 'cancel' }, {
      text: 'Skip exercise', style: 'destructive', onPress: () => {
        setSheet(null);
        report(apply((current) => skipRuntimeExercise(current, exercise.id, false)), () => notify({ tone: 'info', title: `skipped ${exercise.name} · ${setsWord(remainingHere)}` }));
      },
    }]
  );

  const reportPain = () => Alert.alert(
    `Report pain on ${exercise.name}?`,
    `Skips the remaining ${setsWord(remainingHere)} and adds ${exercise.name} to source as excluded. solver() stops prescribing it. Recompile the block after this session to get a replacement, or allow it again in source. If pain is sharp or lasting, stop training and get it checked.`,
    [{ text: 'Cancel', style: 'cancel' }, {
      text: 'Exclude it', style: 'destructive', onPress: () => {
        setSheet(null);
        report(apply((current) => skipRuntimeExercise(current, exercise.id, true)), () => notify({
          tone: 'warning', title: `pain → ${exercise.name} excluded in source`,
          message: 'solver() will not prescribe it. Recompile once this session is committed to get a replacement.', sticky: true,
        }));
      },
    }]
  );

  const swapTo = (replacement: ExerciseDefinition) => Alert.alert(
    `Swap to ${replacement.name}?`,
    `Replaces the remaining ${setsWord(remainingHere)} of ${exercise.name} with ${replacement.name}, starting at ${formatKg(startingLoad(state, replacement))}. Sets already logged stay. A swap can't be undone.`,
    [{ text: 'Cancel', style: 'cancel' }, {
      text: 'Swap', onPress: () => {
        setSheet(null);
        report(apply((current) => substituteRuntimeExercise(current, exercise.id, replacement.id)), () => notify({
          tone: 'success', title: `swap → ${replacement.name} replaces ${exercise.name} · ${setsWord(remainingHere)}`,
        }));
      },
    }]
  );

  const finishEarly = () => Alert.alert(
    'Finish now and review?',
    `Skips the ${setsWord(progress.pending)} still pending and opens the session diff. Nothing is committed to history until you commit.`,
    [{ text: 'Keep training', style: 'cancel' }, {
      text: 'Finish and review', onPress: () => {
        setSheet(null);
        report(apply(skipRemainingRuntimeSets), () => notify({ tone: 'info', title: `finished early · ${setsWord(progress.pending)} skipped` }));
      },
    }]
  );

  const discard = () => Alert.alert(
    'Discard this session?',
    `Rolls back the ${setsWord(results.length)} you logged and restores your previous working weights. Can't be undone.`,
    [{ text: 'Keep session', style: 'cancel' }, {
      text: 'Discard session', style: 'destructive', onPress: () => {
        setSheet(null);
        report(apply(discardRuntimeSession), () => notify({ tone: 'info', title: 'discarded → working weights restored' }));
      },
    }]
  );

  const candidates = sheet === 'swap' ? getSwapCandidates(state, exercise.id, 4) : [];
  const decisionCue = !preview || rir === null
    ? 'select reps left · solver() will compute the next dose'
    : `${rir === 4 ? '4+' : rir} in reserve · ${preview.action === 'increase' ? 'target cleared → load up' : preview.action === 'hold' ? 'inside target → hold dose' : preview.action === 'decrease' ? 'target missed → reduce dose' : 'failure signal → stop'}`;
  const logLabel = !preview
    ? 'commit signal'
    : progress.pending === 1
      ? 'commit → review session'
      : isLastSetHere
        ? 'commit → next exercise'
        : `commit → next · ${formatKg(preview.nextLoadKg)} ${ACTION_SYMBOL[preview.action]}`;
  const evidence = lastDecision && lastOfExercise
    ? `last set · ${formatKg(lastOfExercise.prescribedLoadKg)} × ${lastOfExercise.completedReps} @${lastOfExercise.reportedRir} → ${lastDecision.action}`
    : beat
      ? `last session · ${formatKg(beat.prescribedLoadKg)} × ${beat.completedReps} @${beat.reportedRir} → baseline for this dose`
      : 'no prior result · this set establishes the baseline';

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.top}>
          <ScreenBrand name="set.log" />
          <View style={styles.topRow}>
            <Txt style={styles.exerciseTitle} accessibilityRole="header">{exercise.name}</Txt>
            <IconButton icon="ellipsis-horizontal" label="Menu: swap, skip, pain, finish, discard" onPress={() => setSheet('menu')} />
          </View>
          <View style={styles.progressRow} accessible accessibilityLabel={`Lift ${exerciseIndex + 1} of ${exerciseCount}, set ${set.setNumber} of ${entry.sets.length}. ${progress.done} of ${progress.total} sets done.`}>
            <Txt variant="mono" tone="muted">exercise {exerciseIndex + 1} of {exerciseCount} · set {set.setNumber} of {entry.sets.length}</Txt>
            <View style={styles.pips}>
              {session.exercises.map((item) => (
                <View key={item.id} style={styles.pipGroup}>
                  {item.sets.map((candidate) => (
                    <View
                      key={candidate.id}
                      style={[
                        styles.pip,
                        candidate.status === 'completed' && styles.pipDone,
                        candidate.status === 'skipped' && styles.pipSkipped,
                        candidate.id === set.id && styles.pipNow,
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.prescriptionBlock}>
          <View style={styles.prescribed} accessible accessibilityLabel={`Prescribed ${formatKg(set.loadKg)}${adjustedBy !== 0 ? `, ${adjustedBy > 0 ? 'up' : 'down'} ${Math.abs(Number(adjustedBy.toFixed(2)))} from ${formatKg(lastOfExercise!.prescribedLoadKg)}` : ''}, ${set.minReps} to ${set.maxReps} reps, target RIR ${set.targetRir}`}>
            <Txt maxFontSizeMultiplier={1.3} style={styles.loadNumber}>{formatKg(set.loadKg)}</Txt>
            <View style={styles.prescribedSide}>
              <Txt variant="number">{set.minReps}–{set.maxReps} reps</Txt>
              <Txt variant="mono" tone="secondary">RIR {set.targetRir}</Txt>
            </View>
          </View>
          <View style={styles.evidenceRow}>
            <Txt variant="mono" tone="muted" style={styles.flex} numberOfLines={2}>{evidence}</Txt>
            {lastDecision && lastOfExercise ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={lastResult ? `Undo last set, ${formatKg(lastResult.prescribedLoadKg)} times ${lastResult.completedReps}` : 'Undo last set'}
              onPress={undoSet}
              style={styles.undo}
            >
              <Ionicons name="arrow-undo" size={18} color={colors.textSecondary} />
              <Txt variant="code" tone="secondary">undo</Txt>
            </Pressable>
            ) : null}
          </View>
        </View>

        <Divider />

        <View style={styles.signalBlock}>
          <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button" accessibilityLabel="One fewer rep" disabled={!repsValid || repsValue === 0}
                onPress={() => setReps(`${Math.max(0, (repsValue ?? 0) - 1)}`)}
                style={({ pressed }) => [styles.stepButton, pressed && styles.pressed, (!repsValid || repsValue === 0) && styles.stepDisabled]}
              >
                <Ionicons name="remove" size={24} color={colors.text} />
              </Pressable>
              <View style={styles.repsValue}>
                <TextInput
                  style={styles.repsInput} value={reps} onChangeText={(value) => setReps(value.replace(/[^0-9]/g, '').slice(0, 2))}
                  inputMode="numeric" keyboardType="number-pad" selectTextOnFocus maxFontSizeMultiplier={1.3}
                  accessibilityLabel="Reps completed" accessibilityHint={`Prescribed ${set.minReps} to ${set.maxReps}`}
                />
                <Txt variant="caption" tone="muted">reps done</Txt>
              </View>
              <Pressable
                accessibilityRole="button" accessibilityLabel="One more rep" disabled={repsValue !== null && repsValue >= 99}
                onPress={() => setReps(`${Math.min(99, (repsValue ?? 0) + 1)}`)}
                style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
              >
                <Ionicons name="add" size={24} color={colors.text} />
              </Pressable>
          </View>

          <View accessibilityRole="radiogroup" accessibilityLabel="Reps in reserve" style={styles.rirRow}>
              {RIR_VALUES.map((value) => {
                const selected = rir === value;
                const isTarget = value === set.targetRir;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={`RIR ${value}${value === 4 ? ' or more' : ''}${isTarget ? ', target for this set' : ''}`}
                    accessibilityState={{ checked: selected }}
                    onPress={() => setRir(value)}
                    style={({ pressed }) => [styles.rirButton, selected && styles.rirSelected, pressed && styles.pressed]}
                  >
                    <Txt maxFontSizeMultiplier={1.3} style={[styles.rirNumber, selected && styles.rirNumberSelected]}>{value === 4 ? '4+' : value}</Txt>
                  </Pressable>
                );
              })}
          </View>

          {!repsValid ? (
            <Txt variant="caption" tone="danger" style={styles.signalCue} accessibilityLiveRegion="polite">Enter reps from 0 to 99.</Txt>
          ) : belowTarget ? (
            <Txt variant="caption" tone="warning" style={styles.signalCue} accessibilityLiveRegion="polite">{rir === null ? 'under rep target · select reps left' : decisionCue}</Txt>
          ) : (
            <Txt variant="caption" tone={preview ? 'secondary' : 'muted'} style={styles.signalCue} accessibilityLiveRegion="polite">{decisionCue}</Txt>
          )}
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={logLabel} loading={submitting}
          disabled={rir === null || !repsValid}
          hint={rir === null ? 'Select reps in reserve first' : 'Commits this performance signal and advances the runtime'}
          onPress={submit}
        />
      </View>

      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)} title={exercise.name}>
        <Txt variant="label" tone="muted">this lift</Txt>
        <OptionRow icon="swap-horizontal" title="Swap lift" onPress={() => setSheet('swap')} />
        <OptionRow icon="play-skip-forward" title="Skip exercise" onPress={skipExercise} />
        <OptionRow icon="bandage" tone="danger" title="Report pain" onPress={reportPain} />
        <Divider />
        <Txt variant="label" tone="muted">session · {results.length} logged · {progress.pending} pending</Txt>
        <OptionRow icon="flag" title="Finish early and review" disabled={results.length === 0} onPress={finishEarly} />
        <OptionRow icon="trash" tone="danger" title="Discard session" onPress={discard} />
      </Sheet>

      <Sheet visible={sheet === 'swap'} onClose={() => setSheet('menu')} title={`Swap ${exercise.name}`}>
        {candidates.length ? candidates.map((candidate) => (
          <OptionRow
            key={candidate.id} icon="barbell" title={candidate.name}
            detail={`targets ${muscleList(candidate.primaryMuscles)} · ${candidate.equipment.map(equipmentLabel).join(', ')} · starts at ${formatKg(startingLoad(state, candidate))}`}
            onPress={() => swapTo(candidate)}
          />
        )) : (
          <>
            <Txt>No other exercise fits your equipment and limitations for this movement.</Txt>
            <Button label="Skip this exercise instead" variant="secondary" onPress={skipExercise} />
          </>
        )}
        <Button label="Back" variant="ghost" onPress={() => setSheet('menu')} />
      </Sheet>
    </View>
  );
};

const OptionRow = ({ icon, title, detail, onPress, tone, disabled }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; detail?: string; onPress: () => void; tone?: 'danger'; disabled?: boolean;
}) => (
  <Pressable
    accessibilityRole="button" accessibilityLabel={detail ? `${title}. ${detail}` : title} accessibilityState={{ disabled: Boolean(disabled) }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.option, tone === 'danger' && styles.optionDanger, disabled && styles.optionDisabled, pressed && styles.pressed]}
  >
    <Ionicons name={icon} size={24} color={tone === 'danger' ? colors.danger : colors.accent} />
    <View style={styles.flex}>
      <Txt variant="heading" tone={tone === 'danger' ? 'danger' : 'primary'}>{title}</Txt>
      {detail ? <Txt variant="caption" tone="secondary">{detail}</Txt> : null}
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  pipNow: { borderColor: colors.accent, borderWidth: 2 },
  pipSkipped: { backgroundColor: colors.border, borderColor: colors.border, opacity: 0.5 },
  pipDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  pip: { width: 16, height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong },
  pipGroup: { flexDirection: 'row', gap: 3 },
  pips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  progressRow: { gap: space.xs },
  top: { gap: space.sm },
  flex: { flex: 1 },
  page: { padding: space.lg, paddingBottom: space.md, gap: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  exerciseTitle: { flex: 1, fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.text },
  prescriptionBlock: { gap: space.sm, paddingVertical: space.xs },
  prescribed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  prescribedSide: { alignItems: 'flex-end', gap: 2 },
  loadNumber: { color: colors.text, fontSize: 42, lineHeight: 48, fontWeight: '800', fontVariant: ['tabular-nums'] },
  evidenceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: TOUCH - 8, paddingHorizontal: space.sm },
  signalBlock: { gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepButton: { width: 60, height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  stepDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  repsValue: { flex: 1, alignItems: 'center' },
  repsInput: { width: '100%', minHeight: 42, textAlign: 'center', color: colors.text, fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rirRow: { flexDirection: 'row', gap: space.sm },
  rirButton: { flex: 1, minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  rirSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 2, borderStyle: 'solid' },
  rirNumber: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  rirNumberSelected: { color: colors.accent },
  signalCue: { textAlign: 'center', minHeight: 20 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.ground, padding: space.lg },
  option: { flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, minHeight: TOUCH },
  optionDanger: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  optionDisabled: { opacity: 0.5 },
});
