import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  Animated,
  ActivityIndicator,
  LayoutAnimation,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFabAction } from '../contexts/FabActionContext';

// ─── Theme ────────────────────────────────────────────────────────────────────

const BG = ['#07091C', '#0B0E22', '#0F1228'] as const;

const C = {
  bg:           '#07091C',
  card:         '#0E1225',
  surface:      '#131728',
  accent:       '#6C63FF',
  accentDim:    'rgba(108,99,255,0.14)',
  accentBorder: 'rgba(108,99,255,0.3)',
  success:      '#00F5A0',
  successDim:   'rgba(0,245,160,0.1)',
  warn:         '#FFC442',
  text:         '#FFFFFF',
  textSub:      '#B8BEDC',
  textMuted:    '#6B7194',
  border:       'rgba(255,255,255,0.06)',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type MacroKey = 'protein' | 'carbs' | 'fat' | 'fiber';

type ScannedMeal = {
  id: string;
  imageUri: string;
  name: string;
  calories: number;
  macros: Record<MacroKey, number>;
  scannedAt: string; // ISO string for JSON serialization
  confidence: number;
};

type DayLog = {
  dateStr: string;   // YYYY-MM-DD
  label: string;     // "Yesterday", "Mon Mar 4", etc.
  meals: ScannedMeal[];
};

const MACRO_CONFIG: { key: MacroKey; label: string; color: string; unit: string }[] = [
  { key: 'protein', label: 'Protein', color: '#6C63FF', unit: 'g' },
  { key: 'carbs',   label: 'Carbs',   color: '#00F5A0', unit: 'g' },
  { key: 'fat',     label: 'Fat',     color: '#FFC442', unit: 'g' },
  { key: 'fiber',   label: 'Fiber',   color: '#4EA8DE', unit: 'g' },
];

// ─── Storage helpers ──────────────────────────────────────────────────────────

const storageKey = (dateStr: string) => `diet:meals:${dateStr}`;

const todayDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDateLabel = (dateStr: string): string => {
  const today = todayDateStr();
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const [y, m, day] = dateStr.split('-').map(Number);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const d = new Date(y, m - 1, day);
  return `${DAYS[d.getDay()]} ${MONTHS[m - 1]} ${day}`;
};

async function loadMealsForDate(dateStr: string): Promise<ScannedMeal[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(dateStr));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveMealsForDate(dateStr: string, meals: ScannedMeal[]): Promise<void> {
  try {
    // Keep an index of all days that have meals
    const indexRaw = await AsyncStorage.getItem('diet:days_index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    if (!index.includes(dateStr)) {
      index.push(dateStr);
      index.sort((a, b) => b.localeCompare(a)); // newest first
      await AsyncStorage.setItem('diet:days_index', JSON.stringify(index));
    }
    await AsyncStorage.setItem(storageKey(dateStr), JSON.stringify(meals));
  } catch { /* silent */ }
}

async function removeDayFromIndex(dateStr: string): Promise<void> {
  try {
    const indexRaw = await AsyncStorage.getItem('diet:days_index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    const updated = index.filter((d) => d !== dateStr);
    await AsyncStorage.setItem('diet:days_index', JSON.stringify(updated));
    await AsyncStorage.removeItem(storageKey(dateStr));
  } catch { /* silent */ }
}

async function loadAllPastDays(todayStr: string): Promise<DayLog[]> {
  try {
    const indexRaw = await AsyncStorage.getItem('diet:days_index');
    const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    const pastDates = index.filter((d) => d < todayStr);
    const logs: DayLog[] = [];
    for (const dateStr of pastDates) {
      const meals = await loadMealsForDate(dateStr);
      if (meals.length > 0) {
        logs.push({ dateStr, label: formatDateLabel(dateStr), meals });
      }
    }
    return logs;
  } catch {
    return [];
  }
}

// ─── Mock analysis (replace with real API) ────────────────────────────────────

async function analyzeMealImage(_uri: string): Promise<Omit<ScannedMeal, 'id' | 'imageUri' | 'scannedAt'>> {
  await new Promise((r) => setTimeout(r, 1800));
  const meals = [
    { name: 'Grilled Chicken & Rice', calories: 520, macros: { protein: 45, carbs: 52, fat: 9,  fiber: 3 }, confidence: 0.91 },
    { name: 'Mixed Salad with Salmon', calories: 380, macros: { protein: 32, carbs: 18, fat: 16, fiber: 6 }, confidence: 0.87 },
    { name: 'Oatmeal with Berries',    calories: 310, macros: { protein: 12, carbs: 55, fat: 6,  fiber: 8 }, confidence: 0.89 },
    { name: 'Beef Stir Fry',           calories: 610, macros: { protein: 38, carbs: 48, fat: 22, fiber: 4 }, confidence: 0.84 },
    { name: 'Greek Yogurt Bowl',       calories: 290, macros: { protein: 20, carbs: 32, fat: 8,  fiber: 2 }, confidence: 0.92 },
  ];
  return meals[Math.floor(Math.random() * meals.length)];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const MacroBar: React.FC<{ label: string; value: number; unit: string; color: string; total: number }> = ({
  label, value, unit, color, total,
}) => {
  const pct = total > 0 ? Math.min(value / total, 1) : 0;
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(widthAnim, { toValue: pct, useNativeDriver: false, friction: 8, tension: 60 }).start();
  }, [pct]);

  return (
    <View style={mb.macroRow}>
      <View style={mb.macroLabelRow}>
        <Text style={mb.macroLabel}>{label}</Text>
        <Text style={[mb.macroValue, { color }]}>{value}{unit}</Text>
      </View>
      <View style={mb.macroTrack}>
        <Animated.View
          style={[mb.macroFill, { backgroundColor: color, width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
        />
      </View>
    </View>
  );
};

const mb = StyleSheet.create({
  macroRow:      { marginBottom: 10 },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  macroLabel:    { fontSize: 13, color: C.textSub },
  macroValue:    { fontSize: 13, fontWeight: '600' },
  macroTrack:    { height: 4, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' },
  macroFill:     { height: '100%', borderRadius: 2 },
});

// ─── Meal Card ────────────────────────────────────────────────────────────────

const MealCard: React.FC<{ meal: ScannedMeal; onDelete: (id: string) => void; compact?: boolean }> = ({
  meal, onDelete, compact = false,
}) => {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(fadeAnim,  { toValue: 1, useNativeDriver: true, friction: 8 }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8 }),
    ]).start();
  }, []);

  const totalMacros    = MACRO_CONFIG.reduce((s, m) => s + meal.macros[m.key], 0);
  const time           = new Date(meal.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const confidencePct  = Math.round(meal.confidence * 100);

  return (
    <Animated.View style={[styles.card, compact && styles.cardCompact, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {!compact && <Image source={{ uri: meal.imageUri }} style={styles.cardImage} />}
      {!compact && <LinearGradient colors={['transparent', 'rgba(7,9,28,0.95)']} style={styles.cardImageOverlay} />}

      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{meal.name}</Text>
            <Text style={styles.cardTime}>{time}</Text>
          </View>
          <View style={styles.cardMeta}>
            <Text style={styles.cardCalories}>{meal.calories}</Text>
            <Text style={styles.cardCalLabel}>kcal</Text>
          </View>
        </View>

        <View style={styles.confidenceBadge}>
          <Ionicons name="sparkles" size={11} color={confidencePct >= 85 ? C.success : C.warn} />
          <Text style={[styles.confidenceText, { color: confidencePct >= 85 ? C.success : C.warn }]}>
            {confidencePct}% match
          </Text>
        </View>

        {!compact && (
          <View style={styles.macrosBlock}>
            {MACRO_CONFIG.map((m) => (
              <MacroBar key={m.key} label={m.label} value={meal.macros[m.key]} unit={m.unit} color={m.color} total={totalMacros} />
            ))}
          </View>
        )}

        {compact && (
          <View style={styles.compactMacros}>
            {MACRO_CONFIG.map((m) => (
              <Text key={m.key} style={[styles.compactMacroText, { color: m.color }]}>
                {meal.macros[m.key]}{m.unit} {m.label}
              </Text>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(meal.id)} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={14} color={C.textMuted} />
          <Text style={styles.deleteBtnText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

// ─── Scanning Overlay ─────────────────────────────────────────────────────────

const ScanningOverlay: React.FC<{ imageUri: string }> = ({ imageUri }) => {
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.scanOverlay}>
      <Animated.View style={[styles.scanImageWrap, { transform: [{ scale: pulseAnim }] }]}>
        <Image source={{ uri: imageUri }} style={styles.scanImage} />
        <LinearGradient colors={['rgba(108,99,255,0.15)', 'transparent', 'rgba(108,99,255,0.15)']} style={styles.scanGradientOverlay} />
        <Animated.View
          style={[styles.scanLine, { transform: [{ translateY: scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 160] }) }] }]}
        />
      </Animated.View>
      <ActivityIndicator size="small" color={C.accent} style={{ marginTop: 16 }} />
      <Text style={styles.scanningText}>Analyzing meal...</Text>
    </View>
  );
};

// ─── Daily Summary ────────────────────────────────────────────────────────────

const DailySummary: React.FC<{ meals: ScannedMeal[] }> = ({ meals }) => {
  const totalCal = meals.reduce((s, m) => s + m.calories, 0);
  const totals: Record<MacroKey, number> = { protein: 0, carbs: 0, fat: 0, fiber: 0 };
  meals.forEach((m) => {
    (Object.keys(totals) as MacroKey[]).forEach((k) => { totals[k] += m.macros[k]; });
  });

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Today's Totals</Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalCal}</Text>
          <Text style={styles.summaryLabel}>kcal</Text>
        </View>
        {MACRO_CONFIG.map((m) => (
          <View key={m.key} style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: m.color }]}>{totals[m.key]}g</Text>
            <Text style={styles.summaryLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ─── Past Day Section ─────────────────────────────────────────────────────────

const PastDaySection: React.FC<{ log: DayLog; onDelete: (dateStr: string, mealId: string) => void }> = ({
  log, onDelete,
}) => {
  const [expanded, setExpanded] = useState(false);
  const totalCal = log.meals.reduce((s, m) => s + m.calories, 0);

  return (
    <View style={styles.pastDay}>
      <TouchableOpacity
        style={styles.pastDayHeader}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setExpanded((v) => !v);
        }}
        activeOpacity={0.8}
      >
        <View>
          <Text style={styles.pastDayLabel}>{log.label}</Text>
          <Text style={styles.pastDayMeta}>{log.meals.length} meal{log.meals.length !== 1 ? 's' : ''} · {totalCal} kcal</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
      </TouchableOpacity>

      {expanded && log.meals.map((meal) => (
        <MealCard
          key={meal.id}
          meal={meal}
          compact
          onDelete={(id) => onDelete(log.dateStr, id)}
        />
      ))}
    </View>
  );
};

// ─── Empty State ──────────────────────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <View style={styles.empty}>
    <View style={styles.emptyIconWrap}>
      <Ionicons name="scan-outline" size={40} color={C.accent} />
    </View>
    <Text style={styles.emptyTitle}>No meals scanned</Text>
    <Text style={styles.emptySubtitle}>Tap the scan button below to log your first meal</Text>
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

export const DietScreen: React.FC = () => {
  const { setFabAction } = useFabAction();
  const currentDate = todayDateStr();

  const [todayMeals, setTodayMeals] = useState<ScannedMeal[]>([]);
  const [pastDays,   setPastDays]   = useState<DayLog[]>([]);
  const [scanning,   setScanning]   = useState<{ imageUri: string } | null>(null);
  const [loaded,     setLoaded]     = useState(false);

  // ── Load from storage on mount ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [today, past] = await Promise.all([
        loadMealsForDate(currentDate),
        loadAllPastDays(currentDate),
      ]);
      setTodayMeals(today);
      setPastDays(past);
      setLoaded(true);
    })();
  }, []);

  // ── Persist today's meals whenever they change ─────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    saveMealsForDate(currentDate, todayMeals);
  }, [todayMeals, loaded]);

  // ── Scanner ────────────────────────────────────────────────────────────────
  const openScanner = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Permission', 'Camera access is needed to scan meals.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const imageUri = result.assets[0].uri;
    setScanning({ imageUri });

    try {
      const analysis = await analyzeMealImage(imageUri);
      const meal: ScannedMeal = {
        id: Date.now().toString(),
        imageUri,
        scannedAt: new Date().toISOString(),
        ...analysis,
      };
      setTodayMeals((prev) => [meal, ...prev]);
    } catch {
      Alert.alert('Scan Failed', 'Could not analyze the meal. Please try again.');
    } finally {
      setScanning(null);
    }
  }, []);

  // ── Delete handlers ────────────────────────────────────────────────────────
  const deleteTodayMeal = useCallback((id: string) => {
    setTodayMeals((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const deletePastMeal = useCallback(async (dateStr: string, mealId: string) => {
    const existing = await loadMealsForDate(dateStr);
    const updated  = existing.filter((m) => m.id !== mealId);
    if (updated.length === 0) {
      await removeDayFromIndex(dateStr);
      setPastDays((prev) => prev.filter((d) => d.dateStr !== dateStr));
    } else {
      await saveMealsForDate(dateStr, updated);
      setPastDays((prev) =>
        prev.map((d) => d.dateStr === dateStr ? { ...d, meals: updated } : d)
      );
    }
  }, []);

  // ── FAB ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    setFabAction('Diet', {
      label: 'Scan',
      icon: '⊙',
      colors: ['#6C63FF', '#4A43CC'] as const,
      iconColor: '#FFFFFF',
      labelColor: '#FFFFFF',
      onPress: openScanner,
    });
    return () => setFabAction('Diet', null);
  }, [openScanner, setFabAction]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <LinearGradient colors={BG} style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Diet</Text>
        {todayMeals.length > 0 && (
          <Text style={styles.headerSub}>{todayMeals.length} meal{todayMeals.length !== 1 ? 's' : ''} today</Text>
        )}
      </View>

      {scanning ? (
        <ScanningOverlay imageUri={scanning.imageUri} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Today */}
          {todayMeals.length > 0 && <DailySummary meals={todayMeals} />}
          {todayMeals.length === 0 && pastDays.length === 0 && <EmptyState />}
          {todayMeals.map((meal) => (
            <MealCard key={meal.id} meal={meal} onDelete={deleteTodayMeal} />
          ))}

          {/* Past days */}
          {pastDays.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.historyTitle}>Previous Days</Text>
              {pastDays.map((log) => (
                <PastDaySection key={log.dateStr} log={log} onDelete={deletePastMeal} />
              ))}
            </View>
          )}

          <View style={{ height: 110 }} />
        </ScrollView>
      )}
    </LinearGradient>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:         { flex: 1 },
  header:       { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  headerTitle:  { fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  headerSub:    { fontSize: 13, color: C.textMuted },
  scroll:       { flex: 1 },
  scrollContent:{ paddingHorizontal: 16, paddingTop: 8 },

  // Summary
  summaryCard:  { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  summaryTitle: { fontSize: 12, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  summaryItem:  { alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '700', color: C.text },
  summaryLabel: { fontSize: 11, color: C.textMuted, marginTop: 2 },

  // Card
  card:              { backgroundColor: C.card, borderRadius: 20, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  cardCompact:       { borderRadius: 14, marginBottom: 8 },
  cardImage:         { width: '100%', height: 180 },
  cardImageOverlay:  { position: 'absolute', left: 0, right: 0, top: 100, height: 80 },
  cardBody:          { padding: 16 },
  cardHeader:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  cardTitle:         { fontSize: 17, fontWeight: '700', color: C.text },
  cardTime:          { fontSize: 12, color: C.textMuted, marginTop: 2 },
  cardMeta:          { alignItems: 'flex-end', marginLeft: 8 },
  cardCalories:      { fontSize: 26, fontWeight: '800', color: C.text },
  cardCalLabel:      { fontSize: 11, color: C.textMuted },
  confidenceBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  confidenceText:    { fontSize: 12, fontWeight: '600' },
  macrosBlock:       { marginBottom: 12 },
  compactMacros:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  compactMacroText:  { fontSize: 11, fontWeight: '600' },
  deleteBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end' },
  deleteBtnText:     { fontSize: 12, color: C.textMuted },

  // Scanning
  scanOverlay:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  scanImageWrap:       { width: 240, height: 180, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: C.accent },
  scanImage:           { width: '100%', height: '100%' },
  scanGradientOverlay: { position: 'absolute', inset: 0 } as any,
  scanLine:            { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: C.accent, opacity: 0.8 },
  scanningText:        { marginTop: 10, color: C.textSub, fontSize: 14 },

  // History
  historySection: { marginTop: 8 },
  historyTitle:   { fontSize: 12, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  pastDay:        { backgroundColor: C.card, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  pastDayHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  pastDayLabel:   { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  pastDayMeta:    { fontSize: 12, color: C.textMuted },

  // Empty
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyIconWrap:  { width: 80, height: 80, borderRadius: 40, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:     { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 8 },
  emptySubtitle:  { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
});
