import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PrimaryGoal } from '../types/domain';

type MainFocusScreenProps = {
  onSelect: (goal: PrimaryGoal) => void;
  onSkip: () => void;
};

const GOALS: Array<{ label: string; value: PrimaryGoal }> = [
  { label: 'Build Muscle', value: 'build_muscle' },
  { label: 'Get Stronger', value: 'get_stronger' },
  { label: 'Lose Fat', value: 'lose_fat' },
  { label: 'Endurance', value: 'endurance' },
  { label: 'General Fitness', value: 'general_fitness' },
];

export const MainFocusScreen: React.FC<MainFocusScreenProps> = ({ onSelect, onSkip }) => (
  <View style={styles.container}>
    <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
      <View style={styles.content}>
        <Text style={styles.title}>Main Focus</Text>
        <Text style={styles.subtitle}>Choose your primary training direction.</Text>
        <View style={styles.grid}>
          {GOALS.map((goal) => (
            <TouchableOpacity
              key={goal.value}
              style={styles.option}
              onPress={() => onSelect(goal.value)}
            >
              <Text style={styles.optionText}>{goal.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },
  gradient: { flex: 1 },
  content: { flex: 1, padding: 20, paddingTop: 90 },
  title: { fontSize: 34, fontWeight: '700', color: '#FFFFFF' },
  subtitle: { marginTop: 6, color: '#A0A3BD', fontSize: 14, marginBottom: 18 },
  grid: { gap: 10 },
  option: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#151932',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  optionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  skipButton: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  skipText: { color: '#8B93B0', fontSize: 13, fontWeight: '600' },
});
