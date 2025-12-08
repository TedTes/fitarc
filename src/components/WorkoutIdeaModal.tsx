import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BodyPart } from '../utils/trainingSplitHelper';
import { getExercisesForBodyParts } from '../data/exercises';

type WorkoutIdeaModalProps = {
  visible: boolean;
  onClose: () => void;
  focusAreas: BodyPart[];
};

export const WorkoutIdeaModal: React.FC<WorkoutIdeaModalProps> = ({
  visible,
  onClose,
  focusAreas,
}) => {
  const [exercises, setExercises] = useState<string[]>(() => 
    getExercisesForBodyParts(focusAreas, 5)
  );

  const handleShuffle = () => {
    setExercises(getExercisesForBodyParts(focusAreas, 5));
  };

  const focusText = focusAreas.map(bp => 
    bp.charAt(0).toUpperCase() + bp.slice(1)
  ).join(' & ');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Workout Inspiration</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>Today: {focusText}</Text>

          <View style={styles.standardVolume}>
            <Text style={styles.standardVolumeText}>
              Fitarc Standard Volume: 3–4 sets · 6–12 reps · RPE 7–9 per exercise
            </Text>
          </View>

          <View style={styles.exerciseList}>
            {exercises.map((exercise, index) => (
              <View key={index} style={styles.exerciseItem}>
                <Text style={styles.exerciseBullet}>•</Text>
                <Text style={styles.exerciseName}>{exercise}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.shuffleButton} onPress={handleShuffle}>
            <Text style={styles.shuffleButtonText}>🔄 Show Another Idea</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <LinearGradient
              colors={['#6C63FF', '#5449CC']}
              style={styles.doneButtonGradient}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            This is inspiration only. No logging or tracking required.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 14, 39, 0.9)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#151932',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E2340',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 15,
    color: '#A0A3BD',
    marginBottom: 16,
  },
  standardVolume: {
    backgroundColor: '#1E2340',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: '#6C63FF',
  },
  standardVolumeText: {
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  exerciseList: {
    gap: 12,
    marginBottom: 20,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  exerciseBullet: {
    fontSize: 18,
    color: '#6C63FF',
    marginRight: 12,
    marginTop: -2,
  },
  exerciseName: {
    fontSize: 16,
    color: '#FFFFFF',
    flex: 1,
  },
  shuffleButton: {
    backgroundColor: '#1E2340',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  shuffleButtonText: {
    fontSize: 15,
    color: '#6C63FF',
    fontWeight: '600',
  },
  doneButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  doneButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  disclaimer: {
    fontSize: 12,
    color: '#A0A3BD',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});