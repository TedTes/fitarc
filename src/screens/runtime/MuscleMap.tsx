import { memo, useCallback, useState } from 'react';
import { Image, type ImageSourcePropType, type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { Muscle } from '../../runtime';
import { colors, radius, space } from './theme';
import { Txt } from './ui';
import { MUSCLE_MAP_SIZE, MUSCLE_MASKS, type MuscleMapView } from './muscleMasks';

export type MuscleMapTone = 'neutral' | 'success' | 'warning' | 'danger';

type Props = {
  view: MuscleMapView;
  /** Status colour per muscle GROUP. Parts of a group share it. */
  tones: Partial<Record<Muscle, MuscleMapTone>>;
  selected: Muscle | null;
  /** One muscle inside the selected group. null means the whole group is selected. */
  selectedPart?: string | null;
  /** `part` equals `muscle` for groups the picture does not split into separate muscles. */
  onSelect: (muscle: Muscle, part: string) => void;
};

const BODY: Record<MuscleMapView, ImageSourcePropType> = {
  front: require('../../../assets/images/muscle-map/athlete-front-v2.png'),
  back: require('../../../assets/images/muscle-map/athlete-back-v2.png'),
};

// The upper body, in image pixels. Zooming shows this region at a comfortable touch size.
const FOCUS: Record<MuscleMapView, { x0: number; y0: number; x1: number; y1: number }> = {
  front: { x0: 118, y0: 108, x1: 394, y1: 336 },
  back: { x0: 150, y0: 92, x1: 362, y1: 312 },
};
const FULL = { x0: 0, y0: 0, x1: MUSCLE_MAP_SIZE.width, y1: MUSCLE_MAP_SIZE.height };

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
  if (emphasis === 'sibling') return { color, fill: 0.34, stroke: 0.7, width: 1 };
  if (tone) return { color, fill: 0.24, stroke: 0.5, width: 0.9 };
  return { color, fill: 0.06, stroke: 0.28, width: 0.8 };
};

/**
 * The masks in muscleMasks.ts were traced from these exact images in their native 512 x 768 space, so the
 * overlay uses that same space as its viewBox. The image and the overlay share one frame, which keeps them
 * locked together at any container width and at any zoom.
 */
export const MuscleMap = memo(({ view, tones, selected, selectedPart = null, onSelect }: Props) => {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((current) => (current && current.width === width && current.height === height ? current : { width, height }));
  }, []);

  const region = zoomed ? FOCUS[view] : FULL;
  const fit = box ? Math.min(box.width / (region.x1 - region.x0), box.height / (region.y1 - region.y0)) : 0;
  const width = MUSCLE_MAP_SIZE.width * fit;
  const height = MUSCLE_MAP_SIZE.height * fit;
  const left = box ? box.width / 2 - ((region.x0 + region.x1) / 2) * fit : 0;
  const top = box ? box.height / 2 - ((region.y0 + region.y1) / 2) * fit : 0;

  const masks = MUSCLE_MASKS[view];
  const emphasisOf = (muscle: Muscle, part: string): Emphasis => {
    if (selected !== muscle) return 'rest';
    return selectedPart === null || selectedPart === part ? 'active' : 'sibling';
  };
  // Emphasised shapes are drawn last so their outlines are never covered by a neighbour.
  const rank: Record<Emphasis, number> = { rest: 0, sibling: 1, active: 2 };
  const drawOrder = [...masks].sort((a, b) => rank[emphasisOf(a.muscle, a.part)] - rank[emphasisOf(b.muscle, b.part)]);

  return (
    <View style={styles.container} onLayout={onLayout}>
      {fit > 0 ? (
        <View style={{ position: 'absolute', left, top, width, height }}>
          {/* Explicit size: a local image otherwise keeps its intrinsic 512 x 768 size and ignores absoluteFill. */}
          <Image source={BODY[view]} resizeMode="contain" style={{ width, height }} accessible={false} />
          <Svg
            style={StyleSheet.absoluteFill}
            width={width}
            height={height}
            viewBox={`0 0 ${MUSCLE_MAP_SIZE.width} ${MUSCLE_MAP_SIZE.height}`}
          >
            {drawOrder.map(({ muscle, part, visible }) => {
              const style = look(tones[muscle], emphasisOf(muscle, part));
              return (
                <Path
                  key={`${view}-${part}-visible`}
                  d={visible}
                  fill={style.color}
                  fillOpacity={style.fill}
                  stroke={style.color}
                  strokeOpacity={style.stroke}
                  strokeWidth={style.width}
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              );
            })}
            {/* Touch targets: invisible, a little larger than the muscles, and never overlapping each other. */}
            {masks.map(({ muscle, part, label, hit }) => (
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
            ))}
          </Svg>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={zoomed ? 'Show the full body' : 'Zoom to the upper body'}
        accessibilityState={{ selected: zoomed }}
        onPress={() => setZoomed((value) => !value)}
        style={({ pressed }) => [styles.zoom, pressed && styles.pressed]}
      >
        <Ionicons name={zoomed ? 'contract-outline' : 'expand-outline'} size={16} color={colors.text} />
        <Txt variant="label" tone="secondary" maxFontSizeMultiplier={1.2}>{zoomed ? 'full' : 'zoom'}</Txt>
      </Pressable>
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
