import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getPhysiqueLevelsBySex } from '../data/physiqueLevels';

type TargetPhysiqueSelectionScreenProps = {
  sex: 'male' | 'female' | 'other';
  currentLevelId: number;
  onSelectTarget: (targetLevelId: number) => void;
};

export const TargetPhysiqueSelectionScreen: React.FC<TargetPhysiqueSelectionScreenProps> = ({
  sex,
  currentLevelId,
  onSelectTarget,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);

  const physiqueLevels = getPhysiqueLevelsBySex(sex);
  const availableTargets = physiqueLevels.filter(level => level.id > currentLevelId);

  const handleContinue = () => {
    if (selectedTarget) {
      onSelectTarget(selectedTarget);
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
            <Text style={styles.title}>Where do you want to be?</Text>
            <Text style={styles.subtitle}>
              Choose your target physique for this phase
            </Text>
          </View>

          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>
              📍 You're currently at Level {currentLevelId}
            </Text>
          </View>

          <View style={styles.levelGrid}>
            {availableTargets.map((level) => {
              const levelGap = level.id - currentLevelId;
              const estimatedWeeks = levelGap * 8; // 8 weeks per level

              return (
                <TouchableOpacity
                  key={level.id}
                  style={[
                    styles.levelCard,
                    selectedTarget === level.id && styles.levelCardSelected,
                  ]}
                  onPress={() => setSelectedTarget(level.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.levelImageContainer}>
                    <Image source={{ uri: level.imageUrl }} style={styles.levelImage} />
                    <View style={styles.levelBadge}>
                      <Text style={styles.levelBadgeText}>Level {level.id}</Text>
                    </View>
                    <View style={styles.durationBadge}>
                      <LinearGradient
                        colors={['#6C63FF', '#5449CC']}
                        style={styles.durationBadgeGradient}
                      >
                        <Text style={styles.durationBadgeText}>~{estimatedWeeks} weeks</Text>
                      </LinearGradient>
                    </View>
                  </View>
                  <View style={styles.levelInfo}>
                    <Text style={styles.levelName}>{level.name}</Text>
                    <Text style={styles.levelDescription}>{level.description}</Text>
                    <Text style={styles.bodyFat}>~{level.bodyFatRange} body fat</Text>
                    <View style={styles.characteristics}>
                      {level.characteristics.map((char, idx) => (
                        <View key={idx} style={styles.characteristicRow}>
                          <View style={styles.characteristicDot} />
                          <Text style={styles.characteristicText}>{char}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  {selectedTarget === level.id && (
                    <View style={styles.selectedBadge}>
                      <Text style={styles.selectedBadgeText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedTarget && (
            <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
              <LinearGradient
                colors={['#00F5A0', '#00D9A3']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.continueButtonGradient}
              >
                <Text style={styles.continueButtonText}>Start Phase</Text>
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
    marginBottom: 24,
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
  currentBadge: {
    backgroundColor: '#151932',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  currentBadgeText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
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
    borderColor: '#00F5A0',
    shadowColor: '#00F5A0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  levelImageContainer: {
    position: 'relative',
  },
  levelImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#1E2340',
  },
  levelBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#0A0E27',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  durationBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  durationBadgeGradient: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  durationBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
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
    marginBottom: 8,
  },
  bodyFat: {
    fontSize: 12,
    color: '#6C63FF',
    fontWeight: '600',
    marginBottom: 12,
  },
  characteristics: {
    gap: 6,
  },
  characteristicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  characteristicDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#00F5A0',
  },
  characteristicText: {
    fontSize: 13,
    color: '#A0A3BD',
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
    color: '#0A0E27',
    fontSize: 18,
    fontWeight: 'bold',
  },
});