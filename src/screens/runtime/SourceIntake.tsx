import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { RuntimeGoal, SeedWorkingSet, TrainingSource } from '../../runtime';
import type { User } from '../../types/domain';
import { colors, radius, space, TOUCH } from './theme';
import { Banner, Button, Card, Choice, ScreenBrand, ScreenTitle, Section, Segmented, StateTag, Txt } from './ui';
import { exerciseName, goalLabel, limitationLabel } from './copy';
import {
  DAY_OPTIONS, EquipmentPreset, LIMITATIONS, MINUTE_OPTIONS, presetEquipment, presetLabel, presetOf, SEED_LIFTS,
} from './constants';

type Props = {
  user: User;
  initial: TrainingSource;
  /** Block version the source currently compiles to, for the version preview. */
  blockVersion: number;
  /** A session is active, so the block cannot be recompiled right now. */
  sessionActive?: boolean;
  onSubmit: (source: TrainingSource) => void;
  onCancel: () => void;
};

const parseWeight = (raw: string | undefined): { value: number | null; error: string | null } => {
  const text = (raw ?? '').trim().replace(',', '.');
  if (!text) return { value: null, error: null };
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > 500) return { value: null, error: 'Enter a weight in kg from 1 to 500, or leave it blank.' };
  return { value, error: null };
};

export const SourceIntake = ({ user, initial, blockVersion, sessionActive, onSubmit, onCancel }: Props) => {
  const [goal, setGoal] = useState<RuntimeGoal>(initial.goal);
  const [days, setDays] = useState<3 | 4 | 5>(initial.daysPerWeek);
  const [minutes, setMinutes] = useState<30 | 45 | 60 | 75>(initial.sessionMinutes);
  const [preset, setPreset] = useState<EquipmentPreset>(presetOf(initial));
  const [limitations, setLimitations] = useState<string[]>(initial.limitations);
  const [excluded, setExcluded] = useState<string[]>(initial.excludedExerciseIds);
  const seedSource = initial.seedWorkingSets;
  const [seeds, setSeeds] = useState<Record<string, string>>(
    Object.fromEntries(seedSource.map((seed) => [seed.exerciseId, `${seed.loadKg}`]))
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);

  const seedChecks = SEED_LIFTS.map((lift) => ({ lift, ...parseWeight(seeds[lift.id]) }));
  const invalidCount = seedChecks.filter((check) => check.error).length;
  const showError = (id: string) => (touched[id] || attempted);

  // Everything that would differ from the current source, in the runtime's own terms.
  const changes = ((): string[] => {
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
      id: initial.id, userId: user.id,
      version: initial.version + 1, goal,
      experience: user.experienceLevel === 'advanced' ? 'advanced' : 'intermediate',
      daysPerWeek: days, sessionMinutes: minutes, equipment: presetEquipment(preset),
      excludedExerciseIds: excluded, limitations, seedWorkingSets, createdAt: new Date().toISOString(),
    });
  };

  const submit = () => {
    setAttempted(true);
    if (invalidCount > 0) return;
    Alert.alert(
      'Recompile block?',
      'Keeps: committed history and working weights.\n\nRebuilds: exercises, weekly volume and session slots as a new block version, starting at week 1 today. Sessions committed under the old block stay in history but no longer count toward the new block\'s weeks.',
      [{ text: 'Not yet', style: 'cancel' }, { text: 'Recompile block', onPress: build }]
    );
  };

  const nothingChanged = changes.length === 0;
  const blockedReason = sessionActive
    ? 'A session is active. Commit or discard it before recompiling.'
    : nothingChanged ? 'No source values changed, so there is nothing to recompile.' : null;
  const experience = user.experienceLevel === 'advanced' ? 'advanced' : 'intermediate';
  const nextSource = initial.version + 1;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <ScreenBrand name="source" sub="edit" />
        <ScreenTitle title="Edit source" />

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

        <Card tone={changes.length ? 'accent' : undefined}>
          <View style={styles.versionRow}>
            <Txt variant="mono" tone="muted">@@ recompile preview @@</Txt>
            <StateTag state={changes.length ? 'recompiled' : 'blocked'} label={changes.length ? 'pending' : 'no changes'} />
          </View>
          <Txt variant="code">source v{nextSource} (was v{initial.version}) → block v{blockVersion + 1}</Txt>
          {changes.length ? changes.map((line) => <Txt key={line} variant="caption">• {line}</Txt>) : <Txt variant="caption" tone="secondary">Change a value above to see the diff.</Txt>}
        </Card>

        {attempted && invalidCount > 0 ? <Banner tone="error" title={`Fix ${invalidCount} seed ${invalidCount === 1 ? 'weight' : 'weights'} to continue`} message="Each must be a number in kg, or blank." /> : null}

        <View style={styles.actions}>
          {blockedReason ? <Txt variant="caption" tone="warning" accessibilityLiveRegion="polite">⊘ {blockedReason}</Txt> : null}
          <Button
            label="Recompile block"
            icon="refresh"
            onPress={submit}
            disabled={Boolean(blockedReason)}
            hint="Rebuilds the block after you confirm"
          />
          <Button label="Cancel" variant="secondary" onPress={onCancel} hint="Discards your edits" />
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
