import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WorkoutSessionEntry } from '../types/domain';

type FirstWorkoutPreviewScreenProps = {
  session: WorkoutSessionEntry | null;
  onStartWorkout: () => void;
  onViewFullWeek: () => void;
};

const estimateMinutes = (exerciseCount: number) => Math.max(25, Math.round(exerciseCount * 7.5));

export const FirstWorkoutPreviewScreen: React.FC<FirstWorkoutPreviewScreenProps> = ({
  session,
  onStartWorkout,
  onViewFullWeek,
}) => {
  const exerciseCount = session?.exercises.length ?? 5;
  const minutes = estimateMinutes(exerciseCount);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Your First Workout Preview</Text>
          <Text style={styles.title}>Week 1</Text>
          <Text style={styles.meta}>
            {minutes} min • {exerciseCount} exercises
          </Text>
          <Text style={styles.subtle}>
            {session?.date ? `Scheduled for ${session.date}` : 'Generated and ready to start'}
          </Text>

          <TouchableOpacity style={styles.primaryButton} onPress={onStartWorkout}>
            <Text style={styles.primaryText}>Start Workout</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onViewFullWeek}>
            <Text style={styles.secondaryText}>View Full Week</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },
  gradient: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
    backgroundColor: 'rgba(21, 25, 50, 0.88)',
    padding: 20,
  },
  kicker: { color: '#8B93B0', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '700', marginTop: 8 },
  meta: { color: '#C7CCE6', fontSize: 15, fontWeight: '600', marginTop: 6 },
  subtle: { color: '#8B93B0', fontSize: 12, marginTop: 8, marginBottom: 18 },
  primaryButton: {
    borderRadius: 12,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  secondaryText: { color: '#A0A3BD', fontSize: 13, fontWeight: '600' },
});
