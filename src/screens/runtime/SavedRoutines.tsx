import { useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExerciseDefinition, RuntimeState } from '../../runtime/types';
import { savedRoutines, routineName } from '../../runtime/savedRoutines';
import { Txt } from './ui';
import { MuscleMap } from './MuscleMap';
import { preferredTargetView } from './muscleTargeting';
import { muscleList } from './copy';
import { ExerciseDetailsSheet } from './ExerciseMuscles';
import { PlanText } from './PlanKit';
import { colors, space, planTokens as t } from './theme';

export function SavedRoutines({ state, onUseRoutine, onRenameRoutine, onBack }: {
  state: RuntimeState;
  onBack: () => void;
  onRenameRoutine: (id: string, name: string) => string | undefined;
  onUseRoutine: (id: string) => string | undefined;
}) {
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const pendingName = useRef<{ id: string; value: string } | null>(null);
  const finishingTouch = useRef(false);
  const nameInputs = useRef(new Map<string, TextInput>());
  const [inspected, setInspected] = useState<ExerciseDefinition | null>(null);
  const routines = savedRoutines(state);
  const selected = routines.find(plan => plan.id === state.block?.id) ?? routines[0];

  const finishEditing = (dismiss = true) => {
    const pending = pendingName.current;
    if (!pending) return;
    // Clear first: blur and outside-tap callbacks must not save the same edit twice.
    pendingName.current = null;
    setEditing(null);
    if (dismiss) {
      nameInputs.current.get(pending.id)?.blur();
      Keyboard.dismiss();
    }
    setError(onRenameRoutine(pending.id, pending.value) ?? '');
  };

  return <View style={styles.screen} onTouchStart={() => { finishingTouch.current = Boolean(pendingName.current); finishEditing(); }}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Profile" onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={24} color={colors.text}/>
      </Pressable>
      <PlanText kind="title">Routines</PlanText>
    </View>
    <View>
      <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routines}>
        {routines.map(plan => {
          const active = plan.id === state.block?.id;
          const title = routineName(plan);
          return <Pressable key={plan.id} accessibilityRole="button" accessibilityState={{ selected: active }}
            accessibilityLabel={active ? `${title}, active routine` : `Set ${title} as active`}
            style={({ pressed }) => [styles.routine, active && styles.selected, pressed && styles.pressed]}
            onPress={() => {
              if (finishingTouch.current) return;
              if (pendingName.current) { finishEditing(); return; }
              setError('');
              if (active) return;
              const problem = onUseRoutine(plan.id);
              if (problem) setError(problem);
            }}>
            <View style={styles.cardHeading}>
              <TextInput selectTextOnFocus selectionColor={colors.accent} underlineColorAndroid="transparent" value={editing === plan.id ? name : title}
                ref={input => { if (input) nameInputs.current.set(plan.id, input); else nameInputs.current.delete(plan.id); }}
                onTouchStart={event => event.stopPropagation()}
                onChangeText={value => { pendingName.current = { id: plan.id, value }; setName(value); }}
                onFocus={() => { if (pendingName.current && pendingName.current.id !== plan.id) finishEditing(false); pendingName.current = { id: plan.id, value: title }; setName(title); setEditing(plan.id); setError(''); }}
                onPressIn={event => event.stopPropagation()}
                accessibilityLabel={`Routine name: ${title}`} maxLength={80} returnKeyType="done"
                style={styles.nameInput}
                onEndEditing={() => { if (pendingName.current?.id === plan.id) finishEditing(false); }}/>
            </View>
            <Txt variant="caption" tone="muted">
              {plan.slots.length} {plan.slots.length === 1 ? 'workout' : 'workouts'} · {new Date(`${plan.startedOn}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </Txt>
            <View style={styles.cardFooter}>
              <Txt variant="caption" tone={active ? 'accent' : 'muted'} style={styles.activationText}>{active ? 'Active' : 'Set as active'}</Txt>
            </View>
          </Pressable>;
        })}
      </ScrollView>
    </View>
    <ScrollView key={selected?.id ?? 'empty'} contentContainerStyle={styles.page}>
      {error ? <Txt tone="danger" accessibilityLiveRegion="polite">{error}</Txt> : null}
      {selected?.slots.map(slot => <View key={slot.id} style={styles.section}>
        <Txt variant="heading">{slot.label}</Txt>
        {slot.plannedExercises.map((item, index) => {
          const exercise = selected.catalog?.find(entry => entry.id === item.exerciseId);
          const min = item.prescription?.minReps ?? selected.phases[0]?.minReps;
          const max = item.prescription?.maxReps ?? selected.phases[0]?.maxReps;
          return <Pressable key={`${item.exerciseId}:${index}`} accessibilityRole="button" disabled={!exercise}
            accessibilityLabel={`Preview ${exercise?.name ?? item.exerciseId}`} onPress={() => exercise && setInspected(exercise)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            {exercise ? <View style={styles.muscle} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <MuscleMap view={preferredTargetView(exercise)} targets={exercise} height={60} showZoom={false} focusTargets/>
            </View> : null}
            <View style={styles.content}>
              <Txt>{exercise?.name ?? item.exerciseId}</Txt>
              <Txt variant="caption" tone="muted">{exercise ? `${muscleList(exercise.primaryMuscles)} · ` : ''}{item.sets} × {min === max ? min : `${min}–${max}`}</Txt>
            </View>
            {exercise ? <Ionicons name="chevron-forward" size={t.icon} color={colors.textDim}/> : null}
          </Pressable>;
        })}
      </View>)}
      {!routines.length ? <Txt tone="secondary">No routines yet.</Txt> : null}
    </ScrollView>
    <ExerciseDetailsSheet exercise={inspected} onClose={() => setInspected(null)}/>

  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.pad.small, paddingHorizontal: t.gutter, paddingVertical: t.pad.small },
  back: { width: t.touch, height: t.touch, alignItems: 'center', justifyContent: 'center' },
  page: { padding: t.gutter, gap: space.lg },
  section: { gap: space.sm },
  content: { flex: 1, gap: 4 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardFooter: { marginTop: 'auto', paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activationText: { fontSize: 12, lineHeight: 18 },
  nameInput: { color: colors.text, fontSize: 16, flex: 1, minHeight: t.touch, paddingHorizontal: 0, paddingVertical: 8, borderWidth: 0, backgroundColor: 'transparent' },
  routines: { paddingHorizontal: t.gutter, paddingVertical: t.pad.small, gap: space.sm },
  routine: { width: 240, minHeight: 148, padding: t.pad.medium, gap: 6, borderWidth: t.border, borderColor: colors.borderCard, borderRadius: t.radius.card, backgroundColor: colors.surface },
  selected: { borderColor: colors.accent },
  muscle: { width: 48, height: 60, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.pad.medium, padding: t.pad.medium,
    borderWidth: t.border, borderColor: colors.borderCard, borderRadius: t.radius.card, backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
});
