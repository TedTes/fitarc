import { memo, useCallback, useState } from 'react';
import { Image, type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { Muscle } from '../../runtime';
import { colors, radius, space } from './theme';
import { Txt } from './ui';
import { MUSCLE_MAP_SIZE, MUSCLE_MASKS, type MuscleMapView } from './muscleMasks';
import { ATHLETE_ARTWORK } from '../../components/athleteArtwork';
import { hasLowerBodyTarget, muscleTargetRole, type TargetMuscles } from './muscleTargeting';

export type MuscleMapTone = 'neutral' | 'success' | 'warning' | 'danger';

type Props = {
  view: MuscleMapView;
  /** Status colour per muscle GROUP. Parts of a group share it. */
  tones?: Partial<Record<Muscle, MuscleMapTone>>;
  selected?: Muscle | null;
  /** One muscle inside the selected group. null means the whole group is selected. */
  selectedPart?: string | null;
  /** `part` equals `muscle` for groups the picture does not split into separate muscles. */
  onSelect?: (muscle: Muscle, part: string) => void;
  /** Exercise roles use a single accent; volume traffic-light colors stay in the weekly map. */
  targets?: TargetMuscles;
  height?: number;
  showZoom?: boolean;
  overview?: boolean;
  focusTargets?: boolean;
};

// The upper body, in image pixels. Zooming shows this region at a comfortable touch size.
const FOCUS: Record<MuscleMapView, { x0: number; y0: number; x1: number; y1: number }> = {
  front: { x0: 118, y0: 108, x1: 394, y1: 336 },
  back: { x0: 150, y0: 92, x1: 362, y1: 312 },
};
const FULL = { x0: 0, y0: 0, x1: MUSCLE_MAP_SIZE.width, y1: MUSCLE_MAP_SIZE.height };
const LEGS = { x0: 146, y0: 302, x1: 366, y1: 656 };
const NO_TONES: Partial<Record<Muscle, MuscleMapTone>> = {};

const toneColor = (tone: MuscleMapTone) => {
  if (tone === 'danger') return colors.danger;
  if (tone === 'warning') return colors.warning;
  if (tone === 'success') return colors.success;
  return colors.accent;
};

type Emphasis = 'active' | 'sibling' | 'rest';

// Stroke widths are in the image's own 512 x 768 pixel units, so they scale with the picture.
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
 * The masks in muscleMasks.ts were traced from these exact images in their native 512 x 768 space, so the
 * overlay uses that same space as its viewBox. The image and the overlay share one frame, which keeps them
 * locked together at any container width and at any zoom.
 */
export const MuscleMap = memo(({
  view, tones = NO_TONES, selected = null, selectedPart = null, onSelect,
  targets, height = 420, showZoom = true, overview = false, focusTargets = false,
}: Props) => {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((current) => (current && current.width === width && current.height === height ? current : { width, height }));
  }, []);

  const zoomMuscle = selected ?? targets?.primaryMuscles[0];
  const zoomToLegs = Boolean(zoomMuscle && hasLowerBodyTarget(zoomMuscle));
  const region = zoomed || focusTargets ? zoomToLegs ? LEGS : FOCUS[view] : FULL;
  const fit = box ? Math.min(box.width / (region.x1 - region.x0), box.height / (region.y1 - region.y0)) : 0;
  const width = MUSCLE_MAP_SIZE.width * fit;
  const imageHeight = MUSCLE_MAP_SIZE.height * fit;
  const left = box ? box.width / 2 - ((region.x0 + region.x1) / 2) * fit : 0;
  const top = box ? box.height / 2 - ((region.y0 + region.y1) / 2) * fit : 0;

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
  const drawOrder = [...masks].sort((a, b) => layer(a.muscle, a.part) - layer(b.muscle, b.part));
  const highlight = (muscle: Muscle, part: string) => {
    if (targets) {
      const role = muscleTargetRole(targets, muscle);
      const focused = muscle === selected && (selectedPart === null || part === selectedPart);
      return {
        color: colors.accent,
        fill: role === 'primary' ? 0.55 : role === 'secondary' ? 0.18 : 0,
        stroke: focused ? 1 : role === 'primary' ? 0.85 : role === 'secondary' ? 0.4 : 0,
        width: focused ? 2 : 1,
        strokeColor: focused ? colors.text : colors.accent,
      };
    }
    const style = overview && !selected && tones[muscle]
      ? { color: toneColor(tones[muscle]), fill: 0.28, stroke: 0.45, width: 0.8 }
      : look(tones[muscle], emphasisOf(muscle, part));
    return { ...style, strokeColor: style.color };
  };

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {fit > 0 ? (
        <View style={{ position: 'absolute', left, top, width, height: imageHeight }}
          accessibilityElementsHidden={!onSelect} importantForAccessibility={onSelect ? 'auto' : 'no-hide-descendants'}>
          {/* Explicit size: a local image otherwise keeps its intrinsic 512 x 768 size and ignores absoluteFill. */}
          <Image source={ATHLETE_ARTWORK[view]} resizeMode="contain" style={{ width, height: imageHeight }} accessible={false} fadeDuration={0} />
          <Svg
            style={StyleSheet.absoluteFill}
            width={width}
            height={imageHeight}
            pointerEvents={onSelect ? 'auto' : 'none'}
            viewBox={`0 0 ${MUSCLE_MAP_SIZE.width} ${MUSCLE_MAP_SIZE.height}`}
          >
            {drawOrder.map(({ muscle, part, visible }) => {
              const style = highlight(muscle, part);
              return (
                <Path
                  key={`${view}-${part}-visible`}
                  d={visible}
                  fill={style.color}
                  fillOpacity={style.fill}
                  stroke={style.strokeColor}
                  strokeOpacity={style.stroke}
                  strokeWidth={style.width}
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              );
            })}
            {/* Touch targets: invisible, a little larger than the muscles, and never overlapping each other. */}
            {onSelect ? masks.map(({ muscle, part, label, hit }) => (
              <G
                key={`${view}-${part}-hit`}
                accessible
                accessibilityRole="button"
                accessibilityLabel={label ? `Select ${label}, part of ${muscle}` : 'Select ' + muscle}
                accessibilityState={{ selected: emphasisOf(muscle, part) === 'active' }}
                onPress={() => onSelect(muscle, part)}
              >
                <Path d={hit} fill="#000000" fillOpacity={0.001} />
              </G>
            )) : null}
          </Svg>
        </View>
      ) : null}
      {showZoom ? <Pressable
        accessibilityRole="button"
        accessibilityLabel={zoomed ? 'Show the full body' : zoomToLegs ? 'Zoom to the legs' : 'Zoom to the upper body'}
        accessibilityState={{ selected: zoomed }}
        onPress={() => setZoomed((value) => !value)}
        style={({ pressed }) => [styles.zoom, pressed && styles.pressed]}
      >
        <Ionicons name={zoomed ? 'contract-outline' : 'expand-outline'} size={16} color={colors.text} />
        <Txt variant="label" tone="secondary" maxFontSizeMultiplier={1.2}>{zoomed ? 'full' : 'zoom'}</Txt>
      </Pressable> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%', height: 420, position: 'relative', overflow: 'hidden', borderRadius: 16,
    backgroundColor: '#050607',
  },
  zoom: {
    position: 'absolute', top: space.sm, right: space.sm, minHeight: 40, minWidth: 40, paddingHorizontal: space.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: 'rgba(9,11,15,0.82)',
  },
  pressed: { opacity: 0.7 },
});
