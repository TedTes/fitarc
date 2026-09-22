import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { User, WorkoutSessionEntry } from '../types/domain';
import { compileNextRuntimeBlock, compileTrainingBlock, createRuntimeId, deriveLegacySeeds, getRuntimeWeekView } from '../runtime';
import type { TrainingSource } from '../runtime';
import { colors, space } from './runtime/theme';
import { Banner, Button, ChromeContext, Txt } from './runtime/ui';
import { describeRuntimeError, goalLabel } from './runtime/copy';
import { DUMBBELLS, FULL_GYM, Notify, Surface } from './runtime/constants';
import { EventLine, RuntimeEvent } from './runtime/EventLog';
import { sessionProgress } from './runtime/selectors';
import { useRuntimeController } from './runtime/useRuntimeController';
import { SourceIntake } from './runtime/SourceIntake';
import { AccountSurface } from './runtime/AccountSurface';
import { BlockSurface } from './runtime/BlockSurface';
import { TodaySurface } from './runtime/TodaySurface';
import type { WorkoutDockState } from './runtime/SetLogger';
import { WeekSurface } from './runtime/WeekSurface';
import { useMonoFonts } from './runtime/fonts';

type Props = {
  user: User;
  legacySessions: WorkoutSessionEntry[];
  onSaveProfile: (profile: User) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  onDeleteAccount: () => void | Promise<void>;
};

