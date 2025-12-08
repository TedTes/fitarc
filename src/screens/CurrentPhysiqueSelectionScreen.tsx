import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getPhysiqueLevelsBySex } from '../data/physiqueLevels';

type CurrentPhysiqueSelectionScreenProps = {
  sex: 'male' | 'female' | 'other';
  onSelectLevel: (levelId: number) => void;
};

export const CurrentPhysiqueSelectionScreen: React.FC<CurrentPhysiqueSelectionScreenProps> = ({
  sex,
  onSelectLevel,
}) => {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

  const physiqueLevels = getPhysiqueLevelsBySex(sex);

  const handleContinue = () => {
    if (selectedLevel) {
      onSelectLevel(selectedLevel);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Where are you now?</Text>
            <Text style={styles.subtitle}>
              Select the physique level that best matches your current state
            </Text>
          </View>

          <View style={styles.levelGrid}>
            {physiqueLevels.map((level) => (
              <TouchableOpacity
                key={level.id}
                style={[
                  styles.levelCard,
                  selectedLevel === level.id && styles.levelCardSelected,
                ]}
                onPress={() => setSelectedLevel(level.id)}
                activeOpacity={0.8}
              >
                <View style={styles.levelHeader}>
                  <Text style={styles.levelNumber}>Level {level.id}</Text>
                  {selectedLevel === level.id && (
                    <View style={styles.checkmark}>
                      <Text style={styles.checkmarkText}>✓</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.levelName}>{level.name}</Text>
                <Text style={styles.levelDescription}>{level.description}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity 
            style={[styles.continueButton, !selectedLevel && styles.continueButtonDisabled]} 
            onPress={handleContinue}
            disabled={!selectedLevel}
          >
            <LinearGradient
              colors={selectedLevel ? ['#6C63FF', '#5449CC'] : ['#2A2F4F', '#1E2340']}
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
    lineHeight: 24,
  },
  levelGrid: {
    gap: 16,
    marginBottom: 24,
  },
  levelCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#2A2F4F',
  },
  levelCardSelected: {
    borderColor: '#6C63FF',
    backgroundColor: '#1E2340',
  },
  levelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  levelNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6C63FF',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6C63FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  levelName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  levelDescription: {
    fontSize: 14,
    color: '#A0A3BD',
    lineHeight: 20,
  },
  continueButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  continueButtonDisabled: {
    opacity: 0.5,
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