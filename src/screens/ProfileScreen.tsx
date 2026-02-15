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

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  bg: '#0A0E27',
  surface: '#151932',
  surface2: '#1A1F3A',
  primary: '#6C63FF',
  accent: '#00F5A0',
  text: '#FFFFFF',
  textSec: '#8B93B0',
  textMuted: '#5A6178',
  border: '#2A2F4F',
  danger: '#FF6B6B',
  rowBorder: 'rgba(255,255,255,0.06)',
};

// ─── Types ────────────────────────────────────────────────────────────────────
type ActivePicker = 'experience' | 'split' | 'eating' | 'physique' | null;

type ProfileScreenProps = {
  user: User;
  onSave: (user: User) => void;
  onClose: () => void;
  onChangeCurrentLevel?: () => void;
  onChangeTargetLevel?: () => void;
  onLogout?: () => void;
  onDeleteAccount?: () => Promise<void> | void;
};

// ─── PickerModal ──────────────────────────────────────────────────────────────
type PickerOption = {
  value: string;
  label: string;
  sublabel?: string;
};

type PickerModalProps = {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selected: string | number;
  onSelect: (value: string) => void;
  onClose: () => void;
};

const PickerModal: React.FC<PickerModalProps> = ({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}) => (
  <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
    <View style={pm.overlay}>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={pm.sheet}>
        <View style={pm.handle} />
        <View style={pm.headerRow}>
          <Text style={pm.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={pm.closeX}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {options.map((opt, idx) => {
            const isActive = String(selected) === String(opt.value);
            const isLast = idx === options.length - 1;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[pm.option, !isLast && pm.optionBorder]}
                onPress={() => { onSelect(opt.value); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={pm.optionLeft}>
                  <Text style={[pm.optionLabel, isActive && pm.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  {opt.sublabel ? (
                    <Text style={pm.optionSub}>{opt.sublabel}</Text>
                  ) : null}
                </View>
                {isActive && <Text style={pm.check}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  </Modal>
);

const pm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginTop: 12,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
  },
  closeX: {
    fontSize: 16,
    color: C.textSec,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  optionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.rowBorder,
  },
  optionLeft: { flex: 1 },
  optionLabel: {
    fontSize: 16,
    color: C.textSec,
    fontWeight: '500',
  },
  optionLabelActive: {
    color: C.text,
    fontWeight: '700',
  },
  optionSub: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 3,
    lineHeight: 17,
  },
  check: {
    fontSize: 18,
    color: C.accent,
    fontWeight: '700',
    marginLeft: 12,
  },
});

// ─── Row helpers ──────────────────────────────────────────────────────────────
type CardRowProps = {
  icon: string;
  label: string;
  isLast?: boolean;
  children: React.ReactNode;
  onPress?: () => void;
};

const CardRow: React.FC<CardRowProps> = ({ icon, label, isLast, children, onPress }) => {
  const inner = (
    <View style={[cr.row, !isLast && cr.rowBorder]}>
      <View style={cr.left}>
        <View style={cr.iconBox}>
          <Text style={cr.iconText}>{icon}</Text>
        </View>
        <Text style={cr.label}>{label}</Text>
      </View>
      <View style={cr.right}>{children}</View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
};

const cr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.rowBorder,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText: { fontSize: 18 },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    flex: 1,
    flexWrap: 'wrap',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    maxWidth: '55%',
  },
});

// ─── SectionCard ──────────────────────────────────────────────────────────────
const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View style={sc.wrap}>
    <Text style={sc.title}>{title}</Text>
    <View style={sc.card}>{children}</View>
  </View>
);

const sc = StyleSheet.create({
  wrap: { marginBottom: 28, paddingHorizontal: 16 },
  title: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
});

// ─── Main component ───────────────────────────────────────────────────────────
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

  // ── profile state ──
  const [name, setName] = useState(user.name ?? '');
  const [sex, setSex] = useState<'male' | 'female' | 'other'>(user.sex);
  const [age, setAge] = useState(user.age.toString());
  const [heightCm, setHeightCm] = useState(user.heightCm.toString());
  const [weightKg, setWeightKg] = useState(user.weightKg?.toString() ?? '');
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

  // ── shared picker state (replaces 4 separate booleans) ──
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);

  // ── autosave indicator ──
  const [saved, setSaved] = useState(false);
  const savedOpacity = useRef(new Animated.Value(0)).current;

  const showSavedBadge = useCallback(() => {
    setSaved(true);
    savedOpacity.setValue(1);
    Animated.sequence([
      Animated.delay(1200),
      Animated.timing(savedOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setSaved(false));
  }, [savedOpacity]);

  // ── exercise defaults ──
  const { exercises: exerciseCatalog, isLoading: exercisesLoading } = useSupabaseExercises();
  const {
    defaults: exerciseDefaults,
    isLoading: defaultsLoading,
    upsertDefault,
    removeDefault,
  } = useExerciseDefaults(user.id);

  const [defaultsPanelVisible, setDefaultsPanelVisible] = useState(false);
  const [defaultEdits, setDefaultEdits] = useState<
    Record<string, { weight: string; reps: string; sets: string; rest: string }>
  >({});
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

  // ── handlers (all original, no signature changes) ──
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
        weightKg: parseFloat(weightKg) || undefined,
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
      weightKg,
      name,
      onSave,
      sex,
      trainingSplit,
      user,
      avatarUrl,
      avatarPath,
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
        weightKg: parseFloat(weightKg) || undefined,
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
    weightKg,
    onSave,
    sex,
    trainingSplit,
    user,
    currentPhysiqueLevel,
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
      const ok = persistProfile({ showErrors: false });
      if (ok) showSavedBadge();
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
    weightKg,
    experienceLevel,
    trainingSplit,
    eatingMode,
    currentPhysiqueLevel,
    persistProfile,
    showSavedBadge,
  ]);

  // ── format helpers ──
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

  const formatExperience = (exp: ExperienceLevel): string =>
    exp.charAt(0).toUpperCase() + exp.slice(1);

  const physiqueLevels = useMemo(() => getPhysiqueLevelsBySex(sex), [sex]);
  const currentPhysiqueLabel =
    physiqueLevels.find((level) => level.id === currentPhysiqueLevel)?.name ??
    `Level ${currentPhysiqueLevel}`;

  // ── exercise defaults effects & helpers ──
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
    return exerciseCatalog.filter(
      (exercise) =>
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
    } catch (err: any) {
      Alert.alert('Add Failed', err?.message || 'Unable to add default');
    } finally {
      setSavingDefaultId(null);
    }
  };

  // ── picker option datasets ──
  const experienceOptions: PickerOption[] = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' },
  ];

  const splitOptions: PickerOption[] = [
    { value: 'full_body', label: 'Full Body' },
    { value: 'upper_lower', label: 'Upper / Lower' },
    { value: 'push_pull_legs', label: 'Push / Pull / Legs' },
    { value: 'bro_split', label: 'Bro Split' },
    { value: 'custom', label: 'Custom' },
  ];

  const eatingOptions: PickerOption[] = [
    { value: 'mild_deficit', label: 'Mild Deficit' },
    { value: 'recomp', label: 'Recomp' },
    { value: 'lean_bulk', label: 'Lean Bulk' },
    { value: 'maintenance', label: 'Maintenance' },
  ];

  const physiqueOptions: PickerOption[] = physiqueLevels.map((level) => ({
    value: String(level.id),
    label: `Level ${level.id}: ${level.name}`,
    sublabel: level.description,
  }));

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
        {/* Autosave badge */}
        {saved && (
          <Animated.View style={[styles.savedBadge, { opacity: savedOpacity }]}>
            <Text style={styles.savedBadgeText}>Saved</Text>
          </Animated.View>
        )}

        <Animated.ScrollView
          style={contentStyle}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header spacer */}
          <Animated.View style={[styles.headerSpacer, headerStyle]} />

          {/* ── Profile Hero ──────────────────────────────────────────────── */}
          <View style={styles.hero}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={handlePickAvatar}
              disabled={isUploadingAvatar}
              activeOpacity={0.8}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitials}>{avatarInitials}</Text>
              )}
              {/* Camera overlay */}
              <View style={styles.avatarCameraOverlay}>
                {isUploadingAvatar ? (
                  <ActivityIndicator size="small" color={C.text} />
                ) : (
                  <Text style={styles.avatarCameraIcon}>📷</Text>
                )}
              </View>
            </TouchableOpacity>

            <Text style={styles.heroName}>{name.trim() || 'Your Name'}</Text>

            <View style={styles.heroBadges}>
              <View style={styles.badgeAccent}>
                <Text style={styles.badgeAccentText}>{formatEatingMode(eatingMode)}</Text>
              </View>
              <View style={styles.badgePrimary}>
                <Text style={styles.badgePrimaryText}>{currentPhysiqueLabel}</Text>
              </View>
            </View>
          </View>

          {/* ── Quick Stats Strip ─────────────────────────────────────────── */}
          <View style={styles.statsStrip}>
            <View style={styles.statChip}>
              <Text style={styles.statLabel}>Age</Text>
              <Text style={styles.statValue}>{age || '—'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statChip}>
              <Text style={styles.statLabel}>Height</Text>
              <Text style={styles.statValue}>{heightCm ? `${heightCm} cm` : '—'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statChip}>
              <Text style={styles.statLabel}>Experience</Text>
              <Text style={styles.statValue}>{formatExperience(experienceLevel)}</Text>
            </View>
          </View>

          {/* ── PROFILE ───────────────────────────────────────────────────── */}
          <SectionCard title="Profile">
            {/* Name */}
            <CardRow icon="🪪" label="Name">
              <TextInput
                style={styles.inlineInput}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={C.textMuted}
                autoCapitalize="words"
                maxLength={40}
                textAlign="right"
              />
            </CardRow>

            {/* Sex — full-text 3-button segmented control */}
            <CardRow icon="👤" label="Sex">
              <View style={styles.segmented}>
                {(['male', 'female', 'other'] as const).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.segBtn, sex === option && styles.segBtnActive]}
                    onPress={() => setSex(option)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.segBtnText, sex === option && styles.segBtnTextActive]}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </CardRow>

            {/* Age */}
            <CardRow icon="🎂" label="Age">
              <TextInput
                style={styles.inlineInput}
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={C.textMuted}
                maxLength={3}
                textAlign="right"
              />
            </CardRow>

            {/* Height */}
            <CardRow icon="📏" label="Height">
              <TextInput
                style={styles.inlineInput}
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={C.textMuted}
                maxLength={3}
                textAlign="right"
              />
              <Text style={styles.unitLabel}>cm</Text>
            </CardRow>

            {/* Weight */}
            <CardRow icon="⚖️" label="Weight" isLast>
              <TextInput
                style={styles.inlineInput}
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={C.textMuted}
                maxLength={6}
                textAlign="right"
              />
              <Text style={styles.unitLabel}>kg</Text>
            </CardRow>
          </SectionCard>

          {/* ── TRAINING ──────────────────────────────────────────────────── */}
          <SectionCard title="Training">
            {/* Experience Level */}
            <CardRow
              icon="💪"
              label="Experience"
              onPress={() => setActivePicker('experience')}
            >
              <Text style={styles.valueText}>{formatExperience(experienceLevel)}</Text>
              <Text style={styles.chevron}>›</Text>
            </CardRow>

            {/* Training Split */}
            <CardRow
              icon="🏋️"
              label="Training Split"
              onPress={() => setActivePicker('split')}
            >
              <Text style={styles.valueText}>{formatTrainingSplit(trainingSplit)}</Text>
              <Text style={styles.chevron}>›</Text>
            </CardRow>

            {/* Exercise Defaults */}
            <CardRow
              icon="📓"
              label="Preferred Weights"
              isLast
              onPress={() => setDefaultsPanelVisible(true)}
            >
              <Text style={styles.valueText}>{exerciseDefaults.length} saved</Text>
              <Text style={styles.chevron}>›</Text>
            </CardRow>
          </SectionCard>

          {/* ── NUTRITION ─────────────────────────────────────────────────── */}
          <SectionCard title="Nutrition">
            <CardRow
              icon="🍽️"
              label="Eating Mode"
              isLast
              onPress={() => setActivePicker('eating')}
            >
              <Text style={styles.valueText}>{formatEatingMode(eatingMode)}</Text>
              <Text style={styles.chevron}>›</Text>
            </CardRow>
          </SectionCard>

          {/* ── ARC MANAGEMENT ────────────────────────────────────────────── */}
          <SectionCard title="Arc Management">
            <CardRow
              icon="📍"
              label="Current Physique Level"
              isLast={!onChangeTargetLevel}
              onPress={() => setActivePicker('physique')}
            >
              <Text style={styles.valueText}>{currentPhysiqueLabel}</Text>
              <Text style={styles.chevron}>›</Text>
            </CardRow>

            {onChangeTargetLevel && (
              <CardRow
                icon="🎯"
                label="Start New Plan"
                isLast
                onPress={onChangeTargetLevel}
              >
                <Text style={styles.valueTextSub}>Set a new target</Text>
                <Text style={styles.chevron}>›</Text>
              </CardRow>
            )}
          </SectionCard>

          {/* ── ACCOUNT ───────────────────────────────────────────────────── */}
          {onLogout && (
            <SectionCard title="Account">
              <Pressable
                style={({ pressed }) => [
                  styles.accountRow,
                  pressed && styles.accountRowPressed,
                ]}
                onPress={onLogout}
              >
                <View style={cr.left}>
                  <View style={cr.iconBox}>
                    <Text style={cr.iconText}>🚪</Text>
                  </View>
                  <Text style={cr.label}>Log Out</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>

              {onDeleteAccount && (
                <TouchableOpacity
                  style={styles.deleteAccountRow}
                  onPress={confirmDeleteAccount}
                  disabled={isDeletingAccount}
                  activeOpacity={0.7}
                >
                  <View style={cr.left}>
                    <View style={[cr.iconBox, styles.dangerIconBox]}>
                      <Text style={cr.iconText}>🗑️</Text>
                    </View>
                    <Text style={[cr.label, styles.dangerText]}>Delete Account</Text>
                  </View>
                  {isDeletingAccount && <ActivityIndicator size="small" color={C.danger} />}
                </TouchableOpacity>
              )}
            </SectionCard>
          )}

          {/* ── ABOUT ─────────────────────────────────────────────────────── */}
          <SectionCard title="About">
            <CardRow icon="ℹ️" label="App Version">
              <Text style={styles.valueText}>{appVersion}</Text>
            </CardRow>
            <CardRow
              icon="📖"
              label="Terms & Privacy"
              onPress={() => setTermsModalVisible(true)}
            >
              <Text style={styles.chevron}>›</Text>
            </CardRow>
            <CardRow icon="💬" label="Send Feedback" isLast onPress={handleSendFeedback}>
              <Text style={styles.chevron}>›</Text>
            </CardRow>
          </SectionCard>

          <View style={{ height: 80 }} />
        </Animated.ScrollView>

        {/* ── Shared PickerModals ──────────────────────────────────────────── */}
        <PickerModal
          visible={activePicker === 'experience'}
          title="Experience Level"
          options={experienceOptions}
          selected={experienceLevel}
          onSelect={(v) => setExperienceLevel(v as ExperienceLevel)}
          onClose={() => setActivePicker(null)}
        />
        <PickerModal
          visible={activePicker === 'split'}
          title="Training Split"
          options={splitOptions}
          selected={trainingSplit}
          onSelect={(v) => setTrainingSplit(v as TrainingSplit)}
          onClose={() => setActivePicker(null)}
        />
        <PickerModal
          visible={activePicker === 'eating'}
          title="Eating Mode"
          options={eatingOptions}
          selected={eatingMode}
          onSelect={(v) => setEatingMode(v as EatingMode)}
          onClose={() => setActivePicker(null)}
        />
        <PickerModal
          visible={activePicker === 'physique'}
          title="Current Physique Level"
          options={physiqueOptions}
          selected={String(currentPhysiqueLevel)}
          onSelect={(v) => setCurrentPhysiqueLevel(parseInt(v, 10))}
          onClose={() => setActivePicker(null)}
        />

        {/* ── Preferred Weights panel ──────────────────────────────────────── */}
        <Modal
          animationType="slide"
          transparent
          visible={defaultsPanelVisible}
          onRequestClose={() => setDefaultsPanelVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => setDefaultsPanelVisible(false)}
            />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Preferred Weights</Text>
                <TouchableOpacity
                  onPress={() => setDefaultsPanelVisible(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalCloseX}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                {defaultsLoading ? (
                  <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />
                ) : exerciseDefaults.length === 0 ? (
                  <View style={styles.defaultEmpty}>
                    <Text style={styles.defaultEmptyTitle}>No defaults yet</Text>
                    <Text style={styles.hintText}>
                      Add exercises to prefill your workouts automatically.
                    </Text>
                  </View>
                ) : (
                  exerciseDefaults.map((exerciseDefault) => {
                    const editValues = defaultEdits[exerciseDefault.id] || {
                      sets: '0', reps: '0', weight: '0', rest: '0',
                    };
                    const exerciseName = getExerciseDisplayName(exerciseDefault.exerciseId);
                    const isSaving = savingDefaultId === exerciseDefault.id;
                    const isRemoving = removingDefaultId === exerciseDefault.id;
                    const expanded = expandedDefaults[exerciseDefault.id] ?? false;
                    return (
                      <View key={exerciseDefault.id} style={styles.defaultCard}>
                        <TouchableOpacity
                          style={styles.defaultCardHeader}
                          onPress={() =>
                            setExpandedDefaults((prev) => ({
                              ...prev,
                              [exerciseDefault.id]: !expanded,
                            }))
                          }
                          activeOpacity={0.7}
                        >
                          <Text style={styles.defaultCardTitle}>{exerciseName}</Text>
                          <View style={styles.defaultCardRight}>
                            <Text style={styles.defaultCardSummary}>
                              {editValues.sets}×{editValues.reps} · {editValues.weight}kg
                            </Text>
                            <Text style={styles.chevron}>{expanded ? '⌄' : '›'}</Text>
                          </View>
                        </TouchableOpacity>

                        {expanded && (
                          <View style={styles.defaultCardBody}>
                            <View style={styles.defaultGrid}>
                              <View style={styles.defaultGridRow}>
                                <View style={styles.defaultGridItem}>
                                  <Text style={styles.defaultGridLabel}>Sets</Text>
                                  <TextInput
                                    style={styles.defaultGridInput}
                                    keyboardType="number-pad"
                                    value={editValues.sets}
                                    onChangeText={(t) =>
                                      handleDefaultFieldChange(exerciseDefault.id, 'sets', t)
                                    }
                                  />
                                </View>
                                <View style={styles.defaultGridItem}>
                                  <Text style={styles.defaultGridLabel}>Reps</Text>
                                  <TextInput
                                    style={styles.defaultGridInput}
                                    keyboardType="number-pad"
                                    value={editValues.reps}
                                    onChangeText={(t) =>
                                      handleDefaultFieldChange(exerciseDefault.id, 'reps', t)
                                    }
                                  />
                                </View>
                              </View>
                              <View style={styles.defaultGridRow}>
                                <View style={styles.defaultGridItem}>
                                  <Text style={styles.defaultGridLabel}>Weight (kg)</Text>
                                  <TextInput
                                    style={styles.defaultGridInput}
                                    keyboardType="decimal-pad"
                                    value={editValues.weight}
                                    onChangeText={(t) =>
                                      handleDefaultFieldChange(exerciseDefault.id, 'weight', t)
                                    }
                                  />
                                </View>
                                <View style={styles.defaultGridItem}>
                                  <Text style={styles.defaultGridLabel}>Rest (sec)</Text>
                                  <TextInput
                                    style={styles.defaultGridInput}
                                    keyboardType="number-pad"
                                    value={editValues.rest}
                                    onChangeText={(t) =>
                                      handleDefaultFieldChange(exerciseDefault.id, 'rest', t)
                                    }
                                  />
                                </View>
                              </View>
                            </View>
                            <View style={styles.defaultCardActions}>
                              <TouchableOpacity
                                style={[styles.defaultSaveBtn, isSaving && styles.defaultBtnDisabled]}
                                onPress={() => handleSaveExerciseDefault(exerciseDefault.id)}
                                disabled={isSaving}
                              >
                                <Text style={styles.defaultSaveBtnText}>
                                  {isSaving ? 'Saving…' : 'Save'}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.defaultRemoveBtn, isRemoving && styles.defaultBtnDisabled]}
                                onPress={() => handleRemoveExerciseDefault(exerciseDefault.id)}
                                disabled={isRemoving}
                              >
                                <Text style={styles.defaultRemoveBtnText}>Remove</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
                <TouchableOpacity
                  style={styles.addDefaultBtn}
                  onPress={() => setDefaultModalVisible(true)}
                  disabled={exercisesLoading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addDefaultBtnText}>+ Add Exercise</Text>
                </TouchableOpacity>
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ── Exercise Defaults modal ──────────────────────────────────────── */}
        <Modal
          animationType="slide"
          transparent
          visible={defaultModalVisible}
          onRequestClose={() => setDefaultModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => setDefaultModalVisible(false)}
            />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Add Exercise Default</Text>
                <TouchableOpacity
                  onPress={() => setDefaultModalVisible(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalCloseX}>✕</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.modalSearch}
                placeholder="Search exercises…"
                placeholderTextColor={C.textMuted}
                value={defaultSearch}
                onChangeText={setDefaultSearch}
              />
              <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                {exercisesLoading ? (
                  <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />
                ) : filteredExerciseCatalog.length === 0 ? (
                  <Text style={styles.hintText}>No exercises match your search.</Text>
                ) : (
                  filteredExerciseCatalog.map((exercise, idx) => {
                    const alreadyAdded = exerciseDefaults.some(
                      (item) => item.exerciseId === exercise.id
                    );
                    const isLast = idx === filteredExerciseCatalog.length - 1;
                    return (
                      <TouchableOpacity
                        key={exercise.id}
                        style={[styles.modalItem, !isLast && styles.modalItemBorder, alreadyAdded && styles.modalItemDim]}
                        onPress={() => !alreadyAdded && handleAddExerciseDefault(exercise.id)}
                        disabled={alreadyAdded}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modalItemTitle}>{exercise.name}</Text>
                          <Text style={styles.modalItemSub}>
                            {exercise.primaryMuscles.join(', ') || 'Full body'}
                          </Text>
                        </View>
                        <Text style={[styles.modalItemAction, alreadyAdded && styles.modalItemActionDim]}>
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

        {/* ── Delete Account overlay ───────────────────────────────────────── */}
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
                  <ActivityIndicator size="large" color={C.primary} />
                  <Text style={styles.deleteCardTitle}>Deleting your account…</Text>
                  <Text style={styles.deleteCardBody}>This may take a few seconds.</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.deleteCardTitle, { color: C.danger }]}>Delete failed</Text>
                  <Text style={styles.deleteCardBody}>
                    {deleteError || 'Unable to delete your account. Please try again.'}
                  </Text>
                  <View style={styles.deleteCardActions}>
                    <TouchableOpacity
                      style={styles.deleteCardCancelBtn}
                      onPress={() => setDeleteError(null)}
                    >
                      <Text style={styles.deleteCardCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteCardRetryBtn} onPress={handleDeleteRetry}>
                      <Text style={styles.deleteCardRetryText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* ── Terms modal ─────────────────────────────────────────────────── */}
        <Modal
          animationType="slide"
          transparent
          visible={termsModalVisible}
          onRequestClose={() => setTermsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => setTermsModalVisible(false)}
            />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Terms & Privacy</Text>
                <TouchableOpacity
                  onPress={() => setTermsModalVisible(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalCloseX}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                <Text style={styles.termsHeading}>Terms of Service</Text>
                <Text style={styles.termsText}>
                  By using Fitarc, you agree to use the app responsibly and understand that training
                  guidance is for informational purposes only. Use movements that match your
                  experience level, stop if something feels wrong, and adjust volume or intensity as
                  needed.
                </Text>
                <Text style={styles.termsHeading}>Privacy Policy</Text>
                <Text style={styles.termsText}>
                  We collect account details and workout/meal activity to personalize your plan.
                  Your data is stored securely and used only to provide core features of the app.
                  We do not sell personal data.
                </Text>
                <Text style={styles.termsHeading}>Contact</Text>
                <Text style={styles.termsText}>
                  For questions or data requests, contact support at tedtfu@gmail.com.
                </Text>
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>
      </LinearGradient>
    </View>
  );
};

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  gradient: { flex: 1 },

  scrollContent: {
    flexGrow: 1,
    paddingTop: 16,
  },

  headerSpacer: {
    height: 8,
  },

  // Autosave badge
  savedBadge: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 99,
    backgroundColor: C.accent,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  savedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderWidth: 2,
    borderColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 14,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '800',
    color: C.text,
  },
  avatarCameraOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCameraIcon: { fontSize: 13 },
  heroName: {
    fontSize: 24,
    fontWeight: '800',
    color: C.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  heroBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  badgeAccent: {
    backgroundColor: 'rgba(0, 245, 160, 0.12)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 160, 0.3)',
  },
  badgeAccentText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.accent,
  },
  badgePrimary: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
  },
  badgePrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.primary,
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
  },
  statLabel: {
    fontSize: 11,
    color: C.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  statDivider: {
    width: 1,
    backgroundColor: C.border,
    marginVertical: 12,
  },

  // Inline inputs
  inlineInput: {
    fontSize: 15,
    color: C.text,
    fontWeight: '600',
    minWidth: 60,
    paddingVertical: 4,
    paddingHorizontal: 2,
    flexShrink: 1,
  },
  unitLabel: {
    fontSize: 13,
    color: C.textMuted,
    fontWeight: '500',
  },

  // Segmented control (Sex)
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 2,
    gap: 2,
  },
  segBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  segBtnActive: {
    backgroundColor: C.primary,
  },
  segBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSec,
  },
  segBtnTextActive: {
    color: C.text,
  },

  // Value / chevron
  valueText: {
    fontSize: 14,
    color: C.textSec,
    fontWeight: '500',
  },
  valueTextSub: {
    fontSize: 13,
    color: C.textMuted,
  },
  chevron: {
    fontSize: 20,
    color: C.textMuted,
    fontWeight: '300',
    lineHeight: 22,
  },

  // Exercise defaults (Preferred Weights modal)
  hintText: {
    color: C.textSec,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  defaultEmpty: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 24,
  },
  defaultEmptyTitle: {
    color: C.text,
    fontWeight: '700',
    fontSize: 15,
  },
  defaultCard: {
    backgroundColor: C.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  defaultCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  defaultCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    flex: 1,
  },
  defaultCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  defaultCardSummary: {
    fontSize: 13,
    color: C.textSec,
    fontWeight: '500',
  },
  defaultCardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: C.rowBorder,
    gap: 12,
  },
  defaultGrid: {
    gap: 8,
    paddingTop: 12,
  },
  defaultGridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  defaultGridItem: {
    flex: 1,
    gap: 4,
  },
  defaultGridLabel: {
    fontSize: 11,
    color: C.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  defaultGridInput: {
    backgroundColor: C.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: C.text,
    fontWeight: '700',
    fontSize: 15,
  },
  defaultCardActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  defaultBtnDisabled: { opacity: 0.5 },
  defaultSaveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(108, 99, 255, 0.2)',
    borderWidth: 1,
    borderColor: C.primary,
  },
  defaultSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
  },
  defaultRemoveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.4)',
  },
  defaultRemoveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.danger,
  },
  addDefaultBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginTop: 4,
  },
  addDefaultBtnText: {
    color: C.primary,
    fontWeight: '700',
    fontSize: 14,
  },

  // Account rows
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.rowBorder,
    minHeight: 56,
  },
  accountRowPressed: {
    backgroundColor: 'rgba(255, 107, 107, 0.06)',
  },
  deleteAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  dangerIconBox: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
  },
  dangerText: {
    color: C.danger,
  },

  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginTop: 12,
    marginBottom: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
  },
  modalCloseX: {
    fontSize: 16,
    color: C.textSec,
  },
  modalSearch: {
    backgroundColor: C.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: C.text,
    fontSize: 15,
    marginBottom: 8,
  },
  modalList: {
    flex: 1,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  modalItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.rowBorder,
  },
  modalItemDim: { opacity: 0.45 },
  modalItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  modalItemSub: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
  },
  modalItemAction: {
    fontSize: 14,
    fontWeight: '700',
    color: C.primary,
    marginLeft: 12,
  },
  modalItemActionDim: {
    color: C.textMuted,
  },

  // Delete Account overlay
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 14, 39, 0.80)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  deleteCardTitle: {
    marginTop: 16,
    fontSize: 17,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
  },
  deleteCardBody: {
    marginTop: 8,
    fontSize: 13,
    color: C.textSec,
    textAlign: 'center',
    lineHeight: 19,
  },
  deleteCardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  deleteCardCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
    alignItems: 'center',
  },
  deleteCardCancelText: {
    color: C.textSec,
    fontWeight: '700',
    fontSize: 14,
  },
  deleteCardRetryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.5)',
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    alignItems: 'center',
  },
  deleteCardRetryText: {
    color: C.danger,
    fontWeight: '700',
    fontSize: 14,
  },

  // Terms
  termsHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
    marginTop: 16,
    marginBottom: 6,
  },
  termsText: {
    fontSize: 13,
    color: C.textSec,
    lineHeight: 20,
  },
});
