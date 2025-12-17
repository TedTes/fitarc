
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  PhasePlan,
  WorkoutSessionEntry,
  MuscleGroup,
} from '../types/domain';
import { useHomeScreenData } from '../hooks/useHomeScreenData';
import { useTodayMeals } from '../hooks/useTodayMeals';
import { useWorkoutSessions } from '../hooks/useWorkoutSessions';
import { MealEntry } from '../services/supabaseMealService';
import { getBodyPartLabel } from '../utils';

const MEAL_TYPE_EMOJI: Record<string, string> = {
  Breakfast: '🥚',
  Lunch: '🥗',
  Dinner: '🍽️',
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

const CARD_GRADIENT_DEFAULT = ['rgba(30, 35, 64, 0.8)', 'rgba(21, 25, 50, 0.6)'] as const;
const CARD_GRADIENT_COMPLETE = ['rgba(0, 245, 160, 0.15)', 'rgba(0, 214, 143, 0.1)'] as const;
const ACTIVITY_TOTAL_DAYS = 84;
const DAYS_PER_ACTIVITY_COLUMN = 7;

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
  workoutSessions: WorkoutSessionEntry[];
  onProfilePress?: () => void;
  onStartPhase?: () => void;
  onToggleWorkoutExercise?: (date: string, exerciseName: string) => void;
  onMarkAllWorkoutsComplete?: (date: string) => Promise<void>;
  onCreateSession?: (date: string) => void;
};

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  user,
  phase,
  workoutSessions,
  onProfilePress,
  onStartPhase,
  onToggleWorkoutExercise,
  onMarkAllWorkoutsComplete,
  onCreateSession,
}) => {
  const { data: homeData } = useHomeScreenData(user.id);
  const derivedPhaseId = phase?.id ?? homeData?.phase?.id;
  const { sessions: phaseSessions } = useWorkoutSessions(user.id, derivedPhaseId);
  const [activeTab, setActiveTab] = useState<'workouts' | 'meals'>('workouts');
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  
  const resolvedPhase = phase ?? homeData?.phase ?? null;
  const resolvedSessions = phaseSessions.length
    ? phaseSessions
    : workoutSessions.length
    ? workoutSessions
    : homeData?.recentSessions ?? [];
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const todaySession = resolvedSessions.find((session) => session.date === todayStr) || null;
  const displayExercises = todaySession?.exercises ?? [];
  
  const hasSyncedWorkout = displayExercises.length > 0;
  const greetingMessage = getGreetingMessage();
  const displayName = 'Athlete';
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

  const canLogWorkouts = !!phase && !!onToggleWorkoutExercise;
  const visibleWorkoutCards = displayExercises;
  const totalWorkoutCount = displayExercises.length;
  const completedWorkoutCount = displayExercises.filter((exercise) => exercise.completed).length;
  const pendingWorkoutCount = totalWorkoutCount - completedWorkoutCount;
  const allWorkoutsCompleted = totalWorkoutCount > 0 && completedWorkoutCount === totalWorkoutCount;

  const totalMealCount = hasDailyMeal ? allMealTypes.length : 0;
  const completedMealCount = dayMealsCompleted ? totalMealCount : 0;
  const allMealsCompleted = totalMealCount > 0 && dayMealsCompleted;

  const handleSwipeExercise = (exerciseName: string) => {
    if (canLogWorkouts && onToggleWorkoutExercise) {
      onToggleWorkoutExercise(todayStr, exerciseName);
    }
  };

  const handleMarkAllComplete = async () => {
    if (isMarkingAll) return;
    
    setIsMarkingAll(true);
    
    try {
      if (activeTab === 'workouts') {
        if (pendingWorkoutCount === 0) {
          setIsMarkingAll(false);
          return;
        }
        
        // Use the new markAllWorkoutsComplete function
        if (onMarkAllWorkoutsComplete) {
          await onMarkAllWorkoutsComplete(todayStr);
        }
      } else {
        if (!dayMealsCompleted && toggleDayCompleted) {
          await toggleDayCompleted(true);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Unable to complete action.');
    } finally {
      setIsMarkingAll(false);
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

  const renderWorkoutsSection = () => (
    <View style={styles.section}>
      {!resolvedPhase ? (
        // NO PLAN - Show only "Create Plan" button (opens physique selection)
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🎯</Text>
          <Text style={styles.emptyTitle}>No active plan</Text>
          <Text style={styles.emptyText}>
            Create your personalized training plan to get started.
          </Text>
          
          {onStartPhase && (
            <TouchableOpacity 
              style={styles.createPlanButton} 
              onPress={onStartPhase}
            >
              <Text style={styles.createPlanButtonText}>Create Plan</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : !hasSyncedWorkout ? (
        // HAS PLAN BUT NO WORKOUT TODAY
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>No workout scheduled</Text>
          <Text style={styles.emptyText}>
            Your workout for today will appear here once scheduled.
          </Text>
        </View>
      ) : (
        // HAS WORKOUT - Display exercises
        <View style={styles.verticalList}>
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
                </View>

                <Text style={styles.exerciseName}>{exercise.name}</Text>

                <View style={styles.metaRow}>
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
                  
                  <TouchableOpacity
                    style={[
                      styles.exerciseDoneButtonInline,
                      !canLogWorkouts && styles.exerciseDoneButtonDisabled,
                      isCompleted && styles.exerciseDoneButtonActive,
                    ]}
                    onPress={() => canLogWorkouts && handleSwipeExercise(exercise.name)}
                    disabled={!canLogWorkouts || isCompleted}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.exerciseDoneButtonText,
                        isCompleted && styles.exerciseDoneButtonTextActive,
                      ]}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            );
          })}
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
        <View style={styles.verticalList}>
          {allMealTypes.map((mealType) => renderMealGroup(mealType))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greetingMessage},</Text>
            <Text style={styles.userName}>{displayName}</Text>
            <Text style={styles.dateInfo}>{dateLabel}</Text>
          </View>
          {onProfilePress && (
            <TouchableOpacity style={styles.settingsButton} onPress={onProfilePress}>
              <Text style={styles.settingsIcon}>⚙️</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Scrollable Content - Activity Grid */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
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
        </ScrollView>

        {/* Sticky Tabs Container */}
        <View style={styles.stickyTabsContainer}>
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

          {/* Progress Chip with Mark All Button */}
          <View style={styles.progressChip}>
            <View style={styles.progressLeft}>
              <View style={styles.progressDot} />
              <Text style={styles.progressText}>
                {activeTab === 'workouts'
                  ? `${completedWorkoutCount}/${totalWorkoutCount} workouts`
                  : `${completedMealCount}/${totalMealCount} meals`}
              </Text>
            </View>
            {activeTab === 'workouts' && canLogWorkouts ? (
              <TouchableOpacity 
                style={[
                  styles.markAllFloater, 
                  (isMarkingAll || allWorkoutsCompleted) && styles.markAllButtonDisabled
                ]} 
                onPress={handleMarkAllComplete}
                disabled={isMarkingAll || allWorkoutsCompleted}
              >
                <Text style={styles.markAllFloaterText}>
                  {allWorkoutsCompleted ? 'Done' : 'Complete'}
                </Text>
              </TouchableOpacity>
            ) : (
              (activeTab === 'meals' || totalMealCount === 0) && (
                <TouchableOpacity 
                  style={[styles.markAllButton, isMarkingAll && styles.markAllButtonDisabled]} 
                  onPress={handleMarkAllComplete}
                  disabled={isMarkingAll}
                >
                  <Text style={styles.markAllButtonText}>
                    {isMarkingAll 
                      ? '...' 
                      : activeTab === 'workouts' 
                        ? 'Mark All' 
                        : 'Log All'}
                  </Text>
                </TouchableOpacity>
              )
            )}
         </View>
        </View>

        {/* Scrollable Content Area */}
        <ScrollView
          style={styles.contentScrollView}
          contentContainerStyle={styles.contentScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
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
  scrollView: {
    flex: 0,
    maxHeight: 180,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  stickyTabsContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#0A0E27',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(108, 99, 255, 0.1)',
  },
  contentScrollView: {
    flex: 1,
  },
  contentScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  activityCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.15)',
    marginBottom: 8,
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
    marginBottom: 12,
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
    paddingVertical: 10,
    paddingLeft: 18,
    paddingRight: 12,
    backgroundColor: 'rgba(30, 35, 64, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(139, 147, 176, 0.3)',
    borderRadius: 20,
    minHeight: 48,
  },
  progressLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
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
    flex: 1,
  },
  markAllButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  markAllButtonDisabled: {
    opacity: 0.5,
  },
  markAllButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  markAllFloater: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#00F5A0',
    borderRadius: 20,
    shadowColor: '#00F5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  markAllFloaterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0A0E27',
    letterSpacing: 0.3,
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
    lineHeight: 20,
  },
  createPlanButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  createPlanButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  verticalList: {
    gap: 16,
  },
  exerciseCard: {
    borderRadius: 20,
    padding: 20,
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    gap: 16,
  },
  metaTags: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  exerciseDoneButton: {
    alignSelf: 'flex-end',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  exerciseDoneButtonInline: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  exerciseDoneButtonDisabled: {
    opacity: 0.4,
  },
  exerciseDoneButtonActive: {
    borderColor: 'rgba(0,245,160,0.4)',
    backgroundColor: 'rgba(0,245,160,0.1)',
  },
  exerciseDoneButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.3,
    fontSize: 12,
  },
  exerciseDoneButtonTextActive: {
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
