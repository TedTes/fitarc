import React, { useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EquipmentLevel, ExperienceLevel, PrimaryGoal, TrainingSplit } from '../types/domain';
import { monoFace } from './runtime/fonts';
import { colors, mono, radius, space, TOUCH } from './runtime/theme';

export type ProfileSetupData = {
  name: string;
  sex: 'male' | 'female' | 'other';
  age: number;
  heightCm: number;
  weightKg: number;
  experienceLevel: ExperienceLevel;
  trainingSplit: TrainingSplit;
  eatingMode: 'maintenance';
  primaryGoal: PrimaryGoal;
  daysPerWeek: 3 | 4 | 5;
  sessionMinutes: 30 | 45 | 60 | 75;
  equipmentLevel: EquipmentLevel;
  injuries: string[];
};

type Props = { initialName?: string; onComplete: (data: ProfileSetupData) => void };
type StepKey = 'identity' | 'goal' | 'schedule' | 'context' | 'baseline' | 'limits';

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'identity', label: 'identity' }, { key: 'goal', label: 'objective' },
  { key: 'schedule', label: 'schedule' }, { key: 'context', label: 'context' },
  { key: 'baseline', label: 'baseline' }, { key: 'limits', label: 'constraints' },
];
const GOALS: Array<{ label: string; detail: string; value: PrimaryGoal }> = [
  { label: 'build muscle', detail: 'hypertrophy and size', value: 'build_muscle' },
  { label: 'get stronger', detail: 'strength and performance', value: 'get_stronger' },
  { label: 'lose fat', detail: 'retain muscle while cutting', value: 'lose_fat' },
  { label: 'general fitness', detail: 'balanced capacity', value: 'general_fitness' },
  { label: 'endurance', detail: 'work capacity and stamina', value: 'endurance' },
];
const EXPERIENCE: Array<{ label: string; detail: string; value: ExperienceLevel }> = [
  { label: 'beginner', detail: '< 1 year consistent training', value: 'beginner' },
  { label: 'intermediate', detail: '1–3 years consistent training', value: 'intermediate' },
  { label: 'advanced', detail: '3+ years consistent training', value: 'advanced' },
];
const EQUIPMENT: Array<{ label: string; detail: string; value: EquipmentLevel }> = [
  { label: 'dumbbells', detail: 'home or compact gym', value: 'dumbbells' },
  { label: 'full gym', detail: 'barbells, cables and machines', value: 'full_gym' },
];
const LIMITATIONS = ['shoulder', 'lower back', 'knee', 'elbow', 'neck'];
const splitForDays = (days: 3 | 4 | 5): TrainingSplit =>
  days >= 5 ? 'push_pull_legs' : days === 4 ? 'upper_lower' : 'full_body';

const StepHeading = ({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) => (
  <View style={styles.stepHeading}>
    <Text style={styles.eyebrow}>{eyebrow}</Text>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.subtitle}>{detail}</Text>
  </View>
);

