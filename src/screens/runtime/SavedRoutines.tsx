import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExerciseDefinition, RuntimeState } from '../../runtime/types';
import { savedRoutines } from '../../runtime/savedRoutines';
import { Txt } from './ui';
import { MuscleMap } from './MuscleMap';
import { preferredTargetView } from './muscleTargeting';
import { muscleList } from './copy';
import { ExerciseDetailsSheet } from './ExerciseMuscles';
import { PlanText } from './PlanKit';
import { colors, space, planTokens as t } from './theme';

export function SavedRoutines({ state, onUseRoutine, onBack }: {
  state: RuntimeState;
  onBack: () => void;
  onUseRoutine: (id: string) => string | undefined;
}) {
  const [error, setError] = useState('');
  const [inspected, setInspected] = useState<ExerciseDefinition | null>(null);
  const routines = savedRoutines(state);
  const selected = routines.find(plan => plan.id === state.block?.id) ?? routines[0];

  return <View style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Profile" onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={24} color={colors.text}/>
      </Pressable>
      <PlanText kind="title">Routines</PlanText>
    </View>
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routines}>
        {routines.map(plan => {
          const active = plan.id === state.block?.id;
          const title = plan.slots.map(slot => slot.label).join(' / ');
          return <Pressable key={plan.id} accessibilityRole="radio" accessibilityState={{ checked: active }}
            accessibilityLabel={`Activate ${title}`}
            style={({ pressed }) => [styles.routine, active && styles.selected, pressed && styles.pressed]}
            onPress={() => {
              setError('');
              if (active) return;
              const problem = onUseRoutine(plan.id);
              if (problem) setError(problem);
            }}>
            <View style={styles.content}>
              <Txt>{title}</Txt>
              <Txt variant="caption" tone="muted">{plan.slots.length} {plan.slots.length === 1 ? 'workout' : 'workouts'} · {new Date(plan.createdAt).toLocaleDateString()}</Txt>
            </View>
            <View style={styles.radio}>
              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={24}
                color={active ? colors.accent : colors.textMuted}/>
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
  routines: { paddingHorizontal: t.gutter, paddingVertical: t.pad.small, gap: space.sm },
  routine: { flexDirection: 'row', alignItems: 'flex-start', width: 220, padding: t.pad.medium, gap: space.sm, borderWidth: t.border, borderColor: colors.borderCard, borderRadius: t.radius.card, backgroundColor: colors.surface },
  selected: { borderColor: colors.accent },
  radio: { width: t.touch, height: t.touch, alignItems: 'center', justifyContent: 'center' },
  muscle: { width: 48, height: 60, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.pad.medium, padding: t.pad.medium,
    borderWidth: t.border, borderColor: colors.borderCard, borderRadius: t.radius.card, backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
});
