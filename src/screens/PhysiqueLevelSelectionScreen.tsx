import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

type PhysiqueLevel = {
  id: number;
  name: string;
  description: string;
  imageUrl: string; // For now placeholder, later replace with actual images
};

const PHYSIQUE_LEVELS: PhysiqueLevel[] = [
  {
    id: 1,
    name: 'Beginner',
    description: 'New to training, building foundation',
    imageUrl: 'https://via.placeholder.com/300x400/1E2340/6C63FF?text=Beginner',
  },
  {
    id: 2,
    name: 'Intermediate',
    description: 'Some muscle definition, consistent training',
    imageUrl: 'https://via.placeholder.com/300x400/1E2340/6C63FF?text=Intermediate',
  },
  {
    id: 3,
    name: 'Athletic',
    description: 'Visible muscle, lean physique',
    imageUrl: 'https://via.placeholder.com/300x400/1E2340/6C63FF?text=Athletic',
  },
  {
    id: 4,
    name: 'Advanced',
    description: 'Well-developed muscle, low body fat',
    imageUrl: 'https://via.placeholder.com/300x400/1E2340/6C63FF?text=Advanced',
  },
];

type PhysiqueLevelSelectionScreenProps = {
  sex: 'male' | 'female' | 'other';
  onSelect: (levelId: number) => void;
};

export const PhysiqueLevelSelectionScreen: React.FC<PhysiqueLevelSelectionScreenProps> = ({
  sex,
  onSelect,
}) => {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

  const handleSelect = (levelId: number) => {
    setSelectedLevel(levelId);
  };

  const handleContinue = () => {
    if (selectedLevel) {
      onSelect(selectedLevel);
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
            <Text style={styles.title}>Select Your Current Physique</Text>
            <Text style={styles.subtitle}>
              Choose the level that best matches where you are now
            </Text>
          </View>

          <View style={styles.levelGrid}>
            {PHYSIQUE_LEVELS.map((level) => (
              <TouchableOpacity
                key={level.id}
                style={[
                  styles.levelCard,
                  selectedLevel === level.id && styles.levelCardSelected,
                ]}
                onPress={() => handleSelect(level.id)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: level.imageUrl }} style={styles.levelImage} />
                <View style={styles.levelInfo}>
                  <Text style={styles.levelName}>{level.name}</Text>
                  <Text style={styles.levelDescription}>{level.description}</Text>
                </View>
                {selectedLevel === level.id && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {selectedLevel && (
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
    lineHeight: 24,
  },
  levelGrid: {
    gap: 16,
    marginBottom: 24,
  },
  levelCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2A2F4F',
    overflow: 'hidden',
    position: 'relative',
  },
  levelCardSelected: {
    borderColor: '#6C63FF',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  levelImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#1E2340',
  },
  levelInfo: {
    padding: 16,
  },
  levelName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  levelDescription: {
    fontSize: 14,
    color: '#A0A3BD',
    lineHeight: 20,
  },
  selectedBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00F5A0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedBadgeText: {
    color: '#0A0E27',
    fontSize: 18,
    fontWeight: 'bold',
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