import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PhasePlan, DailyLog } from '../types/domain';

type TodayScreenProps = {
  phase: PhasePlan;
  onLogDay: (log: DailyLog) => void;
  todayLog: DailyLog | null;
};

export const TodayScreen: React.FC<TodayScreenProps> = ({ phase, onLogDay, todayLog }) => {
  const [isMarkedComplete, setIsMarkedComplete] = useState(false);

  useEffect(() => {
    setIsMarkedComplete(todayLog?.loggedActivity === true);
  }, [todayLog]);

  const handleToggleComplete = () => {
    const today = new Date().toISOString().split('T')[0];
    const newStatus = !isMarkedComplete;
    
    const log: DailyLog = {
      id: todayLog?.id || `log_${Date.now()}`,
      date: today,
      phasePlanId: phase.id,
      loggedActivity: newStatus,
      createdAt: new Date().toISOString(),
    };
    
    onLogDay(log);
    setIsMarkedComplete(newStatus);
  };

  const startDate = new Date(phase.startDate);
  const today = new Date();
  const daysActive = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const expectedDays = phase.expectedWeeks * 7;
  const daysRemaining = expectedDays - daysActive;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
          })}</Text>

          <View style={styles.phaseCard}>
            <Text style={styles.phaseTitle}>Current Phase</Text>
            <View style={styles.phaseRow}>
              <Text style={styles.phaseLabel}>Target:</Text>
              <Text style={styles.phaseValue}>Level {phase.currentLevelId} → {phase.targetLevelId}</Text>
            </View>
            <View style={styles.phaseRow}>
              <Text style={styles.phaseLabel}>Days Active:</Text>
              <Text style={styles.phaseValue}>{daysActive}</Text>
            </View>
            <View style={styles.phaseRow}>
              <Text style={styles.phaseLabel}>Days Remaining:</Text>
              <Text style={[styles.phaseValue, styles.highlight]}>
                {daysRemaining > 0 ? daysRemaining : 0}
              </Text>
            </View>
          </View>

          <View style={styles.actionCard}>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>{isMarkedComplete ? '✅' : '📋'}</Text>
            </View>
            <Text style={styles.actionTitle}>
              {isMarkedComplete ? "Today's Progress Logged!" : 'Log Today\'s Progress'}
            </Text>
            <Text style={styles.actionDescription}>
              {isMarkedComplete 
                ? 'Great work! Keep the momentum going.'
                : 'Mark today complete to track your progress toward your goal.'}
            </Text>

            <TouchableOpacity 
              style={styles.completeButton} 
              onPress={handleToggleComplete}
            >
              <LinearGradient
                colors={isMarkedComplete ? ['#2A2F4F', '#1E2340'] : ['#00F5A0', '#00D9A3']}
                style={styles.completeButtonGradient}
              >
                <Text style={[
                  styles.completeButtonText,
                  isMarkedComplete && styles.completeButtonTextInactive
                ]}>
                  {isMarkedComplete ? 'Unmark Day' : 'Mark Day Complete'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.tipCard}>
            <Text style={styles.tipIcon}>💡</Text>
            <Text style={styles.tipText}>
              Consistency is key! Mark each day to track your progress accurately.
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    color: '#A0A3BD',
    marginBottom: 24,
  },
  phaseCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  phaseTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  phaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  phaseLabel: {
    fontSize: 14,
    color: '#A0A3BD',
  },
  phaseValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  highlight: {
    color: '#00F5A0',
  },
  actionCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E2340',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 40,
  },
  actionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  actionDescription: {
    fontSize: 14,
    color: '#A0A3BD',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  completeButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  completeButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  completeButtonText: {
    color: '#0A0E27',
    fontSize: 18,
    fontWeight: 'bold',
  },
  completeButtonTextInactive: {
    color: '#A0A3BD',
  },
  tipCard: {
    backgroundColor: '#1E2340',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  tipIcon: {
    fontSize: 24,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: '#A0A3BD',
    lineHeight: 20,
  },
});