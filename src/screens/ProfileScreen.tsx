import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Switch } from 'react-native';
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

  // ✨ NEW: Settings toggles
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(true);
  const [autoRestTimer, setAutoRestTimer] = useState(true);

  // ✨ NEW: Modal states for pickers
  const [showExperiencePicker, setShowExperiencePicker] = useState(false);
  const [showSplitPicker, setShowSplitPicker] = useState(false);
  const [showEatingPicker, setShowEatingPicker] = useState(false);

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

  // Helper functions to format labels
  const formatTrainingSplit = (split: TrainingSplit): string => {
    const labels: Record<TrainingSplit, string> = {
      full_body: 'Full Body',
      upper_lower: 'Upper/Lower',
      push_pull_legs: 'Push/Pull/Legs',
      bro_split: 'Bro Split',
      custom: 'Custom',
    };
    return labels[split];
  };

  const formatEatingMode = (mode: EatingMode): string => {
    const labels: Record<EatingMode, string> = {
      mild_deficit: 'Mild Deficit',
      recomp: 'Recomp',
      lean_bulk: 'Lean Bulk',
      maintenance: 'Maintenance',
    };
    return labels[mode];
  };

  const formatExperience = (exp: ExperienceLevel): string => {
    return exp.charAt(0).toUpperCase() + exp.slice(1);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* ✨ PROFILE SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PROFILE</Text>
            
            {/* Sex */}
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>👤</Text>
                <Text style={styles.settingLabel}>Sex</Text>
              </View>
              <View style={styles.inlineButtonGroup}>
                {(['male', 'female', 'other'] as const).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.inlineButton,
                      sex === option && styles.inlineButtonActive
                    ]}
                    onPress={() => setSex(option)}
                  >
                    <Text style={[
                      styles.inlineButtonText,
                      sex === option && styles.inlineButtonTextActive
                    ]}>
                      {option.charAt(0).toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Age */}
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>🎂</Text>
                <Text style={styles.settingLabel}>Age</Text>
              </View>
              <TextInput
                style={styles.settingInput}
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                placeholder="--"
                placeholderTextColor="#A0A3BD"
                maxLength={3}
              />
            </View>

            {/* Height */}
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>📏</Text>
                <Text style={styles.settingLabel}>Height</Text>
              </View>
              <View style={styles.settingRight}>
                <TextInput
                  style={styles.settingInput}
                  value={heightCm}
                  onChangeText={setHeightCm}
                  keyboardType="number-pad"
                  placeholder="--"
                  placeholderTextColor="#A0A3BD"
                  maxLength={3}
                />
                <Text style={styles.settingUnit}>cm</Text>
              </View>
            </View>
          </View>

          {/* ✨ TRAINING SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TRAINING</Text>

            {/* Experience Level */}
            <TouchableOpacity 
              style={styles.settingRow}
              onPress={() => setShowExperiencePicker(!showExperiencePicker)}
            >
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>💪</Text>
                <Text style={styles.settingLabel}>Experience Level</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>{formatExperience(experienceLevel)}</Text>
                <Text style={styles.settingChevron}>›</Text>
              </View>
            </TouchableOpacity>

            {showExperiencePicker && (
              <View style={styles.pickerContainer}>
                {(['beginner', 'intermediate', 'advanced'] as const).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={styles.pickerOption}
                    onPress={() => {
                      setExperienceLevel(option);
                      setShowExperiencePicker(false);
                    }}
                  >
                    <Text style={[
                      styles.pickerOptionText,
                      experienceLevel === option && styles.pickerOptionTextActive
                    ]}>
                      {formatExperience(option)}
                    </Text>
                    {experienceLevel === option && (
                      <Text style={styles.pickerCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Training Split */}
            <TouchableOpacity 
              style={styles.settingRow}
              onPress={() => setShowSplitPicker(!showSplitPicker)}
            >
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>🏋️</Text>
                <Text style={styles.settingLabel}>Training Split</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>{formatTrainingSplit(trainingSplit)}</Text>
                <Text style={styles.settingChevron}>›</Text>
              </View>
            </TouchableOpacity>

            {showSplitPicker && (
              <View style={styles.pickerContainer}>
                {([
                  { value: 'full_body', label: 'Full Body' },
                  { value: 'upper_lower', label: 'Upper/Lower' },
                  { value: 'push_pull_legs', label: 'Push/Pull/Legs' },
                  { value: 'bro_split', label: 'Bro Split' },
                  { value: 'custom', label: 'Custom' },
                ] as const).map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.pickerOption}
                    onPress={() => {
                      setTrainingSplit(option.value);
                      setShowSplitPicker(false);
                    }}
                  >
                    <Text style={[
                      styles.pickerOptionText,
                      trainingSplit === option.value && styles.pickerOptionTextActive
                    ]}>
                      {option.label}
                    </Text>
                    {trainingSplit === option.value && (
                      <Text style={styles.pickerCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* ✨ NUTRITION SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NUTRITION</Text>

            {/* Eating Mode */}
            <TouchableOpacity 
              style={styles.settingRow}
              onPress={() => setShowEatingPicker(!showEatingPicker)}
            >
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>🍽️</Text>
                <Text style={styles.settingLabel}>Eating Mode</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>{formatEatingMode(eatingMode)}</Text>
                <Text style={styles.settingChevron}>›</Text>
              </View>
            </TouchableOpacity>

            {showEatingPicker && (
              <View style={styles.pickerContainer}>
                {([
                  { value: 'mild_deficit', label: 'Mild Deficit' },
                  { value: 'recomp', label: 'Recomp' },
                  { value: 'lean_bulk', label: 'Lean Bulk' },
                  { value: 'maintenance', label: 'Maintenance' },
                ] as const).map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.pickerOption}
                    onPress={() => {
                      setEatingMode(option.value);
                      setShowEatingPicker(false);
                    }}
                  >
                    <Text style={[
                      styles.pickerOptionText,
                      eatingMode === option.value && styles.pickerOptionTextActive
                    ]}>
                      {option.label}
                    </Text>
                    {eatingMode === option.value && (
                      <Text style={styles.pickerCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* ✨ APP SETTINGS SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>APP SETTINGS</Text>

            {/* Notifications */}
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>🔔</Text>
                <View>
                  <Text style={styles.settingLabel}>Notifications</Text>
                  <Text style={styles.settingSubtext}>Daily workout reminders</Text>
                </View>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: '#2A2F4F', true: '#6C63FF' }}
                thumbColor={notificationsEnabled ? '#FFFFFF' : '#A0A3BD'}
              />
            </View>

            {/* Auto Rest Timer */}
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>⏱️</Text>
                <View>
                  <Text style={styles.settingLabel}>Auto Rest Timer</Text>
                  <Text style={styles.settingSubtext}>Start timer after each set</Text>
                </View>
              </View>
              <Switch
                value={autoRestTimer}
                onValueChange={setAutoRestTimer}
                trackColor={{ false: '#2A2F4F', true: '#6C63FF' }}
                thumbColor={autoRestTimer ? '#FFFFFF' : '#A0A3BD'}
              />
            </View>

            {/* Dark Mode (always on for now) */}
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>🌙</Text>
                <View>
                  <Text style={styles.settingLabel}>Dark Mode</Text>
                  <Text style={styles.settingSubtext}>Currently enabled</Text>
                </View>
              </View>
              <Switch
                value={darkModeEnabled}
                onValueChange={setDarkModeEnabled}
                trackColor={{ false: '#2A2F4F', true: '#6C63FF' }}
                thumbColor={darkModeEnabled ? '#FFFFFF' : '#A0A3BD'}
                disabled
              />
            </View>
          </View>

          {/* ✨ ARC MANAGEMENT SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ARC MANAGEMENT</Text>

            {onChangeCurrentLevel && (
              <TouchableOpacity 
                style={styles.settingRow}
                onPress={onChangeCurrentLevel}
              >
                <View style={styles.settingLeft}>
                  <Text style={styles.settingIcon}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Current Physique Level</Text>
                    <Text style={styles.settingSubtext}>Update where you are now</Text>
                  </View>
                </View>
                <Text style={styles.settingChevron}>›</Text>
              </TouchableOpacity>
            )}

            {onChangeTargetLevel && (
              <TouchableOpacity 
                style={styles.settingRow}
                onPress={onChangeTargetLevel}
              >
                <View style={styles.settingLeft}>
                  <Text style={styles.settingIcon}>🎯</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Start New Arc</Text>
                    <Text style={styles.settingSubtext}>Set a new target and begin fresh</Text>
                  </View>
                </View>
                <Text style={styles.settingChevron}>›</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ✨ ABOUT SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ABOUT</Text>

            <TouchableOpacity style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>ℹ️</Text>
                <Text style={styles.settingLabel}>App Version</Text>
              </View>
              <Text style={styles.settingValue}>1.0.0</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>📖</Text>
                <Text style={styles.settingLabel}>Terms & Privacy</Text>
              </View>
              <Text style={styles.settingChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>💬</Text>
                <Text style={styles.settingLabel}>Send Feedback</Text>
              </View>
              <Text style={styles.settingChevron}>›</Text>
            </TouchableOpacity>
          </View>

          {/* ✨ Save Button */}
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <LinearGradient
              colors={['#6C63FF', '#5449CC']}
              style={styles.saveButtonGradient}
            >
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Spacing for bottom */}
          <View style={{ height: 40 }} />
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
    paddingTop: 20,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Section
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6C63FF',
    letterSpacing: 1,
    paddingHorizontal: 20,
    marginBottom: 12,
  },

  // Setting Row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#151932',
    borderBottomWidth: 1,
    borderBottomColor: '#1E2340',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingIcon: {
    fontSize: 20,
    width: 28,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  settingSubtext: {
    fontSize: 12,
    color: '#A0A3BD',
    marginTop: 2,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingValue: {
    fontSize: 15,
    color: '#A0A3BD',
    fontWeight: '500',
  },
  settingUnit: {
    fontSize: 14,
    color: '#A0A3BD',
  },
  settingChevron: {
    fontSize: 20,
    color: '#A0A3BD',
    fontWeight: '300',
  },

  // Input
  settingInput: {
    minWidth: 60,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#1E2340',
    borderRadius: 8,
    fontSize: 15,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '600',
  },

  // Inline Button Group (for Sex)
  inlineButtonGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  inlineButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E2340',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  inlineButtonActive: {
    backgroundColor: '#6C63FF',
    borderColor: '#6C63FF',
  },
  inlineButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#A0A3BD',
  },
  inlineButtonTextActive: {
    color: '#FFFFFF',
  },

  // Picker
  pickerContainer: {
    backgroundColor: '#1E2340',
    marginHorizontal: 20,
    marginTop: -1,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#151932',
  },
  pickerOptionText: {
    fontSize: 15,
    color: '#A0A3BD',
    fontWeight: '500',
  },
  pickerOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pickerCheck: {
    fontSize: 16,
    color: '#00F5A0',
    fontWeight: 'bold',
  },

  // Save Button
  saveButton: {
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 16,
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