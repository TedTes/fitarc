import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  discardRuntimeSession, getSwapCandidates, recordRuntimeSet, reorderRuntimeExercises, skipRemainingRuntimeSets, skipRuntimeExercise,
  restSecondsFor, substituteRuntimeExercise, undoLastRuntimeSet,
} from '../../runtime';
import type { ExerciseDefinition, RuntimeState, SessionPrescription } from '../../runtime';
import { colors, radius, space, TOUCH } from './theme';
import { Button, Divider, IconButton, Sheet, Txt } from './ui';
import { describeRuntimeError, equipmentLabel, formatKg, muscleList, setsWord } from './copy';
import { nextPendingSet, pendingSetForExercise, sessionProgress } from './selectors';
import type { ApplyResult } from './useRuntimeController';
import type { Notify } from './constants';

type Props = {
  state: RuntimeState;
  apply: (transform: (current: RuntimeState) => RuntimeState) => ApplyResult;
  notify: Notify;
  onDockChange: (dock: WorkoutDockState | null) => void;
};

export type WorkoutDockState = {
  phase: 'ready' | 'set' | 'rest';
  seconds: number;
  primaryDisabled: boolean;
  onPrimary: () => void;
  onReset: () => void;
};

type RestState = {
  until: number;
  durationSeconds: number;
  nextSetId: string;
  fromExerciseId: string;
  nextExerciseId: string;
};

const DockBridge = ({ phase, seconds, primaryDisabled, onPrimary, onReset, onChange }: WorkoutDockState & {
  onChange: (dock: WorkoutDockState | null) => void;
}) => {
  const actions = useRef({ onPrimary, onReset });
  actions.current = { onPrimary, onReset };

  useEffect(() => {
    onChange({
      phase,
      seconds,
      primaryDisabled,
      onPrimary: () => actions.current.onPrimary(),
      onReset: () => actions.current.onReset(),
    });
  }, [onChange, phase, primaryDisabled, seconds]);

  useEffect(() => () => onChange(null), [onChange]);
  return null;
};

/** What the engine uses as a replacement's first load. Mirrors substituteRuntimeExercise. */
const startingLoad = (state: RuntimeState, exercise: ExerciseDefinition) =>
  state.workingSets[exercise.id]?.loadKg
  ?? state.source?.seedWorkingSets.find((item) => item.exerciseId === exercise.id)?.loadKg
  ?? (exercise.compound ? 20 : 10);

const SolverHeader = ({ state, session, now }: { state: RuntimeState; session: SessionPrescription; now: number }) => {
  const slot = state.block?.slots.find((candidate) => candidate.id === session.slotId);
  const startedAt = new Date(session.createdAt).getTime();
  const elapsedMinutes = Number.isFinite(startedAt) ? Math.max(0, Math.floor((now - startedAt) / 60000)) : 0;
  const minutesLeft = Math.max(0, session.context.minutesAvailable - elapsedMinutes);
  const recovery = session.context.recovery === 'yes' ? 'recovered' : session.context.recovery === 'meh' ? 'tired' : 'wrecked';
  const target = slot?.targetMuscles[0] ?? session.exercises[0]?.exercise.primaryMuscles[0] ?? 'training';
  return (
    <View style={styles.solverHead}>
      <View style={styles.solverHeadRow}>
        <Txt variant="label" style={styles.solverBrand}>solver()<Txt variant="label" tone="accent">.</Txt></Txt>
        <Txt variant="mono" tone="secondary" numberOfLines={1}>{slot?.label ?? 'session'} · {minutesLeft}m left · {recovery}</Txt>
      </View>
      <Txt variant="code" tone="accent">maximize {target}_{state.block?.goal ?? state.source?.goal ?? 'training'}</Txt>
    </View>
  );
};