const TABS: Array<{ key: Surface; label: string; spoken: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap; hint: string }> = [
  { key: 'solver', label: 'solver()', spoken: 'solver, today\'s workout', icon: 'barbell-outline', iconOn: 'barbell', hint: "Today's workout, fitted to current conditions" },
  { key: 'block', label: 'block', spoken: 'block, your compiled plan', icon: 'layers-outline', iconOn: 'layers', hint: 'The compiled six-week plan' },
  { key: 'week', label: 'week', spoken: 'week, status', icon: 'stats-chart-outline', iconOn: 'stats-chart', hint: "This week's dose and fatigue" },
  { key: 'account', label: 'account', spoken: 'account settings', icon: 'person-circle-outline', iconOn: 'person-circle', hint: 'Profile, training source, and account controls' },
];
const SURFACE_INDEX: Record<Surface, number> = { solver: 0, block: 1, week: 2, account: 3 };
const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const TrainingRuntimeScreen = ({ user, legacySessions, onSaveProfile, onLogout, onDeleteAccount }: Props) => {
  const insets = useSafeAreaInsets();
  const fontsReady = useMonoFonts();
  const { state, loading: stateLoading, loadError, reload, sync, apply, retrySync } = useRuntimeController(user.id);
  const loading = stateLoading || !fontsReady;
  const [surface, setSurface] = useState<Surface>('solver');
  const [editingSource, setEditingSource] = useState(false);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [fresh, setFresh] = useState<{ id: number; action?: { label: string; run: () => void } } | null>(null);
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [workoutTabsVisible, setWorkoutTabsVisible] = useState(false);
  const [workoutDock, setWorkoutDock] = useState<WorkoutDockState | null>(null);
  const [autoCompileError, setAutoCompileError] = useState<string | null>(null);
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const tabReveal = useRef(new Animated.Value(1)).current;
  const dockTransition = useRef(new Animated.Value(0)).current;
  const tabPosition = useRef(new Animated.Value(0)).current;
  const previousSurface = useRef<Surface>('solver');
  const surfaceOpacity = useRef<Record<Surface, Animated.Value>>({
    solver: new Animated.Value(1), block: new Animated.Value(0), week: new Animated.Value(0), account: new Animated.Value(0),
  }).current;
  const surfaceOffset = useRef<Record<Surface, Animated.Value>>({
    solver: new Animated.Value(0), block: new Animated.Value(0), week: new Animated.Value(0), account: new Animated.Value(0),
  }).current;
  const eventId = useRef(0);
  const restoredNotice = useRef(false);
  const autoCompileAttempted = useRef(false);
  const suggestedSeeds = useMemo(() => deriveLegacySeeds(legacySessions), [legacySessions]);
  const onboardingSource = useMemo<TrainingSource>(() => {
    const preferences = user.planPreferences;
    const preferredDays = preferences?.daysPerWeek;
    const fallbackDays = user.trainingSplit === 'upper_lower' ? 4 : user.trainingSplit === 'push_pull_legs' || user.trainingSplit === 'bro_split' ? 5 : 3;
    const days: 3 | 4 | 5 = preferredDays === 3 ? 3 : preferredDays === 4 ? 4 : preferredDays ? 5 : fallbackDays;
    const equipment = preferences?.equipmentLevel === 'dumbbells' ? DUMBBELLS : FULL_GYM;
    return {
      id: createRuntimeId(),
      userId: user.id,
      version: 1,
      goal: preferences?.primaryGoal === 'get_stronger' ? 'strength' : 'hypertrophy',
      experience: user.experienceLevel === 'advanced' ? 'advanced' : 'intermediate',
      daysPerWeek: days,
      sessionMinutes: preferences?.sessionMinutes ?? 60,
      equipment,
      excludedExerciseIds: [],
      limitations: preferences?.injuries ?? [],
      seedWorkingSets: suggestedSeeds,
      createdAt: new Date().toISOString(),
    };
  }, [suggestedSeeds, user.experienceLevel, user.id, user.planPreferences]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Every notification is an entry in the runtime log. The latest one is always shown as a single line.
  const notify = useCallback<Notify>((next) => {
    eventId.current += 1;
    const id = eventId.current;
    setEvents((list) => [...list, { id, at: new Date().toISOString(), tone: next.tone, title: next.title, message: next.message }].slice(-40));
    setFresh({ id, action: next.action });
  }, []);
  useEffect(() => {
    if (!fresh) return undefined;
    const timer = setTimeout(() => setFresh((current) => (current?.id === fresh.id ? null : current)), fresh.action ? 10000 : 7000);
    return () => clearTimeout(timer);
  }, [fresh]);

  const progress = sessionProgress(state);
  const inSession = Boolean(progress);
  const timerRunning = workoutDock?.phase === 'set' || workoutDock?.phase === 'rest';
  const showDock = !keyboardOpen && surface === 'solver' && Boolean(progress?.pending) && timerRunning && !workoutTabsVisible;
  const bottomVisible = !keyboardOpen;

  useEffect(() => {
    if (!timerRunning) setWorkoutTabsVisible(false);
  }, [timerRunning]);

  useEffect(() => {
    Animated.timing(tabReveal, {
      toValue: bottomVisible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [bottomVisible, tabReveal]);

  useEffect(() => {
    Animated.timing(dockTransition, {
      toValue: showDock ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [dockTransition, showDock]);

  useEffect(() => {
    const previous = previousSurface.current;
    const direction = SURFACE_INDEX[surface] >= SURFACE_INDEX[previous] ? 1 : -1;

    Animated.timing(tabPosition, {
      toValue: SURFACE_INDEX[surface], duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();

    if (previous === surface) return;
    surfaceOpacity[surface].stopAnimation();
    surfaceOffset[surface].stopAnimation();
    surfaceOpacity[previous].stopAnimation();
    surfaceOffset[previous].stopAnimation();
    surfaceOpacity[surface].setValue(0);
    surfaceOffset[surface].setValue(direction * 18);

    Animated.parallel([
      Animated.timing(surfaceOpacity[previous], { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(surfaceOffset[previous], { toValue: direction * -12, duration: 190, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(surfaceOpacity[surface], { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(surfaceOffset[surface], { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => surfaceOffset[previous].setValue(0));
    previousSurface.current = surface;
  }, [surface, surfaceOffset, surfaceOpacity, tabPosition]);

  // An active session survives restarts. A completed session needs an explicit reminder because
  // the next action is commit/discard; an in-progress session already identifies itself in set.log.
  useEffect(() => {
    if (loading || restoredNotice.current) return;
    restoredNotice.current = true;
    if (progress?.pending === 0) notify({ tone: 'info', title: 'session restored · logged · awaiting commit', message: 'The app was closed before you committed. Commit or discard it.' });
  }, [loading, notify, progress]);

  // A session lives in solver(): landing there when it starts or is restored. Leaving mid-session is allowed.
  useEffect(() => { if (inSession) setSurface('solver'); }, [inSession]);

  const weekView = useMemo(() => (loading ? null : getRuntimeWeekView(state)), [loading, state]);
  const go = useCallback((next: Surface) => {
    setSurface(next);
    if (next === 'solver') setWorkoutTabsVisible(false);
  }, []);

  const compile = useCallback((source: TrainingSource) => {
    const first = !state.source;
    const outcome = apply((current) => compileTrainingBlock(current, source));
    if (!outcome.ok) {
      const problem = describeRuntimeError(outcome.error);
      notify({ tone: 'error', title: first ? `compile failed · ${problem.message}` : `recompile failed · ${problem.message}`, sticky: true });
      return false;
    }
    setEditingSource(false);
    setSurface('block');
    notify({
      tone: 'success',
      title: first ? `compiled block v${outcome.state.block?.version}` : `recompiled → block v${outcome.state.block?.version}`,
      message: first ? 'Your first six weeks are ready.' : outcome.state.lastBlockDiff.join(' · '),
      action: { label: 'solver()', run: () => setSurface('solver') },
    });
    return true;
  }, [apply, notify, state.source]);

  useEffect(() => {
    if (loading || loadError || state.source || state.block || autoCompileAttempted.current) return;
    autoCompileAttempted.current = true;
    if (compile(onboardingSource)) {
      setSurface('solver');
    } else {
      setAutoCompileError('The saved constraints do not leave enough compatible exercises to build every session.');
    }
  }, [compile, loadError, loading, onboardingSource, state.block, state.source]);

  const nextBlock = useCallback(() => {
    const outcome = apply(compileNextRuntimeBlock);
    if (!outcome.ok) {
      const problem = describeRuntimeError(outcome.error);
      notify({ tone: 'error', title: `compile failed · ${problem.message}`, sticky: true });
      return;
    }
    notify({
      tone: 'success', title: `compiled block v${outcome.state.block?.version}`,
      message: 'Working weights carried over. The pipeline restarted at accumulate, week 1.',
      action: { label: 'solver()', run: () => setSurface('solver') },
    });
  }, [apply, notify]);

  const onSyncPress = () => {
    if (sync === 'device' || sync === 'failed') {
      retrySync();
      notify({ tone: 'info', title: 'retrying save', message: 'Your changes stay on this device in the meantime.' });
    }
  };

  const line = (
    <EventLine
      events={events}
      fresh={Boolean(fresh && fresh.id === events[events.length - 1]?.id)}
      action={fresh?.action}
      dismissed={dismissedId === events[events.length - 1]?.id}
      onDismiss={() => setDismissedId(events[events.length - 1]?.id ?? null)}
    />
  );

  // ── Loading and load failure ──
  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]} accessibilityLabel="Loading runtime state" accessible>
        <ActivityIndicator color={colors.accent} size="large" />
        <Txt variant="code" tone="secondary" style={styles.centerText}>loading runtime state…</Txt>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Banner tone="error" title="Could not load runtime state" message={`${loadError} Nothing was changed or deleted.`} />
        <Button label="Try again" onPress={reload} icon="refresh" />
        <Button label="Sign out" variant="secondary" onPress={() => void onLogout()} />
      </View>
    );
  }

  // ── First launch: no runtime yet ──
  if (!state.source || !state.block) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]} accessibilityLabel="Compiling your training block" accessible>
        {autoCompileError ? (
          <>
            <Banner tone="error" title="Could not compile your block" message={autoCompileError} />
            <Button label="Sign out" variant="secondary" onPress={() => void onLogout()} />
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} size="large" />
            <Txt variant="code" tone="secondary" style={styles.centerText}>compiling your block…</Txt>
          </>
        )}
      </View>
    );
  }

  const block = weekView?.block ?? state.block;
  const status = weekView?.status;
  const chip = `${goalLabel(state.source.goal)} · wk ${block.currentWeek}/${block.durationWeeks}`;

  return (
    <ChromeContext.Provider value={{ chip, sync, onSyncPress }}>
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Every surface stays mounted so a half-entered set or an open form survives a look at another destination. */}
      <View style={styles.surfaceStage}>
        <Animated.View
          pointerEvents={surface === 'solver' ? 'auto' : 'none'}
          accessibilityElementsHidden={surface !== 'solver'}
          importantForAccessibility={surface === 'solver' ? 'auto' : 'no-hide-descendants'}
          style={[styles.surfaceLayer, surface === 'solver' && styles.surfaceActive, { opacity: surfaceOpacity.solver, transform: [{ translateX: surfaceOffset.solver }] }]}
        >
          {line}
          <TodaySurface
            state={state} apply={apply} notify={notify} active={surface === 'solver'}
            onDockChange={setWorkoutDock}
            onOpenSource={() => go('account')} onOpenWeek={() => go('week')}
          />
        </Animated.View>
        <Animated.View
          pointerEvents={surface === 'block' ? 'auto' : 'none'}
          accessibilityElementsHidden={surface !== 'block'}
          importantForAccessibility={surface === 'block' ? 'auto' : 'no-hide-descendants'}
          style={[styles.surfaceLayer, surface === 'block' && styles.surfaceActive, { opacity: surfaceOpacity.block, transform: [{ translateX: surfaceOffset.block }] }]}
        >
          <BlockSurface state={state} block={block} sessionActive={inSession} onNextBlock={nextBlock} />
        </Animated.View>
        <Animated.View
          pointerEvents={surface === 'week' ? 'auto' : 'none'}
          accessibilityElementsHidden={surface !== 'week'}
          importantForAccessibility={surface === 'week' ? 'auto' : 'no-hide-descendants'}
          style={[styles.surfaceLayer, surface === 'week' && styles.surfaceActive, { opacity: surfaceOpacity.week, transform: [{ translateX: surfaceOffset.week }] }]}
        >
          {status ? <WeekSurface state={state} block={block} status={status} /> : null}
        </Animated.View>
        <Animated.View
          pointerEvents={surface === 'account' ? 'auto' : 'none'}
          accessibilityElementsHidden={surface !== 'account'}
          importantForAccessibility={surface === 'account' ? 'auto' : 'no-hide-descendants'}
          style={[styles.surfaceLayer, surface === 'account' && styles.surfaceActive, { opacity: surfaceOpacity.account, transform: [{ translateX: surfaceOffset.account }] }]}
        >
          {editingSource ? (
            <SourceIntake user={user} initial={state.source} blockVersion={state.block.version} sessionActive={inSession} onSubmit={compile} onCancel={() => setEditingSource(false)} />
          ) : (
            <AccountSurface
              user={user} state={state} sync={sync}
              onEditSource={() => setEditingSource(true)} onSaveProfile={onSaveProfile}
              onLogout={onLogout} onDeleteAccount={onDeleteAccount}
            />
          )}
        </Animated.View>
      </View>

      <Animated.View
        pointerEvents={bottomVisible ? 'auto' : 'none'}
        style={[
          styles.bottomStage,
          {
            height: tabReveal.interpolate({ inputRange: [0, 1], outputRange: [0, 60 + Math.max(insets.bottom, space.sm)] }),
            opacity: tabReveal,
            overflow: bottomVisible ? 'visible' : 'hidden',
            transform: [{ translateY: tabReveal.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          },
        ]}
      >
        <Animated.View
          accessibilityRole="tablist"
          pointerEvents={showDock ? 'none' : 'auto'}
          onLayout={(event) => setTabBarWidth(event.nativeEvent.layout.width)}
          style={[
            styles.bottomLayer,
            styles.tabsLayer,
            { paddingBottom: Math.max(insets.bottom, space.sm) },
            {
              opacity: dockTransition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [{ translateY: dockTransition.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) }],
            },
          ]}
        >
          {tabBarWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.tabIndicator,
                {
                  width: tabBarWidth / TABS.length,
                  transform: [{
                    translateX: tabPosition.interpolate({
                      inputRange: [0, TABS.length - 1],
                      outputRange: [0, (tabBarWidth / TABS.length) * (TABS.length - 1)],
                    }),
                  }],
                },
              ]}
            />
          ) : null}
          {TABS.map((tab) => {
            const selected = surface === tab.key;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityLabel={tab.key === 'solver' && inSession ? `${tab.spoken}, session active` : tab.spoken}
                accessibilityHint={tab.hint}
                accessibilityState={{ selected }}
                onPress={() => go(tab.key)}
                style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
              >
                <View>
                  <Ionicons name={selected ? tab.iconOn : tab.icon} size={24} color={selected ? colors.accent : colors.textSecondary} />
                  {tab.key === 'solver' && inSession ? <View style={styles.liveDot} /> : null}
                </View>
                <Txt variant="label" tone={selected ? 'accent' : 'secondary'} maxFontSizeMultiplier={1.1} numberOfLines={1}>{tab.label}</Txt>
              </Pressable>
            );
          })}
        </Animated.View>

        <Animated.View
          pointerEvents={showDock ? 'auto' : 'none'}
          style={[
            styles.bottomLayer,
            styles.dockLayer,
            { paddingBottom: Math.max(insets.bottom, space.sm) },
            {
              opacity: dockTransition,
              transform: [{ translateY: dockTransition.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={workoutDock?.phase === 'rest' ? 'Restart rest timer' : 'Reset set timer'}
            onPress={workoutDock?.onReset}
            style={({ pressed }) => [styles.dockAction, pressed && styles.pressed]}
          >
            <Ionicons name="refresh" size={27} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${workoutDock?.phase === 'rest' ? 'Rest' : 'Set'} timer ${formatClock(workoutDock?.seconds ?? 0)}. Show navigation tabs`}
            accessibilityHint="Shows the app navigation while the timer continues"
            onPress={() => setWorkoutTabsVisible(true)}
            style={({ pressed }) => [styles.dockReadout, pressed && styles.pressed]}
          >
            <Txt variant="label" tone="accent" style={styles.dockLabel}>{workoutDock?.phase === 'rest' ? 'REST' : 'SET'}</Txt>
            <Txt style={styles.dockTime}>{formatClock(workoutDock?.seconds ?? 0)}</Txt>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={workoutDock?.phase === 'rest' ? 'Skip rest' : 'Finish set and start rest'}
            accessibilityState={{ disabled: Boolean(workoutDock?.primaryDisabled) }}
            disabled={workoutDock?.primaryDisabled}
            onPress={workoutDock?.onPrimary}
            style={({ pressed }) => [styles.dockAction, workoutDock?.primaryDisabled && styles.dockActionDisabled, pressed && styles.pressed]}
          >
            <Ionicons
              name={workoutDock?.phase === 'rest' ? 'play-skip-forward' : 'checkmark'}
              size={30}
              color={colors.accent}
            />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </KeyboardAvoidingView>
    </ChromeContext.Provider>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.ground },
  center: { flex: 1, alignItems: 'stretch', justifyContent: 'center', gap: space.lg, padding: space.xl, backgroundColor: colors.ground },
  centerText: { textAlign: 'center' },
  surfaceStage: { flex: 1, position: 'relative', overflow: 'hidden' },
  surfaceLayer: { ...StyleSheet.absoluteFillObject },
  surfaceActive: { zIndex: 1 },
  bottomStage: { position: 'relative', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  bottomLayer: { ...StyleSheet.absoluteFillObject },
  tabsLayer: { flexDirection: 'row', backgroundColor: colors.surface },
  dockLayer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: space.lg },
  tabIndicator: { position: 'absolute', zIndex: 2, top: 0, left: 0, height: 3, backgroundColor: colors.accent },
  tab: { zIndex: 1, flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: space.sm },
  pressed: { opacity: 0.7 },
  liveDot: { position: 'absolute', top: -2, right: -6, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning, borderWidth: 1, borderColor: colors.surface },
  dockReadout: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  dockLabel: { fontSize: 11, lineHeight: 14 },
  dockTime: { color: colors.text, fontSize: 27, lineHeight: 31, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dockAction: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  dockActionDisabled: { opacity: 0.3 },
});
