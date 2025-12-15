import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
  Modal,
  Dimensions,
  Pressable,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  PhasePlan,
  WorkoutLog,
  ProgressEstimate,
  StrengthSnapshot,
  WorkoutSessionEntry,
  WorkoutSessionExercise,
  DailyConsistencyLog,
  MuscleGroup,
} from '../types/domain';
import { useHomeScreenData } from '../hooks/useHomeScreenData';
import { useTodayMeals } from '../hooks/useTodayMeals';
import { useWorkoutSessions } from '../hooks/useWorkoutSessions';
import { MealEntry } from '../services/supabaseMealService';
import { getBodyPartLabel } from '../utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MEAL_TYPE_EMOJI: Record<string, string> = {
  Breakfast: '🥚',
  Lunch: '🥗',
  Dinner: '🍽️',
};

// Updated muscle tag colors for better visibility
const MUSCLE_TAG_COLORS: Record<string, string> = {
  chest: 'rgba(108, 99, 255, 0.15)',
  back: 'rgba(108, 99, 255, 0.15)',
  legs: 'rgba(108, 99, 255, 0.15)',
  shoulders: 'rgba(108, 99, 255, 0.15)',
  arms: 'rgba(108, 99, 255, 0.15)',
  core: 'rgba(108, 99, 255, 0.15)',
};

const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'];

const getMealTypeEmoji = (mealType: string): string => {
  const key = mealType.trim();
  if (MEAL_TYPE_EMOJI[key]) return MEAL_TYPE_EMOJI[key];
  const normalized = key.toLowerCase();
  if (normalized.includes('snack')) return '🥗';
  if (normalized.includes('pre')) return '⚡';
  return '🍽️';
};

const CARD_GRADIENT_DEFAULT = ['rgba(30, 35, 64, 0.8)', 'rgba(21, 25, 50, 0.6)'];
const CARD_GRADIENT_COMPLETE = ['rgba(0, 245, 160, 0.15)', 'rgba(0, 214, 143, 0.1)'];
const ACTIVITY_TOTAL_DAYS = 84;
const DAYS_PER_ACTIVITY_COLUMN = 7;

const getMuscleTagColor = (muscles: MuscleGroup[]): string => {
  return 'rgba(108, 99, 255, 0.15)';
};

const formatBodyPartList = (parts: MuscleGroup[]): string => {
  if (!parts.length) return 'Full Body';
  return parts.map((part) => getBodyPartLabel(part)).join(' • ');
};

const getGreetingMessage = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

type ActivityCell = {
  date: Date;
  iso: string;
  count: number;
  level: number;
  isToday: boolean;
};

const formatMealMacros = (entry: MealEntry): string => {
  const parts: string[] = [];
  if (typeof entry.calories === 'number') parts.push(`${entry.calories} kcal`);
  if (typeof entry.protein === 'number') parts.push(`P${entry.protein}g`);
  if (typeof entry.carbs === 'number') parts.push(`C${entry.carbs}g`);
  if (typeof entry.fats === 'number') parts.push(`F${entry.fats}g`);
  return parts.length ? parts.join(' · ') : 'Macros TBD';
};

