import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { User, WorkoutSessionEntry } from '../types/domain';
import { compileNextRuntimeBlock, compileTrainingBlock, deriveLegacySeeds, getRuntimeWeekView } from '../runtime';
import type { TrainingSource } from '../runtime';
import { colors, space, TOUCH } from './runtime/theme';
import { Banner, Button, ChromeContext, Txt } from './runtime/ui';
import { describeRuntimeError, goalLabel } from './runtime/copy';
import { Notify, Surface } from './runtime/constants';
import { EventLine, RuntimeEvent } from './runtime/EventLog';
import { sessionProgress } from './runtime/selectors';
import { useRuntimeController } from './runtime/useRuntimeController';
import { SourceIntake } from './runtime/SourceIntake';
import { SourceSurface } from './runtime/SourceSurface';
import { BlockSurface } from './runtime/BlockSurface';
import { TodaySurface } from './runtime/TodaySurface';
import { WeekSurface } from './runtime/WeekSurface';
import { useMonoFonts } from './runtime/fonts';

type Props = { user: User; legacySessions: WorkoutSessionEntry[]; onLogout: () => void | Promise<void> };

const TABS: Array<{ key: Surface; label: string; spoken: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap; hint: string }> = [
  { key: 'solver', label: 'solver()', spoken: 'solver, today\'s workout', icon: 'barbell-outline', iconOn: 'barbell', hint: "Today's workout, fitted to current conditions" },
  { key: 'block', label: 'block', spoken: 'block, your compiled plan', icon: 'layers-outline', iconOn: 'layers', hint: 'The compiled six-week plan' },
  { key: 'week', label: 'week', spoken: 'week, status', icon: 'stats-chart-outline', iconOn: 'stats-chart', hint: "This week's dose and fatigue" },
  { key: 'source', label: 'source', spoken: 'source, your constraints', icon: 'options-outline', iconOn: 'options', hint: 'Your goal and constraints' },
];
const SURFACE_INDEX: Record<Surface, number> = { solver: 0, block: 1, week: 2, source: 3 };

export const TrainingRuntimeScreen = ({ user, legacySessions, onLogout }: Props) => {
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
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const tabReveal = useRef(new Animated.Value(1)).current;
  const tabPosition = useRef(new Animated.Value(0)).current;
  const previousSurface = useRef<Surface>('solver');
  const surfaceOpacity = useRef<Record<Surface, Animated.Value>>({
    solver: new Animated.Value(1), block: new Animated.Value(0), week: new Animated.Value(0), source: new Animated.Value(0),
  }).current;
  const surfaceOffset = useRef<Record<Surface, Animated.Value>>({
    solver: new Animated.Value(0), block: new Animated.Value(0), week: new Animated.Value(0), source: new Animated.Value(0),
  }).current;
  const eventId = useRef(0);
  const restoredNotice = useRef(false);
  const suggestedSeeds = useMemo(() => deriveLegacySeeds(legacySessions), [legacySessions]);

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
  const workoutActive = surface === 'solver' && Boolean(progress && progress.pending > 0);
  const tabsShown = !keyboardOpen && (!workoutActive || workoutTabsVisible);

  useEffect(() => {
    Animated.timing(tabReveal, {
      toValue: tabsShown ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [tabReveal, tabsShown]);

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
      return;
    }
    setEditingSource(false);
    setSurface('block');
    notify({
      tone: 'success',
      title: first ? `compiled block v${outcome.state.block?.version}` : `recompiled → block v${outcome.state.block?.version}`,
      message: first ? 'Your first six weeks are ready.' : outcome.state.lastBlockDiff.join(' · '),
      action: { label: 'solver()', run: () => setSurface('solver') },
    });
  }, [apply, notify, state.source]);

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
      <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {line}
        <SourceIntake mode="first" user={user} initial={null} suggestedSeeds={suggestedSeeds} onSubmit={compile} />
        <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void onLogout()} style={[styles.signOut, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <Txt variant="caption" tone="muted">Not you? Sign out</Txt>
        </Pressable>
      </KeyboardAvoidingView>
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
            workoutTabsVisible={workoutTabsVisible}
            onToggleWorkoutTabs={() => setWorkoutTabsVisible((visible) => !visible)}
            onOpenSource={() => go('source')} onOpenWeek={() => go('week')}
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
          pointerEvents={surface === 'source' ? 'auto' : 'none'}
          accessibilityElementsHidden={surface !== 'source'}
          importantForAccessibility={surface === 'source' ? 'auto' : 'no-hide-descendants'}
          style={[styles.surfaceLayer, surface === 'source' && styles.surfaceActive, { opacity: surfaceOpacity.source, transform: [{ translateX: surfaceOffset.source }] }]}
        >
          {editingSource ? (
            <SourceIntake mode="edit" user={user} initial={state.source} blockVersion={state.block.version} suggestedSeeds={suggestedSeeds} sessionActive={inSession} onSubmit={compile} onCancel={() => setEditingSource(false)} />
          ) : (
            <SourceSurface state={state} sync={sync} onEdit={() => setEditingSource(true)} onLogout={onLogout} />
          )}
        </Animated.View>
      </View>

      <Animated.View
        accessibilityRole="tablist"
        pointerEvents={tabsShown ? 'auto' : 'none'}
        onLayout={(event) => setTabBarWidth(event.nativeEvent.layout.width)}
        style={[
          styles.tabs,
          {
            paddingBottom: tabReveal.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(insets.bottom, space.sm)] }),
            height: tabReveal.interpolate({ inputRange: [0, 1], outputRange: [0, 60 + Math.max(insets.bottom, space.sm)] }),
            opacity: tabReveal,
            transform: [{ translateY: tabReveal.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
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
  tabs: { position: 'relative', flexDirection: 'row', overflow: 'hidden', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  tabIndicator: { position: 'absolute', zIndex: 2, top: 0, left: 0, height: 3, backgroundColor: colors.accent },
  tab: { zIndex: 1, flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: space.sm },
  pressed: { opacity: 0.7 },
  liveDot: { position: 'absolute', top: -2, right: -6, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning, borderWidth: 1, borderColor: colors.surface },
  signOut: { alignItems: 'center', justifyContent: 'center', minHeight: TOUCH, paddingTop: space.sm },
});
