import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { PhasePlan, PhotoCheckin } from '../types/domain';

type PhaseCompleteScreenProps = {
  phase: PhasePlan;
  beforePhoto: PhotoCheckin | null;
  afterPhoto: PhotoCheckin | null;
  progressPercent: number;
  onStartNextPhase: () => void;
};

export const PhaseCompleteScreen: React.FC<PhaseCompleteScreenProps> = ({
  phase,
  beforePhoto,
  afterPhoto,
  progressPercent,
  onStartNextPhase,
}) => {
  const startDate = new Date(phase.startDate);
  const endDate = new Date();
  const weeksCompleted = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.celebrationSection}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>Phase Complete!</Text>
        <Text style={styles.subtitle}>
          You've reached your target physique
        </Text>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Progress:</Text>
          <Text style={styles.statValue}>{progressPercent}%</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Duration:</Text>
          <Text style={styles.statValue}>{weeksCompleted} weeks</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Phase Type:</Text>
          <Text style={styles.statValue}>{phase.phaseType}</Text>
        </View>
      </View>

      {beforePhoto && afterPhoto && (
        <View style={styles.comparisonCard}>
          <Text style={styles.sectionTitle}>Your Transformation</Text>
          
          <View style={styles.photoRow}>
            <View style={styles.photoColumn}>
              <Text style={styles.photoLabel}>Before</Text>
              <Image source={{ uri: beforePhoto.frontUri }} style={styles.photo} />
              <Text style={styles.photoDate}>
                {new Date(beforePhoto.date).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.photoColumn}>
              <Text style={styles.photoLabel}>After</Text>
              <Image source={{ uri: afterPhoto.frontUri }} style={styles.photo} />
              <Text style={styles.photoDate}>
                {new Date(afterPhoto.date).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.messageCard}>
        <Text style={styles.messageText}>
          Great work! You've successfully completed this phase. Ready to take the next step in your fitness journey?
        </Text>
      </View>

      <TouchableOpacity style={styles.continueButton} onPress={onStartNextPhase}>
        <Text style={styles.continueButtonText}>Start Next Phase</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
  },
  celebrationSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
  },
  statsCard: {
    backgroundColor: '#f0f8ff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: 16,
    color: '#666',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  comparisonCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  photoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoColumn: {
    flex: 1,
    alignItems: 'center',
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginBottom: 8,
  },
  photoDate: {
    fontSize: 12,
    color: '#999',
  },
  messageCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  messageText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    lineHeight: 24,
  },
  continueButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});