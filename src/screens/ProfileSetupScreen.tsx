import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type ProfileSetupScreenProps = {
  onComplete: (data: {
    name: string;
    sex: 'male' | 'female' | 'other';
    age: number;
    heightCm: number;
    experienceLevel: 'beginner' | 'intermediate' | 'advanced';
    trainingSplit: 'full_body' | 'upper_lower' | 'push_pull_legs' | 'bro_split' | 'custom';
    eatingMode: 'mild_deficit' | 'recomp' | 'lean_bulk' | 'maintenance';
  }) => void;
};

const EXPERIENCE_OPTIONS = [
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
] as const;

const TRAINING_SPLIT_OPTIONS = [
  { label: 'Full Body', value: 'full_body' },
  { label: 'Upper/Lower', value: 'upper_lower' },
  { label: 'Push/Pull/Legs', value: 'push_pull_legs' },
  { label: 'Bro Split', value: 'bro_split' },
  { label: 'Custom', value: 'custom' },
] as const;

const EATING_MODE_OPTIONS = [
  { label: 'Mild Deficit', value: 'mild_deficit' },
  { label: 'Burn fat + Gain muscle', value: 'recomp' },
  { label: 'Lean Bulk', value: 'lean_bulk' },
  { label: 'Maintenance', value: 'maintenance' },
] as const;

