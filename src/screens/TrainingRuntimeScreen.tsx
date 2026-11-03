import { saveWeightSettings } from '../runtime/weights';
import { WeightSettingsContext } from './runtime/WeightSettings';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { User } from '../types/domain';
import { createRuntimeId, getRuntimeWeekView } from '../runtime';
import type { TrainingSource } from '../runtime';
import { colors, space } from './runtime/theme';
import { Banner, Button, ChromeContext, ScreenBrand, Txt } from './runtime/ui';
import { EmptyToday } from './runtime/EmptyToday';
import { NewWorkoutSheet } from './runtime/NewWorkoutSheet';
import { describeRuntimeError, goalLabel } from './runtime/copy';
import { DUMBBELLS, FULL_GYM, Notify, Surface } from './runtime/constants';
import { EventLine, RuntimeEvent } from './runtime/EventLog';
import { sessionProgress } from './runtime/selectors';
import { useRuntimeController } from './runtime/useRuntimeController';
import { AccountSurface } from './runtime/AccountSurface';
import { PlanSurface } from './runtime/PlanSurface';
import { TodayPlanContext } from './runtime/TodayPlanContext';
import { TodaySurface } from './runtime/TodaySurface';
import { WorkoutRestDock, type WorkoutDockState } from './runtime/WorkoutTimers';
import { WeekSurface } from './runtime/WeekSurface';
import { useMonoFonts } from './runtime/fonts';
import { useLayoutMotion } from './runtime/useLayoutMotion';
import { AthleteLoadingScreen } from '../components/AthleteBackdrop';

type Props = {
  user: User;
  onSaveProfile: (profile: User) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  onDeleteAccount: () => void | Promise<void>;
};

const TABS: Array<{ key: Surface; label: string; spoken: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap; hint: string }> = [
  { key: 'solver', label: 'Today', spoken: 'Today’s workout', icon: 'barbell-outline', iconOn: 'barbell', hint: "Today's workout, fitted to current conditions" },
  { key: 'block', label: 'Plan', spoken: 'My training plan', icon: 'layers-outline', iconOn: 'layers', hint: 'Your training plan' },
  { key: 'week', label: 'Progress', spoken: 'Training progress', icon: 'stats-chart-outline', iconOn: 'stats-chart', hint: "This week's dose and fatigue" },
  { key: 'account', label: 'Profile', spoken: 'Profile settings', icon: 'person-circle-outline', iconOn: 'person-circle', hint: 'Account and global preferences' },
];
const SURFACE_INDEX: Record<Surface, number> = { solver: 0, block: 1, week: 2, account: 3 };

const EmptyTrainingSurface = ({ title, message }: { title: string; message: string }) => (
  <View style={{ flex: 1, padding: space.lg, gap: space.lg }}>
    <ScreenBrand name={title} />
    <Txt tone="muted">{message}</Txt>
  </View>
);