export const ProfileSetupScreen: React.FC<Props> = ({ initialName = '', onComplete }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState(initialName);
  const [sex, setSex] = useState<ProfileSetupData['sex']>('male');
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>('build_muscle');
  const [daysPerWeek, setDaysPerWeek] = useState<3 | 4 | 5>(4);
  const [sessionMinutes, setSessionMinutes] = useState<30 | 45 | 60 | 75>(60);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('beginner');
  const [equipmentLevel, setEquipmentLevel] = useState<EquipmentLevel>('full_gym');
  const [age, setAge] = useState(25);
  const [heightCm, setHeightCm] = useState(175);
  const [weightKg, setWeightKg] = useState(70);
  const [injuries, setInjuries] = useState<string[]>([]);
  const [nameError, setNameError] = useState(false);
  const [animating, setAnimating] = useState(false);
  const offset = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const activeStep = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const goalLabel = GOALS.find((item) => item.value === primaryGoal)?.label;
  const summary = useMemo(
    () => `${goalLabel} · ${daysPerWeek}d · ${sessionMinutes}m · ${equipmentLevel.replace('_', ' ')}`,
    [daysPerWeek, equipmentLevel, goalLabel, sessionMinutes]
  );

  const moveTo = (next: number) => {
    if (animating || next < 0 || next >= STEPS.length) return;
    const direction = next > stepIndex ? 1 : -1;
    setAnimating(true);
    Animated.parallel([
      Animated.timing(offset, { toValue: direction * -28, duration: 130, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 110, useNativeDriver: true }),
    ]).start(() => {
      setStepIndex(next);
      offset.setValue(direction * 34);
      Animated.parallel([
        Animated.timing(offset, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 190, useNativeDriver: true }),
      ]).start(() => setAnimating(false));
    });
  };

  const continueFlow = () => {
    if (activeStep.key === 'identity' && !name.trim()) { setNameError(true); return; }
    if (!isLast) { moveTo(stepIndex + 1); return; }
    onComplete({
      name: name.trim(), sex, age, heightCm, weightKg, experienceLevel,
      trainingSplit: splitForDays(daysPerWeek), eatingMode: 'maintenance',
      primaryGoal, daysPerWeek, sessionMinutes, equipmentLevel, injuries,
    });
  };

  const Choice = ({ label, detail, selected, onPress }: {
    label: string; detail?: string; selected: boolean; onPress: () => void;
  }) => (
    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected }} activeOpacity={0.78}
      style={[styles.choice, selected && styles.choiceSelected]} onPress={onPress}>
      <View style={[styles.choiceMark, selected && styles.choiceMarkSelected]}>
        {selected ? <View style={styles.choiceMarkCore} /> : null}
      </View>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
        {detail ? <Text style={styles.choiceDetail}>{detail}</Text> : null}
      </View>
      {selected ? <Text style={styles.selectedGlyph}>✓</Text> : null}
    </TouchableOpacity>
  );

  const Metric = ({ label, value, unit, decrement, increment }: {
    label: string; value: string; unit: string; decrement: () => void; increment: () => void;
  }) => (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricControl}>
        <TouchableOpacity accessibilityLabel={`Decrease ${label}`} style={styles.iconTouch} onPress={decrement}>
          <Text style={styles.metricIcon}>−</Text>
        </TouchableOpacity>
        <View style={styles.metricValueWrap}>
          <Text style={styles.metricValue}>{value}</Text><Text style={styles.metricUnit}>{unit}</Text>
        </View>
        <TouchableOpacity accessibilityLabel={`Increase ${label}`} style={styles.iconTouch} onPress={increment}>
          <Text style={styles.metricIcon}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep = () => {
    switch (activeStep.key) {
      case 'identity': return <>
        <StepHeading eyebrow="ATHLETE" title="What should we call you?" detail="Used on your training block and session log." />
        <TextInput autoFocus={!initialName} autoCapitalize="words" maxLength={40} placeholder="your name"
          placeholderTextColor={colors.textMuted} selectionColor={colors.accent}
          style={[styles.nameInput, nameError && styles.nameInputError]} value={name}
          onChangeText={(value) => { setName(value); if (value.trim()) setNameError(false); }} />
        {nameError ? <Text style={styles.inlineError}>enter a name to continue</Text> : null}
        <Text style={styles.fieldLabel}>profile</Text>
        <View style={styles.compactChoices}>
          {(['male', 'female', 'other'] as const).map((value) =>
            <TouchableOpacity key={value} style={[styles.compactChoice, sex === value && styles.compactChoiceSelected]}
              onPress={() => setSex(value)}>
              <Text style={[styles.compactChoiceText, sex === value && styles.compactChoiceTextSelected]}>{value}</Text>
            </TouchableOpacity>)}
        </View>
      </>;
      case 'goal': return <>
        <StepHeading eyebrow="OBJECTIVE" title="What are we optimizing?" detail="This sets the block's progression rules." />
        <View style={styles.choiceList}>{GOALS.map((item) =>
          <Choice key={item.value} {...item} selected={primaryGoal === item.value} onPress={() => setPrimaryGoal(item.value)} />)}</View>
      </>;
      case 'schedule': return <>
        <StepHeading eyebrow="FREQUENCY" title="How often can you train?" detail="We will choose the split from your weekly availability." />
        <View style={styles.dayGrid}>{([3, 4, 5] as const).map((days) =>
          <TouchableOpacity key={days} style={[styles.dayChoice, daysPerWeek === days && styles.dayChoiceSelected]}
            onPress={() => setDaysPerWeek(days)}>
            <Text style={[styles.dayNumber, daysPerWeek === days && styles.dayNumberSelected]}>{days}</Text>
            <Text style={styles.dayLabel}>days / wk</Text>
          </TouchableOpacity>)}</View>
        <Text style={styles.fieldLabel}>session time</Text>
        <View style={styles.timeGrid}>{([30, 45, 60, 75] as const).map((minutes) =>
          <TouchableOpacity key={minutes} style={[styles.timeChoice, sessionMinutes === minutes && styles.timeChoiceSelected]}
            onPress={() => setSessionMinutes(minutes)}>
            <Text style={[styles.timeText, sessionMinutes === minutes && styles.timeTextSelected]}>{minutes}m</Text>
          </TouchableOpacity>)}</View>
        <View style={styles.runtimeNote}>
          <Text style={styles.runtimePrompt}>solver()</Text>
          <Text style={styles.runtimeNoteText}>will compile a {splitForDays(daysPerWeek).replaceAll('_', ' ')} rotation</Text>
        </View>
      </>;
      case 'context': return <>
        <StepHeading eyebrow="TRAINING CONTEXT" title="Match the starting dose." detail="Choose your experience and available equipment." />
        <Text style={styles.fieldLabel}>experience</Text>
        <View style={styles.choiceList}>{EXPERIENCE.map((item) =>
          <Choice key={item.value} {...item} selected={experienceLevel === item.value} onPress={() => setExperienceLevel(item.value)} />)}</View>
        <Text style={styles.fieldLabel}>equipment</Text>
        <View style={styles.choiceList}>{EQUIPMENT.map((item) =>
          <Choice key={item.value} {...item} selected={equipmentLevel === item.value} onPress={() => setEquipmentLevel(item.value)} />)}</View>
      </>;
      case 'baseline': return <>
        <StepHeading eyebrow="BASELINE" title="Set your starting profile." detail="You can update these values later in Account." />
        <View style={styles.metricsCard}>
          <Metric label="age" value={`${age}`} unit="yr" decrement={() => setAge(v => Math.max(15, v - 1))} increment={() => setAge(v => Math.min(90, v + 1))} />
          <View style={styles.rule} />
          <Metric label="height" value={`${heightCm}`} unit="cm" decrement={() => setHeightCm(v => Math.max(140, v - 1))} increment={() => setHeightCm(v => Math.min(220, v + 1))} />
          <View style={styles.rule} />
          <Metric label="weight" value={`${weightKg}`} unit="kg" decrement={() => setWeightKg(v => Math.max(40, v - 1))} increment={() => setWeightKg(v => Math.min(250, v + 1))} />
        </View>
      </>;
      case 'limits': return <>
        <StepHeading eyebrow="CONSTRAINTS" title="Anything we should protect?" detail="Optional. Select areas that need exercise substitutions." />
        <View style={styles.limitGrid}>{LIMITATIONS.map((item) => {
          const selected = injuries.includes(item);
          return <TouchableOpacity key={item} style={[styles.limitChoice, selected && styles.limitChoiceSelected]}
            onPress={() => setInjuries(current => current.includes(item) ? current.filter(x => x !== item) : [...current, item])}>
            <Text style={[styles.limitText, selected && styles.limitTextSelected]}>{item}</Text>
          </TouchableOpacity>;
        })}</View>
        <View style={styles.compileCard}>
          <View><Text style={styles.compileEyebrow}>READY TO COMPILE</Text><Text style={styles.compileName}>{name.trim()}</Text></View>
          <Text style={styles.compileSummary}>{summary}</Text>
        </View>
      </>;
    }
  };

  return <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>build.profile</Text><Text style={styles.brandDot}>.</Text>
          <Text style={styles.stepCount}>{String(stepIndex + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}</Text>
        </View>
        <View style={styles.progressTrack}>{STEPS.map((step, index) =>
          <View key={step.key} style={[styles.progressSegment, index < stepIndex && styles.progressSegmentDone, index === stepIndex && styles.progressSegmentActive]} />)}</View>
        <View style={styles.progressMeta}><Text style={styles.progressLabel}>{activeStep.label}</Text><Text style={styles.progressPercent}>{Math.round(((stepIndex + 1) / STEPS.length) * 100)}%</Text></View>
      </View>
      <Animated.View style={[styles.animatedBody, { opacity, transform: [{ translateX: offset }] }]}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {renderStep()}
        </ScrollView>
      </Animated.View>
      <View style={styles.footer}>
        <TouchableOpacity accessibilityLabel="Previous step" disabled={stepIndex === 0 || animating}
          style={[styles.backButton, stepIndex === 0 && styles.backButtonHidden]} onPress={() => moveTo(stepIndex - 1)}>
          <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.82} disabled={animating} style={styles.continueButton} onPress={continueFlow}>
          <Text style={styles.continueText}>{isLast ? 'compile profile' : 'continue'}</Text>
          <Ionicons name={isLast ? 'flash' : 'arrow-forward'} size={18} color={colors.accentText} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.ground },
  header: { paddingHorizontal: space.xl, paddingTop: space.md },
  brandRow: { flexDirection: 'row', alignItems: 'baseline' },
  brand: { color: colors.text, fontFamily: monoFace('700') ?? mono, fontSize: 20 },
  brandDot: { color: colors.accent, fontFamily: monoFace('700') ?? mono, fontSize: 20 },
  stepCount: { marginLeft: 'auto', color: colors.textSecondary, fontFamily: monoFace('600') ?? mono, fontSize: 12 },
  progressTrack: { flexDirection: 'row', gap: 5, marginTop: space.lg },
  progressSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.borderStrong },
  progressSegmentDone: { backgroundColor: '#9C5D36' }, progressSegmentActive: { backgroundColor: colors.accent },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  progressLabel: { color: colors.textMuted, fontFamily: monoFace('600') ?? mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  progressPercent: { color: colors.textMuted, fontFamily: monoFace('400') ?? mono, fontSize: 11 },
  animatedBody: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: space.xl, paddingTop: 38, paddingBottom: space.xl },
  stepHeading: { marginBottom: space.xl }, eyebrow: { color: colors.accent, fontFamily: monoFace('700') ?? mono, fontSize: 12, letterSpacing: 1.5, marginBottom: space.sm },
  title: { color: colors.text, fontFamily: monoFace('700') ?? mono, fontSize: 27, lineHeight: 34, letterSpacing: -0.7 },
  subtitle: { color: colors.textSecondary, fontFamily: monoFace('400') ?? mono, fontSize: 13, lineHeight: 20, marginTop: space.sm },
  nameInput: { minHeight: 62, borderBottomWidth: 2, borderBottomColor: colors.borderStrong, color: colors.text, fontFamily: monoFace('600') ?? mono, fontSize: 24, paddingHorizontal: 2 },
  nameInputError: { borderBottomColor: colors.danger }, inlineError: { color: colors.danger, fontFamily: monoFace('400') ?? mono, fontSize: 11, marginTop: space.sm },
  fieldLabel: { color: colors.textMuted, fontFamily: monoFace('700') ?? mono, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: space.xl, marginBottom: space.md },
  compactChoices: { flexDirection: 'row', gap: space.sm }, compactChoice: { flex: 1, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: colors.border },
  compactChoiceSelected: { borderBottomColor: colors.accent, backgroundColor: colors.accentSoft }, compactChoiceText: { color: colors.textMuted, fontFamily: monoFace('600') ?? mono, fontSize: 13 }, compactChoiceTextSelected: { color: colors.accent },
  choiceList: { gap: space.sm }, choice: { minHeight: 62, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  choiceSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, choiceMark: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginRight: space.md },
  choiceMarkSelected: { borderColor: colors.accent }, choiceMarkCore: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent }, choiceCopy: { flex: 1 },
  choiceLabel: { color: colors.textSecondary, fontFamily: monoFace('600') ?? mono, fontSize: 14 }, choiceLabelSelected: { color: colors.text }, choiceDetail: { color: colors.textMuted, fontFamily: monoFace('400') ?? mono, fontSize: 11, marginTop: 3 }, selectedGlyph: { color: colors.accent, fontFamily: monoFace('700') ?? mono, fontSize: 14 },
  dayGrid: { flexDirection: 'row', gap: space.sm }, dayChoice: { flex: 1, minHeight: 92, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  dayChoiceSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, dayNumber: { color: colors.textSecondary, fontFamily: monoFace('700') ?? mono, fontSize: 26 }, dayNumberSelected: { color: colors.accent }, dayLabel: { color: colors.textMuted, fontFamily: monoFace('400') ?? mono, fontSize: 9, marginTop: 3 },
  timeGrid: { flexDirection: 'row', gap: space.sm }, timeChoice: { flex: 1, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: colors.border }, timeChoiceSelected: { borderBottomColor: colors.accent, backgroundColor: colors.accentSoft }, timeText: { color: colors.textMuted, fontFamily: monoFace('600') ?? mono, fontSize: 12 }, timeTextSelected: { color: colors.accent },
  runtimeNote: { marginTop: space.xl, borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: space.md, gap: 3 }, runtimePrompt: { color: colors.accent, fontFamily: monoFace('700') ?? mono, fontSize: 12 }, runtimeNoteText: { color: colors.textSecondary, fontFamily: monoFace('400') ?? mono, fontSize: 12, lineHeight: 18 },
  metricsCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: space.lg }, metricRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center' }, metricLabel: { color: colors.textSecondary, fontFamily: monoFace('600') ?? mono, fontSize: 13, width: 72 },
  metricControl: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }, iconTouch: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }, metricIcon: { color: colors.textSecondary, fontFamily: monoFace('400') ?? mono, fontSize: 24 },
  metricValueWrap: { minWidth: 88, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 }, metricValue: { color: colors.text, fontFamily: monoFace('700') ?? mono, fontSize: 22 }, metricUnit: { color: colors.textMuted, fontFamily: monoFace('400') ?? mono, fontSize: 11 }, rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  limitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, limitChoice: { minHeight: TOUCH, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, limitChoiceSelected: { borderColor: colors.warning, backgroundColor: colors.warningSoft }, limitText: { color: colors.textSecondary, fontFamily: monoFace('600') ?? mono, fontSize: 12 }, limitTextSelected: { color: colors.warning },
  compileCard: { marginTop: 34, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: space.md }, compileEyebrow: { color: colors.success, fontFamily: monoFace('700') ?? mono, fontSize: 10, letterSpacing: 1.2 }, compileName: { color: colors.text, fontFamily: monoFace('700') ?? mono, fontSize: 18, marginTop: 4 }, compileSummary: { color: colors.textSecondary, fontFamily: monoFace('400') ?? mono, fontSize: 12 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md }, backButton: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }, backButtonHidden: { opacity: 0 },
  continueButton: { flex: 1, minHeight: 54, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm }, continueText: { color: colors.accentText, fontFamily: monoFace('700') ?? mono, fontSize: 14 },
});
