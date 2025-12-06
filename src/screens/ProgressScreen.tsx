import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  const daysActive = progressEstimate?.daysActive || 0;
  const daysLogged = progressEstimate?.daysLogged || 0;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Progress</Text>
          
          <View style={styles.progressCard}>
            <Text style={styles.progressLabel}>Progress Toward Target</Text>
            <Text style={styles.progressValue}>{progressPercent}%</Text>
            
            <View style={styles.progressBarContainer}>
              <LinearGradient
                colors={['#6C63FF', '#00F5A0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
              />
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{daysLogged}</Text>
                <Text style={styles.statLabel}>Days Logged</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{daysActive}</Text>
                <Text style={styles.statLabel}>Days Active</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{phase.expectedWeeks}</Text>
                <Text style={styles.statLabel}>Total Weeks</Text>
              </View>
            </View>
          </View>

          {baselinePhoto && latestPhoto && (
            <View style={styles.comparisonCard}>
              <Text style={styles.sectionTitle}>Photo Comparison</Text>
              
              <View style={styles.photoRow}>
                <View style={styles.photoColumn}>
                  <Text style={styles.photoLabel}>Start</Text>
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
            <LinearGradient
              colors={['#6C63FF', '#5449CC']}
              style={styles.photoButtonGradient}
            >
              <Text style={styles.photoButtonText}>📸 Take Progress Photo</Text>
            </LinearGradient>
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
    marginBottom: 24,
  },
  progressCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  progressLabel: {
    fontSize: 16,
    color: '#A0A3BD',
    marginBottom: 8,
  },
  progressValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#00F5A0',
    marginBottom: 16,
  },
  progressBarContainer: {
    width: '100%',
    height: 12,
    backgroundColor: '#1E2340',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressBarFill: {
    height: '100%',
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
    backgroundColor: '#1E2340',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#A0A3BD',
    textAlign: 'center',
  },
  comparisonCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
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
    color: '#A0A3BD',
    marginBottom: 8,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#1E2340',
    marginBottom: 8,
  },
  photoDate: {
    fontSize: 12,
    color: '#A0A3BD',
  },
  photoButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  photoButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  photoButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  timelineCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2A2F4F',
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
    backgroundColor: '#6C63FF',
  },
  timelinePhoto: {
    width: 80,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#1E2340',
  },
  timelineInfo: {
    flex: 1,
  },
  timelineDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  timelineLabel: {
    fontSize: 12,
    color: '#A0A3BD',
  },
});