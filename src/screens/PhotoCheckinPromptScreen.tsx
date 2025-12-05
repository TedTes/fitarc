import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { PhotoCheckin, PhasePlan } from '../types/domain';

type PhotoCheckinPromptScreenProps = {
  phase: PhasePlan;
  lastPhoto: PhotoCheckin | null;
  onTakePhoto: () => void;
  onSkip: () => void;
};

export const PhotoCheckinPromptScreen: React.FC<PhotoCheckinPromptScreenProps> = ({
  phase,
  lastPhoto,
  onTakePhoto,
  onSkip,
}) => {
  const daysSinceLastPhoto = lastPhoto
    ? Math.floor((new Date().getTime() - new Date(lastPhoto.date).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const startDate = new Date(phase.startDate);
  const today = new Date();
  const daysIntoPhase = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const weeksIntoPhase = Math.floor(daysIntoPhase / 7);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>📸</Text>
        <Text style={styles.title}>Time for Progress Photos</Text>
        <Text style={styles.subtitle}>
          You're {weeksIntoPhase} weeks into your phase
        </Text>

        {lastPhoto && (
          <View style={styles.lastPhotoSection}>
            <Text style={styles.lastPhotoLabel}>Last photo taken:</Text>
            <Text style={styles.lastPhotoDate}>
              {daysSinceLastPhoto} days ago
            </Text>
            <Image source={{ uri: lastPhoto.frontUri }} style={styles.lastPhotoPreview} />
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Weekly photos help track your visual progress and improve accuracy of progress estimates.
          </Text>
        </View>

        <TouchableOpacity style={styles.takePhotoButton} onPress={onTakePhoto}>
          <Text style={styles.takePhotoButtonText}>Take Progress Photos</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
          <Text style={styles.skipButtonText}>Remind Me Tomorrow</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  lastPhotoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  lastPhotoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  lastPhotoDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  lastPhotoPreview: {
    width: 120,
    height: 150,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  infoBox: {
    backgroundColor: '#f0f8ff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    lineHeight: 20,
  },
  takePhotoButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  takePhotoButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 12,
  },
  skipButtonText: {
    color: '#666',
    fontSize: 16,
  },
});