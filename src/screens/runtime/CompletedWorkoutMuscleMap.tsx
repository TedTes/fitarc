import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NextWorkout } from '../../runtime/nextWorkout';
import type { Muscle } from '../../runtime/types';
import { MuscleMap } from './MuscleMap';
import { muscleLabel } from './copy';
import { Sheet, Txt } from './ui';
import { colors, space } from './theme';
import { WorkoutCelebration } from './WorkoutCelebration';

export type TodayStats = { sets: number; volumeKg: number; minutes: number | null };

export const SessionMuscleChips = ({ muscles, tone, selected, onSelect }: {
  muscles: readonly Muscle[]; tone: 'done' | 'next'; selected: Muscle | null; onSelect: (muscle: Muscle) => void;
}) => {
  return <>{muscles.map((muscle) => (
    <Pressable key={`${tone}-${muscle}`} accessibilityRole="button" accessibilityState={{ selected: selected === muscle }}
      accessibilityLabel={`${muscleLabel(muscle)}, ${tone === 'done' ? 'done today' : 'next session'}. Highlights it on the body`}
      onPress={() => onSelect(muscle)} hitSlop={4}
      style={({ pressed }) => [s.chip, tone === 'done' ? s.chipDone : s.chipNext, selected === muscle && (tone === 'done' ? s.chipDoneOn : s.chipNextOn), pressed && s.pressed]}>
      <Txt variant="caption" style={{ color: tone === 'done' ? colors.success : colors.next }}>{muscleLabel(muscle).toLowerCase()}</Txt>
    </Pressable>
  ))}</>;
};

/** Completed muscles and the upcoming session share the same selectable body map. */
export const CompletedWorkoutMuscleMap = ({ workout, stats, celebrationId, selected, onSelect }: {
  workout: NextWorkout; stats?: TodayStats; celebrationId?: string | null;
  selected: Muscle | null; onSelect: (muscle: Muscle) => void;
}) => {
  const completed = workout.completedMuscles;
  const next = [...new Set(workout.exercises.filter((entry) => entry.sets > 0).flatMap(({ exercise }) => exercise.primaryMuscles))];
  const [expanded, setExpanded] = useState<'front' | 'back' | null>(null);
  const { height: screenHeight } = useWindowDimensions();
  const comparison = { completed, next };
  const facts = stats ? [`${stats.sets} sets`, stats.volumeKg > 0 ? `${Math.round(stats.volumeKg).toLocaleString()} kg` : null, stats.minutes ? `${stats.minutes} min` : null].filter(Boolean).join(' · ') : '';
  const chips = (muscles: readonly Muscle[], tone: 'done' | 'next') => <SessionMuscleChips muscles={muscles} tone={tone} selected={selected} onSelect={onSelect} />;

  return <View style={s.root} testID="completed-workout-muscle-map">
    <View style={s.done}>
      <Ionicons name="checkmark-circle" size={20} color={colors.success} />
      <Txt variant="heading" tone="success">Workout complete</Txt>
      {facts ? <Txt variant="mono" tone="secondary" numberOfLines={1} style={s.facts}>{facts}</Txt> : null}
    </View>
    <View style={s.bodies}>
      {(['front', 'back'] as const).map((view) => <View key={view} style={s.body}>
        <MuscleMap view={view} selected={selected} onSelect={onSelect}
          sessionComparison={comparison} height={200} showZoom={false} onBackgroundPress={() => setExpanded(view)} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Open the ${view} muscle map full screen`} onPress={() => setExpanded(view)}
          hitSlop={10} style={({ pressed }) => [s.expand, pressed && s.pressed]}>
          <Ionicons name="expand-outline" size={16} color={colors.text} />
        </Pressable>
      </View>)}
    </View>
    <View style={s.summary}>
      {completed.length ? <View style={s.line}><Ionicons name="checkmark" size={15} color={colors.success} /><Txt variant="caption" tone="secondary">Done</Txt>{chips(completed, 'done')}</View> : null}
    </View>
    {celebrationId ? <WorkoutCelebration key={celebrationId} /> : null}
    {/* Full-screen look: same done/next colours, with the map's own zoom, drag and front/back flip.
        Not scrollable, so a drag moves the zoomed body rather than the sheet. */}
    <Sheet visible={expanded !== null} onClose={() => setExpanded(null)} title="Muscle map" scrollable={false}>
      {expanded ? <MuscleMap view={expanded} onViewChange={setExpanded} selected={selected} onSelect={onSelect}
        sessionComparison={comparison} height={Math.round(screenHeight * 0.6)} /> : null}
      <View style={s.summary}>
        {completed.length ? <View style={s.line}><Ionicons name="checkmark" size={15} color={colors.success} /><Txt variant="caption" tone="secondary">Done</Txt>{chips(completed, 'done')}</View> : null}
        {next.length ? <View style={s.line}><Ionicons name="arrow-forward" size={15} color={colors.next} /><Txt variant="caption" tone="secondary">Next</Txt>{chips(next, 'next')}</View> : null}
      </View>
    </Sheet>
  </View>;
};

const s = StyleSheet.create({
  root: { gap: space.sm },
  done: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  facts: { flexShrink: 1, marginLeft: 4 },
  bodies: { flexDirection: 'row', gap: space.sm },
  body: { flex: 1 },
  expand: { position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(9,11,15,0.72)' },
  summary: { gap: 6 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  chipDone: { borderColor: 'rgba(91,224,138,0.35)' },
  chipDoneOn: { backgroundColor: 'rgba(91,224,138,0.18)', borderColor: colors.success },
  chipNext: { borderColor: 'rgba(96,165,250,0.4)' },
  chipNextOn: { backgroundColor: 'rgba(96,165,250,0.18)', borderColor: colors.next },
  pressed: { opacity: 0.7 },
});
