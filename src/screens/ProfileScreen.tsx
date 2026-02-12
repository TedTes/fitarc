import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  Image,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { User, TrainingSplit, EatingMode, ExperienceLevel } from '../types/domain';
import { getPhysiqueLevelsBySex } from '../data/physiqueLevels';
import { useSupabaseExercises } from '../hooks/useSupabaseExercises';
import { useExerciseDefaults } from '../hooks/useExerciseDefaults';
import { useScreenAnimation } from '../hooks/useScreenAnimation';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { uploadUserAvatar } from '../services/userProfileService';

type ProfileScreenProps = {
  user: User;
  onSave: (user: User) => void;
  onClose: () => void;
  onChangeCurrentLevel?: () => void;
  onChangeTargetLevel?: () => void;
  onLogout?: () => void;
  onDeleteAccount?: () => Promise<void> | void;
};

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  onSave,
  onClose: _onClose,
  onChangeCurrentLevel: _onChangeCurrentLevel,
  onChangeTargetLevel,
  onLogout,
  onDeleteAccount,
}) => {
  const { headerStyle, contentStyle } = useScreenAnimation();
  const [name, setName] = useState(user.name ?? '');
  const [sex, setSex] = useState<'male' | 'female' | 'other'>(user.sex);
  const [age, setAge] = useState(user.age.toString());
  const [heightCm, setHeightCm] = useState(user.heightCm.toString());
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(user.experienceLevel);
  const [trainingSplit, setTrainingSplit] = useState<TrainingSplit>(user.trainingSplit);
  const [eatingMode, setEatingMode] = useState<EatingMode>(user.eatingMode);
  const [currentPhysiqueLevel, setCurrentPhysiqueLevel] = useState<number>(
    user.currentPhysiqueLevel ?? 1
  );
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(user.avatarUrl);
  const [avatarPath, setAvatarPath] = useState<string | undefined>(user.avatarPath);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInitials = useMemo(
    () =>
      name
        .trim()
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'A',
    [name]
  );


  // ✨ NEW: Modal states for pickers
  const [showExperiencePicker, setShowExperiencePicker] = useState(false);
  const [showSplitPicker, setShowSplitPicker] = useState(false);
  const [showEatingPicker, setShowEatingPicker] = useState(false);
  const [showCurrentLevelPicker, setShowCurrentLevelPicker] = useState(false);

  const { exercises: exerciseCatalog, isLoading: exercisesLoading } = useSupabaseExercises();
  const {
    defaults: exerciseDefaults,
    isLoading: defaultsLoading,
    upsertDefault,
    removeDefault,
  } = useExerciseDefaults(user.id);

  const [defaultsExpanded, setDefaultsExpanded] = useState(false);
  const [defaultEdits, setDefaultEdits] = useState<Record<string, { weight: string; reps: string; sets: string; rest: string }>>({});
  const [expandedDefaults, setExpandedDefaults] = useState<Record<string, boolean>>({});
  const [defaultSearch, setDefaultSearch] = useState('');
  const [defaultModalVisible, setDefaultModalVisible] = useState(false);
  const [savingDefaultId, setSavingDefaultId] = useState<string | null>(null);
  const [removingDefaultId, setRemovingDefaultId] = useState<string | null>(null);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const appVersion =
    Constants.expoConfig?.version ??
    (Constants as any).manifest?.version ??
    '1.0.0';

  const handleSendFeedback = useCallback(async () => {
    const subject = encodeURIComponent('Fitarc Feedback');
    const body = encodeURIComponent(
      `App version: ${appVersion}\nPlatform: ${Platform.OS} ${Platform.Version}\nUser ID: ${user.id}\n\nFeedback:\n`
    );
    const mailtoUrl = `mailto:tedtfu@gmail.com?subject=${subject}&body=${body}`;
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (!canOpen) {
        Alert.alert('Unable to open mail app', 'Please email tedtfu@gmail.com.');
        return;
      }
      await Linking.openURL(mailtoUrl);
    } catch (error) {
      console.error('Failed to open mail client', error);
      Alert.alert('Unable to open mail app', 'Please email tedtfu@gmail.com.');
    }
  }, [appVersion, user.id]);

  const confirmDeleteAccount = useCallback(() => {
    if (!onDeleteAccount || isDeletingAccount) return;
    Alert.alert(
      'Delete account?',
      'This will permanently delete your account and data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingAccount(true);
            setDeleteError(null);
            try {
              await onDeleteAccount();
            } catch (err: any) {
              setDeleteError(err?.message || 'Unable to delete your account. Please try again.');
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ]
    );
  }, [isDeletingAccount, onDeleteAccount]);

  const handleDeleteRetry = useCallback(async () => {
    if (!onDeleteAccount) return;
    setIsDeletingAccount(true);
    setDeleteError(null);
    try {
      await onDeleteAccount();
      setDeleteError(null);
    } catch (err: any) {
      setDeleteError(err?.message || 'Unable to delete your account. Please try again.');
    } finally {
      setIsDeletingAccount(false);
    }
  }, [onDeleteAccount]);

  const persistProfile = useCallback(
    (options?: { showErrors?: boolean }) => {
      const ageNum = parseInt(age, 10);
      const heightNum = parseInt(heightCm, 10);

      if (!age || isNaN(ageNum) || ageNum < 13 || ageNum > 100) {
        if (options?.showErrors) {
          Alert.alert('Invalid Input', 'Please enter a valid age (13-100)');
        }
        return false;
      }

      if (!heightCm || isNaN(heightNum) || heightNum < 100 || heightNum > 250) {
        if (options?.showErrors) {
          Alert.alert('Invalid Input', 'Please enter a valid height (100-250 cm)');
        }
        return false;
      }

      const updatedUser: User = {
        ...user,
        name: name.trim(),
        sex,
        age: ageNum,
        heightCm: heightNum,
        experienceLevel,
        trainingSplit,
        eatingMode,
        currentPhysiqueLevel,
        avatarUrl,
        avatarPath,
      };

      onSave(updatedUser);
      return true;
    },
    [
      age,
      currentPhysiqueLevel,
      eatingMode,
      experienceLevel,
      heightCm,
      name,
      onSave,
      sex,
      trainingSplit,
      user,
    ]
  );

  const handlePickAvatar = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to photos to upload an avatar.');
        return;
      }
      const mediaTypes =
        (ImagePicker as any).MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        allowsEditing: true,
        quality: 0.8,
        aspect: [1, 1],
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setIsUploadingAvatar(true);
      const { path, signedUrl } = await uploadUserAvatar(user.id, asset.uri);
      setAvatarPath(path);
      setAvatarUrl(signedUrl);
      onSave({
        ...user,
        sex,
        age: parseInt(age, 10) || user.age,
        heightCm: parseInt(heightCm, 10) || user.heightCm,
        experienceLevel,
        trainingSplit,
        eatingMode,
        currentPhysiqueLevel,
        avatarUrl: signedUrl,
        avatarPath: path,
      });
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Unable to upload avatar.');
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [
    age,
    eatingMode,
    experienceLevel,
    heightCm,
    onSave,
    sex,
    trainingSplit,
    user,
  ]);

  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    autosaveTimeoutRef.current = setTimeout(() => {
      persistProfile({ showErrors: false });
    }, 800);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [
    sex,
    age,
    heightCm,
    experienceLevel,
    trainingSplit,
    eatingMode,
    currentPhysiqueLevel,
    persistProfile,
  ]);

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

  const physiqueLevels = useMemo(() => getPhysiqueLevelsBySex(sex), [sex]);
  const currentPhysiqueLabel =
    physiqueLevels.find((level) => level.id === currentPhysiqueLevel)?.name ??
    `Level ${currentPhysiqueLevel}`;

  useEffect(() => {
    const toDisplayString = (value?: number | null) =>
      value === null || value === undefined ? '0' : value.toString();
    const map: Record<string, { weight: string; reps: string; sets: string; rest: string }> = {};
    const expandedMap: Record<string, boolean> = {};
    exerciseDefaults.forEach((item) => {
      map[item.id] = {
        weight: toDisplayString(item.defaultWeight),
        reps: toDisplayString(item.defaultReps),
        sets: toDisplayString(item.defaultSets),
        rest: toDisplayString(item.defaultRestSeconds),
      };
      expandedMap[item.id] = expandedDefaults[item.id] ?? false;
    });
    setDefaultEdits(map);
    setExpandedDefaults(expandedMap);
  }, [exerciseDefaults]);

  const exerciseNameMap = useMemo(() => {
    const map = new Map<string, string>();
    exerciseCatalog.forEach((entry) => map.set(entry.id, entry.name));
    return map;
  }, [exerciseCatalog]);

  const filteredExerciseCatalog = useMemo(() => {
    const term = defaultSearch.trim().toLowerCase();
    if (!term) return exerciseCatalog;
    return exerciseCatalog.filter((exercise) =>
      exercise.name.toLowerCase().includes(term) ||
      exercise.primaryMuscles.some((muscle) => muscle.toLowerCase().includes(term))
    );
  }, [exerciseCatalog, defaultSearch]);

  const getExerciseDisplayName = (exerciseId?: string | null): string => {
    if (exerciseId && exerciseNameMap.has(exerciseId)) {
      return exerciseNameMap.get(exerciseId) as string;
    }
    return 'Custom Exercise';
  };

  const handleDefaultFieldChange = (
    id: string,
    field: 'weight' | 'reps' | 'sets' | 'rest',
    value: string
  ) => {
    setDefaultEdits((prev) => ({
      ...prev,
      [id]: {
        weight: prev[id]?.weight ?? '',
        reps: prev[id]?.reps ?? '',
        sets: prev[id]?.sets ?? '',
        rest: prev[id]?.rest ?? '',
        [field]: value,
      },
    }));
  };

  const parseNumberValue = (value: string, allowFloat = false): number | null => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const parsed = allowFloat ? parseFloat(trimmed) : parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleSaveExerciseDefault = async (defaultId: string) => {
    const edit = defaultEdits[defaultId];
    const record = exerciseDefaults.find((item) => item.id === defaultId);
    if (!edit || !record) return;
    try {
      setSavingDefaultId(defaultId);
      await upsertDefault({
        userId: user.id,
        id: record.id,
        exerciseId: record.exerciseId ?? null,
        userExerciseId: record.userExerciseId ?? null,
        defaultWeight: parseNumberValue(edit.weight, true),
        defaultReps: parseNumberValue(edit.reps),
        defaultSets: parseNumberValue(edit.sets),
        defaultRestSeconds: parseNumberValue(edit.rest),
      });
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Unable to save default');
    } finally {
      setSavingDefaultId(null);
    }
  };

  const handleRemoveExerciseDefault = (defaultId: string) => {
    Alert.alert('Remove Default?', 'This will remove your saved values for this exercise.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setRemovingDefaultId(defaultId);
            await removeDefault(defaultId);
          } catch (err: any) {
            Alert.alert('Remove Failed', err?.message || 'Unable to remove default');
          } finally {
            setRemovingDefaultId(null);
          }
        },
      },
    ]);
  };

  const handleAddExerciseDefault = async (exerciseId: string) => {
    try {
      setSavingDefaultId('new');
      await upsertDefault({
        userId: user.id,
        exerciseId,
        defaultSets: 4,
        defaultReps: 10,
      });
      setDefaultModalVisible(false);
      setDefaultsExpanded(true);
    } catch (err: any) {
      Alert.alert('Add Failed', err?.message || 'Unable to add default');
    } finally {
      setSavingDefaultId(null);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <Animated.ScrollView
          style={contentStyle}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View style={[styles.header, headerStyle]} />

          <View style={styles.avatarRow}>
            <TouchableOpacity
              style={styles.avatarButton}
              onPress={handlePickAvatar}
              disabled={isUploadingAvatar}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitials}>{avatarInitials}</Text>
              )}
            </TouchableOpacity>
            <View style={styles.avatarMeta}>
              <Text style={styles.avatarTitle}>Profile photo</Text>
              <Text style={styles.avatarHint}>
                {isUploadingAvatar ? 'Uploading…' : 'Tap to upload'}
              </Text>
            </View>
          </View>

          {/* ✨ PROFILE SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PROFILE</Text>

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>🪪</Text>
                <Text style={styles.settingLabel}>Name</Text>
              </View>
              <TextInput
                style={styles.settingInput}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="#A0A3BD"
                autoCapitalize="words"
                maxLength={40}
              />
            </View>
            
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

            {/* Exercise Defaults (collapsed within Training) */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => setDefaultsExpanded((prev) => !prev)}
            >
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>📓</Text>
                <View>
                  <Text style={styles.settingLabel}>Preferred Weights</Text>
                  <Text style={styles.settingSubtext}>Auto-fill workouts with your usual sets</Text>
                </View>
              </View>
              <Text style={styles.settingChevron}>{defaultsExpanded ? '⌄' : '›'}</Text>
            </TouchableOpacity>

            {defaultsExpanded && (
              <View style={styles.defaultsPanel}>
                {defaultsLoading ? (
                  <Text style={styles.defaultHint}>Loading defaults…</Text>
                ) : exerciseDefaults.length === 0 ? (
                  <View style={styles.defaultEmpty}>
                    <Text style={styles.defaultEmptyText}>No defaults saved yet.</Text>
                    <Text style={styles.defaultHint}>Add an exercise to prefill workouts.</Text>
                  </View>
                ) : (
                  <>
                    {exerciseDefaults.map((exerciseDefault) => {
                      const editValues = defaultEdits[exerciseDefault.id] || {
                        sets: '0',
                        reps: '0',
                        weight: '0',
                        rest: '0',
                      };
                      const exerciseName = getExerciseDisplayName(exerciseDefault.exerciseId);
                      const isSaving = savingDefaultId === exerciseDefault.id;
                      const isRemoving = removingDefaultId === exerciseDefault.id;
                      const expanded = expandedDefaults[exerciseDefault.id] ?? false;
                      const summary = `${editValues.sets}x${editValues.reps} @ ${editValues.weight}kg`;
                      return (
                        <View key={exerciseDefault.id} style={styles.defaultRow}>
                          <TouchableOpacity
                            style={styles.defaultRowHeader}
                            onPress={() =>
                              setExpandedDefaults((prev) => ({
                                ...prev,
                                [exerciseDefault.id]: !expanded,
                              }))
                            }
                          >
                            <View style={styles.defaultRowName}>
                              <Text style={styles.defaultRowTitle}>{exerciseName}</Text>
                              <Text style={styles.defaultSummaryText}>{summary}</Text>
                            </View>
                            <Text style={styles.settingChevron}>{expanded ? '⌄' : '›'}</Text>
                          </TouchableOpacity>
                          {expanded && (
                            <View style={styles.defaultDetails}>
                              <View style={styles.defaultFieldRow}>
                                <View style={styles.defaultInputGroupInline}>
                                  <Text style={styles.defaultInputLabel}>Sets</Text>
                                  <TextInput
                                    style={styles.defaultInput}
                                    keyboardType="number-pad"
                                    value={editValues.sets}
                                    onChangeText={(text) => handleDefaultFieldChange(exerciseDefault.id, 'sets', text)}
                                  />
                                </View>
                                <View style={styles.defaultInputGroupInline}>
                                  <Text style={styles.defaultInputLabel}>Reps</Text>
                                  <TextInput
                                    style={styles.defaultInput}
                                    keyboardType="number-pad"
                                    value={editValues.reps}
                                    onChangeText={(text) => handleDefaultFieldChange(exerciseDefault.id, 'reps', text)}
                                  />
                                </View>
                              </View>
                              <View style={styles.defaultFieldRow}>
                                <View style={styles.defaultInputGroupInline}>
                                  <Text style={styles.defaultInputLabel}>Weight</Text>
                                  <TextInput
                                    style={styles.defaultInput}
                                    keyboardType="decimal-pad"
                                    value={editValues.weight}
                                    onChangeText={(text) => handleDefaultFieldChange(exerciseDefault.id, 'weight', text)}
                                  />
                                </View>
                                <View style={styles.defaultInputGroupInline}>
                                  <Text style={styles.defaultInputLabel}>Rest</Text>
                                  <TextInput
                                    style={styles.defaultInput}
                                    keyboardType="number-pad"
                                    value={editValues.rest}
                                    onChangeText={(text) => handleDefaultFieldChange(exerciseDefault.id, 'rest', text)}
                                  />
                                </View>
                              </View>
                              <View style={styles.defaultActions}>
                                <TouchableOpacity
                                  style={[styles.defaultIconButton, isSaving && styles.defaultActionButtonDisabled]}
                                  onPress={() => handleSaveExerciseDefault(exerciseDefault.id)}
                                  disabled={isSaving}
                                >
                                  <Text style={styles.defaultIconText}>{isSaving ? '…' : '✓'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.defaultIconButtonDanger, isRemoving && styles.defaultActionButtonDisabled]}
                                  onPress={() => handleRemoveExerciseDefault(exerciseDefault.id)}
                                  disabled={isRemoving}
                                >
                                  <Text style={styles.defaultIconText}>✕</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </>
                )}
                <TouchableOpacity
                  style={styles.addDefaultButton}
                  onPress={() => setDefaultModalVisible(true)}
                  disabled={exercisesLoading}
                >
                  <Text style={styles.addDefaultText}>+ Add Exercise Default</Text>
                </TouchableOpacity>
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

          {/* ✨ ARC MANAGEMENT SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ARC MANAGEMENT</Text>

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => setShowCurrentLevelPicker((prev) => !prev)}
            >
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Current Physique Level</Text>
                  <Text style={styles.settingValueInline}>{currentPhysiqueLabel}</Text>
                </View>
              </View>
              <Text style={styles.settingChevron}>{showCurrentLevelPicker ? '▾' : '›'}</Text>
            </TouchableOpacity>

            {showCurrentLevelPicker && (
              <View style={styles.pickerContainer}>
                {physiqueLevels.map((level) => (
                  <TouchableOpacity
                    key={level.id}
                    style={styles.pickerOption}
                    onPress={() => {
                      setCurrentPhysiqueLevel(level.id);
                      setShowCurrentLevelPicker(false);
                    }}
                  >
                    <View style={styles.pickerOptionTextWrap}>
                      <Text
                        style={[
                          styles.pickerOptionText,
                          currentPhysiqueLevel === level.id && styles.pickerOptionTextActive,
                        ]}
                      >
                        Level {level.id}: {level.name}
                      </Text>
                      <Text style={styles.pickerOptionSubtext}>{level.description}</Text>
                    </View>
                    {currentPhysiqueLevel === level.id && (
                      <Text style={styles.pickerCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {onChangeTargetLevel && (
              <TouchableOpacity 
                style={styles.settingRow}
                onPress={onChangeTargetLevel}
              >
                <View style={styles.settingLeft}>
                  <Text style={styles.settingIcon}>🎯</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Start New Plan</Text>
                    <Text style={styles.settingSubtext}>Set a new target and begin fresh</Text>
                  </View>
                </View>
                <Text style={styles.settingChevron}>›</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ✨ ACCOUNT SECTION */}
          {onLogout && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ACCOUNT</Text>
              <TouchableOpacity style={styles.settingRow} onPress={onLogout}>
                <View style={styles.settingLeft}>
                  <Text style={styles.settingIcon}>🚪</Text>
                  <Text style={styles.settingLabel}>Log Out</Text>
                </View>
                <Text style={styles.settingChevron}>›</Text>
              </TouchableOpacity>
              {onDeleteAccount && (
                <TouchableOpacity
                  style={[styles.settingRow, styles.deleteRow]}
                  onPress={confirmDeleteAccount}
                  disabled={isDeletingAccount}
                >
                  <View style={styles.settingLeft}>
                    <Text style={styles.settingIcon}>🗑️</Text>
                    <Text style={[styles.settingLabel, styles.deleteLabel]}>
                      Delete Account
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

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

            <TouchableOpacity style={styles.settingRow} onPress={() => setTermsModalVisible(true)}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>📖</Text>
                <Text style={styles.settingLabel}>Terms & Privacy</Text>
              </View>
              <Text style={styles.settingChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingRow} onPress={handleSendFeedback}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingIcon}>💬</Text>
                <Text style={styles.settingLabel}>Send Feedback</Text>
              </View>
              <Text style={styles.settingChevron}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Spacing for bottom */}
          <View style={{ height: 40 }} />
        </Animated.ScrollView>

        <Modal
          animationType="fade"
          transparent
          visible={defaultModalVisible}
          onRequestClose={() => setDefaultModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={() => setDefaultModalVisible(false)} />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Add Exercise Default</Text>
                <TouchableOpacity onPress={() => setDefaultModalVisible(false)}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search exercises..."
                placeholderTextColor="#6B6F7B"
                value={defaultSearch}
                onChangeText={setDefaultSearch}
              />
              <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                {exercisesLoading ? (
                  <Text style={styles.defaultHint}>Loading exercises…</Text>
                ) : filteredExerciseCatalog.length === 0 ? (
                  <Text style={styles.defaultHint}>No exercises match your search.</Text>
                ) : (
                  filteredExerciseCatalog.map((exercise) => {
                    const alreadyAdded = exerciseDefaults.some(
                      (item) => item.exerciseId === exercise.id
                    );
                    return (
                      <TouchableOpacity
                        key={exercise.id}
                        style={[styles.modalListItem, alreadyAdded && styles.modalListItemDisabled]}
                        onPress={() => !alreadyAdded && handleAddExerciseDefault(exercise.id)}
                        disabled={alreadyAdded}
                      >
                        <View>
                          <Text style={styles.modalListItemTitle}>{exercise.name}</Text>
                          <Text style={styles.modalListItemSubtitle}>
                            {exercise.primaryMuscles.join(', ') || 'Full body'}
                          </Text>
                        </View>
                        <Text style={styles.modalListItemAction}>
                          {alreadyAdded ? 'Saved' : 'Add'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          animationType="fade"
          transparent
          visible={isDeletingAccount || !!deleteError}
          onRequestClose={() => setDeleteError(null)}
        >
          <View style={styles.deleteOverlay}>
            <View style={styles.deleteCard}>
              {isDeletingAccount ? (
                <>
                  <ActivityIndicator size="large" color="#6C63FF" />
                  <Text style={styles.deleteTitle}>Deleting your account…</Text>
                  <Text style={styles.deleteBody}>This may take a few seconds.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.deleteTitle}>Delete failed</Text>
                  <Text style={styles.deleteBody}>
                    {deleteError || 'Unable to delete your account. Please try again.'}
                  </Text>
                  <View style={styles.deleteActions}>
                    <TouchableOpacity
                      style={styles.deleteSecondary}
                      onPress={() => setDeleteError(null)}
                    >
                      <Text style={styles.deleteSecondaryText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deletePrimary}
                      onPress={handleDeleteRetry}
                    >
                      <Text style={styles.deletePrimaryText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        <Modal
          animationType="fade"
          transparent
          visible={termsModalVisible}
          onRequestClose={() => setTermsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={() => setTermsModalVisible(false)} />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Terms & Privacy</Text>
                <TouchableOpacity onPress={() => setTermsModalVisible(false)}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.termsBody} showsVerticalScrollIndicator={false}>
                <Text style={styles.termsHeading}>Terms of Service</Text>
                <Text style={styles.termsText}>
                  By using Fitarc, you agree to use the app responsibly and understand that
                  training guidance is for informational purposes only. Use movements
                  that match your experience level, stop if something feels wrong, and
                  adjust volume or intensity as needed.
                </Text>
                <Text style={styles.termsHeading}>Privacy Policy</Text>
                <Text style={styles.termsText}>
                  We collect account details and workout/meal activity to personalize your
                  plan. Your data is stored securely and used only to provide core features
                  of the app. We do not sell personal data.
                </Text>
                <Text style={styles.termsHeading}>Contact</Text>
                <Text style={styles.termsText}>
                  For questions or data requests, contact support at tedtfu@gmail.com.
                </Text>
              </ScrollView>
            </View>
          </View>
        </Modal>
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
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  avatarButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarMeta: {
    flex: 1,
  },
  avatarTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  avatarHint: {
    fontSize: 13,
    color: '#A3A7B7',
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
  deleteRow: {
    borderBottomColor: 'rgba(255, 107, 107, 0.3)',
  },
  deleteLabel: {
    color: '#FF6B6B',
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

  // Exercise defaults
  defaultsPanel: {
    marginHorizontal: 20,
    paddingVertical: 4,
    gap: 6,
  },
  defaultHint: {
    color: '#A0A3BD',
    fontSize: 13,
    textAlign: 'center',
  },
  defaultEmpty: {
    alignItems: 'center',
    gap: 6,
  },
  defaultEmptyText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  defaultRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2340',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#151932',
    marginBottom: 6,
    gap: 10,
  },
  defaultRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  defaultRowName: {
    flex: 1,
    paddingRight: 12,
  },
  defaultRowTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  defaultSummaryText: {
    color: '#A0A3BD',
    fontSize: 12,
    marginTop: 4,
  },
  defaultDetails: {
    marginTop: 12,
    gap: 12,
  },
  defaultFieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  defaultInputGroupInline: {
    flex: 1,
    gap: 6,
  },
  defaultInputLabel: {
    color: '#A0A3BD',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  defaultInput: {
    backgroundColor: '#1E2340',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    paddingVertical: 8,
    paddingHorizontal: 10,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  defaultActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  defaultActionButtonDisabled: {
    opacity: 0.5,
  },
  defaultIconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2B2E46',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3B3F5C',
  },
  defaultIconButtonDanger: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
  },
  defaultIconText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  addDefaultButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#151932',
  },
  addDefaultText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    backgroundColor: '#0F1224',
    paddingHorizontal: 20,
    marginBottom: 30,
    height: '60%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2A2F4F',
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20
  },
  modalSearchInput: {
    backgroundColor: '#151932',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E2340',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  modalList: {
    maxHeight: '70%',
  },
  termsBody: {
    maxHeight: '70%',
  },
  termsHeading: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
  },
  termsText: {
    color: '#A0A3BD',
    fontSize: 13,
    lineHeight: 20,
  },
  modalListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2340',
  },
  modalListItemDisabled: {
    opacity: 0.5,
  },
  modalListItemTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 14, 39, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#151932',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2F4F',
  },
  deleteTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  deleteBody: {
    marginTop: 6,
    fontSize: 13,
    color: '#A0A3BD',
    textAlign: 'center',
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    width: '100%',
    justifyContent: 'flex-end',
  },
  deleteSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2F4F',
    backgroundColor: '#1E2340',
  },
  deleteSecondaryText: {
    color: '#A0A3BD',
    fontWeight: '700',
    fontSize: 13,
  },
  deletePrimary: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6C63FF',
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
  },
  deletePrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  modalListItemSubtitle: {
    color: '#A0A3BD',
    fontSize: 12,
  },
  modalListItemAction: {
    color: '#6C63FF',
    fontWeight: '700',
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
  pickerOptionTextWrap: {
    flex: 1,
    gap: 4,
  },
  pickerOptionSubtext: {
    fontSize: 12,
    color: '#7A7F98',
    lineHeight: 16,
  },
  pickerOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  settingValueInline: {
    marginTop: 4,
    fontSize: 13,
    color: '#8B93B0',
  },
  pickerCheck: {
    fontSize: 16,
    color: '#00F5A0',
    fontWeight: 'bold',
  },

});
