import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { User, TrainingSplit, ExperienceLevel, EquipmentLevel, PrimaryGoal } from '../types/domain';
import { getPhysiqueLevelsBySex } from '../data/physiqueLevels';
import { useSupabaseExercises } from '../hooks/useSupabaseExercises';
import { useExerciseDefaults } from '../hooks/useExerciseDefaults';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:        '#0A0E27',
  surface:   '#151932',
  surface2:  '#1A1F3A',
  primary:   '#6C63FF',
  text:      '#FFFFFF',
  textSec:   '#8B93B0',
  textMuted: '#5A6178',
  border:    '#2A2F4F',
  danger:    '#FF6B6B',
  accent:    '#00F5A0',
  rowBorder: 'rgba(255,255,255,0.06)',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
type ActivePicker = 'experience' | 'split' | 'equipment' | 'physique' | 'goal' | 'days' | null;

type PickerOption = { value: string; label: string; sublabel?: string };

export type SettingsScreenProps = {
  user: User;
  onSave: (user: User) => void;
  onStartNewPlan?: () => void;
};

const inferDaysPerWeekFromSplit = (split: TrainingSplit): 3 | 4 | 5 | 6 => {
  switch (split) {
    case 'full_body':
      return 3;
    case 'upper_lower':
      return 4;
    case 'push_pull_legs':
      return 6;
    case 'bro_split':
      return 5;
    case 'custom':
    default:
      return 4;
  }
};

// ─── PickerModal ──────────────────────────────────────────────────────────────
const PickerModal: React.FC<{
  visible: boolean;
  title: string;
  options: PickerOption[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}> = ({ visible, title, options, selected, onSelect, onClose }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={pm.overlay} onPress={onClose}>
      <Pressable style={pm.sheet} onPress={() => {}}>
        <View style={pm.handle} />
        <View style={pm.headerRow}>
          <Text style={pm.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={pm.closeX}>✕</Text>
          </TouchableOpacity>
        </View>
        {options.map((opt) => {
          const isActive = opt.value === selected;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[pm.option, isActive && pm.optionActive]}
              onPress={() => { onSelect(opt.value); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={[pm.optionLabel, isActive && pm.optionLabelActive]}>{opt.label}</Text>
              {opt.sublabel && <Text style={pm.optionSub}>{opt.sublabel}</Text>}
              {isActive && <Text style={pm.check}>✓</Text>}
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 24 }} />
      </Pressable>
    </Pressable>
  </Modal>
);

const pm = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:            { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8 },
  handle:           { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 16 },
  headerRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title:            { fontSize: 16, fontWeight: '700', color: C.text },
  closeX:           { fontSize: 14, color: C.textMuted, fontWeight: '600' },
  option:           { paddingVertical: 14, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.rowBorder },
  optionActive:     { backgroundColor: 'rgba(108,99,255,0.08)', borderRadius: 8 },
  optionLabel:      { flex: 1, fontSize: 15, color: C.textSec },
  optionLabelActive:{ color: C.primary, fontWeight: '700' },
  optionSub:        { fontSize: 12, color: C.textMuted, marginRight: 8 },
  check:            { fontSize: 14, color: C.primary, fontWeight: '900' },
});

// ─── CardRow ──────────────────────────────────────────────────────────────────
const CardRow: React.FC<{
  icon: string;
  label: string;
  isLast?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}> = ({ icon, label, isLast, onPress, children }) => {
  const inner = (
    <View style={[cr.row, !isLast && cr.rowBorder]}>
      <View style={cr.left}>
        <View style={cr.iconBox}><Text style={cr.iconText}>{icon}</Text></View>
        <Text style={cr.label}>{label}</Text>
      </View>
      <View style={cr.right}>{children}</View>
    </View>
  );
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  }
  return inner;
};

const cr = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder:{ borderBottomWidth: 1, borderBottomColor: C.rowBorder },
  left:     { flexDirection: 'row', alignItems: 'center', flex: 1 },
  right:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBox:  { width: 28, height: 28, borderRadius: 7, backgroundColor: 'rgba(108,99,255,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconText: { fontSize: 14 },
  label:    { fontSize: 14, color: C.text, fontWeight: '500' },
});

// ─── SectionCard ──────────────────────────────────────────────────────────────
const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={sc.wrap}>
    <Text style={sc.title}>{title}</Text>
    <View style={sc.card}>{children}</View>
  </View>
);