type DashboardScreenProps = {
  user: User;
  phase: PhasePlan | null;
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
  workoutSessions: WorkoutSessionEntry[];
  progressEstimate: ProgressEstimate | null;
  onProfilePress?: () => void;
  onStartPhase?: () => void;
  onToggleWorkoutExercise?: (date: string, exerciseName: string) => void;
  onMarkConsistent?: (log: DailyConsistencyLog) => void;
  onCreateSession?: (date: string) => void;
};

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  user,
  phase,
  workoutSessions,
  progressEstimate,
  onProfilePress,
  onStartPhase,
  onToggleWorkoutExercise,
  onCreateSession,
}) => {
  const { data: homeData } = useHomeScreenData(user.id);
  const derivedPhaseId = phase?.id ?? homeData?.phase?.id;
  const { sessions: phaseSessions } = useWorkoutSessions(user.id, derivedPhaseId);
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'workouts' | 'meals'>('workouts');
  
  const resolvedPhase = phase ?? homeData?.phase ?? null;
  const resolvedSessions = phaseSessions.length
    ? phaseSessions
    : workoutSessions.length
    ? workoutSessions
    : homeData?.recentSessions ?? [];
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const storedSession =
    resolvedPhase &&
    resolvedSessions.find(
      (session) => session.phasePlanId === resolvedPhase.id && session.date === todayStr
    );
  const todaySession = storedSession && storedSession.exercises.length ? storedSession : null;
  const displayExercises = todaySession?.exercises ?? [];
  
  const hasSyncedWorkout = displayExercises.length > 0;
  const greetingMessage = getGreetingMessage();
  const displayName = user?.name || 'Athlete';
  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const activityCells = useMemo<ActivityCell[]>(() => {
    const counts: Record<string, number> = {};
    resolvedSessions.forEach((session) => {
      if (!session.date) return;
      counts[session.date] = (counts[session.date] || 0) + 1;
    });
    const now = new Date();
    const cells: ActivityCell[] = [];
    for (let i = ACTIVITY_TOTAL_DAYS - 1; i >= 0; i -= 1) {
      const cellDate = new Date(now);
      cellDate.setDate(now.getDate() - i);
      const iso = cellDate.toISOString().split('T')[0];
      const count = counts[iso] || 0;
      cells.push({
        date: cellDate,
        iso,
        count,
        level: Math.min(3, count),
        isToday: i === 0,
      });
    }
    return cells;
  }, [resolvedSessions]);

  const activityColumns = useMemo(() => {
    const columns: ActivityCell[][] = [];
    for (let i = 0; i < activityCells.length; i += DAYS_PER_ACTIVITY_COLUMN) {
      columns.push(activityCells.slice(i, i + DAYS_PER_ACTIVITY_COLUMN));
    }
    return columns;
  }, [activityCells]);

  const getActivityLevelStyle = (level: number) => {
    if (level >= 3) return styles.activityLevel3;
    if (level === 2) return styles.activityLevel2;
    if (level === 1) return styles.activityLevel1;
    return styles.activityLevel0;
  };

  const {
    dailyMeal,
    mealsByType,
    isLoading: isMealsLoading,
    isMutating: isMealsMutating,
    error: todayMealsError,
    toggleDayCompleted,
  } = useTodayMeals(phase ? user.id : undefined, today, Boolean(phase));
  
  const hasDailyMeal = Boolean(dailyMeal);
  const totalMealEntries = Object.values(mealsByType).reduce(
    (sum, entries) => sum + entries.length,
    0
  );
  const dayMealsCompleted = Boolean(dailyMeal?.completed);
  
  const allMealTypes = useMemo(() => {
    const dynamicTypes = Object.keys(mealsByType).filter((type) => !!type);
    const ordered = [...DEFAULT_MEAL_TYPES];
    dynamicTypes.forEach((type) => {
      if (!ordered.includes(type)) {
        ordered.push(type);
      }
    });
    return ordered;
  }, [mealsByType]);

  const weeksIntoPhase = Math.max(1, Math.floor((progressEstimate?.daysActive || 0) / 7) + 1);
  const canLogWorkouts = !!phase && !!onToggleWorkoutExercise;

  const enhancedExercises = displayExercises.map((exercise) => ({
    ...exercise,
    setCount: exercise.sets || 4,
    repRange: exercise.reps || '8-10',
  }));
  
  const completedExercises = enhancedExercises.filter((e) => e.completed);
  const pendingExercises = enhancedExercises.filter((e) => !e.completed);
  const visibleWorkoutCards = canLogWorkouts
    ? [...pendingExercises, ...completedExercises]
    : enhancedExercises;
  
  const totalWorkoutCount = enhancedExercises.length;
  const completedWorkoutCount = completedExercises.length;
  const allWorkoutsCompleted = totalWorkoutCount > 0 && completedWorkoutCount === totalWorkoutCount;

  const totalMealCount = hasDailyMeal ? allMealTypes.length : 0;
  const completedMealCount = dayMealsCompleted ? totalMealCount : 0;
  const allMealsCompleted = totalMealCount > 0 && dayMealsCompleted;

  const handleCompleteExercise = (exerciseName: string) => {
    if (canLogWorkouts && onToggleWorkoutExercise) {
      onToggleWorkoutExercise(todayStr, exerciseName);
    }
  };

  const renderMealGroup = (mealType: string) => {
    const entries = mealsByType[mealType] ?? [];
    return (
      <LinearGradient
        key={mealType}
        colors={CARD_GRADIENT_DEFAULT}
        style={styles.mealCard}
      >
        <View style={styles.mealCardHeader}>
          <Text style={styles.mealEmoji}>{getMealTypeEmoji(mealType)}</Text>
          <View style={styles.mealInfo}>
            <Text style={styles.mealName}>{mealType}</Text>
            <Text style={styles.mealMeta}>
              {entries.length ? `${entries.length} item${entries.length > 1 ? 's' : ''}` : 'No items'}
            </Text>
          </View>
        </View>
        {entries.length === 0 ? (
          <Text style={styles.mealEmptyText}>Add from Menu tab</Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.mealEntry}>
              <Text style={styles.mealEntryName}>{entry.foodName}</Text>
              <Text style={styles.mealEntryMacros}>{formatMealMacros(entry)}</Text>
            </View>
          ))
        )}
      </LinearGradient>
    );
  };

  const handleCompleteAll = () => {
    if (activeTab === 'workouts') {
      pendingExercises.forEach((exercise) => handleCompleteExercise(exercise.name));
    } else if (!dayMealsCompleted) {
      toggleDayCompleted?.(true);
    }
  };

  const renderWorkoutsSection = () => (
    <View style={styles.section}>
      {!hasSyncedWorkout ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>No workout scheduled</Text>
          <Text style={styles.emptyText}>Start a session when ready to train.</Text>
          {onCreateSession && (
            <TouchableOpacity style={styles.startButton} onPress={() => onCreateSession(todayStr)}>
              <Text style={styles.startButtonText}>Start Session</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.cardScrollContainer}>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardScrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {visibleWorkoutCards.map((exercise, index) => {
            const isCompleted = exercise.completed;
            return (
              <LinearGradient
                key={`${todayStr}-${exercise.name}-${index}`}
                colors={isCompleted ? CARD_GRADIENT_COMPLETE : CARD_GRADIENT_DEFAULT}
                style={[styles.exerciseCard, isCompleted && styles.exerciseCardCompleted]}
              >
                {isCompleted && <View style={styles.completedTopBar} />}
                
                <View style={styles.cardHeader}>
                  <View style={styles.exerciseBadge}>
                    <Text style={styles.exerciseBadgeText}>#{index + 1}</Text>
                  </View>
                  <View style={styles.cardHeaderActions}>
                    {!isCompleted && canLogWorkouts && (
                      <TouchableOpacity
                        style={styles.logSetsButton}
                        onPress={() => handleCompleteExercise(exercise.name)}
                      >
                        <Text style={styles.logSetsButtonText}>Log Sets</Text>
                      </TouchableOpacity>
                    )}
                    {isCompleted && (
                      <View style={styles.completedBadge}>
                        <Text style={styles.completedBadgeText}>✓ Done</Text>
                      </View>
                    )}
                  </View>
                </View>

                <Text style={styles.exerciseName}>{exercise.name}</Text>

                <View style={styles.metaTags}>
                  <View style={styles.metaTag}>
                    <Text style={styles.metaTagText}>{formatBodyPartList(exercise.bodyParts)}</Text>
                  </View>
                  <View style={styles.metaTag}>
                    <Text style={styles.metaTagText}>{exercise.setCount} sets</Text>
                  </View>
                  <View style={styles.metaTag}>
                    <Text style={styles.metaTagText}>{exercise.repRange} reps</Text>
                  </View>
                </View>

                {isCompleted && (
                  <View style={styles.completedHint}>
                    <Text style={styles.completedHintText}>✓ Completed</Text>
                  </View>
                )}
              </LinearGradient>
            );
          })}
          </ScrollView>
        </View>
      )}
    </View>
  );

  const renderMealsSection = () => (
    <View style={styles.section}>
      {!resolvedPhase ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyTitle}>Meals unlock soon</Text>
          <Text style={styles.emptyText}>Complete onboarding first.</Text>
        </View>
      ) : !hasDailyMeal && totalMealEntries === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyTitle}>No meals for today</Text>
          <Text style={styles.emptyText}>Use Menu tab to create meals.</Text>
        </View>
      ) : (
        <View style={styles.cardScrollContainer}>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardScrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {allMealTypes.map((mealType) => renderMealGroup(mealType))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>{greetingMessage},</Text>
              <Text style={styles.userName}>{displayName}</Text>
              <Text style={styles.dateInfo}>
                {dateLabel}
                {resolvedPhase ? ` • Week ${weeksIntoPhase}` : ''}
              </Text>
            </View>
            {onProfilePress && (
              <TouchableOpacity style={styles.settingsButton} onPress={onProfilePress}>
                <Text style={styles.settingsIcon}>⚙️</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Activity Grid */}
          <LinearGradient colors={CARD_GRADIENT_DEFAULT} style={styles.activityCard}>
            <View style={styles.activityHeader}>
              <Text style={styles.activityTitle}>ACTIVITY STREAK</Text>
              <View style={styles.activityLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.activityLevel1]} />
                  <Text style={styles.legendText}>1</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.activityLevel2]} />
                  <Text style={styles.legendText}>2</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.activityLevel3]} />
                  <Text style={styles.legendText}>3+</Text>
                </View>
              </View>
            </View>
            <View style={styles.activityGrid}>
              {activityColumns.map((column, colIdx) => (
                <View key={`col-${colIdx}`} style={styles.activityColumn}>
                  {column.map((cell) => (
                    <View
                      key={cell.iso}
                      style={[
                        styles.activityCell,
                        getActivityLevelStyle(cell.level),
                        cell.isToday && styles.activityCellToday,
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </LinearGradient>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'workouts' && styles.tabActive]}
              onPress={() => setActiveTab('workouts')}
            >
              <Text style={[styles.tabText, activeTab === 'workouts' && styles.tabTextActive]}>
                Workouts
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'meals' && styles.tabActive]}
              onPress={() => setActiveTab('meals')}
            >
              <Text style={[styles.tabText, activeTab === 'meals' && styles.tabTextActive]}>
                Meals
              </Text>
            </TouchableOpacity>
          </View>

          {/* Progress Chip */}
          <View style={styles.progressChip}>
            <View style={styles.progressLeft}>
              <View style={styles.progressDot} />
              <Text style={styles.progressText}>
                {activeTab === 'workouts'
                  ? allWorkoutsCompleted
                    ? 'Workouts complete'
                    : `${completedWorkoutCount}/${totalWorkoutCount} workouts`
                  : allMealsCompleted
                  ? 'Meals logged'
                  : `${completedMealCount}/${totalMealCount} meals`}
              </Text>
            </View>
            {((activeTab === 'workouts' && !allWorkoutsCompleted && totalWorkoutCount > 0) ||
              (activeTab === 'meals' && !allMealsCompleted && totalMealCount > 0)) && (
              <TouchableOpacity style={styles.progressButton} onPress={handleCompleteAll}>
                <Text style={styles.progressButtonText}>
                  {activeTab === 'workouts' ? 'Complete All' : 'Log All'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Content */}
          {activeTab === 'workouts' ? renderWorkoutsSection() : renderMealsSection()}
        </ScrollView>

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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 15,
    color: '#8B93B0',
    marginBottom: 4,
  },
  userName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  dateInfo: {
    fontSize: 15,
    color: '#6C63FF',
    fontWeight: '500',
  },
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    fontSize: 20,
  },
  activityCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.15)',
    marginBottom: 20,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  activityTitle: {
    fontSize: 11,
    color: '#8B93B0',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  activityLegend: {
    flexDirection: 'row',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    color: '#8B93B0',
  },
  activityGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  activityColumn: {
    flex: 1,
    gap: 6,
  },
  activityCell: {
    height: 10,
    borderRadius: 4,
    backgroundColor: 'rgba(108, 99, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.15)',
  },
  activityLevel0: {
    backgroundColor: 'rgba(108, 99, 255, 0.08)',
  },
  activityLevel1: {
    backgroundColor: 'rgba(108, 99, 255, 0.3)',
    borderColor: 'rgba(108, 99, 255, 0.4)',
  },
  activityLevel2: {
    backgroundColor: 'rgba(108, 99, 255, 0.5)',
    borderColor: 'rgba(108, 99, 255, 0.6)',
  },
  activityLevel3: {
    backgroundColor: '#6C63FF',
    borderColor: '#00F5A0',
  },
  activityCellToday: {
    borderWidth: 2,
    borderColor: '#00F5A0',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(30, 35, 64, 0.4)',
    padding: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.15)',
    gap: 12,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: 'rgba(108, 99, 255, 0.3)',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8B93B0',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  progressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    paddingLeft: 18,
    backgroundColor: 'rgba(30, 35, 64, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(139, 147, 176, 0.3)',
    borderRadius: 20,
    marginBottom: 20,
  },
  progressLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6C63FF',
  },
  progressText: {
    fontSize: 13,
    color: '#8B93B0',
    fontWeight: '500',
  },
  section: {
    gap: 16,
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    padding: 32,
    alignItems: 'center',
    backgroundColor: 'rgba(108, 99, 255, 0.05)',
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#8B93B0',
    textAlign: 'center',
    marginBottom: 20,
  },
  startButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#6C63FF',
    borderRadius: 12,
  },
  startButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardScrollContainer: {
    maxHeight: 460,
  },
  cardScroll: {
    flexGrow: 0,
  },
  cardScrollContent: {
    gap: 16,
    paddingBottom: 8,
  },
  exerciseCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
    position: 'relative',
    overflow: 'hidden',
  },
  exerciseCardCompleted: {
    borderColor: 'rgba(0, 245, 160, 0.4)',
  },
  completedTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#00F5A0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  exerciseBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#6C63FF',
    borderRadius: 8,
  },
  exerciseBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  completedBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#00F5A0',
    borderRadius: 8,
  },
  completedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0A0E27',
  },
  exerciseName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  metaTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  metaTag: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(139, 147, 176, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 147, 176, 0.2)',
    borderRadius: 8,
  },
  metaTagText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8B93B0',
  },
  logSetsButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logSetsButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  completedHint: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 245, 160, 0.08)',
    borderRadius: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  completedHintText: {
    fontSize: 13,
    color: '#00F5A0',
  },
  mealCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  mealEmoji: {
    fontSize: 24,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  mealMeta: {
    fontSize: 13,
    color: '#8B93B0',
  },
  mealEntry: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  mealEntryName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  mealEntryMacros: {
    fontSize: 12,
    color: '#8B93B0',
  },
  mealEmptyText: {
    fontSize: 13,
    color: '#8B93B0',
  },
});
