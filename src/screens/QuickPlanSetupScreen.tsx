import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { EquipmentLevel, PrimaryGoal } from '../types/domain';

type QuickPlanSetupScreenProps = {
  primaryGoal: PrimaryGoal;
  onComplete: (input: {
    daysPerWeek: 3 | 4 | 5 | 6;
    equipmentLevel: EquipmentLevel;
    injuries: string[];
  }) => void;
  onSkip: () => void;
};

const DAY_OPTIONS: Array<3 | 4 | 5 | 6> = [3, 4, 5, 6];

const EQUIPMENT_OPTIONS: Array<{ label: string; value: EquipmentLevel }> = [
  { label: 'Bodyweight', value: 'bodyweight' },
  { label: 'Dumbbells', value: 'dumbbells' },
  { label: 'Full Gym', value: 'full_gym' },
];

const INJURY_OPTIONS = ['Shoulder', 'Lower back', 'Knee', 'Elbow', 'Neck'];

export const QuickPlanSetupScreen: React.FC<QuickPlanSetupScreenProps> = ({
  primaryGoal,
  onComplete,
  onSkip,
}) => {
  const [daysPerWeek, setDaysPerWeek] = useState<3 | 4 | 5 | 6>(4);
  const [equipmentLevel, setEquipmentLevel] = useState<EquipmentLevel>('full_gym');
  const [injuries, setInjuries] = useState<string[]>([]);

  const toggleInjury = (name: string) => {
    setInjuries((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const selectionSummary = useMemo(
    () => `${primaryGoal.replace('_', ' ')} • ${daysPerWeek} days/week • ${equipmentLevel.replace('_', ' ')}`,
    [daysPerWeek, equipmentLevel, primaryGoal]
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Program Matching</Text>
          <Text style={styles.subtitle}>Set key preferences so we can match you to the right template.</Text>

          <Text style={styles.sectionTitle}>Training Days / Week</Text>
          <View style={styles.row}>
            {DAY_OPTIONS.map((days) => (
              <TouchableOpacity
                key={days}
                style={[styles.pill, daysPerWeek === days && styles.pillActive]}
                onPress={() => setDaysPerWeek(days)}
              >
                <Text style={[styles.pillText, daysPerWeek === days && styles.pillTextActive]}>
                  {days}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Equipment Access</Text>
          <View style={styles.row}>
            {EQUIPMENT_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[styles.pill, equipmentLevel === item.value && styles.pillActive]}
                onPress={() => setEquipmentLevel(item.value)}
              >
                <Text
                  style={[styles.pillText, equipmentLevel === item.value && styles.pillTextActive]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Limitations (optional)</Text>
          <View style={styles.row}>
            {INJURY_OPTIONS.map((name) => (
              <TouchableOpacity
                key={name}
                style={[styles.pill, injuries.includes(name) && styles.pillWarn]}
                onPress={() => toggleInjury(name)}
              >
                <Text style={[styles.pillText, injuries.includes(name) && styles.pillWarnText]}>
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.summary}>{selectionSummary}</Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() =>
            onComplete({
                daysPerWeek,
                equipmentLevel,
                injuries,
              })
            }
          >
            <Text style={styles.primaryText}>Match My Program</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onSkip}>
            <Text style={styles.secondaryText}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },
  gradient: { flex: 1 },
  content: { padding: 20, paddingTop: 70, paddingBottom: 50, gap: 12 },
  title: { fontSize: 32, fontWeight: '700', color: '#FFFFFF' },
  subtitle: { fontSize: 14, color: '#A0A3BD', marginBottom: 6 },
  sectionTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: {
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#151932',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minWidth: '47%',
  },
  choiceActive: {
    borderColor: '#6C63FF',
    backgroundColor: 'rgba(108, 99, 255, 0.25)',
  },
  choiceText: { color: '#A0A3BD', fontWeight: '600', fontSize: 13 },
  choiceTextActive: { color: '#FFFFFF' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#151932',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pillActive: {
    borderColor: '#6C63FF',
    backgroundColor: 'rgba(108, 99, 255, 0.25)',
  },
  pillWarn: {
    borderColor: 'rgba(255, 196, 66, 0.7)',
    backgroundColor: 'rgba(255, 196, 66, 0.2)',
  },
  pillText: { color: '#A0A3BD', fontSize: 12, fontWeight: '600' },
  pillTextActive: { color: '#FFFFFF' },
  pillWarnText: { color: '#FFD374' },
  summary: { color: '#8B93B0', fontSize: 12, marginTop: 2 },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { color: '#8B93B0', fontSize: 13, fontWeight: '600' },
});
