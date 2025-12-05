import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { User } from '../types/domain';

type OnboardingScreenProps = {
  onComplete: (user: User) => void;
};

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const [sex, setSex] = useState<'male' | 'female' | 'other'>('male');
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');

  const handleSubmit = () => {
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

    const user: User = {
      id: `user_${Date.now()}`,
      sex,
      age: ageNum,
      heightCm: heightNum,
      experienceLevel,
      createdAt: new Date().toISOString(),
    };

    onComplete(user);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Welcome to fitarc</Text>
      <Text style={styles.description}>Let's set up your profile</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Sex</Text>
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.optionButton, sex === 'male' && styles.optionButtonActive]}
            onPress={() => setSex('male')}
          >
            <Text style={[styles.optionText, sex === 'male' && styles.optionTextActive]}>Male</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, sex === 'female' && styles.optionButtonActive]}
            onPress={() => setSex('female')}
          >
            <Text style={[styles.optionText, sex === 'female' && styles.optionTextActive]}>Female</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, sex === 'other' && styles.optionButtonActive]}
            onPress={() => setSex('other')}
          >
            <Text style={[styles.optionText, sex === 'other' && styles.optionTextActive]}>Other</Text>
          </TouchableOpacity>
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
          maxLength={3}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Training Experience</Text>
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.optionButton, experienceLevel === 'beginner' && styles.optionButtonActive]}
            onPress={() => setExperienceLevel('beginner')}
          >
            <Text style={[styles.optionText, experienceLevel === 'beginner' && styles.optionTextActive]}>
              Beginner
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, experienceLevel === 'intermediate' && styles.optionButtonActive]}
            onPress={() => setExperienceLevel('intermediate')}
          >
            <Text style={[styles.optionText, experienceLevel === 'intermediate' && styles.optionTextActive]}>
              Intermediate
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, experienceLevel === 'advanced' && styles.optionButtonActive]}
            onPress={() => setExperienceLevel('advanced')}
          >
            <Text style={[styles.optionText, experienceLevel === 'advanced' && styles.optionTextActive]}>
              Advanced
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
        <Text style={styles.submitButtonText}>Continue</Text>
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
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    alignItems: 'center',
  },
  optionButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  optionTextActive: {
    color: '#fff',
  },
  submitButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});