export const TrainingRuntimeScreen = ({ user, onSaveProfile, onLogout, onDeleteAccount }: Props) => {
  const insets = useSafeAreaInsets();
  const fontsReady = useMonoFonts();
  const { reduced } = useLayoutMotion();
  const { state, loading: stateLoading, loadError, reload, sync, apply, retrySync, restoreCloud } = useRuntimeController(user.id);
  const loading = stateLoading || !fontsReady;
  const [surface, setSurface] = useState<Surface>('solver');
  const [quickWorkoutOpen, setQuickWorkoutOpen] = useState(false);
  const visibleTabs = TABS;
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [fresh, setFresh] = useState<{ id: number; action?: { label: string; run: () => void } } | null>(null);
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [workoutDock, setWorkoutDock] = useState<WorkoutDockState | null>(null);
  const tabReveal = useRef(new Animated.Value(1)).current;
  const dockTransition = useRef(new Animated.Value(0)).current;
  const previousSurface = useRef<Surface>('solver');
  const surfaceOpacity = useRef<Record<Surface, Animated.Value>>({
    solver: new Animated.Value(1), block: new Animated.Value(0), week: new Animated.Value(0), account: new Animated.Value(0),
  }).current;
  const surfaceOffset = useRef<Record<Surface, Animated.Value>>({
    solver: new Animated.Value(0), block: new Animated.Value(0), week: new Animated.Value(0), account: new Animated.Value(0),
  }).current;
  const eventId = useRef(0);
  const restoredNotice = useRef(false);
  const defaultSource = useMemo<TrainingSource>(() => {
    const preferences = user.planPreferences;
    const preferredDays = preferences?.daysPerWeek;
    const fallbackDays = user.trainingSplit === 'upper_lower' ? 4 : user.trainingSplit === 'push_pull_legs' || user.trainingSplit === 'bro_split' ? 5 : 3;
    const days: 3 | 4 | 5 = preferredDays === 3 ? 3 : preferredDays === 4 ? 4 : preferredDays ? 5 : fallbackDays;
    const equipment = preferences?.equipmentLevel === 'dumbbells' ? DUMBBELLS : FULL_GYM;
    return {
      id: createRuntimeId(),
      userId: user.id,
      version: 1,
      goal: preferences?.primaryGoal === 'get_stronger' ? 'strength' : preferences?.primaryGoal === 'lose_fat' ? 'fat_loss' : preferences?.primaryGoal === 'general_fitness' ? 'general' : 'hypertrophy',
      experience: user.experienceLevel === 'advanced' ? 'advanced' : 'intermediate',
      daysPerWeek: days,
      sessionMinutes: preferences?.sessionMinutes ?? 60,
      equipment,
      excludedExerciseIds: [],
      limitations: preferences?.injuries ?? [],
      seedWorkingSets: [],
      createdAt: new Date().toISOString(),
    };
  }, [user.experienceLevel, user.id, user.planPreferences, user.trainingSplit]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Keep the event trail; routine success messages only occupy Today while fresh.
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
  const inSession = Boolean(state.activeSession?.startedAt || state.activeSession?.exercises.some(entry=>entry.sets.some(set=>set.result)));
  const showDock = !keyboardOpen && surface === 'solver' && inSession && Boolean(workoutDock);
  const bottomVisible = !keyboardOpen;

  useEffect(() => {
    if (!visibleTabs.some(tab => tab.key === surface)) setSurface('solver');
  }, [surface, visibleTabs]);

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
      duration: reduced ? 0 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [dockTransition, showDock, reduced]);

  useEffect(() => {
    const previous = previousSurface.current;
    const direction = SURFACE_INDEX[surface] >= SURFACE_INDEX[previous] ? 1 : -1;

    if (previous === surface) return;
    surfaceOpacity[surface].stopAnimation();
    surfaceOffset[surface].stopAnimation();
    surfaceOpacity[previous].stopAnimation();
    surfaceOffset[previous].stopAnimation();
    surfaceOpacity[surface].setValue(0);
    surfaceOffset[surface].setValue(direction * 18);
    // An interrupted switch (fast taps, a reload) can leave a third layer part-faded; layers sit on
    // transparent backgrounds, so it would show through the active tab. Hide every uninvolved layer.
    (Object.keys(surfaceOpacity) as Surface[]).forEach((key) => {
      if (key === surface || key === previous) return;
      surfaceOpacity[key].stopAnimation();
      surfaceOpacity[key].setValue(0);
      surfaceOffset[key].setValue(0);
    });

    Animated.parallel([
      Animated.timing(surfaceOpacity[previous], { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(surfaceOffset[previous], { toValue: direction * -12, duration: 190, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(surfaceOpacity[surface], { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(surfaceOffset[surface], { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => { surfaceOffset[previous].setValue(0); if (finished) surfaceOpacity[previous].setValue(0); });
    previousSurface.current = surface;
  }, [surface, surfaceOffset, surfaceOpacity]);

  // An active session survives restarts. A completed session needs an explicit reminder because
  // the next action is commit/discard; an in-progress session already identifies itself in set.log.
  useEffect(() => {
    if (loading || restoredNotice.current) return;
    restoredNotice.current = true;
    if (progress?.pending === 0) notify({ tone: 'info', title: 'Workout restored · ready to finish', message: 'The app was closed before you finished your workout. Finish or discard it.' });
  }, [loading, notify, progress]);

  // A session lives in Today: landing there when it starts or is restored. Leaving mid-session is allowed.
  useEffect(() => { if (inSession) setSurface('solver'); }, [inSession]);

  const weekView = useMemo(() => (loading ? null : getRuntimeWeekView(state)), [loading, state]);
  const go = useCallback((next: Surface) => {
    setSurface(next);
  }, []);

  const onSyncPress = () => {
    if (sync === 'conflict') {
      Alert.alert('Training changed on another device',
        'This device has unsynced changes. Loading the cloud version keeps a recovery copy of this device’s training locally.',
        [{ text: 'Keep training here', style: 'cancel' }, { text: 'Load cloud version', onPress: () => {
          void restoreCloud().catch(() => notify({ tone: 'error', title: 'Could not load cloud data. Your device copy is preserved.' }));
        } }]);
      return;
    }
    if (sync === 'device' || sync === 'failed') {
      retrySync();
      notify({ tone: 'info', title: 'retrying save', message: 'Your changes stay on this device in the meantime.' });
    }
  };

  const lastEvent = events[events.length - 1];
  const showEventLine = Boolean(fresh || ((lastEvent?.tone === 'error' || lastEvent?.tone === 'warning') && dismissedId !== lastEvent.id));
  const line = showEventLine ? (
    <EventLine
      events={events}
      fresh={Boolean(fresh && fresh.id === events[events.length - 1]?.id)}
      action={fresh?.action}
      dismissed={dismissedId === events[events.length - 1]?.id}
      onDismiss={() => setDismissedId(events[events.length - 1]?.id ?? null)}
    />
  ) : null;

  // ── Loading and load failure ──
  if (loading) {
    return <AthleteLoadingScreen message="Restoring your training…" />;
  }
  if (loadError) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Banner tone="error" title="Could not load your training" message={`${loadError} Nothing was changed or deleted.`} />
        <Button label="Try again" onPress={reload} icon="refresh" />
        <Button label="Sign out" variant="secondary" onPress={() => void onLogout()} />
      </View>
    );
  }

  const block = weekView?.block ?? state.block;
  const status = weekView?.status;
  const hasTraining = Boolean(state.source && block);
  const chip = state.source && block ? block.kind === 'workout' ? 'Workout log' : `${goalLabel(state.source.goal)} · Week ${block.currentWeek}${block.scheduling ? "" : ` of ${block.durationWeeks}`}` : null;

  return (
    <WeightSettingsContext.Provider value={{unit:state.source?.weightUnit??'kg',ranges:state.source?.weightRanges??{},save:patch=>{
      const outcome=apply(current=>saveWeightSettings(current,defaultSource,patch));
      return outcome.ok?undefined:describeRuntimeError(outcome.error).message;
    }}}>
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
          <TodayPlanContext state={state} defaults={defaultSource} apply={apply} active={surface==='solver'}/>
          {hasTraining ? <TodaySurface key={state.activeSession?.id??state.block?.id}
            state={state} apply={apply} notify={notify} active={surface === 'solver'}
            onDockChange={setWorkoutDock} onNewWorkout={()=>setQuickWorkoutOpen(true)}
            onOpenSource={() => { go('block'); }} onOpenWeek={() => go('week')}
          /> : <EmptyToday onAddRoutine={()=>{go('block');}} onLogWorkout={()=>setQuickWorkoutOpen(true)} />}
          {line?<View pointerEvents="box-none" style={styles.notificationOverlay}><View style={styles.notificationCard}>{line}</View></View>:null}
        </Animated.View>
        <Animated.View
          pointerEvents={surface === 'block' ? 'auto' : 'none'}
          accessibilityElementsHidden={surface !== 'block'}
          importantForAccessibility={surface === 'block' ? 'auto' : 'no-hide-descendants'}
          style={[styles.surfaceLayer, surface === 'block' && styles.surfaceActive, { opacity: surfaceOpacity.block, transform: [{ translateX: surfaceOffset.block }] }]}
        >
          <PlanSurface state={state} defaults={defaultSource} apply={apply} active={surface==='block'} sync={sync}/>
        </Animated.View>
        <Animated.View
          pointerEvents={surface === 'week' ? 'auto' : 'none'}
          accessibilityElementsHidden={surface !== 'week'}
          importantForAccessibility={surface === 'week' ? 'auto' : 'no-hide-descendants'}
          style={[styles.surfaceLayer, surface === 'week' && styles.surfaceActive, { opacity: surfaceOpacity.week, transform: [{ translateX: surfaceOffset.week }] }]}
        >
          {status && block ? <WeekSurface apply={apply} state={state} block={block} status={status} /> : <EmptyTrainingSurface title="Progress" message="No workouts logged" />}
        </Animated.View>
        <Animated.View
          pointerEvents={surface === 'account' ? 'auto' : 'none'}
          accessibilityElementsHidden={surface !== 'account'}
          importantForAccessibility={surface === 'account' ? 'auto' : 'no-hide-descendants'}
          style={[styles.surfaceLayer, surface === 'account' && styles.surfaceActive, { opacity: surfaceOpacity.account, transform: [{ translateX: surfaceOffset.account }] }]}
        >
          <AccountSurface active={surface === 'account'} user={user} state={state} sync={sync}
            onSaveProfile={onSaveProfile} onLogout={onLogout} onDeleteAccount={onDeleteAccount}/>

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
          aria-hidden={showDock}
          accessibilityElementsHidden={showDock}
          importantForAccessibility={showDock ? 'no-hide-descendants' : 'auto'}
          pointerEvents={showDock ? 'none' : 'auto'}
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
          {visibleTabs.map((tab) => {
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
          aria-hidden={!showDock}
          accessibilityElementsHidden={!showDock}
          importantForAccessibility={showDock ? 'auto' : 'no-hide-descendants'}
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
          {workoutDock ? <WorkoutRestDock dock={workoutDock}/> : null}
        </Animated.View>
      </Animated.View>
      {quickWorkoutOpen?<NewWorkoutSheet state={state} defaults={defaultSource} apply={apply}
        onClose={()=>setQuickWorkoutOpen(false)} onStarted={()=>{setQuickWorkoutOpen(false);go('solver');}}/>:null}
    </KeyboardAvoidingView>
    </ChromeContext.Provider>
    </WeightSettingsContext.Provider>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.ground },
  center: { flex: 1, alignItems: 'stretch', justifyContent: 'center', gap: space.lg, padding: space.xl, backgroundColor: colors.ground },
  notificationOverlay: { position: 'absolute', top: 8, left: 12, right: 12, zIndex: 20 },
  notificationCard: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  surfaceStage: { flex: 1, position: 'relative', overflow: 'hidden' },
  surfaceLayer: { ...StyleSheet.absoluteFillObject },
  surfaceActive: { zIndex: 1 },
  bottomStage: { position: 'relative', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  bottomLayer: { ...StyleSheet.absoluteFillObject },
  tabsLayer: { flexDirection: 'row', backgroundColor: colors.surface },
  dockLayer: { justifyContent: 'center', backgroundColor: colors.surface, paddingHorizontal: space.lg },
  tab: { zIndex: 1, flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: space.sm },
  pressed: { opacity: 0.7 },
  liveDot: { position: 'absolute', top: -2, right: -6, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning, borderWidth: 1, borderColor: colors.surface },
});
