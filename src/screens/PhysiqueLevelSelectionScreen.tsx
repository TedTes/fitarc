import React, { useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { getPhysiqueLevelsBySex } from '../data/physiqueLevels';

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  sex: 'male' | 'female' | 'other';
  onSelect: (levelId: number) => void;
};

// ─── Level visual config ──────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<number, {
  accent: string;
  dimAccent: string;
  // Body fat midpoint → ring fill (inverted: lower BF = more filled)
  ringProgress: number;
  gradientId: string;
}> = {
  1: { accent: '#8B93B0', dimAccent: 'rgba(139,147,176,0.15)', ringProgress: 0.22, gradientId: 'g1' },
  2: { accent: '#6C63FF', dimAccent: 'rgba(108,99,255,0.15)', ringProgress: 0.40, gradientId: 'g2' },
  3: { accent: '#00C9E0', dimAccent: 'rgba(0,201,224,0.15)', ringProgress: 0.58, gradientId: 'g3' },
  4: { accent: '#FFB800', dimAccent: 'rgba(255,184,0,0.15)',  ringProgress: 0.74, gradientId: 'g4' },
  5: { accent: '#00F5A0', dimAccent: 'rgba(0,245,160,0.15)', ringProgress: 0.90, gradientId: 'g5' },
};

// ─── Ring component ───────────────────────────────────────────────────────────

const PhysiqueRing: React.FC<{ progress: number; accent: string; size?: number }> = ({
  progress,
  accent,
  size = 72,
}) => {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 8;
  const maxArc = (circumference - gap) / circumference;
  const clamped = Math.min(Math.max(progress, 0), maxArc);
  const dashoffset = circumference * (1 - clamped);
  const bfPct = Math.round((1 - progress) * 35); // rough display BF%

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={accent}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {/* Center text */}
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: accent, letterSpacing: -0.3 }}>
          {bfPct}%
        </Text>
        <Text style={{ fontSize: 8, fontWeight: '600', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
          BF
        </Text>
      </View>
    </View>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const PhysiqueLevelSelectionScreen: React.FC<Props> = ({ sex, onSelect }) => {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const btnScale = useRef(new Animated.Value(1)).current;

  const levels = getPhysiqueLevelsBySex(sex);

  const handleSelect = (levelId: number) => {
    setSelectedLevel(levelId);
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  const handleContinue = () => {
    if (selectedLevel) onSelect(selectedLevel);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Where are you now?</Text>
            <Text style={styles.subtitle}>
              Pick the level that best describes your current physique.{'\n'}
              Be honest — it helps us tailor your plan.
            </Text>
          </View>

          {/* Level cards */}
          <View style={styles.cardList}>
            {levels.map((level) => {
              const config = LEVEL_CONFIG[level.id] ?? LEVEL_CONFIG[1];
              const isSelected = selectedLevel === level.id;

              return (
                <TouchableOpacity
                  key={level.id}
                  activeOpacity={0.82}
                  onPress={() => handleSelect(level.id)}
                  style={[
                    styles.card,
                    isSelected && { borderColor: config.accent, backgroundColor: config.dimAccent },
                  ]}
                >
                  {/* Left accent strip */}
                  {isSelected && (
                    <View style={[styles.cardStrip, { backgroundColor: config.accent }]} />
                  )}

                  <View style={styles.cardInner}>
                    {/* Ring */}
                    <PhysiqueRing
                      progress={config.ringProgress}
                      accent={isSelected ? config.accent : 'rgba(255,255,255,0.2)'}
                    />

                    {/* Info */}
                    <View style={styles.cardBody}>
                      <View style={styles.cardTitleRow}>
                        <Text style={[styles.cardName, isSelected && { color: config.accent }]}>
                          {level.name}
                        </Text>
                        <View style={[styles.bfBadge, { backgroundColor: config.dimAccent, borderColor: config.accent + '40' }]}>
                          <Text style={[styles.bfBadgeText, { color: config.accent }]}>
                            {level.bodyFatRange}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.cardDesc} numberOfLines={1}>{level.description}</Text>

                      <View style={styles.tagRow}>
                        {level.characteristics.slice(0, 2).map((c, i) => (
                          <View key={i} style={styles.tag}>
                            <Text style={styles.tagText} numberOfLines={1}>{c}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {/* Checkmark / level number */}
                    <View style={[
                      styles.badge,
                      isSelected
                        ? { backgroundColor: config.accent }
                        : { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
                    ]}>
                      <Text style={[
                        styles.badgeText,
                        { color: isSelected ? '#0A0E27' : 'rgba(255,255,255,0.3)' },
                      ]}>
                        {isSelected ? '✓' : level.id}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Sticky continue button */}
        {selectedLevel && (
          <View style={styles.footer}>
            <Animated.View style={{ transform: [{ scale: btnScale }] }}>
              <TouchableOpacity
                style={[styles.continueBtn, { backgroundColor: LEVEL_CONFIG[selectedLevel]?.accent ?? '#6C63FF' }]}
                onPress={handleContinue}
                activeOpacity={0.85}
              >
                <Text style={styles.continueBtnText}>This is me  →</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}
      </LinearGradient>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },
  gradient: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 64, paddingBottom: 120 },

  header: { marginBottom: 28 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6, marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#8B93B0', lineHeight: 22, fontWeight: '500' },

  cardList: { gap: 10 },

  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#151932',
    overflow: 'hidden',
    position: 'relative',
  },
  cardStrip: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  cardBody: { flex: 1, gap: 5 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 },
  bfBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  bfBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  cardDesc: { fontSize: 12, color: '#8B93B0', fontWeight: '500' },
  tagRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  tag: {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    maxWidth: 150,
  },
  tagText: { fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '600' },

  badge: {
    width: 30, height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 13, fontWeight: '800' },

  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 16,
    backgroundColor: 'rgba(10,14,39,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  continueBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0A0E27',
    letterSpacing: 0.2,
  },
});