const sc = StyleSheet.create({
  wrap:  { marginHorizontal: 16, marginBottom: 20 },
  title: { fontSize: 11, fontWeight: '700', color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4 },
  card:  { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
});

// ─── Main component ───────────────────────────────────────────────────────────
export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  user,
  onSave,
  onStartNewPlan,
}) => {
  // ── local state ──
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(user.experienceLevel);
  const [trainingSplit,   setTrainingSplit]   = useState<TrainingSplit>(user.trainingSplit);
  const [equipmentLevel,  setEquipmentLevel]  = useState<EquipmentLevel>(
    user.planPreferences?.equipmentLevel ?? 'full_gym'
  );
  const [primaryGoal,     setPrimaryGoal]     = useState<PrimaryGoal>(
    user.planPreferences?.primaryGoal ?? 'general_fitness'
  );
  const [daysPerWeek,     setDaysPerWeek]     = useState<3 | 4 | 5 | 6>(
    user.planPreferences?.daysPerWeek ?? inferDaysPerWeekFromSplit(user.trainingSplit)
  );
  const [currentPhysiqueLevel, setCurrentPhysiqueLevel] = useState<number>(
    user.currentPhysiqueLevel ?? 1
  );

  const [activePicker, setActivePicker]           = useState<ActivePicker>(null);
  const [defaultsPanelVisible, setDefaultsPanelVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);

  // ── exercise defaults ──
  const { exercises: exerciseCatalog, isLoading: exercisesLoading } = useSupabaseExercises();
  const {
    defaults: exerciseDefaults,
    isLoading: defaultsLoading,
    upsertDefault,
    removeDefault,
  } = useExerciseDefaults(user.id);

  const [defaultEdits, setDefaultEdits] = useState<
    Record<string, { weight: string; reps: string; sets: string; rest: string }>
  >({});
  const [expandedDefaults, setExpandedDefaults] = useState<Record<string, boolean>>({});
  const [defaultSearch, setDefaultSearch]               = useState('');
  const [defaultModalVisible, setDefaultModalVisible]   = useState(false);
  const [savingDefaultId, setSavingDefaultId]           = useState<string | null>(null);
  const [removingDefaultId, setRemovingDefaultId]       = useState<string | null>(null);

  const appVersion =
    Constants.expoConfig?.version ??
    (Constants as any).manifest?.version ??
    '1.0.0';

  // ── sync defaults edits ──
  useEffect(() => {
    const toStr = (v?: number | null) => (v == null ? '0' : String(v));
    const map: Record<string, { weight: string; reps: string; sets: string; rest: string }> = {};
    const expMap: Record<string, boolean> = {};
    exerciseDefaults.forEach((item) => {
      map[item.id] = {
        weight: toStr(item.defaultWeight),
        reps:   toStr(item.defaultReps),
        sets:   toStr(item.defaultSets),
        rest:   toStr(item.defaultRestSeconds),
      };
      expMap[item.id] = expandedDefaults[item.id] ?? false;
    });
    setDefaultEdits(map);
    setExpandedDefaults(expMap);
  }, [exerciseDefaults]);

  const exerciseNameMap = useMemo(() => {
    const map = new Map<string, string>();
    exerciseCatalog.forEach((e) => map.set(e.id, e.name));
    return map;
  }, [exerciseCatalog]);

  const filteredExerciseCatalog = useMemo(() => {
    const term = defaultSearch.trim().toLowerCase();
    if (!term) return exerciseCatalog;
    return exerciseCatalog.filter(
      (e) => e.name.toLowerCase().includes(term) || e.primaryMuscles.some((m) => m.toLowerCase().includes(term))
    );
  }, [exerciseCatalog, defaultSearch]);

  const getExerciseDisplayName = (id?: string | null) =>
    id && exerciseNameMap.has(id) ? exerciseNameMap.get(id)! : 'Custom Exercise';

  const handleDefaultFieldChange = (id: string, field: 'weight' | 'reps' | 'sets' | 'rest', value: string) => {
    setDefaultEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const parseNum = (value: string, float = false) => {
    const t = value?.trim();
    if (!t) return null;
    const n = float ? parseFloat(t) : parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  };

  const handleSaveExerciseDefault = async (defaultId: string) => {
    const edit = defaultEdits[defaultId];
    const record = exerciseDefaults.find((item) => item.id === defaultId);
    if (!edit || !record) return;
    try {
      setSavingDefaultId(defaultId);
      await upsertDefault({
        userId: user.id, id: record.id,
        exerciseId: record.exerciseId ?? null,
        userExerciseId: record.userExerciseId ?? null,
        defaultWeight: parseNum(edit.weight, true),
        defaultReps:   parseNum(edit.reps),
        defaultSets:   parseNum(edit.sets),
        defaultRestSeconds: parseNum(edit.rest),
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
        text: 'Remove', style: 'destructive',
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
      await upsertDefault({ userId: user.id, exerciseId, defaultSets: 4, defaultReps: 10 });
      setDefaultModalVisible(false);
    } catch (err: any) {
      Alert.alert('Add Failed', err?.message || 'Unable to add default');
    } finally {
      setSavingDefaultId(null);
    }
  };

  const handleSendFeedback = useCallback(async () => {
    const subject = encodeURIComponent('Fitarc Feedback');
    const body = encodeURIComponent(
      `App version: ${appVersion}\nPlatform: ${Platform.OS} ${Platform.Version}\nUser ID: ${user.id}\n\nFeedback:\n`
    );
    const url = `mailto:tedtfu@gmail.com?subject=${subject}&body=${body}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) { Alert.alert('Unable to open mail app', 'Please email tedtfu@gmail.com.'); return; }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open mail app', 'Please email tedtfu@gmail.com.');
    }
  }, [appVersion, user.id]);

  // ── autosave ──
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);
  const skipNextAutosaveRef = useRef(false);

  // ── sync when user prop changes externally (e.g. after onboarding or plan start) ──
  useEffect(() => {
    skipNextAutosaveRef.current = true;
    setExperienceLevel(user.experienceLevel);
    setTrainingSplit(user.trainingSplit);
    setEquipmentLevel(user.planPreferences?.equipmentLevel ?? 'full_gym');
    setPrimaryGoal(user.planPreferences?.primaryGoal ?? 'general_fitness');
    setDaysPerWeek(user.planPreferences?.daysPerWeek ?? inferDaysPerWeekFromSplit(user.trainingSplit));
    setCurrentPhysiqueLevel(user.currentPhysiqueLevel ?? 1);
  // only re-sync when the user object reference changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const persistSettings = useCallback(() => {
    const updated: User = {
      ...user,
      experienceLevel,
      trainingSplit,
      currentPhysiqueLevel,
      planPreferences: {
        ...(user.planPreferences ?? {}),
        primaryGoal,
        daysPerWeek,
        equipmentLevel,
      },
    };
    onSave(updated);
  }, [user, experienceLevel, trainingSplit, equipmentLevel, primaryGoal, daysPerWeek, currentPhysiqueLevel, onSave]);

  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (skipNextAutosaveRef.current) { skipNextAutosaveRef.current = false; return; }
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(persistSettings, 800);
    return () => { if (autosaveRef.current) clearTimeout(autosaveRef.current); };
  }, [experienceLevel, trainingSplit, equipmentLevel, primaryGoal, daysPerWeek, currentPhysiqueLevel, persistSettings]);

  // ── picker datasets ──
  const physiqueLevels    = useMemo(() => getPhysiqueLevelsBySex(user.sex), [user.sex]);
  const currentPhysiqueLabel =
    physiqueLevels.find((l) => l.id === currentPhysiqueLevel)?.name ?? `Level ${currentPhysiqueLevel}`;

  const formatExperience  = (v: ExperienceLevel) => v.charAt(0).toUpperCase() + v.slice(1);
  const formatSplit       = (v: TrainingSplit): string => ({
    full_body: 'Full Body', upper_lower: 'Upper/Lower',
    push_pull_legs: 'Push/Pull/Legs', bro_split: 'Bro Split', custom: 'Custom',
  }[v] ?? v);
  const formatEquipment   = (v: EquipmentLevel): string => ({
    bodyweight: 'Bodyweight', dumbbells: 'Dumbbells', full_gym: 'Full Gym',
  }[v] ?? v);
  const formatGoal        = (v: PrimaryGoal): string => ({
    build_muscle: 'Build Muscle', get_stronger: 'Get Stronger',
    lose_fat: 'Lose Fat', endurance: 'Endurance', general_fitness: 'General Fitness',
  }[v] ?? v);

  const experienceOptions: PickerOption[] = [
    { value: 'beginner',     label: 'Beginner',     sublabel: 'Less than 1 year' },
    { value: 'intermediate', label: 'Intermediate', sublabel: '1–3 years' },
    { value: 'advanced',     label: 'Advanced',     sublabel: '3+ years' },
  ];
  const splitOptions: PickerOption[] = [
    { value: 'full_body',      label: 'Full Body' },
    { value: 'upper_lower',    label: 'Upper / Lower' },
    { value: 'push_pull_legs', label: 'Push / Pull / Legs' },
    { value: 'bro_split',      label: 'Bro Split' },
    { value: 'custom',         label: 'Custom' },
  ];
  const equipmentOptions: PickerOption[] = [
    { value: 'bodyweight', label: 'Bodyweight', sublabel: 'No equipment' },
    { value: 'dumbbells',  label: 'Dumbbells',  sublabel: 'Home gym' },
    { value: 'full_gym',   label: 'Full Gym',   sublabel: 'Barbells & machines' },
  ];
  const goalOptions: PickerOption[] = [
    { value: 'build_muscle',    label: 'Build Muscle' },
    { value: 'get_stronger',    label: 'Get Stronger' },
    { value: 'lose_fat',        label: 'Lose Fat' },
    { value: 'endurance',       label: 'Endurance' },
    { value: 'general_fitness', label: 'General Fitness' },
  ];
  const daysOptions: PickerOption[] = [
    { value: '3', label: '3 days / week' },
    { value: '4', label: '4 days / week' },
    { value: '5', label: '5 days / week' },
    { value: '6', label: '6 days / week' },
  ];
  const physiqueOptions: PickerOption[] = physiqueLevels.map((l) => ({
    value: String(l.id),
    label: `Level ${l.id}: ${l.name}`,
    sublabel: l.description,
  }));

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Page header */}
        <View style={s.pageHeader}>
          <Text style={s.pageTitle}>Settings</Text>
          <Text style={s.pageSub}>Plan inputs, workout defaults, and account-adjacent controls.</Text>
        </View>

        <LinearGradient
          colors={['rgba(108,99,255,0.24)', 'rgba(108,99,255,0.08)', 'rgba(255,255,255,0.02)']}
          style={s.summaryCard}
        >
          <Text style={s.summaryEyebrow}>Current setup</Text>
          <Text style={s.summaryTitle}>{formatGoal(primaryGoal)}</Text>
          <View style={s.summaryChipRow}>
            <View style={s.summaryChip}>
              <Text style={s.summaryChipText}>{daysPerWeek}x / week</Text>
            </View>
            <View style={s.summaryChip}>
              <Text style={s.summaryChipText}>{formatSplit(trainingSplit)}</Text>
            </View>
            <View style={s.summaryChip}>
              <Text style={s.summaryChipText}>{formatEquipment(equipmentLevel)}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── PLAN SETUP ──────────────────────────────────────────────────── */}
        <SectionCard title="Plan Setup">
          <CardRow icon="🎯" label="Primary Goal" onPress={() => setActivePicker('goal')}>
            <Text style={s.valueText}>{formatGoal(primaryGoal)}</Text>
            <Text style={s.chevron}>›</Text>
          </CardRow>
          <CardRow icon="📅" label="Days Per Week" onPress={() => setActivePicker('days')}>
            <Text style={s.valueText}>{daysPerWeek}×</Text>
            <Text style={s.chevron}>›</Text>
          </CardRow>
          <CardRow icon="🏋️" label="Training Split" onPress={() => setActivePicker('split')}>
            <Text style={s.valueText}>{formatSplit(trainingSplit)}</Text>
            <Text style={s.chevron}>›</Text>
          </CardRow>
          <CardRow icon="🔧" label="Equipment" isLast onPress={() => setActivePicker('equipment')}>
            <Text style={s.valueText}>{formatEquipment(equipmentLevel)}</Text>
            <Text style={s.chevron}>›</Text>
          </CardRow>
        </SectionCard>

        {/* ── WORKOUT DEFAULTS ────────────────────────────────────────────── */}
        <SectionCard title="Workout Defaults">
          <CardRow icon="💪" label="Experience Level" onPress={() => setActivePicker('experience')}>
            <Text style={s.valueText}>{formatExperience(experienceLevel)}</Text>
            <Text style={s.chevron}>›</Text>
          </CardRow>
          <CardRow icon="📓" label="Preferred Weights" isLast onPress={() => setDefaultsPanelVisible(true)}>
            <Text style={s.valueText}>{exerciseDefaults.length > 0 ? `${exerciseDefaults.length} saved` : 'None'}</Text>
            <Text style={s.chevron}>›</Text>
          </CardRow>
        </SectionCard>

        {/* ── PLAN STATE ──────────────────────────────────────────────────── */}
        <SectionCard title="Plan State">
          <CardRow
            icon="📍"
            label="Current Physique Level"
            isLast={!onStartNewPlan}
            onPress={() => setActivePicker('physique')}
          >
            <Text style={s.valueText}>{currentPhysiqueLabel}</Text>
            <Text style={s.chevron}>›</Text>
          </CardRow>
          {onStartNewPlan && (
            <View>
              <CardRow icon="🔄" label="Start New Plan" isLast onPress={onStartNewPlan}>
                <Text style={s.chevron}>›</Text>
              </CardRow>
              <Text style={s.sectionHint}>
                Generates a fresh program based on your current goal and physique level. Your workout history is preserved.
              </Text>
            </View>
          )}
        </SectionCard>

        {/* ── ABOUT ───────────────────────────────────────────────────────── */}
        <SectionCard title="About">
          <CardRow icon="ℹ️" label="App Version">
            <Text style={s.valueText}>{appVersion}</Text>
          </CardRow>
          <CardRow icon="💬" label="Send Feedback" onPress={handleSendFeedback}>
            <Text style={s.chevron}>›</Text>
          </CardRow>
          <CardRow icon="📖" label="Terms & Privacy" isLast onPress={() => setTermsModalVisible(true)}>
            <Text style={s.chevron}>›</Text>
          </CardRow>
        </SectionCard>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Pickers ────────────────────────────────────────────────────────── */}
      <PickerModal
        visible={activePicker === 'goal'}
        title="Primary Goal"
        options={goalOptions}
        selected={primaryGoal}
        onSelect={(v) => setPrimaryGoal(v as PrimaryGoal)}
        onClose={() => setActivePicker(null)}
      />
      <PickerModal
        visible={activePicker === 'days'}
        title="Days Per Week"
        options={daysOptions}
        selected={String(daysPerWeek)}
        onSelect={(v) => setDaysPerWeek(parseInt(v, 10) as 3 | 4 | 5 | 6)}
        onClose={() => setActivePicker(null)}
      />
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
        visible={activePicker === 'equipment'}
        title="Equipment Level"
        options={equipmentOptions}
        selected={equipmentLevel}
        onSelect={(v) => setEquipmentLevel(v as EquipmentLevel)}
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

      {/* ── Preferred Weights panel ─────────────────────────────────────────── */}
      <Modal animationType="slide" transparent visible={defaultsPanelVisible} onRequestClose={() => setDefaultsPanelVisible(false)}>
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDefaultsPanelVisible(false)} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>Preferred Weights</Text>
              <TouchableOpacity onPress={() => setDefaultsPanelVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.modalCloseX}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {defaultsLoading ? (
                <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />
              ) : exerciseDefaults.length === 0 ? (
                <View style={s.defaultEmpty}>
                  <Text style={s.defaultEmptyTitle}>No defaults yet</Text>
                  <Text style={s.hintText}>Add exercises to prefill your workouts automatically.</Text>
                </View>
              ) : (
                exerciseDefaults.map((ed) => {
                  const vals = defaultEdits[ed.id] || { sets: '0', reps: '0', weight: '0', rest: '0' };
                  const expanded = expandedDefaults[ed.id] ?? false;
                  return (
                    <View key={ed.id} style={s.defaultCard}>
                      <TouchableOpacity
                        style={s.defaultCardHeader}
                        onPress={() => setExpandedDefaults((prev) => ({ ...prev, [ed.id]: !expanded }))}
                        activeOpacity={0.7}
                      >
                        <Text style={s.defaultCardTitle}>{getExerciseDisplayName(ed.exerciseId)}</Text>
                        <View style={s.defaultCardRight}>
                          <Text style={s.defaultCardSummary}>{vals.sets}×{vals.reps} · {vals.weight}kg</Text>
                          <Text style={s.chevron}>{expanded ? '⌄' : '›'}</Text>
                        </View>
                      </TouchableOpacity>
                      {expanded && (
                        <View style={s.defaultCardBody}>
                          <View style={s.defaultGrid}>
                            <View style={s.defaultGridRow}>
                              {(['sets', 'reps'] as const).map((field) => (
                                <View key={field} style={s.defaultGridItem}>
                                  <Text style={s.defaultGridLabel}>{field.charAt(0).toUpperCase() + field.slice(1)}</Text>
                                  <TextInput
                                    style={s.defaultGridInput}
                                    keyboardType="number-pad"
                                    value={vals[field]}
                                    onChangeText={(t) => handleDefaultFieldChange(ed.id, field, t)}
                                  />
                                </View>
                              ))}
                            </View>
                            <View style={s.defaultGridRow}>
                              <View style={s.defaultGridItem}>
                                <Text style={s.defaultGridLabel}>Weight (kg)</Text>
                                <TextInput style={s.defaultGridInput} keyboardType="decimal-pad" value={vals.weight} onChangeText={(t) => handleDefaultFieldChange(ed.id, 'weight', t)} />
                              </View>
                              <View style={s.defaultGridItem}>
                                <Text style={s.defaultGridLabel}>Rest (sec)</Text>
                                <TextInput style={s.defaultGridInput} keyboardType="number-pad" value={vals.rest} onChangeText={(t) => handleDefaultFieldChange(ed.id, 'rest', t)} />
                              </View>
                            </View>
                          </View>
                          <View style={s.defaultCardActions}>
                            <TouchableOpacity
                              style={[s.defaultSaveBtn, savingDefaultId === ed.id && s.defaultBtnDisabled]}
                              onPress={() => handleSaveExerciseDefault(ed.id)}
                              disabled={savingDefaultId === ed.id}
                            >
                              <Text style={s.defaultSaveBtnText}>{savingDefaultId === ed.id ? 'Saving…' : 'Save'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.defaultRemoveBtn, removingDefaultId === ed.id && s.defaultBtnDisabled]}
                              onPress={() => handleRemoveExerciseDefault(ed.id)}
                              disabled={removingDefaultId === ed.id}
                            >
                              <Text style={s.defaultRemoveBtnText}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
              <TouchableOpacity style={s.addDefaultBtn} onPress={() => setDefaultModalVisible(true)} disabled={exercisesLoading} activeOpacity={0.7}>
                <Text style={s.addDefaultBtnText}>+ Add Exercise</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Add Exercise Default modal ──────────────────────────────────────── */}
      <Modal animationType="slide" transparent visible={defaultModalVisible} onRequestClose={() => setDefaultModalVisible(false)}>
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDefaultModalVisible(false)} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>Add Exercise Default</Text>
              <TouchableOpacity onPress={() => setDefaultModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.modalCloseX}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.modalSearch}
              placeholder="Search exercises…"
              placeholderTextColor={C.textMuted}
              value={defaultSearch}
              onChangeText={setDefaultSearch}
            />
            <ScrollView style={s.modalList} showsVerticalScrollIndicator={false}>
              {exercisesLoading ? (
                <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />
              ) : filteredExerciseCatalog.length === 0 ? (
                <Text style={s.hintText}>No exercises match your search.</Text>
              ) : (
                filteredExerciseCatalog.map((ex, idx) => {
                  const alreadyAdded = exerciseDefaults.some((item) => item.exerciseId === ex.id);
                  return (
                    <TouchableOpacity
                      key={ex.id}
                      style={[s.modalItem, idx < filteredExerciseCatalog.length - 1 && s.modalItemBorder, alreadyAdded && s.modalItemDim]}
                      onPress={() => !alreadyAdded && handleAddExerciseDefault(ex.id)}
                      disabled={alreadyAdded}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.modalItemTitle}>{ex.name}</Text>
                        <Text style={s.modalItemSub}>{ex.primaryMuscles.join(', ') || 'Full body'}</Text>
                      </View>
                      <Text style={[s.modalItemAction, alreadyAdded && s.modalItemActionDim]}>
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

      {/* ── Terms modal ─────────────────────────────────────────────────────── */}
      <Modal animationType="slide" transparent visible={termsModalVisible} onRequestClose={() => setTermsModalVisible(false)}>
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setTermsModalVisible(false)} />
          <View style={[s.modalSheet, { maxHeight: '80%' }]}>
            <View style={s.modalHandle} />
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>Terms & Privacy</Text>
              <TouchableOpacity onPress={() => setTermsModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.modalCloseX}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.termsHeading}>Terms of Service</Text>
              <Text style={s.termsText}>
                By using FitArc, you agree to use the app for personal fitness tracking only. We reserve the right to update these terms at any time.
              </Text>
              <Text style={s.termsHeading}>Privacy Policy</Text>
              <Text style={s.termsText}>
                We collect only the data necessary to provide the service. Your workout data is stored securely and never sold to third parties. You may delete your account at any time.
              </Text>
              <Text style={s.termsHeading}>Contact</Text>
              <Text style={s.termsText}>For questions or concerns, email tedtfu@gmail.com.</Text>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  scrollContent:{ paddingTop: 0, paddingBottom: 20 },
  pageHeader:   { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 24 },
  pageTitle:    { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  pageSub:      { marginTop: 6, fontSize: 13, color: C.textMuted, lineHeight: 18, maxWidth: 320 },
  summaryCard:  { marginHorizontal: 16, marginBottom: 18, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(108,99,255,0.22)', padding: 16 },
  summaryEyebrow:{ fontSize: 10, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  summaryTitle: { marginTop: 8, fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  summaryChipRow:{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  summaryChip:   { borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 6 },
  summaryChipText:{ fontSize: 11, fontWeight: '700', color: C.textSec },

  valueText:    { fontSize: 13, color: C.textSec },
  valueTextSub: { fontSize: 12, color: C.textMuted },
  chevron:      { fontSize: 16, color: C.textMuted, marginLeft: 2 },
  sectionHint:  { fontSize: 12, color: C.textMuted, lineHeight: 17, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 2 },

  // ── Defaults panel ──
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:      { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingHorizontal: 20, paddingTop: 8 },
  modalHandle:     { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 16 },
  modalHeaderRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:      { fontSize: 16, fontWeight: '700', color: C.text },
  modalCloseX:     { fontSize: 14, color: C.textMuted, fontWeight: '600' },
  modalSearch:     { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontSize: 14, marginBottom: 10 },
  modalList:       { maxHeight: 360 },
  modalItem:       { paddingVertical: 13, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center' },
  modalItemBorder: { borderBottomWidth: 1, borderBottomColor: C.rowBorder },
  modalItemDim:    { opacity: 0.4 },
  modalItemTitle:  { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 2 },
  modalItemSub:    { fontSize: 12, color: C.textMuted },
  modalItemAction: { fontSize: 13, fontWeight: '700', color: C.primary },
  modalItemActionDim: { color: C.textMuted },

  defaultEmpty:      { alignItems: 'center', paddingVertical: 32 },
  defaultEmptyTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  hintText:          { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingHorizontal: 16 },

  defaultCard:       { backgroundColor: C.surface2, borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  defaultCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  defaultCardTitle:  { fontSize: 14, fontWeight: '600', color: C.text, flex: 1 },
  defaultCardRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  defaultCardSummary:{ fontSize: 12, color: C.textMuted },
  defaultCardBody:   { borderTopWidth: 1, borderTopColor: C.rowBorder, paddingHorizontal: 14, paddingBottom: 14 },

  defaultGrid:       { gap: 10, marginTop: 12 },
  defaultGridRow:    { flexDirection: 'row', gap: 10 },
  defaultGridItem:   { flex: 1 },
  defaultGridLabel:  { fontSize: 11, color: C.textMuted, marginBottom: 4, fontWeight: '600' },
  defaultGridInput:  { backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },

  defaultCardActions:{ flexDirection: 'row', gap: 10, marginTop: 12 },
  defaultSaveBtn:    { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: C.primary, alignItems: 'center' },
  defaultSaveBtnText:{ fontSize: 13, fontWeight: '700', color: C.text },
  defaultRemoveBtn:  { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,107,107,0.4)', alignItems: 'center' },
  defaultRemoveBtnText: { fontSize: 13, fontWeight: '600', color: C.danger },
  defaultBtnDisabled:{ opacity: 0.5 },

  addDefaultBtn:     { marginTop: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(108,99,255,0.35)', borderStyle: 'dashed', alignItems: 'center' },
  addDefaultBtnText: { fontSize: 14, fontWeight: '700', color: C.primary },

  // ── Terms ──
  termsHeading: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 16, marginBottom: 6 },
  termsText:    { fontSize: 13, color: C.textSec, lineHeight: 20 },
});
