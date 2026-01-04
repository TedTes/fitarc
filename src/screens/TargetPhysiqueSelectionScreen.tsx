import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getPhysiqueLevelsBySex } from '../data/physiqueLevels';

type TargetPhysiqueSelectionScreenProps = {
  sex: 'male' | 'female' | 'other';
  currentLevelId: number;
  onSelectTarget: (targetLevelId: number) => void;
  onCancel?: () => void;
};

export const TargetPhysiqueSelectionScreen: React.FC<TargetPhysiqueSelectionScreenProps> = ({
  sex,
  currentLevelId,
  onSelectTarget,
  onCancel,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<number | null>(null);

  const physiqueLevels = getPhysiqueLevelsBySex(sex);
  const selectableLevels = physiqueLevels.filter((level) => level.id !== currentLevelId);

  useEffect(() => {
    if (selectedTarget !== null) return;
    const nextLevel = selectableLevels.find((level) => level.id === currentLevelId + 1);
    setSelectedTarget(nextLevel?.id ?? selectableLevels[0]?.id ?? null);
  }, [currentLevelId, selectableLevels, selectedTarget]);

  const handleContinue = () => {
    if (!selectedTarget) return;
    setPendingTarget(selectedTarget);
    setConfirmVisible(true);
  };

  const handleCancel = () => {
    onCancel?.();
  };

  const handleDismissConfirm = () => {
    setConfirmVisible(false);
    setPendingTarget(null);
  };

  const handleConfirmStart = () => {
    if (!pendingTarget) return;
    setConfirmVisible(false);
    onSelectTarget(pendingTarget);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Please select your next goal</Text>
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
            {selectableLevels.map((level) => {
              const levelGap = level.id - currentLevelId;
              const estimatedWeeks = levelGap * 8;

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
                  <View style={styles.levelHeader}>
                    <View style={styles.levelBadgePill}>
                      <Text style={styles.levelBadgeText}>Level {level.id}</Text>
                    </View>
                    <LinearGradient
                      colors={['#6C63FF', '#5449CC']}
                      style={styles.durationBadgeGradient}
                    >
                      <Text style={styles.durationBadgeText}>~{estimatedWeeks} weeks</Text>
                    </LinearGradient>
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

          <View style={styles.actionRow}>
            {onCancel ? (
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                <Text style={styles.cancelButtonText}>Previous</Text>
              </TouchableOpacity>
            ) : null}

            {selectedTarget && (
              <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
                <LinearGradient
                  colors={['#00F5A0', '#00D9A3']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.continueButtonGradient}
                >
                  <Text style={styles.continueButtonText}>Start Plan</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </LinearGradient>

      <Modal
        transparent
        animationType="fade"
        visible={confirmVisible}
        onRequestClose={handleDismissConfirm}
      >
        <Pressable style={styles.confirmOverlay} onPress={handleDismissConfirm}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitle}>Start this plan?</Text>
            <Text style={styles.confirmBody}>
              Target: Level {pendingTarget ?? '-'}
            </Text>
            <Text style={styles.confirmBody}>
              Estimated duration: {((pendingTarget ?? currentLevelId) - currentLevelId) * 8} weeks
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} onPress={handleDismissConfirm}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmPrimary} onPress={handleConfirmStart}>
                <Text style={styles.confirmPrimaryText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    fontSize: 27,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    marginTop: 30
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
  levelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  levelBadgePill: {
    backgroundColor: '#0A0E27',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  durationBadgeGradient: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
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
    borderRadius: 12,
    overflow: 'hidden',
    flex: 1,
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#151932',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#A0A3BD',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8,10,22,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#151932',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    padding: 20,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  confirmBody: {
    fontSize: 14,
    color: '#A0A3BD',
    marginBottom: 4,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  confirmCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#101427',
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A0A3BD',
  },
  confirmPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#00F5A0',
    alignItems: 'center',
  },
  confirmPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0E27',
  },
});
