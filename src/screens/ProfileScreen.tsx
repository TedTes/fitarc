import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { User, TrainingSplit, EatingMode, ExperienceLevel } from '../types/domain';

type ProfileScreenProps = {
  user: User;
  onSave: (user: User) => void;
  onClose: () => void;
  onChangeCurrentLevel?: () => void;
  onChangeTargetLevel?: () => void;
};

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  onSave,
  onClose,
  onChangeCurrentLevel,
  onChangeTargetLevel,
}) => {
  const [sex, setSex] = useState<'male' | 'female' | 'other'>(user.sex);
  const [age, setAge] = useState(user.age.toString());
  const [heightCm, setHeightCm] = useState(user.heightCm.toString());
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(user.experienceLevel);
  const [trainingSplit, setTrainingSplit] = useState<TrainingSplit>(user.trainingSplit);
  const [eatingMode, setEatingMode] = useState<EatingMode>(user.eatingMode);

  const handleSave = () => {
    const ageNum = parseInt(age, 10);
    const heightNum = parseInt(heightCm, 10);

    if (!age || isNaN(ageNum) || ageNum < 13 || ageNum > 100) {
      Alert.alert('Invalid Input', 'Please enter a valid age (13-100)');
      return;
    }

    if (!heightCm || isNaN(heightNum) || heightNum < 100 || heightNum > 250) {
      Alert.alert('Invalid Input', 'Please enter a valid height (100-250 cm)');
      return;
    }

    const updatedUser: User = {
      ...user,
      sex,
      age: ageNum,
      heightCm: heightNum,
      experienceLevel,
      trainingSplit,
      eatingMode,
    };

    onSave(updatedUser);
    onClose();
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Profile & Settings</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Basic Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Sex</Text>
              <View style={styles.buttonGroup}>
                {(['male', 'female', 'other'] as const).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.optionButton, sex === option && styles.optionButtonActive]}
                    onPress={() => setSex(option)}
                  >
                    <Text style={[styles.optionText, sex === option && styles.optionTextActive]}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                placeholder="Enter your age"
                placeholderTextColor="#A0A3BD"
                maxLength={3}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Height (cm)</Text>
              <TextInput
                style={styles.input}
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="number-pad"
                placeholder="Enter your height"
                placeholderTextColor="#A0A3BD"
                maxLength={3}
              />
            </View>
          </View>

          {/* Training Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Training</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Experience Level</Text>
              <View style={styles.buttonGroup}>
                {(['beginner', 'intermediate', 'advanced'] as const).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.optionButton, experienceLevel === option && styles.optionButtonActive]}
                    onPress={() => setExperienceLevel(option)}
                  >
                    <Text style={[styles.optionText, experienceLevel === option && styles.optionTextActive]}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Training Split</Text>
              <View style={styles.splitGrid}>
                {([
                  { value: 'full_body', label: 'Full Body' },
                  { value: 'upper_lower', label: 'Upper/Lower' },
                  { value: 'push_pull_legs', label: 'Push/Pull/Legs' },
                  { value: 'bro_split', label: 'Bro Split' },
                  { value: 'custom', label: 'Custom' },
                ] as const).map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.splitButton, trainingSplit === option.value && styles.splitButtonActive]}
                    onPress={() => setTrainingSplit(option.value)}
                  >
                    <Text style={[styles.splitText, trainingSplit === option.value && styles.splitTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Nutrition Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Nutrition</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Eating Mode</Text>
              <View style={styles.splitGrid}>
                {([
                  { value: 'mild_deficit', label: 'Mild Deficit' },
                  { value: 'recomp', label: 'Recomp' },
                  { value: 'lean_bulk', label: 'Lean Bulk' },
                  { value: 'maintenance', label: 'Maintenance' },
                ] as const).map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.splitButton, eatingMode === option.value && styles.splitButtonActive]}
                    onPress={() => setEatingMode(option.value)}
                  >
                    <Text style={[styles.splitText, eatingMode === option.value && styles.splitTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Arc Management */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Arc Management</Text>

            {onChangeCurrentLevel && (
              <TouchableOpacity style={styles.arcButton} onPress={onChangeCurrentLevel}>
                <Text style={styles.arcButtonText}>Change Current Physique Level</Text>
                <Text style={styles.arcButtonSubtext}>Update where you are now</Text>
              </TouchableOpacity>
            )}

            {onChangeTargetLevel && (
              <TouchableOpacity style={styles.arcButton} onPress={onChangeTargetLevel}>
                <Text style={styles.arcButtonText}>Start New Arc</Text>
                <Text style={styles.arcButtonSubtext}>Set a new target and begin a fresh arc</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Save/Cancel Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <LinearGradient
                colors={['#6C63FF', '#5449CC']}
                style={styles.saveButtonGradient}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </LinearGradient>
            </TouchableOpacity>
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
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#151932',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
  },
  headerSpacer: {
    width: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A0A3BD',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#151932',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#151932',
    alignItems: 'center',
  },
  optionButtonActive: {
    backgroundColor: '#6C63FF',
    borderColor: '#6C63FF',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A0A3BD',
  },
  optionTextActive: {
    color: '#FFFFFF',
  },
  splitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  splitButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#151932',
  },
  splitButtonActive: {
    backgroundColor: '#6C63FF',
    borderColor: '#6C63FF',
  },
  splitText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A0A3BD',
  },
  splitTextActive: {
    color: '#FFFFFF',
  },
  arcButton: {
    backgroundColor: '#151932',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  arcButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  arcButtonSubtext: {
    fontSize: 13,
    color: '#A0A3BD',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A0A3BD',
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  saveButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});