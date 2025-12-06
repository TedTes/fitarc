import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PhasePlan, User } from '../types/domain';

type HomeScreenProps = {
  user: User;
  phase: PhasePlan | null;
  onStartPhase: () => void;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ user, phase, onStartPhase }) => {
  if (!phase) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#0A0E27', '#151932', '#1E2340']}
          style={styles.gradient}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.greeting}>Welcome back,</Text>
              <Text style={styles.title}>Ready to transform?</Text>
              <Text style={styles.subtitle}>
                Select your target physique and start tracking your progress
              </Text>
            </View>

            <View style={styles.profileCard}>
              <Text style={styles.cardTitle}>Your Profile</Text>
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Level</Text>
                  <Text style={styles.infoValue}>{user.currentPhysiqueLevel}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Age</Text>
                  <Text style={styles.infoValue}>{user.age}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Height</Text>
                  <Text style={styles.infoValue}>{user.heightCm} cm</Text>
                </View>
              </View>
            </View>

            <View style={styles.ctaSection}>
              <View style={styles.iconContainer}>
                <Text style={styles.icon}>🎯</Text>
              </View>
              <Text style={styles.ctaTitle}>Start Your Journey</Text>
              <Text style={styles.ctaDescription}>
                Choose your target physique and track your daily progress toward your goal
              </Text>
            </View>

            <TouchableOpacity style={styles.startButton} onPress={onStartPhase}>
              <LinearGradient
                colors={['#6C63FF', '#5449CC']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.startButtonGradient}
              >
                <Text style={styles.startButtonText}>Start New Phase</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </LinearGradient>
      </View>
    );
  }

  const startDate = new Date(phase.startDate);
  const endDate = new Date(phase.expectedEndDate);
  const today = new Date();
  const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const totalDays = phase.expectedWeeks * 7;
  const daysRemaining = totalDays - daysElapsed;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Active Phase</Text>
          
          <View style={styles.phaseCard}>
            <View style={styles.phaseHeader}>
              <View>
                <Text style={styles.phaseType}>TRANSFORMATION</Text>
                <Text style={styles.phaseSubtitle}>Level {phase.currentLevelId} → {phase.targetLevelId}</Text>
              </View>
              <View style={styles.statusBadge}>
                <LinearGradient
                  colors={['#00F5A0', '#00D9A3']}
                  style={styles.statusBadgeGradient}
                >
                  <Text style={styles.statusText}>{phase.status}</Text>
                </LinearGradient>
              </View>
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Duration</Text>
                <Text style={styles.progressValue}>{phase.expectedWeeks} weeks</Text>
              </View>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Started</Text>
                <Text style={styles.progressValue}>{startDate.toLocaleDateString()}</Text>
              </View>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Expected End</Text>
                <Text style={styles.progressValue}>{endDate.toLocaleDateString()}</Text>
              </View>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Days Remaining</Text>
                <Text style={[styles.progressValue, styles.highlight]}>
                  {daysRemaining > 0 ? daysRemaining : 0}
                </Text>
              </View>
            </View>

            <View style={styles.infoSection}>
              <View style={styles.infoIcon}>
                <Text style={styles.iconEmoji}>📈</Text>
              </View>
              <Text style={styles.infoText}>
                Track your progress daily by marking each day complete in the Today tab
              </Text>
            </View>

            <View style={styles.infoSection}>
              <View style={styles.infoIcon}>
                <Text style={styles.iconEmoji}>📸</Text>
              </View>
              <Text style={styles.infoText}>
                Take weekly photos to visually track your transformation
              </Text>
            </View>
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
  header: {
    marginBottom: 32,
  },
  greeting: {
    fontSize: 16,
    color: '#A0A3BD',
    marginBottom: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A3BD',
    lineHeight: 24,
  },
  profileCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  infoItem: {
    flex: 1,
    backgroundColor: '#1E2340',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: '#A0A3BD',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  ctaSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#151932',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  icon: {
    fontSize: 40,
  },
  ctaTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  ctaDescription: {
    fontSize: 14,
    color: '#A0A3BD',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  startButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  startButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  phaseCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F4F',
  },
  phaseType: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6C63FF',
    marginBottom: 4,
  },
  phaseSubtitle: {
    fontSize: 14,
    color: '#A0A3BD',
  },
  statusBadge: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  statusBadgeGradient: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: {
    color: '#0A0E27',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  progressSection: {
    marginBottom: 20,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  progressLabel: {
    fontSize: 14,
    color: '#A0A3BD',
  },
  progressValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  highlight: {
    color: '#00F5A0',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2F4F',
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E2340',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconEmoji: {
    fontSize: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#A0A3BD',
    lineHeight: 20,
  },
});