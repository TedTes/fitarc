import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { Muscle } from '../../runtime/types';
import { muscleLabel } from './copy';
import { Txt } from './ui';
import { colors, radius, space } from './theme';

const HOLD_MS = 650;
const SIZE = 76;
const STROKE = 5;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Session summary with a press-and-hold ring that starts the workout once it fills. */
export const StartSessionCard = ({ title, exercises, sets, muscles, onStart, when, showMuscles = true }: {
  title: string; exercises: number; sets: number; muscles: Muscle[]; showMuscles?: boolean;
  /** Omitted for a session that can't start yet; the card then shows `when` instead of the ring. */
  onStart?: () => void; when?: string;
}) => {
  const progress = useRef(new Animated.Value(0)).current;
  const [hint, setHint] = useState(false);
  const started = useRef(false);
  const holding = useRef(false);
  useEffect(() => { if (!hint) return undefined; const t = setTimeout(() => setHint(false), 1800); return () => clearTimeout(t); }, [hint]);

  const begin = () => {
    holding.current = true;
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished && holding.current && !started.current && onStart) { started.current = true; onStart(); }
    });
  };
  const release = () => {
    holding.current = false;
    if (started.current) return;
    progress.stopAnimation((value) => {
      if (value < 0.2) setHint(true);
      Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: false }).start();
    });
  };
  // Rough guide only: about 2.5 min per working set including rest, plus setup per exercise.
  const minutes = Math.round((sets * 2.5 + exercises) / 5) * 5;
  const unique = [...new Set(muscles)].slice(0, 4);

  return (
    <View style={s.card}>
      <View style={s.copy}>
        <Txt variant="label" tone="accent">{onStart ? 'READY WHEN YOU ARE' : `UP NEXT · ${(when ?? 'later').toUpperCase()}`}</Txt>
        <Txt variant="title" numberOfLines={1}>{title}</Txt>
        <Txt variant="caption" tone="secondary">{exercises} exercises · {sets} sets · ~{minutes} min</Txt>
        {showMuscles ? <View style={s.chips}>
          {unique.map((muscle) => <View key={muscle} style={s.chip}><Txt variant="mono" tone="secondary">{muscleLabel(muscle).toLowerCase()}</Txt></View>)}
        </View> : null}
      </View>
      {onStart ? <View style={s.ringColumn}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Start ${title}`}
          accessibilityHint="Press and hold to start the workout"
          accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'activate' && !started.current) { started.current = true; onStart(); } }}
          onPressIn={begin}
          onPressOut={release}
          style={({ pressed }) => [s.ring, pressed && s.ringPressed]}
        >
          <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.border} strokeWidth={STROKE} fill={colors.accentSoft} />
            <AnimatedCircle
              cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.accent} strokeWidth={STROKE} fill="none" strokeLinecap="round"
              strokeDasharray={`${C} ${C}`}
              strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [C, 0] })}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </Svg>
          <Ionicons name="play" size={26} color={colors.accent} style={s.play} />
        </Pressable>
        <Txt variant="mono" tone={hint ? 'accent' : 'muted'}>{hint ? 'keep holding' : 'hold to start'}</Txt>
      </View> : <Ionicons name="calendar-outline" size={26} color={colors.textMuted} accessibilityElementsHidden importantForAccessibility="no" />}
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, marginTop: space.sm,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.surfaceRaised },
  ringColumn: { alignItems: 'center', gap: 6 },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ringPressed: { transform: [{ scale: 0.96 }] },
  play: { marginLeft: 4 },
});
