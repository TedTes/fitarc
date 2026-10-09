import { type ReactNode, useEffect, useRef, useState } from 'react';
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
export const StartSessionCard = ({ title, exercises, sets, muscles, onStart, onCalendar, when, showMuscles = true, children }: {
  title: string; exercises: number; sets: number; muscles: Muscle[]; showMuscles?: boolean; children?: ReactNode;
  /** Omitted for a session that can't start yet; the card then shows `when` instead of the ring. */
  onStart?: () => void; onCalendar?: () => void; when?: string;
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

  const calendar=onCalendar?<Pressable accessibilityRole="button" accessibilityLabel="Choose workout days" onPress={onCalendar} style={s.calendar}>{when ? <Txt variant="caption" tone="secondary">{when}</Txt> : null}<Ionicons name="calendar-outline" size={20} color={colors.textMuted}/></Pressable>:null;

  return (
    <View style={s.card}>
      <View>
      <View style={s.header}>
        <Txt variant="body" style={s.sessionTitle}>Next session: {title}</Txt>
        {calendar}
      </View>
      <View style={s.summary}>
      <View style={s.copy}>
        {exercises > 0 ? <Txt variant="caption" tone="secondary">{exercises} {exercises===1?'exercise':'exercises'} · {sets} sets · ~{minutes} min</Txt> : null}
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
      </View> : null}
      </View>
      </View>
      {children}
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    gap: space.sm, padding: space.md, marginTop: space.xs,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sessionTitle: { flex: 1, minWidth: 0, color: colors.next },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.surfaceRaised },
  ringColumn: { alignItems: 'center', gap: 6 },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ringPressed: { transform: [{ scale: 0.96 }] },
  calendar: {flexDirection:'row',flexShrink:0,minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center',gap:8},
  play: { marginLeft: 4 },
});
