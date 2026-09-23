import { memo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExerciseDefinition, Muscle } from '../../runtime/types';
import { equipmentLabel, muscleLabel, muscleList } from './copy';
import { MuscleMap } from './MuscleMap';
import { partLabel } from './muscleParts';
import { isMuscleVisible, muscleTargetRole, preferredTargetView, viewForMuscle, type BodyView } from './muscleTargeting';
import { colors, radius, space, TOUCH } from './theme';
import { Divider, Sheet, Txt } from './ui';

/** A small, single tap target. Its anatomy is decorative; the full sheet is interactive. */
export const ExerciseTargetPreview = memo(({ exercise, onPress, label = 'Muscles worked', compact = false }: {
  exercise: ExerciseDefinition;
  onPress: () => void;
  label?: string;
  compact?: boolean;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${label}: ${exercise.name}. Primary: ${muscleList(exercise.primaryMuscles)}.${exercise.secondaryMuscles.length ? ` Assisting: ${muscleList(exercise.secondaryMuscles)}.` : ''}`}
    accessibilityHint="Opens the interactive front and back muscle map and exercise details"
    onPress={onPress}
    style={({ pressed }) => [styles.preview, pressed && styles.pressed]}
  >
    <View style={[styles.thumbnail, compact && styles.thumbnailCompact]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MuscleMap view={preferredTargetView(exercise)} targets={exercise} height={compact ? 60 : 84} showZoom={false} focusTargets />
    </View>
    <View style={styles.previewCopy}>
      <Txt variant="label" tone="muted">{label}</Txt>
      <Txt variant="caption" numberOfLines={2}>{muscleList(exercise.primaryMuscles)}</Txt>
      {!compact && exercise.secondaryMuscles.length ? (
        <Txt variant="mono" tone="secondary" numberOfLines={2}>assists · {muscleList(exercise.secondaryMuscles)}</Txt>
      ) : null}
    </View>
    <Ionicons name="expand-outline" size={17} color={colors.accent} />
  </Pressable>
));

/** Mount with exercise.id as its key so every inspected lift starts at its best view. */
export const ExerciseMuscleDetails = memo(({ exercise, reason }: { exercise: ExerciseDefinition; reason?: string }) => {
  const { height } = useWindowDimensions();
  const [view, setView] = useState<BodyView>(() => preferredTargetView(exercise));
  const [selection, setSelection] = useState<{ muscle: Muscle; part: string | null } | null>(null);
  const role = selection ? muscleTargetRole(exercise, selection.muscle) : null;
  const selectedLabel = selection ? (selection.part ? partLabel(selection.part) : null) ?? muscleLabel(selection.muscle) : null;
  const chooseGroup = (muscle: Muscle) => {
    setView((current) => viewForMuscle(muscle, current));
    setSelection({ muscle, part: null });
  };

  return (
    <View style={styles.details}>
      <View style={styles.detailsHeader}>
        <Txt variant="caption" tone="secondary" style={styles.flex}>
          {exercise.compound ? 'Compound lift' : 'Isolation lift'} · {exercise.equipment.map(equipmentLabel).join(' · ')}
        </Txt>
        <View style={styles.viewSwitch} accessibilityRole="radiogroup" accessibilityLabel="Muscle map view">
          {(['front', 'back'] as const).map((side) => (
            <Pressable
              key={side} accessibilityRole="radio" accessibilityLabel={`Show ${side} muscles`}
              accessibilityState={{ checked: side === view }}
              onPress={() => { setView(side); if (selection && !isMuscleVisible(selection.muscle, side)) setSelection(null); }}
              style={({ pressed }) => [styles.viewChoice, side === view && styles.viewActive, pressed && styles.pressed]}
            ><Txt variant="label" tone={side === view ? 'accent' : 'secondary'}>{side}</Txt></Pressable>
          ))}
        </View>
      </View>
      <MuscleMap
        view={view} targets={exercise} height={Math.min(380, Math.max(250, height * 0.42))}
        selected={selection?.muscle} selectedPart={selection?.part}
        onSelect={(muscle, part) => setSelection({ muscle, part: part === muscle ? null : part })}
      />
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={styles.primaryDot} /><Txt variant="mono" tone="secondary">primary</Txt></View>
        <View style={styles.legendItem}><View style={styles.assistDot} /><Txt variant="mono" tone="secondary">assisting</Txt></View>
        <Txt variant="mono" tone="muted">tap to inspect</Txt>
      </View>
      {selection ? (
        <View style={styles.selection} accessibilityLiveRegion="polite">
          <Txt variant="heading">{selectedLabel}</Txt>
          <Txt variant="caption" tone="secondary">
            {role === 'primary' ? 'Primary target' : role === 'secondary' ? 'Assisting muscle' : 'Not a listed target for this lift'}
            {selection.part ? ` · part of ${muscleLabel(selection.muscle).toLowerCase()}` : ''}
          </Txt>
        </View>
      ) : null}
      <TargetGroup label="Primary" muscles={exercise.primaryMuscles} selected={selection?.muscle} onSelect={chooseGroup} />
      {exercise.secondaryMuscles.length ? (
        <TargetGroup label="Assisting" muscles={exercise.secondaryMuscles} selected={selection?.muscle} onSelect={chooseGroup} />
      ) : null}
      <Txt variant="caption" tone="muted">Highlights show the exercise’s muscle groups. Effort and weekly volume are tracked separately.</Txt>
      {reason ? <><Divider /><Txt variant="caption" tone="secondary">{reason}</Txt></> : null}
    </View>
  );
});

const TargetGroup = ({ label, muscles, selected, onSelect }: {
  label: string; muscles: Muscle[]; selected?: Muscle; onSelect: (muscle: Muscle) => void;
}) => (
  <View style={styles.group}>
    <Txt variant="label" tone="muted">{label}</Txt>
    <View style={styles.chips}>
      {muscles.map((muscle) => (
        <Pressable key={muscle} accessibilityRole="button" accessibilityLabel={`Inspect ${muscleLabel(muscle)}, ${label.toLowerCase()}`}
          accessibilityState={{ selected: selected === muscle }} onPress={() => onSelect(muscle)}
          style={({ pressed }) => [styles.chip, selected === muscle && styles.viewActive, pressed && styles.pressed]}>
          <Txt variant="caption" tone={selected === muscle ? 'accent' : 'secondary'}>{muscleLabel(muscle)}</Txt>
        </Pressable>
      ))}
    </View>
  </View>
);

export const ExerciseDetailsSheet = ({ exercise, onClose, reason }: {
  exercise: ExerciseDefinition | null; onClose: () => void; reason?: string;
}) => exercise ? (
  <Sheet visible onClose={onClose} title={exercise.name}>
    <ExerciseMuscleDetails key={exercise.id} exercise={exercise} reason={reason} />
  </Sheet>
) : null;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingRight: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  thumbnail: { width: 64, height: 84, overflow: 'hidden' },
  thumbnailCompact: { width: 46, height: 60 },
  previewCopy: { flex: 1, minWidth: 0, gap: 3, paddingVertical: space.sm },
  details: { gap: space.md },
  detailsHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  viewSwitch: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  viewChoice: { minHeight: TOUCH, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  viewActive: { backgroundColor: colors.accentSoft },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  primaryDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  assistDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  selection: { gap: 3, borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: space.md },
  group: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  pressed: { opacity: 0.7 },
});