/** set.log: one prescription, one signal, the runtime's reply. Everything else is behind the menu. */
export const SetLogger = ({ state, apply, notify, onDockChange }: Props) => {
  const { height: windowHeight } = useWindowDimensions();
  const stackRowHeight = Math.round(Math.max(54, Math.min(76, windowHeight * 0.085)));
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState<null | 'menu' | 'swap'>(null);
  const [rest, setRest] = useState<RestState | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [setStartedAt, setSetStartedAt] = useState<number | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const stackScroll = useRef<ScrollView>(null);
  const frameScroll = useRef<ScrollView>(null);
  const defaultPending = nextPendingSet(state);
  const selectedPending = selectedExerciseId ? pendingSetForExercise(state, selectedExerciseId) : null;
  const pending = selectedPending ?? defaultPending;
  const progress = sessionProgress(state);
  const setId = pending?.set.id;
  const maxReps = pending?.set.maxReps;

  useEffect(() => {
    if (maxReps !== undefined) {
      setReps(`${maxReps}`); setRir(3); setSubmitting(false); setSetStartedAt(null);
      frameScroll.current?.scrollTo({ y: 0, animated: true });
    }
  }, [setId, maxReps]);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!rest && !selectedPending && defaultPending) setSelectedExerciseId(defaultPending.entry.exercise.id);
  }, [defaultPending?.set.id, selectedPending?.set.id, selectedExerciseId, rest]);

  useEffect(() => {
    if (rest && setId && rest.nextSetId !== setId) setRest(null);
  }, [rest, setId]);

  const session = state.activeSession;
  const visibleExerciseId = rest?.fromExerciseId ?? pending?.entry.exercise.id;
  const selectedIndex = session?.exercises.findIndex((item) => item.exercise.id === visibleExerciseId) ?? -1;

  useEffect(() => {
    if (selectedIndex < 0) return;
    const frame = requestAnimationFrame(() => {
      stackScroll.current?.scrollTo({ y: selectedIndex * stackRowHeight, animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex, stackRowHeight]);

  useEffect(() => {
    if (rest && clockNow >= rest.until) {
      setSelectedExerciseId(rest.nextExerciseId);
      setRest(null);
    }
  }, [clockNow, rest]);

  const results = useMemo(() => session ? state.setResults.filter((result) => result.prescriptionId === session.id) : [], [state.setResults, session]);
  if (!session || !pending || !progress) return null;

  const { entry, set, exerciseIndex, exerciseCount } = pending;
  const exercise = entry.exercise;
  const lastResult = results[results.length - 1];
  const lastOfExercise = [...results].reverse().find((result) => result.exerciseId === exercise.id);
  const canUndo = Boolean(lastOfExercise && lastResult?.setId === lastOfExercise.setId);
  const remainingHere = entry.sets.filter((item) => item.status === 'pending').length;
  const repsValue = reps.trim() === '' ? null : Number.parseInt(reps, 10);
  const repsValid = repsValue !== null && Number.isFinite(repsValue) && repsValue >= 0 && repsValue <= 99;

  // What to beat: the most recent result for this lift from an earlier session, the same reference the diff uses.
  const beat = [...state.setResults].reverse().find((item) => item.exerciseId === exercise.id && item.prescriptionId !== session.id);

  const candidateResult = () => ({
    prescriptionId: session.id, setId: set.id, exerciseId: exercise.id,
    prescribedLoadKg: set.loadKg, prescribedMinReps: set.minReps, prescribedMaxReps: set.maxReps,
    targetRir: set.targetRir, completedReps: repsValue ?? 0, reportedRir: rir ?? 0, completedAt: new Date().toISOString(),
  });
  const report = (outcome: ApplyResult, onSuccess: () => void) => {
    if (outcome.ok) { onSuccess(); return true; }
    const problem = describeRuntimeError(outcome.error);
    const duplicate = outcome.error instanceof Error && outcome.error.message === 'set_already_recorded';
    notify({ tone: duplicate ? 'warning' : 'error', title: problem.title, message: problem.message, sticky: !duplicate });
    return false;
  };

  const moveExercise = (exerciseId: string, direction: -1 | 1) => {
    const ids = session.exercises.map((item) => item.exercise.id);
    const from = ids.indexOf(exerciseId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    report(apply((current) => reorderRuntimeExercises(current, ids)), () => setSelectedExerciseId(exerciseId));
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
      setSetStartedAt(null);
      const decision = outcome.state.decisions[outcome.state.decisions.length - 1];
      const next = pendingSetForExercise(outcome.state, exercise.id) ?? nextPendingSet(outcome.state);
      if (next && decision) {
        const duration = restSecondsFor(outcome.state.source?.goal ?? 'hypertrophy', exercise.compound);
        setOrdering(false);
        setRest({
          until: Date.now() + duration * 1000,
          durationSeconds: duration,
          nextSetId: next.set.id,
          fromExerciseId: exercise.id,
          nextExerciseId: next.entry.exercise.id,
        });
      }
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
  const priorDose = lastOfExercise ?? beat;
  const loadChange = priorDose ? Number((set.loadKg - priorDose.prescribedLoadKg).toFixed(2)) : 0;
  const frameRule = priorDose
    ? `${priorDose.completedReps >= priorDose.prescribedMinReps ? 'last reps hit' : 'last reps missed'} + RIR${priorDose.reportedRir} → ${loadChange > 0 ? `+${formatKg(loadChange)}` : loadChange < 0 ? `−${formatKg(Math.abs(loadChange))}` : 'hold'}`
    : 'no prior signal → establish baseline';

  const resting = rest?.nextSetId === set.id;
  const secondsLeft = resting ? Math.max(0, Math.ceil((rest.until - clockNow) / 1000)) : 0;
  const setSeconds = setStartedAt === null ? 0 : Math.max(0, Math.floor((clockNow - setStartedAt) / 1000));
  const dockPhase: WorkoutDockState['phase'] = resting ? 'rest' : setStartedAt === null ? 'ready' : 'set';
  const resetDockTimer = () => {
    if (resting) {
      setRest((value) => value ? { ...value, until: Date.now() + value.durationSeconds * 1000 } : null);
    } else {
      setSetStartedAt(null);
    }
  };
  const runDockPrimary = () => {
    if (resting) {
      setRest((value) => value ? { ...value, until: Date.now() } : null);
    } else if (setStartedAt === null) {
      setSetStartedAt(Date.now());
    } else {
      submit();
    }
  };

  return (
    <View style={styles.flex}>
      <DockBridge
        phase={dockPhase}
        seconds={resting ? secondsLeft : setSeconds}
        primaryDisabled={dockPhase === 'set' && (rir === null || !repsValid || submitting)}
        onPrimary={runDockPrimary}
        onReset={resetDockTimer}
        onChange={onDockChange}
      />
      <View style={styles.page}>
        <SolverHeader state={state} session={session} now={clockNow} />

        <View style={styles.workspace}>
          <View style={styles.runtimeSection}>
          <View style={styles.sectionHeader}>
            <Txt variant="label" tone="muted">STACK</Txt>
            <View style={styles.stackHeaderActions}>
              <Txt variant="mono" tone="secondary">{exerciseIndex + 1} / {exerciseCount} lifts</Txt>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ordering ? 'Finish ordering exercises' : 'Change exercise order'}
                onPress={() => setOrdering((value) => !value)}
                style={({ pressed }) => [styles.orderToggle, ordering && styles.orderToggleActive, pressed && styles.pressed]}
              >
                <Ionicons name={ordering ? 'checkmark' : 'reorder-three'} size={18} color={ordering ? colors.accent : colors.textSecondary} />
                <Txt variant="label" tone={ordering ? 'accent' : 'secondary'}>{ordering ? 'done' : 'order'}</Txt>
              </Pressable>
            </View>
          </View>
          <ScrollView
            ref={stackScroll}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            style={[styles.stackViewport, { height: Math.min(3, session.exercises.length) * stackRowHeight }]}
            contentContainerStyle={styles.stackTrack}
            decelerationRate="fast"
            snapToInterval={stackRowHeight}
            keyboardShouldPersistTaps="handled"
          >
            {session.exercises.map((stackEntry) => {
              const pendingSets = stackEntry.sets.filter((candidate) => candidate.status === 'pending');
              const completedSets = stackEntry.sets.filter((candidate) => candidate.status === 'completed').length;
              const skippedSets = stackEntry.sets.filter((candidate) => candidate.status === 'skipped').length;
              const selected = stackEntry.exercise.id === visibleExerciseId;
              const done = pendingSets.length === 0;
              const nextSet = pendingSets[0];
              const stateLabel = done ? (completedSets ? 'done' : 'skip') : selected ? '▶ now' : 'next';
              const stateTone = done ? (completedSets ? 'success' : 'muted') : selected ? 'accent' : 'secondary';
              const progressLabel = done
                ? `${completedSets}/${stackEntry.sets.length}`
                : `set ${nextSet.setNumber}/${stackEntry.sets.length}`;
              const stackIndex = session.exercises.indexOf(stackEntry);
              return (
                <View key={stackEntry.id} style={[styles.stackRow, { height: stackRowHeight }, selected && styles.stackRowSelected]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${stateLabel}, ${stackEntry.exercise.name}, ${progressLabel}${skippedSets ? `, ${skippedSets} skipped` : ''}`}
                    accessibilityState={{ selected, disabled: done || resting }}
                    disabled={done || resting || ordering}
                    onPress={() => { setSetStartedAt(null); setSelectedExerciseId(stackEntry.exercise.id); }}
                    style={({ pressed }) => [styles.stackRowBody, pressed && styles.pressed]}
                  >
                    <Txt variant="label" tone={stateTone} style={styles.stackState}>{stateLabel}</Txt>
                    <Txt variant="caption" tone={done ? 'muted' : 'primary'} style={styles.stackName} numberOfLines={1}>{stackEntry.exercise.name}</Txt>
                    <Txt variant="mono" tone="muted">{progressLabel}</Txt>
                  </Pressable>
                  {ordering ? (
                    <View style={styles.orderControls}>
                      <Pressable
                        accessibilityRole="button" accessibilityLabel={`Move ${stackEntry.exercise.name} earlier`}
                        disabled={stackIndex === 0} onPress={() => moveExercise(stackEntry.exercise.id, -1)}
                        style={({ pressed }) => [styles.orderButton, stackIndex === 0 && styles.stepDisabled, pressed && styles.pressed]}
                      ><Ionicons name="arrow-back" size={18} color={colors.textSecondary} /></Pressable>
                      <Pressable
                        accessibilityRole="button" accessibilityLabel={`Move ${stackEntry.exercise.name} later`}
                        disabled={stackIndex === exerciseCount - 1} onPress={() => moveExercise(stackEntry.exercise.id, 1)}
                        style={({ pressed }) => [styles.orderButton, stackIndex === exerciseCount - 1 && styles.stepDisabled, pressed && styles.pressed]}
                      ><Ionicons name="arrow-forward" size={18} color={colors.textSecondary} /></Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
          </View>

          <Divider />

          <View style={[styles.runtimeSection, styles.frameSection]}>
          <View style={styles.sectionHeader}>
            <Txt variant="label" tone={resting ? 'accent' : 'muted'}>{resting ? 'NEXT FRAME' : 'FRAME'}</Txt>
            <View style={styles.frameIdentity}>
              <Txt variant="mono" tone="secondary" numberOfLines={1}>{exercise.id}</Txt>
              <IconButton icon="ellipsis-horizontal" label="Menu: swap, skip, pain, finish, discard" onPress={() => setSheet('menu')} />
            </View>
          </View>

          <ScrollView
            ref={frameScroll}
            style={styles.frameViewport}
            contentContainerStyle={styles.frameContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
          <View style={styles.frameFacts}>
            <View style={styles.frameRow}>
              <Txt variant="label" tone="muted" style={styles.frameLabel}>{lastOfExercise ? 'last committed' : 'last session'}</Txt>
              <Txt variant="code" tone={priorDose ? 'secondary' : 'muted'} style={styles.frameValue}>
                {priorDose ? `${formatKg(priorDose.prescribedLoadKg)} × ${priorDose.completedReps} @ RIR${priorDose.reportedRir}` : 'none · establishes baseline'}
              </Txt>
            </View>
            <View style={styles.frameRow}>
              <Txt variant="label" tone="muted" style={styles.frameLabel}>this set</Txt>
              <Txt variant="code" style={styles.frameValue}>{formatKg(set.loadKg)} × {set.maxReps} @ RIR{set.targetRir}</Txt>
            </View>
            <View style={styles.frameRow}>
              <Txt variant="label" tone="muted" style={styles.frameLabel}>rule</Txt>
              <Txt variant="mono" tone="accent" style={styles.frameValue}>{frameRule}</Txt>
            </View>
            <View style={[styles.frameAdjustRow, resting && styles.controlsResting]} pointerEvents={resting ? 'none' : 'auto'}>
              <Txt variant="label" tone="muted" style={styles.frameLabel}>reps done</Txt>
              <View style={styles.inlineValue}>
                <TextInput
                  style={styles.inlineRepsInput} value={reps} onChangeText={(value) => setReps(value.replace(/[^0-9]/g, '').slice(0, 2))}
                  inputMode="numeric" keyboardType="number-pad" selectTextOnFocus maxFontSizeMultiplier={1.3}
                  accessibilityLabel="Reps completed" accessibilityHint={`Prescribed ${set.minReps} to ${set.maxReps}`}
                />
                <Txt variant="mono" tone="muted">/ {set.minReps === set.maxReps ? set.maxReps : `${set.minReps}–${set.maxReps}`}</Txt>
              </View>
              <View style={styles.inlineAdjustButtons}>
                <Pressable
                  accessibilityRole="button" accessibilityLabel="One fewer rep" disabled={!repsValid || repsValue === 0}
                  onPress={() => setReps(`${Math.max(0, (repsValue ?? 0) - 1)}`)}
                  style={({ pressed }) => [styles.inlineAdjustButton, pressed && styles.pressed, (!repsValid || repsValue === 0) && styles.stepDisabled]}
                ><Ionicons name="remove" size={16} color={colors.text} /></Pressable>
                <Pressable
                  accessibilityRole="button" accessibilityLabel="One more rep" disabled={repsValue !== null && repsValue >= 99}
                  onPress={() => setReps(`${Math.min(99, (repsValue ?? 0) + 1)}`)}
                  style={({ pressed }) => [styles.inlineAdjustButton, pressed && styles.pressed]}
                ><Ionicons name="add" size={16} color={colors.text} /></Pressable>
              </View>
            </View>
            <View style={[styles.frameAdjustRow, resting && styles.controlsResting]} pointerEvents={resting ? 'none' : 'auto'}>
              <Txt variant="label" tone="muted" style={styles.frameLabel}>RIR</Txt>
              <View style={styles.inlineValue} accessible accessibilityLabel={`RIR ${rir ?? 3}, target ${set.targetRir}`}>
                <Txt variant="number" tone="accent">{rir === 4 ? '4+' : rir ?? 3}</Txt>
                <Txt variant="mono" tone="muted">/ target {set.targetRir}</Txt>
              </View>
              <View style={styles.inlineAdjustButtons}>
                <Pressable
                  accessibilityRole="button" accessibilityLabel="Decrease RIR"
                  disabled={rir === 0}
                  onPress={() => setRir(rir === null ? Math.max(0, set.targetRir - 1) : Math.max(0, rir - 1))}
                  style={({ pressed }) => [styles.inlineAdjustButton, rir === 0 && styles.stepDisabled, pressed && styles.pressed]}
                ><Ionicons name="remove" size={16} color={colors.text} /></Pressable>
                <Pressable
                  accessibilityRole="button" accessibilityLabel="Increase RIR"
                  disabled={rir === 4}
                  onPress={() => setRir(rir === null ? Math.min(4, set.targetRir + 1) : Math.min(4, rir + 1))}
                  style={({ pressed }) => [styles.inlineAdjustButton, rir === 4 && styles.stepDisabled, pressed && styles.pressed]}
                ><Ionicons name="add" size={16} color={colors.text} /></Pressable>
              </View>
            </View>
          </View>

          {canUndo ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Undo last committed set" onPress={undoSet} style={styles.undoInline}>
              <Ionicons name="arrow-undo" size={16} color={colors.textMuted} />
              <Txt variant="mono" tone="muted">undo last commit</Txt>
            </Pressable>
          ) : null}
            </ScrollView>
          </View>
        </View>
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
  solverHead: { gap: space.sm },
  solverHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  solverBrand: { fontSize: 18, lineHeight: 24, color: colors.text },
  workspace: { flex: 1, minHeight: 0 },
  runtimeSection: { gap: space.md },
  sectionHeader: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  stackHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  orderToggle: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  orderToggleActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  stackViewport: { backgroundColor: colors.surface },
  stackTrack: { paddingHorizontal: 0 },
  stackRow: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  stackRowSelected: { backgroundColor: colors.accentSoft, borderLeftWidth: 3, borderLeftColor: colors.accent },
  stackRowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  stackState: { width: 48 },
  stackName: { flex: 1 },
  orderControls: { width: 82, flexDirection: 'row', borderLeftWidth: 1, borderLeftColor: colors.border },
  orderButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.border },
  frameIdentity: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space.xs },
  frameSection: { flex: 1, minHeight: 0 },
  frameViewport: { flex: 1 },
  frameContent: { flexGrow: 1, gap: space.md, paddingBottom: space.md },
  frameFacts: { flexGrow: 1, minHeight: 240, justifyContent: 'space-evenly', gap: space.sm },
  frameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  frameAdjustRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: space.md },
  frameLabel: { width: 112 },
  frameValue: { flex: 1 },
  inlineValue: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  inlineRepsInput: { width: 34, minHeight: 34, color: colors.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'center', borderBottomWidth: 1, borderBottomColor: colors.accent, paddingVertical: 0 },
  inlineAdjustButtons: { flexDirection: 'row', gap: space.xs },
  inlineAdjustButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  controlsResting: { opacity: 0.42 },
  undoInline: { alignSelf: 'flex-end', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm },
  flex: { flex: 1 },
  page: { flex: 1, minHeight: 0, padding: space.lg, paddingBottom: space.md, gap: space.lg },
  stepDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  option: { flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, minHeight: TOUCH },
  optionDanger: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  optionDisabled: { opacity: 0.5 },
});
