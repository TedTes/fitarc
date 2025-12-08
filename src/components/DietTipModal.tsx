import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { EatingMode } from '../types/domain';
import { dietTips } from '../data/dietTips';

type DietTipModalProps = {
  visible: boolean;
  onClose: () => void;
  eatingMode: EatingMode;
};

export const DietTipModal: React.FC<DietTipModalProps> = ({
  visible,
  onClose,
  eatingMode,
}) => {
  const tip = dietTips[eatingMode];

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
            <Text style={styles.title}>Suggested Diet Approach</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>{tip.label}</Text>

          <View style={styles.modeDescription}>
            <Text style={styles.modeDescriptionText}>
              Fitarc Diet Mode: {tip.description}
            </Text>
          </View>

          <Text style={styles.rulesTitle}>Simple Daily Guidelines:</Text>
          <View style={styles.rulesList}>
            {tip.rules.map((rule, index) => (
              <View key={index} style={styles.ruleItem}>
                <Text style={styles.ruleCheck}>✓</Text>
                <Text style={styles.ruleText}>{rule}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <LinearGradient
              colors={['#6C63FF', '#5449CC']}
              style={styles.doneButtonGradient}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            No calorie counting or macro tracking required. Just simple guidance.
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
    fontSize: 18,
    color: '#00F5A0',
    marginBottom: 16,
    fontWeight: '600',
  },
  modeDescription: {
    backgroundColor: '#1E2340',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: '#00F5A0',
  },
  modeDescriptionText: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  rulesTitle: {
    fontSize: 15,
    color: '#A0A3BD',
    marginBottom: 12,
    fontWeight: '600',
  },
  rulesList: {
    gap: 14,
    marginBottom: 24,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ruleCheck: {
    fontSize: 18,
    color: '#00F5A0',
    marginRight: 12,
    marginTop: -2,
  },
  ruleText: {
    fontSize: 15,
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 22,
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