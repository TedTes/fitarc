import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { PhasePlan, PhotoCheckin, ProgressEstimate } from '../types/domain';

type ProgressScreenProps = {
  phase: PhasePlan;
  photoCheckins: PhotoCheckin[];
  progressEstimate: ProgressEstimate | null;
  onTakePhoto: () => void;
};

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  phase,
  photoCheckins,
  progressEstimate,
  onTakePhoto,
}) => {
  const phasePhotos = photoCheckins.filter(p => p.phasePlanId === phase.id);
  const baselinePhoto = photoCheckins.find(p => p.phasePlanId === 'baseline');
  const latestPhoto = phasePhotos.length > 0 ? phasePhotos[phasePhotos.length - 1] : baselinePhoto;

  const progressPercent = progressEstimate?.progressPercent || 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Progress</Text>
      
      <View style={styles.progressCard}>
        <Text style={styles.progressLabel}>Progress Toward Target</Text>
        <Text style={styles.progressValue}>{progressPercent}%</Text>
        
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>

        {progressEstimate && (
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{progressEstimate.averageAdherence}%</Text>
              <Text style={styles.statLabel}>Avg Adherence</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{progressEstimate.weeksElapsed}</Text>
              <Text style={styles.statLabel}>Weeks In</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{phase.expectedWeeks}</Text>
              <Text style={styles.statLabel}>Total Weeks</Text>
            </View>
          </View>
        )}
      </View>

      {baselinePhoto && latestPhoto && (
        <View style={styles.comparisonCard}>
          <Text style={styles.sectionTitle}>Photo Comparison</Text>
          
          <View style={styles.photoRow}>
            <View style={styles.photoColumn}>
              <Text style={styles.photoLabel}>Before</Text>
              <Image source={{ uri: baselinePhoto.frontUri }} style={styles.photo} />
              <Text style={styles.photoDate}>
                {new Date(baselinePhoto.date).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.photoColumn}>
              <Text style={styles.photoLabel}>Current</Text>
              <Image source={{ uri: latestPhoto.frontUri }} style={styles.photo} />
              <Text style={styles.photoDate}>
                {new Date(latestPhoto.date).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.photoButton} onPress={onTakePhoto}>
        <Text style={styles.photoButtonText}>Take Progress Photo</Text>
      </TouchableOpacity>

      {phasePhotos.length > 0 && (
        <View style={styles.timelineCard}>
          <Text style={styles.sectionTitle}>Photo Timeline</Text>
          
          <View style={styles.timeline}>
            {baselinePhoto && (
              <View style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <Image source={{ uri: baselinePhoto.frontUri }} style={styles.timelinePhoto} />
                <View style={styles.timelineInfo}>
                  <Text style={styles.timelineDate}>
                    {new Date(baselinePhoto.date).toLocaleDateString()}
                  </Text>
                  <Text style={styles.timelineLabel}>Baseline</Text>
                </View>
              </View>
            )}

            {phasePhotos.map((photo, index) => (
              <View key={photo.id} style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <Image source={{ uri: photo.frontUri }} style={styles.timelinePhoto} />
                <View style={styles.timelineInfo}>
                  <Text style={styles.timelineDate}>
                    {new Date(photo.date).toLocaleDateString()}
                  </Text>
                  <Text style={styles.timelineLabel}>Week {index + 1}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
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
    marginBottom: 24,
  },
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  progressValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 16,
  },
  progressBarContainer: {
    width: '100%',
    height: 12,
    backgroundColor: '#e0e0e0',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 6,
  },
  statsGrid: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  comparisonCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
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
  photoButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  photoButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  timelineCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  timeline: {
    gap: 20,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
  },
  timelinePhoto: {
    width: 80,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  timelineInfo: {
    flex: 1,
  },
  timelineDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  timelineLabel: {
    fontSize: 12,
    color: '#666',
  },
});