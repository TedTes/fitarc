import React, { useEffect, useMemo, useState } from 'react';
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
import { useMealPlans } from '../hooks/useMealPlans';
import { useTodayMeals } from '../hooks/useTodayMeals';
import { useWorkoutSessions } from '../hooks/useWorkoutSessions';
import { MealEntry } from '../services/supabaseMealService';
import { getBodyPartLabel } from '../utils';
import { formatLocalDateYMD } from '../utils/date';
import {
  computeEntriesMacroTotals,
  formatMacroSummaryLine,
  formatMealEntryMacros,
} from '../utils/mealMacros';
const MEAL_TYPE_EMOJI: Record<string, string> = {
  Breakfast: '🥚',
  Lunch: '🥗',
  Dinner: '🍽️',
};

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
const ACTIVITY_GAP = 6;

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
  const [localCompleted, setLocalCompleted] = useState<Set<string>>(new Set());
  
  const resolvedPhase = phase ?? homeData?.phase ?? null;
  const activePhaseId = resolvedPhase?.id ?? null;
  const resolvedSessions = phaseSessions.length
    ? phaseSessions
    : workoutSessions.length
    ? workoutSessions
    : homeData?.recentSessions ?? [];
  
  const today = new Date();
  const todayStr = formatLocalDateYMD(today);
  const todaySession = resolvedSessions.find((session) => session.date === todayStr) || null;

  const displayExercises = todaySession?.exercises ?? [];
  const getExerciseKey = (exercise: WorkoutSessionEntry['exercises'][number]) =>
    (exercise.id as string) ||
    (exercise.exerciseId as string) ||
    `${exercise.name}-${exercise.sets ?? ''}-${exercise.reps ?? ''}`;

  useEffect(() => {
    setLocalCompleted(new Set());
  }, [todaySession?.id]);

  const visibleWorkoutCards = displayExercises.filter(
    (exercise) => !exercise.completed && !localCompleted.has(getExerciseKey(exercise))
  );
  
  const hasSyncedWorkout = displayExercises.length > 0;
  const greetingMessage = getGreetingMessage();
  const displayName = 'Athlete';
  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, WorkoutSessionEntry[]>();
    resolvedSessions.forEach((session) => {
      if (!session.date) return;
      const key = session.date;
      map.set(key, [...(map.get(key) || []), session]);
    });
    return map;
  }, [resolvedSessions]);

  const activityCells = useMemo<ActivityCell[]>(() => {
    const now = new Date();
    const cells: ActivityCell[] = [];
    for (let i = ACTIVITY_TOTAL_DAYS - 1; i >= 0; i -= 1) {
      const cellDate = new Date(now);
      cellDate.setDate(now.getDate() - i);
      const iso = cellDate.toISOString().split('T')[0];
      const count = sessionsByDate.get(iso)?.length || 0;
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

  const [gridLayout, setGridLayout] = useState({ width: 0, height: 0 });
  const [selectedActivityMeta, setSelectedActivityMeta] = useState<{
    iso: string;
    row: number;
    col: number;
  } | null>(null);
  
  useEffect(() => {
    if (!selectedActivityMeta) return;
    const timeout = setTimeout(() => {
      setSelectedActivityMeta(null);
    }, 2500); // Increased timeout for better UX
    return () => clearTimeout(timeout);
  }, [selectedActivityMeta]);

  useEffect(() => {
    if (
      selectedActivityMeta &&
      !activityCells.some((cell) => cell.iso === selectedActivityMeta.iso)
    ) {
      setSelectedActivityMeta(null);
    }
  }, [activityCells, selectedActivityMeta]);

  const selectedActivity =
    (selectedActivityMeta &&
      activityCells.find((cell) => cell.iso === selectedActivityMeta.iso)) ||
    null;

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
  } = useTodayMeals(
    resolvedPhase ? user.id : undefined,
    resolvedPhase ? today : undefined,
    Boolean(resolvedPhase),
    activePhaseId
  );
  const { mealPlansByDate } = useMealPlans(
    resolvedPhase ? user.id : undefined,
    resolvedPhase ? todayStr : undefined,
    resolvedPhase ? todayStr : undefined,
    activePhaseId
  );
  const baseMealTypes = useMemo(() => Object.keys(mealsByType), [mealsByType]);
  const mealGroups = useMemo(() => {
    return baseMealTypes
      .map((mealType) => ({
        mealType,
        entries: mealsByType[mealType] ?? [],
      }))
      .filter((group) => group.entries.length > 0);
  }, [baseMealTypes, mealsByType]);

  const dayMealsCompleted = Boolean(dailyMeal?.completed);

  const canLogWorkouts = !!resolvedPhase && !!onToggleWorkoutExercise;
  const totalWorkoutCount = displayExercises.length;
  const completedWorkoutCount = totalWorkoutCount - visibleWorkoutCards.length;
  const pendingWorkoutCount = visibleWorkoutCards.length;
  const allWorkoutsCompleted = totalWorkoutCount > 0 && completedWorkoutCount === totalWorkoutCount;

  const totalMealCount = mealGroups.length;
  const completedMealCount = dayMealsCompleted ? totalMealCount : 0;

  const showWorkoutCompletionButton =
    activeTab === 'workouts' &&
    canLogWorkouts &&
    resolvedPhase &&
    hasSyncedWorkout &&
    pendingWorkoutCount > 0;

  const handleSwipeExercise = (exerciseName: string) => {
    if (!canLogWorkouts || !onToggleWorkoutExercise) return;
    onToggleWorkoutExercise(todayStr, exerciseName);
    setLocalCompleted((prev) => {
      const next = new Set(prev);
      const target = displayExercises.find((exercise) => exercise.name === exerciseName);
      if (target) {
        next.add(getExerciseKey(target));
      }
      return next;
    });
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
        
        if (onMarkAllWorkoutsComplete) {
          await onMarkAllWorkoutsComplete(todayStr);
        }
        const next = new Set(localCompleted);
        visibleWorkoutCards.forEach((exercise) => next.add(getExerciseKey(exercise)));
        setLocalCompleted(next);
      } else if (toggleDayCompleted) {
        await toggleDayCompleted(true);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Unable to complete action.');
    } finally {
      setIsMarkingAll(false);
    }
  };

  const renderMealGroup = (group: { mealType: string; entries: MealEntry[] }) => {
    const { mealType, entries } = group;
    if (entries.length === 0) return null;

    const totals = computeEntriesMacroTotals(entries);
    const macroSummary = formatMacroSummaryLine(totals);
    const totalCount = entries.length;
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
              {totalCount
                ? `${totalCount} item${totalCount > 1 ? 's' : ''} · ${macroSummary}`
                : 'Suggested by your plan'}
            </Text>
          </View>
        </View>
        {entries.map((entry) => (
          <View key={entry.id} style={styles.mealEntry}>
            <View>
              <Text style={styles.mealEntryName}>{entry.foodName}</Text>
              <Text style={styles.mealEntryMacros}>{formatMealEntryMacros(entry)}</Text>
            </View>
            {entry.isDone && (
              <View style={styles.mealEntryDoneBadge}>
                <Text style={styles.mealEntryDoneText}>Done</Text>
              </View>
            )}
          </View>
        ))}
      </LinearGradient>
    );
  };

  const renderActivityDetails = () => {
    if (!selectedActivity || !selectedActivityMeta) return null;
    
    const sessionsForDay = sessionsByDate.get(selectedActivity.iso) || [];
    const workoutCount = sessionsForDay.length;
    
    const totalExercises = sessionsForDay.reduce(
      (sum, session) => sum + session.exercises.length,
      0
    );
    
    const totalSets = sessionsForDay.reduce((sum, session) => {
      return (
        sum +
        session.exercises.reduce((exerciseSum, exercise) => {
          const setsLogged = exercise.setDetails?.length ?? exercise.sets ?? 0;
          return exerciseSum + setsLogged;
        }, 0)
      );
    }, 0);
  
    const columnsCount = activityColumns.length || 1;
    const columnWidth =
      columnsCount > 0
        ? (gridLayout.width - ACTIVITY_GAP * (columnsCount - 1)) / columnsCount
        : 0;
    const rowHeight =
      (gridLayout.height - ACTIVITY_GAP * (DAYS_PER_ACTIVITY_COLUMN - 1)) /
      DAYS_PER_ACTIVITY_COLUMN;
  
    if (!columnWidth || !rowHeight) return null;
  
    const baseLeft =
      selectedActivityMeta.col * (columnWidth + ACTIVITY_GAP) + columnWidth / 2;
    const baseTop =
      selectedActivityMeta.row * (rowHeight + ACTIVITY_GAP) - rowHeight;
  
    const tooltipHalfWidth = 60;
    const clampedLeft = Math.min(
      Math.max(baseLeft, tooltipHalfWidth),
      gridLayout.width - tooltipHalfWidth
    );
  
    return (
      <LinearGradient
        colors={['rgba(16, 20, 39, 0.98)', 'rgba(25, 30, 55, 0.98)']}
        style={[
          styles.activityDetailCard,
          {
            left: clampedLeft - tooltipHalfWidth,
            top: Math.max(baseTop, -10),
          },
        ]}
        pointerEvents="none"
      >
        {workoutCount === 0 ? (
          <View style={styles.activityTooltipCompact}>
            <Text style={styles.activityCompactIcon}>💤</Text>
          </View>
        ) : (
          <View style={styles.activityTooltipCompact}>
            <View style={styles.activityCompactStat}>
              <Text style={styles.activityCompactIcon}>🏋️</Text>
              <Text style={styles.activityCompactValue}>{workoutCount}</Text>
            </View>
            
            <View style={styles.activityCompactDivider} />
            
            <View style={styles.activityCompactStat}>
              <Text style={styles.activityCompactIcon}>💪</Text>
              <Text style={styles.activityCompactValue}>{totalExercises}</Text>
            </View>
            
            <View style={styles.activityCompactDivider} />
            
            <View style={styles.activityCompactStat}>
              <Text style={styles.activityCompactIcon}>🔥</Text>
              <Text style={styles.activityCompactValue}>{totalSets}</Text>
            </View>
          </View>
        )}
  
        <View style={styles.activityTooltipArrow} />
      </LinearGradient>
    );
  };

  const renderWorkoutsSection = () => (
    <View style={styles.section}>
      {!resolvedPhase ? (
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
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>No workout scheduled</Text>
          <Text style={styles.emptyText}>
            Your workout for today will appear here once scheduled.
          </Text>
          {onCreateSession && (
            <TouchableOpacity
              style={[styles.createPlanButton, styles.createSessionButton]}
              onPress={() => onCreateSession(todayStr)}
            >
              <Text style={styles.createPlanButtonText}>Create Session</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : pendingWorkoutCount === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <Text style={styles.emptyTitle}>Workouts complete</Text>
          <Text style={styles.emptyText}>Rest up and check Plans for tomorrow's session.</Text>
        </View>
      ) : (
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
                <Text style={styles.exerciseBodyParts}>
                  {formatBodyPartList(exercise.bodyParts)}
                </Text>

                <View style={styles.metaRow}>
                  <View style={styles.exerciseStats}>
                    <View style={styles.inlineStat}>
                      <Text style={styles.inlineStatValue}>
                        {exercise.sets ?? '—'}
                      </Text>
                      <Text style={styles.inlineStatLabel}>sets</Text>
                    </View>
                    <Text style={styles.inlineDot}>•</Text>
                    <View style={styles.inlineStat}>
                      <Text style={styles.inlineStatValue}>
                        {exercise.reps?? '—'}
                      </Text>
                      <Text style={styles.inlineStatLabel}>reps</Text>
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
      ) : isMealsLoading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>⏳</Text>
          <Text style={styles.emptyTitle}>Loading meals</Text>
          <Text style={styles.emptyText}>Fetching today’s plan.</Text>
        </View>
      ) : mealGroups.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyTitle}>No meals for today</Text>
          <Text style={styles.emptyText}>Use Menu tab to create meals.</Text>
        </View>
      ) : (
        <View style={styles.verticalList}>
          {mealGroups.map((group) => renderMealGroup(group))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
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

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
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
            <View style={styles.activityGridWrapper}>
              <View
                style={styles.activityGrid}
                onLayout={(event) =>
                  setGridLayout({
                    width: event.nativeEvent.layout.width,
                    height: event.nativeEvent.layout.height,
                  })
                }
              >
                {activityColumns.map((column, colIdx) => (
                  <View key={`col-${colIdx}`} style={styles.activityColumn}>
                    {column.map((cell, rowIdx) => (
                      <TouchableOpacity
                        key={cell.iso}
                        style={[
                          styles.activityCell,
                          getActivityLevelStyle(cell.level),
                          cell.isToday && styles.activityCellToday,
                        ]}
                        onPress={() =>
                          setSelectedActivityMeta({ iso: cell.iso, row: rowIdx, col: colIdx })
                        }
                        activeOpacity={0.85}
                      />
                    ))}
                  </View>
                ))}
              </View>
              {selectedActivity && renderActivityDetails()}
            </View>
          </LinearGradient>
        </ScrollView>

        <View style={styles.stickyTabsContainer}>
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

          <View style={styles.progressChip}>
            <View style={styles.progressLeft}>
              <View style={styles.progressDot} />
              <Text style={styles.progressText}>
                {activeTab === 'workouts'
                  ? `${completedWorkoutCount}/${totalWorkoutCount} workouts`
                  : `${completedMealCount}/${totalMealCount} meals`}
              </Text>
            </View>
            {showWorkoutCompletionButton ? (
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
              activeTab === 'meals' && totalMealCount > 0 && (
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
  activityGridWrapper: {
    position: 'relative',
    marginTop: 8,
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
    shadowColor: '#00F5A0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 5,
  },

  activityDetailCard: {
    position: 'absolute',
    width: 100,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'visible',
  },
  activityTooltipArrow: {
    position: 'absolute',
    bottom: -5,
    left: '50%',
    marginLeft: -5,
    width: 10,
    height: 10,
    backgroundColor: 'rgba(16, 20, 39, 0.98)',
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(108, 99, 255, 0.4)',
    transform: [{ rotate: '45deg' }],
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
  createSessionButton: {
    marginTop: 16,
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
  exerciseName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  exerciseBodyParts: {
    fontSize: 13,
    color: '#A0A3BD',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    gap: 16,
  },
  exerciseStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  inlineStat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  inlineStatValue: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  inlineStatLabel: {
    fontSize: 12,
    color: '#8B93B0',
  },
  inlineDot: {
    color: '#8B93B0',
    fontSize: 12,
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
  mealTemplateList: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    gap: 6,
  },
  mealTemplateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealTemplateBullet: {
    color: '#6B7390',
    fontWeight: '700',
  },
  mealTemplateText: {
    flex: 1,
    color: '#8B93B0',
    fontStyle: 'italic',
    fontSize: 13,
  },
  mealEntry: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
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
  mealEntryDoneBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#00F5A0',
    backgroundColor: 'rgba(0,245,160,0.1)',
  },
  mealEntryDoneText: {
    color: '#00F5A0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  mealEmptyText: {
    fontSize: 13,
    color: '#8B93B0',
  },

  activityTooltipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  activityCompactStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  activityCompactIcon: {
    fontSize: 12,
  },
  activityCompactValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  activityCompactDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  

});