const AGE_MIN = 15;
const AGE_MAX = 100;
const DEFAULT_AGE = 25;
const HEIGHT_MIN = 157;
const HEIGHT_MAX = 173;
const DEFAULT_HEIGHT = 160;
export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({ onComplete }) => {
  const [name, setName] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | 'other'>('male');
  const [age, setAge] = useState(DEFAULT_AGE);
  const [heightCm, setHeightCm] = useState(DEFAULT_HEIGHT);
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [trainingSplit, setTrainingSplit] = useState<'full_body' | 'upper_lower' | 'push_pull_legs' | 'bro_split' | 'custom'>('full_body');
  const [eatingMode, setEatingMode] = useState<'mild_deficit' | 'recomp' | 'lean_bulk' | 'maintenance'>('maintenance');

  const handleContinue = () => {
    const trimmedName = name.trim();
    const ageNum = age;
    const heightNum = heightCm;

    if (!trimmedName) {
      Alert.alert('Missing Name', 'Please enter your name.');
      return;
    }

    if (Number.isNaN(ageNum) || ageNum < AGE_MIN || ageNum > AGE_MAX) {
      Alert.alert('Invalid Input', `Please enter a valid age (${AGE_MIN}-${AGE_MAX})`);
      return;
    }

    if (Number.isNaN(heightNum) || heightNum < HEIGHT_MIN || heightNum > HEIGHT_MAX) {
      Alert.alert('Invalid Input', `Please enter a valid height (${HEIGHT_MIN}-${HEIGHT_MAX} cm)`);
      return;
    }

    onComplete({
      name: trimmedName,
      sex,
      age: ageNum,
      heightCm: heightNum,
      experienceLevel,
      trainingSplit,
      eatingMode,
    });
  };

  const ChipButton = ({
    label,
    selected,
    onPress,
    style,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
    style?: StyleProp<ViewStyle>;
  }) => (
    <TouchableOpacity
      style={[styles.chipButton, style, selected && styles.chipButtonSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.chipContent, selected && styles.chipContentSelected]}>
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );

  const CheckboxOption = ({
    label,
    selected,
    onPress,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.checkboxRow} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.checkboxOuter, selected && styles.checkboxOuterSelected]}>
        {selected && <View style={styles.checkboxInner} />}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );

  const [activePicker, setActivePicker] = useState<'age' | 'height' | null>(null);
  const ageOptions = Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => AGE_MIN + i);
  const heightOptions = Array.from({ length: HEIGHT_MAX - HEIGHT_MIN + 1 }, (_, i) => HEIGHT_MIN + i);
  const activeOptions = activePicker === 'age' ? ageOptions : heightOptions;
  const activeValue = activePicker === 'age' ? age : heightCm;
  const activeLabel = activePicker === 'age' ? 'Select age' : 'Select height';

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

          <View style={styles.formSection}>
            <View style={styles.inlineRow}>
              <View style={styles.labelRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>1</Text>
                </View>
                <Text style={styles.rowLabel}>Name</Text>
              </View>
              <View style={[styles.rightColumn, styles.inlineInputBox]}>
                <TextInput
                  style={styles.inlineInputText}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  placeholderTextColor="#A0A3BD"
                  autoCapitalize="words"
                  maxLength={40}
                />
              </View>
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inlineRow}>
              <View style={styles.labelRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>2</Text>
                </View>
                <Text style={styles.rowLabel}>Sex</Text>
              </View>
              <View style={[styles.rightColumn, styles.chipGroup]}>
                <ChipButton label="M" selected={sex === 'male'} onPress={() => setSex('male')} />
                <ChipButton label="F" selected={sex === 'female'} onPress={() => setSex('female')} />
                <ChipButton label="Other" selected={sex === 'other'} onPress={() => setSex('other')} />
              </View>
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inlineRow}>
              <View style={styles.labelRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>3</Text>
                </View>
                <Text style={styles.rowLabel}>Age</Text>
              </View>
              <TouchableOpacity
                style={[styles.rightColumn, styles.selectField]}
                onPress={() => setActivePicker('age')}
                activeOpacity={0.8}
              >
                <Text style={styles.selectText}>{age}</Text>
                <Text style={styles.selectChevron}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inlineRow}>
              <View style={styles.labelRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>4</Text>
                </View>
                <Text style={styles.rowLabel}>Height (cm)</Text>
              </View>
              <TouchableOpacity
                style={[styles.rightColumn, styles.selectField]}
                onPress={() => setActivePicker('height')}
                activeOpacity={0.8}
              >
                <Text style={styles.selectText}>{heightCm}</Text>
                <Text style={styles.selectChevron}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inlineRowTop}>
              <View style={styles.labelRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>5</Text>
                </View>
                <View>
                  <Text style={styles.rowLabel}>Training Experience</Text>
                </View>
              </View>
              <View style={[styles.rightColumn, styles.checkboxList]}>
                {EXPERIENCE_OPTIONS.map((option) => (
                  <CheckboxOption
                    key={option.value}
                    label={option.label}
                    selected={experienceLevel === option.value}
                    onPress={() => setExperienceLevel(option.value)}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inlineRowTop}>
              <View style={styles.labelRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>6</Text>
                </View>
                <View>
                  <Text style={styles.rowLabel}>Training Split</Text>
                </View>
              </View>
              <View style={[styles.rightColumn, styles.checkboxList]}>
                {TRAINING_SPLIT_OPTIONS.map((option) => (
                  <CheckboxOption
                    key={option.value}
                    label={option.label}
                    selected={trainingSplit === option.value}
                    onPress={() => setTrainingSplit(option.value)}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inlineRowTop}>
              <View style={styles.labelRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>7</Text>
                </View>
                <View>
                  <Text style={styles.rowLabel}>Eating Mode</Text>
                </View>
              </View>
              <View style={[styles.rightColumn, styles.checkboxList]}>
                {EATING_MODE_OPTIONS.map((option) => (
                  <CheckboxOption
                    key={option.value}
                    label={option.label}
                    selected={eatingMode === option.value}
                    onPress={() => setEatingMode(option.value)}
                  />
                ))}
              </View>
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

      <Modal
        transparent
        visible={activePicker !== null}
        animationType="fade"
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setActivePicker(null)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{activeLabel}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {activeOptions.map((option) => {
                const isSelected = option === activeValue;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.modalOption, isSelected && styles.modalOptionSelected]}
                    onPress={() => {
                      if (activePicker === 'age') {
                        setAge(option);
                      } else {
                        setHeightCm(option);
                      }
                      setActivePicker(null);
                    }}
                  >
                    <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextSelected]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
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
    padding: 20,
    paddingTop: 56,
    paddingBottom: 56,
  },
  header: {
    marginBottom: 24,
    marginTop: 40,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A3BD',
  },
  formSection: {
    marginBottom: 20,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: '#6C63FF',
    fontSize: 12,
    fontWeight: '700',
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  inlineInputBox: {
    backgroundColor: 'rgba(21, 25, 50, 0.9)',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inlineInputText: {
    fontSize: 15,
    color: '#FFFFFF',
  },
  chipGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  chipButton: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#151932',
  },
  chipButtonSelected: {
    borderColor: '#6C63FF',
  },
  chipContent: {
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipContentSelected: {
    backgroundColor: 'rgba(108, 99, 255, 0.25)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A0A3BD',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  checkboxList: {
    flexDirection: 'column',
    gap: 10,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  checkboxOuter: {
    width: 17,
    height: 17,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#394064',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOuterSelected: {
    borderColor: '#6C63FF',
  },
  checkboxInner: {
    width: 9,
    height: 9,
    borderRadius: 4,
    backgroundColor: '#6C63FF',
  },
  rightColumn: {
    width: 200,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(21, 25, 50, 0.9)',
    borderWidth: 1,
    borderColor: '#2A2F4F',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  selectText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  selectChevron: {
    fontSize: 14,
    color: '#A0A3BD',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 10, 28, 0.75)',
  },
  modalSheet: {
    width: '84%',
    maxHeight: '70%',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#151932',
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  modalOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  modalOptionSelected: {
    backgroundColor: 'rgba(108, 99, 255, 0.18)',
  },
  modalOptionText: {
    fontSize: 14,
    color: '#A0A3BD',
    fontWeight: '600',
  },
  modalOptionTextSelected: {
    color: '#FFFFFF',
  },
  continueButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 12,
  },
  continueButtonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: 'bold',
  },
});
