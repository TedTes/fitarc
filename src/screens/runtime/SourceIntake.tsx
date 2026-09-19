import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { createRuntimeId } from '../../runtime';
import type { RuntimeGoal, SeedWorkingSet, TrainingSource } from '../../runtime';
import type { User } from '../../types/domain';
import { colors, radius, space, TOUCH } from './theme';
import { Banner, Button, Card, Choice, ScreenBrand, ScreenTitle, Section, Segmented, StateTag, Txt } from './ui';
import { exerciseName, goalLabel, limitationLabel } from './copy';
import {
  DAY_OPTIONS, EquipmentPreset, LIMITATIONS, MINUTE_OPTIONS, presetEquipment, presetLabel, presetOf, SEED_LIFTS,
} from './constants';

type Props = {
  mode: 'first' | 'edit';
  user: User;
  initial: TrainingSource | null;
  /** Block version the source currently compiles to, for the version preview. */
  blockVersion?: number;
  suggestedSeeds: SeedWorkingSet[];
  /** A session is active, so the block cannot be recompiled right now. */
  sessionActive?: boolean;
  onSubmit: (source: TrainingSource) => void;
  onCancel?: () => void;
};

const parseWeight = (raw: string | undefined): { value: number | null; error: string | null } => {
  const text = (raw ?? '').trim().replace(',', '.');
  if (!text) return { value: null, error: null };
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > 500) return { value: null, error: 'Enter a weight in kg from 1 to 500, or leave it blank.' };
  return { value, error: null };
};

