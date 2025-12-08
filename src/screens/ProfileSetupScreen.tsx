import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type ProfileSetupScreenProps = {
  onComplete: (data: {
    sex: 'male' | 'female' | 'other';
    age: number;
    heightCm: number;
    experienceLevel: 'beginner' | 'intermediate' | 'advanced';
    trainingSplit: 'full_body' | 'upper_lower' | 'push_pull_legs' | 'bro_split' | 'custom';
    eatingMode: 'mild_deficit' | 'recomp' | 'lean_bulk' | 'maintenance';
  }) => void;
};

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({ onComplete }) => {
  const [sex, setSex] = useState<'male' | 'female' | 'other'>('male');
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [trainingSplit, setTrainingSplit] = useState<'full_body' | 'upper_lower' | 'push_pull_legs' | 'bro_split' | 'custom'>('full_body');
  const [eatingMode, setEatingMode] = useState<'mild_deficit' | 'recomp' | 'lean_bulk' | 'maintenance'>('maintenance');

  const handleContinue = () => {
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

    onComplete({
      sex,
      age: ageNum,
      heightCm: heightNum,
      experienceLevel,
      trainingSplit,
      eatingMode,
    });
  };

  const OptionButton = ({ 
    label, 
    selected, 
    onPress 
  }: { 
    label: string; 
    selected: boolean; 
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={[styles.optionButton, selected && styles.optionButtonSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {selected && (
        <LinearGradient
          colors={['#6C63FF', '#5449CC']}
          style={styles.optionButtonGradient}
        >
          <Text style={styles.optionButtonTextSelected}>{label}</Text>
        </LinearGradient>
      )}
      {!selected && (
        <Text style={styles.optionButtonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Welcome to FitArc</Text>
            <Text style={styles.subtitle}>Let's set up your profile</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Sex</Text>
            <View style={styles.buttonGroup}>
              <OptionButton label="Male" selected={sex === 'male'} onPress={() => setSex('male')} />
              <OptionButton label="Female" selected={sex === 'female'} onPress={() => setSex('female')} />
              <OptionButton label="Other" selected={sex === 'other'} onPress={() => setSex('other')} />
            </View>
          </View>

          <View style={styles.section}>
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

          <View style={styles.section}>
            <Text style={styles.label}>Height (cm)</Text>
            <TextInput
              style={styles.input}
              value={heightCm}
              onChangeText={setHeightCm}
              keyboardType="number-pad"
              placeholder="Enter your height in cm"
              placeholderTextColor="#A0A3BD"
              maxLength={3}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Training Experience</Text>
            <View style={styles.buttonGroup}>
              <OptionButton label="Beginner" selected={experienceLevel === 'beginner'} onPress={() => setExperienceLevel('beginner')} />
              <OptionButton label="Intermediate" selected={experienceLevel === 'intermediate'} onPress={() => setExperienceLevel('intermediate')} />
              <OptionButton label="Advanced" selected={experienceLevel === 'advanced'} onPress={() => setExperienceLevel('advanced')} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Training Split</Text>
            <Text style={styles.helper}>How do you like to train?</Text>
            <View style={styles.splitGrid}>
              <OptionButton label="Full Body" selected={trainingSplit === 'full_body'} onPress={() => setTrainingSplit('full_body')} />
              <OptionButton label="Upper/Lower" selected={trainingSplit === 'upper_lower'} onPress={() => setTrainingSplit('upper_lower')} />
              <OptionButton label="Push/Pull/Legs" selected={trainingSplit === 'push_pull_legs'} onPress={() => setTrainingSplit('push_pull_legs')} />
              <OptionButton label="Bro Split" selected={trainingSplit === 'bro_split'} onPress={() => setTrainingSplit('bro_split')} />
              <OptionButton label="Custom" selected={trainingSplit === 'custom'} onPress={() => setTrainingSplit('custom')} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Eating Mode</Text>
            <Text style={styles.helper}>What's your nutrition goal?</Text>
            <View style={styles.splitGrid}>
              <OptionButton label="Mild Deficit" selected={eatingMode === 'mild_deficit'} onPress={() => setEatingMode('mild_deficit')} />
              <OptionButton label="Recomp" selected={eatingMode === 'recomp'} onPress={() => setEatingMode('recomp')} />
              <OptionButton label="Lean Bulk" selected={eatingMode === 'lean_bulk'} onPress={() => setEatingMode('lean_bulk')} />
              <OptionButton label="Maintenance" selected={eatingMode === 'maintenance'} onPress={() => setEatingMode('maintenance')} />
            </View>
          </View>

          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <LinearGradient
              colors={['#6C63FF', '#5449CC']}
              style={styles.continueButtonGradient}
            >
              <Text style={styles.continueButtonText}>Continue</Text>
            </LinearGradient>
          </TouchableOpacity>
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
    marginBottom: 32,
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
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  helper: {
    fontSize: 13,
    color: '#A0A3BD',
    marginBottom: 12,
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
  splitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    minWidth: 100,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#151932',
  },
  optionButtonSelected: {
    borderColor: '#6C63FF',
  },
  optionButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  optionButtonText: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '600',
    color: '#A0A3BD',
    textAlign: 'center',
  },
  optionButtonTextSelected: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  continueButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 24,
  },
  continueButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});