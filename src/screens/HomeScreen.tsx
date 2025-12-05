import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PhasePlan, User } from '../types/domain';

type HomeScreenProps = {
  user: User;
  phase: PhasePlan | null;
  onStartPhase: () => void;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ user, phase, onStartPhase }) => {
  if (!phase) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Welcome, ready to start?</Text>
        <Text style={styles.subtitle}>
          Let's create your first phase plan
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Your Profile</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Age:</Text>
            <Text style={styles.infoValue}>{user.age} years</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Height:</Text>
            <Text style={styles.infoValue}>{user.heightCm} cm</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Experience:</Text>
            <Text style={styles.infoValue}>{user.experienceLevel}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.startButton} onPress={onStartPhase}>
          <Text style={styles.startButtonText}>Start My First Phase</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const startDate = new Date(phase.startDate);
  const endDate = new Date(phase.expectedEndDate);
  const today = new Date();
  const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const totalDays = phase.expectedWeeks * 7;
  const daysRemaining = totalDays - daysElapsed;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Active Phase</Text>
      
      <View style={styles.phaseCard}>
        <View style={styles.phaseHeader}>
          <Text style={styles.phaseTitle}>{phase.phaseType.toUpperCase()}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{phase.status}</Text>
          </View>
        </View>

        <View style={styles.phaseInfo}>
          <View style={styles.phaseRow}>
            <Text style={styles.phaseLabel}>Duration:</Text>
            <Text style={styles.phaseValue}>{phase.expectedWeeks} weeks</Text>
          </View>
          <View style={styles.phaseRow}>
            <Text style={styles.phaseLabel}>Started:</Text>
            <Text style={styles.phaseValue}>{startDate.toLocaleDateString()}</Text>
          </View>
          <View style={styles.phaseRow}>
            <Text style={styles.phaseLabel}>Expected End:</Text>
            <Text style={styles.phaseValue}>{endDate.toLocaleDateString()}</Text>
          </View>
          <View style={styles.phaseRow}>
            <Text style={styles.phaseLabel}>Days Remaining:</Text>
            <Text style={styles.phaseValue}>{daysRemaining > 0 ? daysRemaining : 0}</Text>
          </View>
        </View>

        <View style={styles.planSection}>
          <Text style={styles.sectionTitle}>Workout Schedule</Text>
          <Text style={styles.sectionValue}>{phase.workoutSessions.length} sessions per week</Text>
          {phase.workoutSessions.map((session) => (
            <View key={session.id} style={styles.sessionRow}>
              <Text style={styles.sessionName}>• {session.name}</Text>
              <Text style={styles.sessionDay}>{session.dayHint}</Text>
            </View>
          ))}
        </View>

        <View style={styles.planSection}>
          <Text style={styles.sectionTitle}>Diet Mode</Text>
          <Text style={styles.sectionValue}>{phase.dietMode.modeType.replace('_', ' ')}</Text>
          <Text style={styles.dietDescription}>{phase.dietMode.description}</Text>
        </View>

        <View style={styles.planSection}>
          <Text style={styles.sectionTitle}>Daily Habits</Text>
          {phase.habitTargets.minStepsPerDay && (
            <Text style={styles.habitText}>• {phase.habitTargets.minStepsPerDay}+ steps</Text>
          )}
          {phase.habitTargets.minSleepHours && (
            <Text style={styles.habitText}>• {phase.habitTargets.minSleepHours}h sleep</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  infoBox: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 32,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 16,
    color: '#666',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  startButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  phaseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  phaseTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  statusBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  phaseInfo: {
    marginBottom: 24,
  },
  phaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  phaseLabel: {
    fontSize: 14,
    color: '#666',
  },
  phaseValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  planSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionValue: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  sessionName: {
    fontSize: 14,
    color: '#333',
  },
  sessionDay: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
  },
  dietDescription: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  habitText: {
    fontSize: 14,
    color: '#333',
    paddingVertical: 4,
  },
});