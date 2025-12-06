import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type ProfileSetupScreenProps = {
  onComplete: (data: {
    sex: 'male' | 'female' | 'other';
    age: number;
    heightCm: number;
    experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  }) => void;
};

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({ onComplete }) => {
  const [sex, setSex] = useState<'male' | 'female' | 'other'>('male');
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');

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
          <Text style={styles.optionTextSelected}>{label}</Text>
        </LinearGradient>
      )}
      {!selected && <Text style={styles.optionText}>{label}</Text>}
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
            <Text style={styles.title}>Complete Your Profile</Text>
            <Text style={styles.subtitle}>Help us personalize your experience</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Sex</Text>
            <View style={styles.optionRow}>
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
              placeholder="Enter your height"
              placeholderTextColor="#A0A3BD"
              maxLength={3}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Training Experience</Text>
            <View style={styles.optionColumn}>
              <OptionButton 
                label="Beginner" 
                selected={experienceLevel === 'beginner'} 
                onPress={() => setExperienceLevel('beginner')} 
              />
              <OptionButton 
                label="Intermediate" 
                selected={experienceLevel === 'intermediate'} 
                onPress={() => setExperienceLevel('intermediate')} 
              />
              <OptionButton 
                label="Advanced" 
                selected={experienceLevel === 'advanced'} 
                onPress={() => setExperienceLevel('advanced')} 
              />
            </View>
          </View>

          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <LinearGradient
              colors={['#6C63FF', '#5449CC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
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
    padding: 24,
    paddingTop: 60,
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
    marginBottom: 28,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
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
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionColumn: {
    gap: 12,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#151932',
    alignItems: 'center',
    overflow: 'hidden',
  },
  optionButtonSelected: {
    borderColor: '#6C63FF',
  },
  optionButtonGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A0A3BD',
  },
  optionTextSelected: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  continueButton: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
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