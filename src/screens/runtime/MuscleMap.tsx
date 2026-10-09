import { createElement, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, type LayoutChangeEvent, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, Mask, Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { Muscle } from '../../runtime';
import { colors, radius, space } from './theme';
import { MUSCLE_MAP_SIZES, MUSCLE_MASKS, type MuscleMapView } from './muscleMasks';
import { BACK_GROUP_CONTOURS } from './backMuscleContours';
import { MUSCLE_MAP_ARTWORK } from '../../components/athleteArtwork';
import { hasLowerBodyTarget, muscleTargetRole, type TargetMuscles } from './muscleTargeting';

export type MuscleMapTone = 'neutral' | 'success' | 'warning' | 'danger';

type Props = {
  view: MuscleMapView;
  onViewChange?: (view: MuscleMapView) => void;
  /** Status colour per muscle GROUP. Parts of a group share it. */
  tones?: Partial<Record<Muscle, MuscleMapTone>>;
  selected?: Muscle | null;
  /** One muscle inside the selected group. null means the whole group is selected. */
  selectedPart?: string | null;
  /** `part` equals `muscle` for groups the picture does not split into separate muscles. */
  onSelect?: (muscle: Muscle, part: string) => void;
  /** Exercise roles use a single accent; volume traffic-light colors stay in the weekly map. */
  targets?: TargetMuscles;
  /** Today recap: green completed training, red next-session training; overlap keeps both. */
  sessionComparison?: { completed: readonly Muscle[]; next: readonly Muscle[] };
  /** Tap anywhere that isn't a muscle (background, head, shorts). Muscle taps still go to onSelect. */
  onBackgroundPress?: () => void;
  height?: number;
  showZoom?: boolean;
  overview?: boolean;
  focusTargets?: boolean;
};

// The upper body, in image pixels. Zooming shows this region at a comfortable touch size.
const FOCUS: Record<MuscleMapView, { x0: number; y0: number; x1: number; y1: number }> = {
  front: { x0: 245, y0: 165, x1: 660, y1: 525 },
  back: { x0: 290, y0: 175, x1: 800, y1: 590 },
};
const LEGS: Record<MuscleMapView, { x0: number; y0: number; x1: number; y1: number }> = {
  front: { x0: 290, y0: 500, x1: 625, y1: 1095 },
  back: { x0: 355, y0: 580, x1: 735, y1: 1320 },
};
const NO_TONES: Partial<Record<Muscle, MuscleMapTone>> = {};

const toneColor = (tone: MuscleMapTone) => {
  if (tone === 'danger') return colors.danger;
  if (tone === 'warning') return colors.warning;
  if (tone === 'success') return colors.success;
  return colors.accent;
};

type Emphasis = 'active' | 'sibling' | 'rest';

// Stroke widths use the artwork's native pixel units and scale with the picture.
const look = (tone: MuscleMapTone | undefined, emphasis: Emphasis) => {
  const color = toneColor(tone ?? 'neutral');
  if (emphasis === 'active') return { color, fill: 0.52, stroke: 1, width: 1.5 };
  // Sibling used to get a faint wash of the same colour as active, but any visible fill/stroke
  // there -- even faint -- reads as "a second area inside the highlighted blob" rather than "a
  // separate, unselected part," since it's the same hue sitting right next to the real selection.
  // A tapped part now stands alone; everything else in its group is visually identical to rest.
  if (emphasis === 'sibling') return { color, fill: 0.06, stroke: 0, width: 0.8 };
  // No ambient status wash and no outline: an unselected muscle stays a bare sliver of fill,
  // so adjoining shapes (e.g. quads/calves at the knee) don't draw a seam where they meet.
  // Status colour and the outline only appear once you tap a muscle (active/sibling above).
  return { color, fill: 0.06, stroke: 0, width: 0.8 };
};

/**
 * Each view uses its artwork's native dimensions for both the image and SVG viewBox.
 * The image and overlay share one frame, which keeps them
 * locked together at any container width and at any zoom.
 */
export const MuscleMap = memo(({
  view, onViewChange, tones = NO_TONES, selected = null, selectedPart = null, onSelect,
  targets, sessionComparison, onBackgroundPress, height = 420, showZoom = true, overview = false, focusTargets = false,
}: Props) => {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((current) => (current && current.width === width && current.height === height ? current : { width, height }));
  }, []);

  const zoomMuscle = selected ?? targets?.primaryMuscles[0];
  const zoomToLegs = Boolean(zoomMuscle && hasLowerBodyTarget(zoomMuscle));
  const size = MUSCLE_MAP_SIZES[view];
  const full = { x0: 0, y0: 0, x1: size.width, y1: size.height };
  const region = zoomed || focusTargets ? zoomToLegs ? LEGS[view] : FOCUS[view] : full;
  const fit = box ? Math.min(box.width / (region.x1 - region.x0), box.height / (region.y1 - region.y0)) : 0;
  const width = size.width * fit;
  const imageHeight = size.height * fit;
  const left = box ? box.width / 2 - ((region.x0 + region.x1) / 2) * fit : 0;
  const top = box ? box.height / 2 - ((region.y0 + region.y1) / 2) * fit : 0;

  // Drag to pan when the picture is larger than its frame (zoomed), so the whole body stays reachable.
  // Limits keep an image edge from ever pulling inside the frame; a fitted picture can't move at all.
  const limits = useMemo(() => box ? {
    minX: Math.min(0, box.width - width - left), maxX: Math.max(0, -left),
    minY: Math.min(0, box.height - imageHeight - top), maxY: Math.max(0, -top),
  } : { minX: 0, maxX: 0, minY: 0, maxY: 0 }, [box, width, imageHeight, left, top]);
  const canPan = limits.minX < 0 || limits.maxX > 0 || limits.minY < 0 || limits.maxY > 0;
  const pan = useRef(new Animated.ValueXY()).current;
  const panAt = useRef({ x: 0, y: 0 });
  const live = useRef({ limits, canPan });
  live.current = { limits, canPan };
  useEffect(() => {
    panAt.current = { x: 0, y: 0 };
    pan.setValue({ x: 0, y: 0 });
  }, [pan, view, zoomed, zoomToLegs, box?.width, box?.height]);
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const responder = useMemo(() => PanResponder.create({
    // Small moves stay taps, so muscles can still be selected while zoomed.
    onMoveShouldSetPanResponder: (_, g) => live.current.canPan && Math.abs(g.dx) + Math.abs(g.dy) > 6,
    onMoveShouldSetPanResponderCapture: (_, g) => live.current.canPan && Math.abs(g.dx) + Math.abs(g.dy) > 6,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => {
      const { limits: l } = live.current;
      pan.setValue({ x: clamp(panAt.current.x + g.dx, l.minX, l.maxX), y: clamp(panAt.current.y + g.dy, l.minY, l.maxY) });
    },
    onPanResponderRelease: (_, g) => {
      const { limits: l } = live.current;
      panAt.current = { x: clamp(panAt.current.x + g.dx, l.minX, l.maxX), y: clamp(panAt.current.y + g.dy, l.minY, l.maxY) };
    },
    onPanResponderTerminate: (_, g) => {
      const { limits: l } = live.current;
      panAt.current = { x: clamp(panAt.current.x + g.dx, l.minX, l.maxX), y: clamp(panAt.current.y + g.dy, l.minY, l.maxY) };
    },
  }), [pan]);

  const masks = MUSCLE_MASKS[view];
  const emphasisOf = (muscle: Muscle, part: string): Emphasis => {
    if (selected !== muscle) return 'rest';
    return selectedPart === null || selectedPart === part ? 'active' : 'sibling';
  };
  // Emphasised shapes are drawn last so their outlines are never covered by a neighbour.
  const rank: Record<Emphasis, number> = { rest: 0, sibling: 1, active: 2 };
  const layer = (muscle: Muscle, part: string) => targets
    ? (muscle === selected && (selectedPart === null || part === selectedPart) ? 3 : muscleTargetRole(targets, muscle) === 'primary' ? 2 : 1)
    : rank[emphasisOf(muscle, part)];
  const visibleMasks = view === 'back' && !selectedPart
    ? [...masks.filter(mask=>!BACK_GROUP_CONTOURS.some(group=>group.muscle===mask.muscle)), ...BACK_GROUP_CONTOURS]
    : masks;
  const drawOrder = [...visibleMasks].sort((a, b) => layer(a.muscle, a.part) - layer(b.muscle, b.part));
  const touchMasks = sessionComparison ? visibleMasks : masks;
  // Comparison view: one dimming layer over the whole picture with every done/next (or the selected) muscle
  // cut out of it, so those muscles stay at their natural brightness while the rest of the body recedes.
  // The cut-outs are drawn with a wide stroke so the hairline gaps between neighbouring parts (e.g. the three
  // quad heads) stay lit instead of showing the dimming through as dark seams.
  const lit = sessionComparison ? visibleMasks.filter(({ muscle }) => selected
    ? muscle === selected
    : sessionComparison.completed.includes(muscle) || sessionComparison.next.includes(muscle))
    // Weekly overview: trained muscles stay lit, untrained ones recede; a selection stands alone.
    : overview ? masks.filter(({ muscle }) => selected ? muscle === selected : Boolean(tones[muscle]))
    // Exercise targets: primary and assisting muscles stay lit; an orange tint alone vanishes on orange-lit skin.
    : targets ? masks.filter(({ muscle }) => selected ? muscle === selected : muscleTargetRole(targets, muscle) !== null) : [];
  const spotlightId = useRef(`spotlight-${Math.random().toString(36).slice(2)}`).current;
  const highlight = (muscle: Muscle, part: string) => {
    if (sessionComparison) {
      const completed = sessionComparison.completed.includes(muscle);
      const next = sessionComparison.next.includes(muscle);
      const focused = muscle === selected;
      const dimmed = selected !== null && !focused;
      // Done today: green fill. Coming next: blue fill (not red, which reads as a warning). Both: green with
      // a blue outline. A selection is shown by brightening that muscle and dimming the rest -- never by
      // outlining each part, which makes multi-part groups (quads, hamstrings) read as stitched seams.
      // Spotlight: the body is dimmed and these muscles are cut out of the dimming (see `spotlight` below),
      // so "next" keeps natural skin with only a faint cool tint; "done" glows green.
      const base = completed ? 0.32 : next ? 0.1 : 0;
      return {
        color: completed ? colors.success : colors.next,
        fill: focused ? completed ? 0.6 : 0.4 : dimmed ? base * 0.35 : base,
        strokeColor: colors.next,
        stroke: completed && next ? dimmed ? 0.3 : 0.9 : 0,
        width: 3,
      };
    }
    if (targets) {
      const role = muscleTargetRole(targets, muscle);
      const focused = muscle === selected && (selectedPart === null || part === selectedPart);
      // Lit by the spotlight; primary gets a light warm lift, assisting is pulled halfway back toward the dimmed body.
      return {
        color: role === 'secondary' && !focused ? '#000000' : colors.accent,
        fill: focused ? 0.3 : role === 'primary' ? 0.16 : role === 'secondary' ? 0.28 : 0,
        stroke: 0,
        width: 0,
        strokeColor: colors.accent,
      };
    }
    const style = overview && tones[muscle]
      ? { color: toneColor(tones[muscle]), fill: muscle === selected ? 0.5 : selected ? 0.1 : 0.3, stroke: 0, width: 0 }
      : overview ? { color: colors.text, fill: 0, stroke: 0, width: 0 }
      : look(tones[muscle], emphasisOf(muscle, part));
    return { ...style, strokeColor: style.color };
  };

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout} {...responder.panHandlers}>
      {fit > 0 ? (
        <Animated.View style={{ position: 'absolute', left, top, width, height: imageHeight, transform: pan.getTranslateTransform() }}
          accessibilityElementsHidden={!onSelect} importantForAccessibility={onSelect ? 'auto' : 'no-hide-descendants'}>
          {/* Explicit size keeps the artwork and SVG registered at every zoom level. */}
          <Image source={MUSCLE_MAP_ARTWORK[view]} resizeMode="contain" style={{ width, height: imageHeight }} accessible={false} fadeDuration={0} />
          <Svg
            style={StyleSheet.absoluteFill}
            width={width}
            height={imageHeight}
            pointerEvents={onSelect || onBackgroundPress ? 'auto' : 'none'}
            viewBox={`0 0 ${size.width} ${size.height}`}
          >
            {lit.length ? <>
              <Defs>
                <Mask id={spotlightId} x="0" y="0" width={size.width} height={size.height} maskUnits="userSpaceOnUse">
                  <Rect x="0" y="0" width={size.width} height={size.height} fill="#ffffff" />
                  {lit.map((mask) => <Path key={mask.part} d={mask.visible} fill="#000000" stroke="#000000" strokeWidth={7} strokeLinejoin="round" />)}
                </Mask>
              </Defs>
              <Rect x="0" y="0" width={size.width} height={size.height} fill="#000000" fillOpacity={0.45} mask={`url(#${spotlightId})`} pointerEvents="none" />
            </> : null}
            {drawOrder.map(({ muscle, part, visible, covered }) => {
              const style = highlight(muscle, part);
              return (
                <Path
                  key={`${view}-${part}-visible`}
                  testID={sessionComparison ? `recap-muscle-${view}-${part}` : undefined}
                  d={visible}
                  fill={style.color}
                  fillOpacity={covered ? style.fill * 0.6 : style.fill}
                  stroke={style.strokeColor}
                  strokeOpacity={style.stroke}
                  strokeWidth={style.width}
                  strokeLinejoin="round"
                  strokeDasharray={covered ? '8 6' : undefined}
                  pointerEvents="none"
                />
              );
            })}
            {/* Drawn under the muscle touch targets, so it only receives taps that miss every muscle. */}
            {onBackgroundPress ? <Rect x="0" y="0" width={size.width} height={size.height} fill="#000000" fillOpacity={0.001}
              onPress={onBackgroundPress} accessible={false} /> : null}
            {/* Comparison taps follow the group surface; detail views retain individual parts. */}
            {onSelect ? touchMasks.map(({ muscle, part, label, hit }) => {
              const name = label ? `Select ${label}, part of ${muscle}` : 'Select ' + muscle;
              const isSelected = emphasisOf(muscle, part) === 'active';
              const select = () => onSelect(muscle, part);
              const path = <Path d={hit} fill="#000000" fillOpacity={0.001} />;
              // RN Web converts accessibilityRole="button" on G into an HTML
              // button inside the SVG, which breaks hit testing. Keep a real g.
              if (Platform.OS === 'web') return createElement('g', {
                key: `${view}-${part}-hit`, role: 'button', tabIndex: 0,
                'aria-label': name, 'aria-pressed': isSelected, onClick: select,
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
                },
              }, path);
              return <G
                key={`${view}-${part}-hit`}
                accessible
                accessibilityRole="button"
                accessibilityLabel={name}
                accessibilityState={{ selected: isSelected }}
                onPress={select}
              >
                {path}
              </G>;
            }) : null}
          </Svg>
        </Animated.View>
      ) : null}
      {canPan && showZoom ? <View pointerEvents="none" style={styles.dragHint}>
        <Ionicons name="move-outline" size={14} color={colors.textSecondary} />
      </View> : null}
      {onViewChange || showZoom ? <View style={styles.tools}>
        {onViewChange ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Show ${view === 'front' ? 'back' : 'front'} muscles`}
          onPress={() => onViewChange(view === 'front' ? 'back' : 'front')}
          style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
        ><Ionicons name="sync-outline" size={22} color={colors.text} /></Pressable> : null}
        {showZoom ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={zoomed ? 'Show the full body' : zoomToLegs ? 'Zoom to the legs' : 'Zoom to the upper body'}
          accessibilityState={{ selected: zoomed }}
          onPress={() => setZoomed((value) => !value)}
          style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
        ><Ionicons name={zoomed ? 'contract-outline' : 'expand-outline'} size={22} color={colors.text} /></Pressable> : null}
      </View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%', height: 420, position: 'relative', overflow: 'hidden', borderRadius: 16,
    backgroundColor: '#050607',
  },
  tools: {
    position: 'absolute', bottom: space.sm, right: space.sm, flexDirection: 'row',
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: 'rgba(9,11,15,0.88)',
  },
  dragHint: { position: 'absolute', top: space.sm, left: space.sm, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(9,11,15,0.7)' },
  tool: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