export const SourceIntake = ({ mode, user, initial, blockVersion, suggestedSeeds, sessionActive, onSubmit, onCancel }: Props) => {
  const [goal, setGoal] = useState<RuntimeGoal>(initial?.goal ?? 'hypertrophy');
  const [days, setDays] = useState<3 | 4 | 5>(initial?.daysPerWeek ?? 4);
  const [minutes, setMinutes] = useState<30 | 45 | 60 | 75>(initial?.sessionMinutes ?? 45);
  const [preset, setPreset] = useState<EquipmentPreset>(presetOf(initial));
  const [limitations, setLimitations] = useState<string[]>(initial?.limitations ?? []);
  const [excluded, setExcluded] = useState<string[]>(initial?.excludedExerciseIds ?? []);
  const seedSource = initial?.seedWorkingSets ?? suggestedSeeds;
  const [seeds, setSeeds] = useState<Record<string, string>>(
    Object.fromEntries(seedSource.map((seed) => [seed.exerciseId, `${seed.loadKg}`]))
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const usedHistory = !initial && suggestedSeeds.length > 0;

  const seedChecks = SEED_LIFTS.map((lift) => ({ lift, ...parseWeight(seeds[lift.id]) }));
  const invalidCount = seedChecks.filter((check) => check.error).length;
  const showError = (id: string) => (touched[id] || attempted);

  // Everything that would differ from the current source, in the runtime's own terms.
  const changes = ((): string[] => {
    if (!initial) return [];
    const lines: string[] = [];
    if (goal !== initial.goal) lines.push(`goal: ${goalLabel(initial.goal)} → ${goalLabel(goal)}`);
    if (days !== initial.daysPerWeek) lines.push(`frequency: ${initial.daysPerWeek} → ${days} days`);
    if (minutes !== initial.sessionMinutes) lines.push(`time cap: ${initial.sessionMinutes} → ${minutes} min`);
    if (preset !== presetOf(initial)) lines.push(`equipment: ${presetLabel(presetOf(initial))} → ${presetLabel(preset)}`);
    limitations.filter((item) => !initial.limitations.includes(item)).forEach((item) => lines.push(`+ limitation: ${item}`));
    initial.limitations.filter((item) => !limitations.includes(item)).forEach((item) => lines.push(`− limitation: ${item}`));
    initial.excludedExerciseIds.filter((id) => !excluded.includes(id)).forEach((id) => lines.push(`− excluded: ${exerciseName(id)}`));
    seedChecks.forEach(({ lift, value }) => {
      const before = initial.seedWorkingSets.find((seed) => seed.exerciseId === lift.id)?.loadKg ?? null;
      if (value !== before) lines.push(`seed ${lift.label.toLowerCase()}: ${before ?? '—'} → ${value ?? '—'} kg`);
    });
    return lines;
  })();

  const toggleLimit = (item: string) =>
    setLimitations((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);

  const build = () => {
    const seedWorkingSets: SeedWorkingSet[] = seedChecks.flatMap(({ lift, value }) =>
      value ? [{ exerciseId: lift.id, loadKg: value, reps: goal === 'strength' ? 5 : 8, rir: 3 }] : []
    );
    onSubmit({
      id: initial?.id ?? createRuntimeId(), userId: user.id,
      version: (initial?.version ?? 0) + 1, goal,
      experience: user.experienceLevel === 'advanced' ? 'advanced' : 'intermediate',
      daysPerWeek: days, sessionMinutes: minutes, equipment: presetEquipment(preset),
      excludedExerciseIds: excluded, limitations, seedWorkingSets, createdAt: new Date().toISOString(),
    });
  };

  const submit = () => {
    setAttempted(true);
    if (invalidCount > 0) return;
    if (mode === 'first') { build(); return; }
    Alert.alert(
      'Recompile block?',
      'Keeps: committed history and working weights.\n\nRebuilds: exercises, weekly volume and session slots as a new block version, starting at week 1 today. Sessions committed under the old block stay in history but no longer count toward the new block\'s weeks.',
      [{ text: 'Not yet', style: 'cancel' }, { text: 'Recompile block', onPress: build }]
    );
  };

  const nothingChanged = mode === 'edit' && changes.length === 0;
  const blockedReason = sessionActive
    ? 'A session is active. Commit or discard it before recompiling.'
    : nothingChanged ? 'No source values changed, so there is nothing to recompile.' : null;
  const experience = user.experienceLevel === 'advanced' ? 'advanced' : 'intermediate';
  const nextSource = (initial?.version ?? 0) + 1;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <ScreenBrand name="source" sub={mode === 'first' ? 'intent' : 'edit'} />
        <ScreenTitle
          title={mode === 'first' ? 'Declare your constraints' : 'Edit source'}
          text={mode === 'first' ? 'Your goal and constraints. The runtime compiles all training from these. You never write a workout.' : null}
        />
        {mode === 'first' ? (
          <Card>
            <Txt variant="mono" tone="muted">@@ the loop @@</Txt>
            <Txt variant="code">source → compile → solver() → set.log → commit</Txt>
            <Txt variant="caption" tone="secondary">You set the source once. Each set you log feeds the next prescription.</Txt>
          </Card>
        ) : null}

        <Section title="goal" hint={<Txt variant="caption" tone="muted">required · choose one</Txt>}>
          <Choice label="hypertrophy" code description="build muscle" selected={goal === 'hypertrophy'} onPress={() => setGoal('hypertrophy')} />
          <Choice label="strength" code description="get stronger" selected={goal === 'strength'} onPress={() => setGoal('strength')} />
        </Section>

        <Section title="days per week" hint={<Txt variant="caption" tone="muted">required · choose one</Txt>}>
          <Segmented label="Training days per week" options={DAY_OPTIONS} value={days} onChange={setDays} format={(value) => `${value}`} />
        </Section>

        <Section title="time cap" hint={<Txt variant="caption" tone="muted">required · choose one</Txt>}>
          <Segmented label="Session time cap in minutes" options={MINUTE_OPTIONS} value={minutes} onChange={setMinutes} format={(value) => `${value}m`} />
        </Section>

        <Section title="equipment" hint={<Txt variant="caption" tone="muted">required · choose one</Txt>}>
          <Choice label="full gym" code description="barbell, rack, machines, cables, dumbbells, bench, pull-up bar" selected={preset === 'full'} onPress={() => setPreset('full')} />
          <Choice label="dumbbells + bench" code selected={preset === 'dumbbells'} onPress={() => setPreset('dumbbells')} />
        </Section>

        <Section title="limitations" hint={<Txt variant="caption" tone="muted">optional</Txt>}>
          <View style={styles.wrap}>
            {LIMITATIONS.map((item) => <Choice key={item} compact role="checkbox" label={limitationLabel(item)} selected={limitations.includes(item)} onPress={() => toggleLimit(item)} />)}
          </View>
          {excluded.length ? (
            <Card tone="warning">
              <Txt variant="label" tone="warning">excluded after pain</Txt>
              {excluded.map((id) => (
                <View key={id} style={styles.excludedRow}>
                  <Txt style={styles.flex}>{exerciseName(id)}</Txt>
                  <Button label="Allow again" variant="secondary" onPress={() => setExcluded((current) => current.filter((item) => item !== id))} accessibilityLabel={`Allow ${exerciseName(id)} again`} style={styles.smallButton} />
                </View>
              ))}
            </Card>
          ) : null}
        </Section>

        <Section title="seed working weights" hint={<Txt variant="caption" tone="muted">optional</Txt>}>
          {preset === 'dumbbells' ? (
            <Txt variant="caption" tone="secondary">These are barbell lifts, which a dumbbell source doesn't use.</Txt>
          ) : (
            <>
              <Txt variant="caption" tone="secondary">
                A normal working weight for about {goal === 'strength' ? '5' : '8'} reps, not a one-rep max. Blank starts light.
              </Txt>
              {usedHistory ? <Banner tone="info" announce={false} title="Prefilled from your logged workouts" message="Check they still look right." /> : null}
              {seedChecks.map(({ lift, error }) => (
                <View key={lift.id} style={styles.field}>
                  <View style={styles.fieldRow}>
                    <Txt style={styles.flex}>{lift.label}</Txt>
                    <TextInput
                      style={[styles.input, error && showError(lift.id) && styles.inputError]}
                      value={seeds[lift.id] ?? ''}
                      onChangeText={(value) => setSeeds((current) => ({ ...current, [lift.id]: value }))}
                      onBlur={() => setTouched((current) => ({ ...current, [lift.id]: true }))}
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      placeholder="optional"
                      placeholderTextColor={colors.textMuted}
                      maxFontSizeMultiplier={1.6}
                      accessibilityLabel={`${lift.label} seed working weight in kilograms`}
                      accessibilityHint="Optional"
                    />
                    <Txt tone="secondary">kg</Txt>
                  </View>
                  {error && showError(lift.id) ? <Txt variant="caption" tone="danger" accessibilityLiveRegion="polite">⚠ {error}</Txt> : null}
                </View>
              ))}
            </>
          )}
        </Section>

        <Card>
          <Txt variant="mono" tone="muted">@@ from your profile @@</Txt>
          <Txt variant="code">experience: {experience}</Txt>
        </Card>

        <Card tone={mode === 'edit' && changes.length ? 'accent' : undefined}>
          <View style={styles.versionRow}>
            <Txt variant="mono" tone="muted">@@ {mode === 'first' ? 'compiles to' : 'recompile preview'} @@</Txt>
            {mode === 'edit' ? <StateTag state={changes.length ? 'recompiled' : 'blocked'} label={changes.length ? 'pending' : 'no changes'} /> : null}
          </View>
          <Txt variant="code">
            source v{nextSource}{mode === 'edit' ? ` (was v${initial?.version})` : ''} → block v{mode === 'edit' ? (blockVersion ?? 0) + 1 : 1}
          </Txt>
          {mode === 'edit' ? (
            changes.length ? changes.map((line) => <Txt key={line} variant="caption">• {line}</Txt>) : <Txt variant="caption" tone="secondary">Change a value above to see the diff.</Txt>
          ) : null}
        </Card>

        {attempted && invalidCount > 0 ? <Banner tone="error" title={`Fix ${invalidCount} seed ${invalidCount === 1 ? 'weight' : 'weights'} to continue`} message="Each must be a number in kg, or blank." /> : null}

        <View style={styles.actions}>
          {blockedReason ? <Txt variant="caption" tone="warning" accessibilityLiveRegion="polite">⊘ {blockedReason}</Txt> : null}
          <Button
            label={mode === 'first' ? 'Compile block' : 'Recompile block'}
            icon={mode === 'first' ? 'arrow-forward' : 'refresh'}
            onPress={submit}
            disabled={Boolean(blockedReason)}
            hint={mode === 'first' ? 'Generates your first six weeks' : 'Rebuilds the block after you confirm'}
          />
          {onCancel ? <Button label="Cancel" variant="secondary" onPress={onCancel} hint="Discards your edits" /> : null}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.xl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  excludedRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  smallButton: { minHeight: TOUCH },
  field: { gap: space.xs },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { width: 116, minHeight: TOUCH, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: space.md, color: colors.text, backgroundColor: colors.surface, fontSize: 17, textAlign: 'right' },
  inputError: { borderColor: colors.danger, borderWidth: 2 },
  versionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
  actions: { gap: space.md },
});
