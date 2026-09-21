import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Mask, Path, Pattern, Polygon, Rect, Stop } from 'react-native-svg';
import { colors } from '../screens/runtime/theme';

type AthleteMeshProps = {
  active?: boolean;
  /** Overrides the default fixed-aspect box, e.g. to fill a flexible region. */
  style?: StyleProp<ViewStyle>;
  /** `ghost` is hairline line-art that fades out top and bottom, for use behind content. */
  variant?: 'solid' | 'ghost';
};

export const AthleteMesh: React.FC<AthleteMeshProps> = ({ active = false, style, variant = 'solid' }) => {
  const ghost = variant === 'ghost';
  // Solid fills turn muddy when dimmed, so the ghost variant keeps outlines only.
  const fo = (value: number) => (ghost ? 0 : value);
  const entrance = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(entrance, {
      toValue: 1,
      tension: 44,
      friction: 9,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  useEffect(() => {
    pulse.stopAnimation();
    pulse.setValue(0);
    if (!active) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 680,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 680,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [active, pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.athlete,
        style,
        {
          opacity: entrance,
          transform: [
            { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
            {
              scale: Animated.multiply(
                entrance,
                pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] })
              ),
            },
          ],
        },
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 240 280">
        {ghost ? (
          <Defs>
            <LinearGradient id="ghostFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
              <Stop offset="0.22" stopColor="#FFFFFF" stopOpacity="1" />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.7" />
              <Stop offset="0.82" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
            <Mask id="ghostMask" x="0" y="0" width="240" height="280">
              <Rect x="0" y="0" width="240" height="280" fill="url(#ghostFade)" />
            </Mask>
          </Defs>
        ) : null}
        <G
          stroke={colors.warning}
          strokeWidth={ghost ? 1.1 : 2.4}
          strokeOpacity={ghost ? 0.42 : 1}
          strokeLinecap="square"
          strokeLinejoin="round"
          mask={ghost ? 'url(#ghostMask)' : undefined}
        >
          <Path
            d="M120 18 L108 38 L84 42 L61 55 L47 80 L43 121 L34 160 L36 221 L50 252 L70 252 L77 224 L78 174 L91 128 L105 149 L106 214 L120 258 L134 214 L135 149 L149 128 L162 174 L163 224 L170 252 L190 252 L204 221 L206 160 L197 121 L193 80 L179 55 L156 42 L132 38 Z"
            fill="none"
            strokeDasharray="11 7"
          />
          <Path d="M108 39 L89 61 L75 96 L92 122 L116 118 L118 52 Z" fill="#56350E" fillOpacity={fo(0.72)} />
          <Path d="M132 39 L151 61 L165 96 L148 122 L124 118 L122 52 Z" fill="#56350E" fillOpacity={fo(0.72)} />
          <Path d="M92 123 L108 126 L115 147 L104 166 L88 149 Z" fill="#41290D" fillOpacity={fo(0.82)} />
          <Path d="M148 123 L132 126 L125 147 L136 166 L152 149 Z" fill="#41290D" fillOpacity={fo(0.82)} />
          <Polygon points="104,169 117,157 117,184 105,193" fill="#5F3B0E" fillOpacity={fo(0.78)} />
          <Polygon points="136,169 123,157 123,184 135,193" fill="#5F3B0E" fillOpacity={fo(0.78)} />
          <Polygon points="105,197 117,188 117,216 108,225" fill="#4B2F0D" fillOpacity={fo(0.82)} />
          <Polygon points="135,197 123,188 123,216 132,225" fill="#4B2F0D" fillOpacity={fo(0.82)} />
          <Path d="M82 50 L59 63 L48 91 L52 119 L68 111 L80 78 L96 58 Z" fill="#4A2D0B" fillOpacity={fo(0.72)} />
          <Path d="M158 50 L181 63 L192 91 L188 119 L172 111 L160 78 L144 58 Z" fill="#4A2D0B" fillOpacity={fo(0.72)} />
          <Path d="M49 122 L39 164 L42 214 L55 235 L68 215 L65 168 L72 124 Z" fill="#39250F" fillOpacity={fo(0.82)} />
          <Path d="M191 122 L201 164 L198 214 L185 235 L172 215 L175 168 L168 124 Z" fill="#39250F" fillOpacity={fo(0.82)} />
          <Path d="M90 129 L76 169 L80 219 L96 247 L107 215 L105 166 Z" fill="#3B260E" fillOpacity={fo(0.76)} />
          <Path d="M150 129 L164 169 L160 219 L144 247 L133 215 L135 166 Z" fill="#3B260E" fillOpacity={fo(0.76)} />
          <Line x1="91" y1="82" x2="149" y2="82" strokeDasharray="14 8" />
          <Line x1="100" y1="106" x2="140" y2="106" strokeDasharray="12 6" />
          <Line x1="108" y1="137" x2="132" y2="137" />
          <Line x1="105" y1="166" x2="135" y2="166" />
          <Line x1="105" y1="194" x2="135" y2="194" />
          <Line x1="109" y1="222" x2="131" y2="222" />
          <Line x1="120" y1="124" x2="120" y2="229" strokeDasharray="8 5" />
        </G>
        <G fill={colors.warning} opacity={ghost ? 0 : 0.85}>
          <Rect x="47" y="107" width="6" height="6" />
          <Rect x="187" y="107" width="6" height="6" />
          <Rect x="66" y="232" width="5" height="5" />
          <Rect x="169" y="232" width="5" height="5" />
        </G>
      </Svg>
    </Animated.View>
  );
};

type CompilerGlyphsProps = {
  active?: boolean;
};

export const CompilerGlyphs: React.FC<CompilerGlyphsProps> = ({ active = false }) => {
  const cells = useMemo(
    () => Array.from({ length: 6 }, () => new Animated.Value(0)),
    []
  );

  useEffect(() => {
    cells.forEach((cell) => cell.setValue(0));
    if (!active) return;
    const animation = Animated.loop(
      Animated.stagger(
        90,
        cells.map((cell) =>
          Animated.sequence([
            Animated.timing(cell, {
              toValue: 1,
              duration: 180,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(cell, {
              toValue: 0,
              duration: 520,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ])
        )
      )
    );
    animation.start();
    return () => animation.stop();
  }, [active, cells]);

  return (
    <View style={styles.compilerCells} accessibilityLabel={active ? 'Signing in' : 'Ready'}>
      {cells.map((cell, index) => (
        <Animated.View
          key={index}
          style={[
            styles.compilerCell,
            index < 3 ? styles.compilerCellReady : styles.compilerCellIdle,
            active && {
              opacity: cell.interpolate({ inputRange: [0, 1], outputRange: [0.34, 1] }),
              transform: [{ translateY: cell.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
              backgroundColor: colors.warning,
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  athlete: {
    width: '100%',
    maxWidth: 260,
    aspectRatio: 240 / 280,
    alignSelf: 'center',
  },
  compilerCells: {
    flexDirection: 'row',
    gap: 3,
  },
  compilerCell: {
    width: 18,
    height: 14,
  },
  compilerCellReady: {
    backgroundColor: '#739B52',
  },
  compilerCellIdle: {
    backgroundColor: '#A6A6A6',
  },
});

/** Faint horizontal scanlines over the ground, so the background reads as a terminal surface. */
export const Scanlines: React.FC = () => (
  <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%">
      <Defs>
        <Pattern id="scan" patternUnits="userSpaceOnUse" width="4" height="4">
          <Rect x="0" y="0" width="4" height="1" fill="#FFFFFF" fillOpacity="0.035" />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#scan)" />
    </Svg>
  </View>
);
