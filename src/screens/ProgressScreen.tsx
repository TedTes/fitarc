import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  VictoryAxis,
  VictoryChart,
  VictoryLine,
} from 'victory-native';
import { PhasePlan, User, WorkoutLog, WorkoutSessionEntry, StrengthSnapshot, TrackingPreferences } from '../types/domain';
import { parseYMDToDate } from '../utils/date';
import { fetchSwapReasonSignals, SwapReasonSignal } from '../services/progressService';
import { uiCopy } from '../content/uiCopy';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0E27',
  card: '#0F1326',
  cardElevated: '#131929',
  accent: '#6C63FF',
  accentSoft: 'rgba(108,99,255,0.15)',
  success: '#00F5A0',
  successSoft: 'rgba(0,245,160,0.12)',
  pink: '#FF6B93',
  orange: '#FFB800',
  blue: '#4EA8DE',
  textPrimary: '#FFFFFF',
  textSecondary: '#C7CCE6',
  textMuted: '#5A6178',
  border: 'rgba(255,255,255,0.07)',
  borderAccent: 'rgba(108,99,255,0.2)',
} as const;

const VIEW_TABS = [
  { id: 'muscles', label: uiCopy.progress.viewTabs.muscles },
  { id: 'exercises', label: uiCopy.progress.viewTabs.exercises },
] as const;

type ProgressScreenProps = {
  user: User;
  phase: PhasePlan;
  workoutDataVersion: number;
  workoutSessions: WorkoutSessionEntry[];
  workoutLogs: WorkoutLog[];
  strengthSnapshots: StrengthSnapshot[];
  onAddProgress?: () => void;
  onUpdateTrackingPreferences?: (preferences: TrackingPreferences) => Promise<void> | void;
};

const formatShortDate = (date: Date | null) => {
  if (!date) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
};

const getWeekNumber = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

const buildExerciseSeries = (snapshots: StrengthSnapshot[], selectedExercise: string | null) => {
  if (!selectedExercise) return [];
  const today = new Date();
  const weeks: { key: string; start: Date }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() - i * 7);
    weekStart.setHours(0, 0, 0, 0);
    const key = `W${getWeekNumber(weekStart)}`;
    weeks.push({ key, start: weekStart });
  }

  return weeks.map((week) => {
    const end = new Date(week.start);
    end.setDate(end.getDate() + 7);
    const bucket = snapshots.filter((snap) => {
      const snapDate = new Date(snap.date);
      return snapDate >= week.start && snapDate < end;
    });
    const values = bucket
      .filter((s) => (s.exerciseName ?? s.lift ?? '').toLowerCase() === selectedExercise.toLowerCase())
      .map((s) => s.weight ?? 0);
    return {
      week: week.key,
      weight: values.length ? Math.max(...values) : 0,
    };
  });
};

const buildVolumeRows = (workoutLogs: WorkoutLog[]) => {
  if (!workoutLogs.length) return [];
  const totals = new Map<string, number>();
  workoutLogs.forEach((log) => {
    Object.entries(log.muscleVolume || {}).forEach(([key, value]) => {
      totals.set(key, (totals.get(key) ?? 0) + (value ?? 0));
    });
  });
  const colors = [COLORS.accent, COLORS.blue, COLORS.pink, COLORS.orange, '#A78BFA'];
  return Array.from(totals.entries())
    .map(([muscle, sets], i) => ({
      muscle: muscle.charAt(0).toUpperCase() + muscle.slice(1),
      sets: Math.round(sets),
      color: colors[i % colors.length],
    }))
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 5);
};

const buildMuscleTrend = (workoutLogs: WorkoutLog[], muscles: string[]) => {
  const today = new Date();
  const weeks: { key: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() - i * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    weeks.push({ key: `W${getWeekNumber(start)}`, start, end });
  }

  const series = muscles.map((muscle) => {
    const key = muscle.toLowerCase();
    return {
      muscle,
      data: weeks.map((week) => {
        const weeklySets = workoutLogs.reduce((sum, log) => {
          const logDate = parseYMDToDate(log.date);
          if (logDate < week.start || logDate >= week.end) return sum;
          const muscleValue = Object.entries(log.muscleVolume ?? {}).find(
            ([muscleKey]) => muscleKey.toLowerCase() === key
          )?.[1] ?? 0;
          return sum + muscleValue;
        }, 0);
        return { week: week.key, sets: Math.round(weeklySets) };
      }),
    };
  });

  return { weeks, series };
};

const normalizeStartOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const countCompletedSessions = (sessions: WorkoutSessionEntry[]) =>
  sessions.filter((session) => session.exercises?.length && session.exercises.every((exercise) => exercise.completed === true));

const buildSessionStreak = (sessions: WorkoutSessionEntry[]) => {
  const completed = countCompletedSessions(sessions)
    .map((session) => session.date)
    .sort((a, b) => b.localeCompare(a));
  const uniqueDates = Array.from(new Set(completed));
  return uniqueDates.length;
};

const countSessionsInWindow = (sessions: WorkoutSessionEntry[], windowDays: number) => {
  const today = normalizeStartOfDay(new Date());
  const start = new Date(today);
  start.setDate(today.getDate() - (windowDays - 1));
  return sessions.filter((session) => {
    const date = parseYMDToDate(session.date);
    return date >= start && date <= today;
  }).length;
};

const buildAdherenceDays = (sessions: WorkoutSessionEntry[], windowDays = 14) => {
  const completedDates = new Set(
    countCompletedSessions(sessions).map((session) => session.date)
  );
  const today = normalizeStartOfDay(new Date());
  return Array.from({ length: windowDays }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (windowDays - 1 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      shortLabel: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      dayNumber: date.getDate(),
      completed: completedDates.has(key),
      isToday: key === today.toISOString().slice(0, 10),
    };
  });
};

const buildKeyLiftCards = (snapshots: StrengthSnapshot[]) => {
  const grouped = new Map<string, StrengthSnapshot[]>();
  snapshots.forEach((snapshot) => {
    const label = (snapshot.exerciseName ?? snapshot.lift ?? '').trim();
    if (!label || (snapshot.weight ?? 0) <= 0) return;
    const key = label.toLowerCase();
    const list = grouped.get(key) ?? [];
    list.push(snapshot);
    grouped.set(key, list);
  });

  return Array.from(grouped.entries())
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
      const latest = sorted[sorted.length - 1];
      const first = sorted[0];
      const latestValue = Math.round(latest.estimated1RM ?? latest.weight ?? 0);
      const firstValue = Math.round(first.estimated1RM ?? first.weight ?? 0);
      return {
        id: key,
        name: latest.exerciseName ?? latest.lift ?? key,
        latestValue,
        change: latestValue - firstValue,
        sessions: items.length,
        lastDate: latest.date,
      };
    })
    .sort((a, b) => b.latestValue - a.latestValue)
    .slice(0, 4);
};

const buildMuscleBalanceRows = (workoutLogs: WorkoutLog[]) => {
  const totals = new Map<string, number>();
  workoutLogs.forEach((log) => {
    Object.entries(log.muscleVolume ?? {}).forEach(([muscle, sets]) => {
      totals.set(muscle, (totals.get(muscle) ?? 0) + Math.round(sets ?? 0));
    });
  });

  const target = 10;
  return Array.from(totals.entries())
    .map(([muscle, sets]) => {
      const label = muscle.charAt(0).toUpperCase() + muscle.slice(1);
      const ratio = Math.min(1, sets / target);
      const status =
        sets < 6 ? 'under' : sets > 16 ? 'high' : 'balanced';
      return {
        muscle: label,
        sets,
        target,
        ratio,
        status,
      };
    })
    .sort((a, b) => a.sets - b.sets);
};

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  user,
  phase,
  workoutSessions,
  workoutLogs,
  strengthSnapshots,
}) => {
  const [activeView, setActiveView] = useState<typeof VIEW_TABS[number]['id']>('muscles');
  const [swapSignals, setSwapSignals] = useState<SwapReasonSignal[]>([]);

  const filteredSessions = useMemo(
    () => workoutSessions.filter((session) => session.phasePlanId === phase.id),
    [phase.id, workoutSessions]
  );
  const filteredWorkoutLogs = useMemo(
    () => workoutLogs.filter((log) => log.phasePlanId === phase.id),
    [phase.id, workoutLogs]
  );
  const filteredStrengthSnapshots = useMemo(
    () => strengthSnapshots.filter((snapshot) => snapshot.phasePlanId === phase.id),
    [phase.id, strengthSnapshots]
  );

  const planProgress = useMemo(() => {
    const sessions = workoutSessions.filter((s) => s.phasePlanId === phase.id);
    const completed = sessions.filter((s) => s.exercises?.length && s.exercises.every((ex) => ex.completed === true)).length;
    const total = sessions.length;
    const startDate = phase.startDate ? parseYMDToDate(phase.startDate) : null;
    const endDate = phase.expectedEndDate ? parseYMDToDate(phase.expectedEndDate) : null;
    const totalWeeks = Math.max(phase.expectedWeeks ?? 8, 1);
    const currentWeek = startDate
      ? Math.min(totalWeeks, Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 604800000) + 1))
      : Math.min(4, totalWeeks);
    return {
      name: phase.name ?? uiCopy.progress.trainingPlanFallback,
      startDate: formatShortDate(startDate),
      endDate: formatShortDate(endDate),
      currentWeek,
      totalWeeks,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      totalWorkouts: total,
      completedWorkouts: completed,
    };
  }, [phase, workoutSessions]);

  const volumeData = useMemo(() => buildVolumeRows(filteredWorkoutLogs), [filteredWorkoutLogs]);
  const totalSets = volumeData.reduce((sum, item) => sum + item.sets, 0);

  const overviewMetrics = useMemo(() => {
    const sessionsLast7Days = countSessionsInWindow(filteredSessions, 7);
    const uniqueMuscles = new Set(
      filteredWorkoutLogs.flatMap((log) =>
        Object.keys(log.muscleVolume ?? {}).filter((muscle) => (log.muscleVolume?.[muscle] ?? 0) > 0)
      )
    ).size;
    const topSnapshot = [...filteredStrengthSnapshots]
      .filter((snapshot) => (snapshot.weight ?? 0) > 0)
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];

    return [
      {
        label: 'Completed',
        value: `${planProgress.completedWorkouts}/${planProgress.totalWorkouts || 0}`,
        tone: COLORS.accent,
        meta: 'sessions',
      },
      {
        label: 'Last 7 Days',
        value: `${sessionsLast7Days}`,
        tone: COLORS.success,
        meta: 'workouts',
      },
      {
        label: 'Muscles Hit',
        value: `${uniqueMuscles}`,
        tone: COLORS.blue,
        meta: 'this block',
      },
      {
        label: 'Top Lift',
        value: topSnapshot ? `${Math.round(topSnapshot.weight ?? 0)}` : '—',
        tone: COLORS.orange,
        meta: topSnapshot?.exerciseName ?? topSnapshot?.lift ?? 'no logs',
      },
    ];
  }, [filteredSessions, filteredStrengthSnapshots, filteredWorkoutLogs, planProgress.completedWorkouts, planProgress.totalWorkouts]);

  const adherenceDays = useMemo(() => buildAdherenceDays(filteredSessions), [filteredSessions]);
  const keyLiftCards = useMemo(() => buildKeyLiftCards(filteredStrengthSnapshots), [filteredStrengthSnapshots]);
  const muscleBalanceRows = useMemo(() => buildMuscleBalanceRows(filteredWorkoutLogs), [filteredWorkoutLogs]);

  const weeklySnapshot = useMemo(() => {
    const currentWeekSessions = countSessionsInWindow(filteredSessions, 7);
    const averageSetsPerWorkout =
      filteredWorkoutLogs.length > 0 ? Math.round(totalSets / filteredWorkoutLogs.length) : 0;
    return {
      streak: buildSessionStreak(filteredSessions),
      currentWeekSessions,
      averageSetsPerWorkout,
    };
  }, [filteredSessions, filteredWorkoutLogs.length, totalSets]);

  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const exerciseOptions = useMemo(() => {
    const groups = new Map<string, StrengthSnapshot[]>();
    filteredStrengthSnapshots.forEach((snap) => {
      const label = (snap.exerciseName ?? snap.lift ?? '').trim();
      if (!label || (snap.weight ?? 0) <= 0) return;
      const key = label.toLowerCase();
      const existing = groups.get(key) ?? [];
      existing.push(snap);
      groups.set(key, existing);
    });
    const colors = [COLORS.orange, COLORS.accent, COLORS.pink, COLORS.success, COLORS.blue];
    return Array.from(groups.entries())
      .map(([key, samples], idx) => {
        const sorted = [...samples].sort((a, b) => a.date.localeCompare(b.date));
        const latest = sorted[sorted.length - 1]?.weight ?? 0;
        const first = sorted[0]?.weight ?? 0;
        const gain = latest - first;
        return {
          id: key,
          name: sorted[sorted.length - 1]?.exerciseName ?? sorted[sorted.length - 1]?.lift ?? key,
          color: colors[idx % colors.length],
          valueText: `${Math.round(latest)} lbs`,
          gainText: `${gain >= 0 ? '+' : ''}${Math.round(gain)} lbs`,
          count: samples.length,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filteredStrengthSnapshots]);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const activeExercise = selectedExercise ?? exerciseOptions[0]?.id ?? null;
  const exerciseData = useMemo(
    () => buildExerciseSeries(filteredStrengthSnapshots, activeExercise),
    [filteredStrengthSnapshots, activeExercise]
  );
  const activeMuscle = selectedMuscle ?? volumeData[0]?.muscle ?? null;

  const muscleWorkoutHistory = useMemo(() => {
    if (!activeMuscle) return [];
    return [...filteredSessions]
      .filter((session) =>
        session.exercises.some((exercise) =>
          exercise.bodyParts.some((part) => part.toLowerCase() === activeMuscle.toLowerCase())
        )
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((session) => {
        const matching = session.exercises.filter((exercise) =>
          exercise.bodyParts.some((part) => part.toLowerCase() === activeMuscle.toLowerCase())
        );
        const setCount = matching.reduce((sum, exercise) => {
          const loggedSets = exercise.setDetails?.length ?? 0;
          return sum + (loggedSets > 0 ? loggedSets : Math.max(0, exercise.sets ?? 0));
        }, 0);
        return {
          id: session.id,
          date: session.date,
          exercises: matching.length,
          sets: setCount,
        };
      });
  }, [activeMuscle, filteredSessions]);

  const exerciseWorkoutHistory = useMemo(() => {
    if (!activeExercise) return [];
    return [...filteredSessions]
      .filter((session) =>
        session.exercises.some((exercise) => {
          const name = exercise.name.toLowerCase();
          return name === activeExercise || name.includes(activeExercise);
        })
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((session) => {
        const matching = session.exercises.filter((exercise) => {
          const name = exercise.name.toLowerCase();
          return name === activeExercise || name.includes(activeExercise);
        });
        return {
          id: session.id,
          date: session.date,
          exercises: matching.map((exercise) => exercise.name).join(', '),
        };
      });
  }, [activeExercise, filteredSessions]);
  const muscleTrend = useMemo(
    () => buildMuscleTrend(filteredWorkoutLogs, volumeData.map((item) => item.muscle)),
    [filteredWorkoutLogs, volumeData]
  );
  const weeklyAction = useMemo(() => {
    const topSignal = swapSignals[0];
    const completionRate = planProgress.completionRate;

    if (completionRate < 60) {
      return {
        title: uiCopy.progress.actionSimplifyTitle,
        body: uiCopy.progress.actionSimplifyBody,
      };
    }

    if (topSignal?.source === 'meal' && topSignal.key.includes('user_availability')) {
      return {
        title: uiCopy.progress.actionAvailabilityTitle,
        body: uiCopy.progress.actionAvailabilityBody,
      };
    }

    if (topSignal?.source === 'meal' && topSignal.key.includes('user_time')) {
      return {
        title: uiCopy.progress.actionTimeTitle,
        body: uiCopy.progress.actionTimeBody,
      };
    }

    if (topSignal?.source === 'workout' && topSignal.key.includes('volume_adjustment')) {
      return {
        title: uiCopy.progress.actionVolumeTitle,
        body: uiCopy.progress.actionVolumeBody,
      };
    }

    if (completionRate >= 80) {
      return {
        title: uiCopy.progress.actionProgressiveTitle,
        body: uiCopy.progress.actionProgressiveBody,
      };
    }

    return {
      title: uiCopy.progress.actionKeepTitle,
      body: uiCopy.progress.actionKeepBody,
    };
  }, [planProgress.completionRate, swapSignals]);

  const focusSignals = useMemo(() => {
    const items = [
      `${planProgress.currentWeek}/${planProgress.totalWeeks} weeks`,
      `${weeklySnapshot.streak} completed sessions`,
      `${weeklySnapshot.averageSetsPerWorkout} avg sets`,
    ];
    if (user.planPreferences?.daysPerWeek) {
      items.push(`${user.planPreferences.daysPerWeek}x/week target`);
    }
    return items;
  }, [planProgress.currentWeek, planProgress.totalWeeks, user.planPreferences?.daysPerWeek, weeklySnapshot.averageSetsPerWorkout, weeklySnapshot.streak]);

  const undertrainedMuscles = useMemo(
    () => muscleBalanceRows.filter((row) => row.status === 'under').slice(0, 3),
    [muscleBalanceRows]
  );

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const signals = await fetchSwapReasonSignals(user.id, phase.id, 7);
        if (mounted) setSwapSignals(signals);
      } catch (error) {
        console.error('Failed to load swap reason signals:', error);
        if (mounted) setSwapSignals([]);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [phase.id, user.id]);

  return (
    <LinearGradient colors={['#0A0E27', '#0D1229', '#111633']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>{uiCopy.progress.pageTitle}</Text>
            <Text style={styles.headerSub}>Your training block at a glance</Text>
          </View>
          <View style={styles.adherencePill}>
            <Text style={styles.adherencePillValue}>{planProgress.completionRate}%</Text>
            <Text style={styles.adherencePillLabel}>{uiCopy.progress.onTrackLabel}</Text>
          </View>
        </View>

        <LinearGradient
          colors={['rgba(108,99,255,0.2)', 'rgba(108,99,255,0.06)', 'transparent']}
          style={styles.planCard}
        >
          <View style={styles.planCardInner}>
            <View style={styles.planTop}>
              <View style={styles.planTopLeft}>
                <Text style={styles.planLabel}>{uiCopy.progress.currentPlanLabel}</Text>
                <Text style={styles.planName} numberOfLines={1}>{planProgress.name}</Text>
                <Text style={styles.planDates}>{planProgress.startDate} → {planProgress.endDate}</Text>
              </View>
              <View style={styles.planStats}>
                <Text style={styles.planStatValue}>{planProgress.completedWorkouts}</Text>
                <Text style={styles.planStatLabel}>done</Text>
                <View style={styles.planStatDiv} />
                <Text style={styles.planStatValue}>{planProgress.totalWorkouts}</Text>
                <Text style={styles.planStatLabel}>total</Text>
              </View>
            </View>

            <View style={styles.weekRow}>
              {Array.from({ length: planProgress.totalWeeks }).map((_, i) => {
                const isPast = i < planProgress.currentWeek - 1;
                const isCurrent = i === planProgress.currentWeek - 1;
                return (
                  <View key={i} style={styles.weekSlot}>
                    <View style={[
                      styles.weekBar,
                      isPast && styles.weekBarDone,
                      isCurrent && styles.weekBarCurrent,
                    ]} />
                    {isCurrent && <View style={styles.weekDot} />}
                  </View>
                );
              })}
            </View>
            <View style={styles.weekLabelRow}>
              <Text style={styles.weekLabelText}>Week 1</Text>
              <Text style={styles.weekLabelText}>Week {planProgress.totalWeeks}</Text>
            </View>

            <View style={styles.focusRail}>
              {focusSignals.map((item) => (
                <View key={item} style={styles.focusChip}>
                  <Text style={styles.focusChipText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        </LinearGradient>

        <View style={styles.overviewGrid}>
          {overviewMetrics.map((metric) => (
            <View key={metric.label} style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>{metric.label}</Text>
              <Text style={[styles.overviewValue, { color: metric.tone }]} numberOfLines={1}>
                {metric.value}
              </Text>
              <Text style={styles.overviewMeta} numberOfLines={1}>{metric.meta}</Text>
            </View>
          ))}
        </View>

        <View style={styles.adherenceCard}>
          <View style={styles.adherenceHeader}>
            <View>
              <Text style={styles.signalTitle}>Adherence</Text>
              <Text style={styles.cardSub}>Last 14 days of completed training</Text>
            </View>
            <View style={styles.streakBadge}>
              <Text style={styles.streakBadgeValue}>{weeklySnapshot.streak}</Text>
              <Text style={styles.streakBadgeLabel}>done</Text>
            </View>
          </View>
          <View style={styles.adherenceRail}>
            {adherenceDays.map((day) => (
              <View key={day.key} style={styles.adherenceDayWrap}>
                <View
                  style={[
                    styles.adherenceDot,
                    day.completed && styles.adherenceDotDone,
                    day.isToday && styles.adherenceDotToday,
                  ]}
                />
                <Text style={[styles.adherenceDayLabel, day.isToday && styles.adherenceDayLabelToday]}>
                  {day.shortLabel}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.insightRow}>
          <View style={[styles.signalCard, styles.insightColumn]}>
            <View style={styles.signalHeader}>
              <Text style={styles.signalTitle}>{uiCopy.progress.adaptationSignalsTitle}</Text>
              <Text style={styles.signalWindow}>{uiCopy.progress.adaptationSignalsWindow}</Text>
            </View>
            {swapSignals.length ? (
              <View style={styles.signalList}>
                {swapSignals.slice(0, 3).map((signal) => (
                  <View key={`${signal.source}:${signal.key}`} style={styles.signalRow}>
                    <Text style={styles.signalLabel} numberOfLines={1}>
                      {signal.source === 'workout'
                        ? uiCopy.progress.signalSourceWorkout
                        : uiCopy.progress.signalSourceMeal}
                      : {signal.label}
                    </Text>
                    <Text style={styles.signalCount}>{signal.count}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.signalEmpty}>{uiCopy.progress.adaptationSignalsEmpty}</Text>
            )}
          </View>

          <View style={[styles.actionCard, styles.insightColumn]}>
            <Text style={styles.actionLabel}>Coach Note</Text>
            <Text style={styles.actionTitle}>{weeklyAction.title}</Text>
            <Text style={styles.actionBody}>{weeklyAction.body}</Text>
            <View style={styles.coachMetaRow}>
              <Text style={styles.coachMetaText}>{weeklySnapshot.currentWeekSessions} sessions in the last 7 days</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View>
              <Text style={styles.cardTitle}>Key Lifts</Text>
              <Text style={styles.cardSub}>Estimated top-end strength for your main movements</Text>
            </View>
          </View>
          {keyLiftCards.length ? (
            <View style={styles.keyLiftGrid}>
              {keyLiftCards.map((lift) => (
                <View key={lift.id} style={styles.keyLiftCard}>
                  <Text style={styles.keyLiftName} numberOfLines={1}>{lift.name}</Text>
                  <Text style={styles.keyLiftValue}>{lift.latestValue}</Text>
                  <Text style={styles.keyLiftMeta}>est. 1RM</Text>
                  <Text style={[styles.keyLiftChange, lift.change < 0 && styles.keyLiftChangeDown]}>
                    {lift.change >= 0 ? '+' : ''}{lift.change} vs first log
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>Log weighted sets to unlock key lift trends.</Text>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View>
              <Text style={styles.cardTitle}>Muscle Balance</Text>
              <Text style={styles.cardSub}>Weekly set balance against a simple 10-set baseline</Text>
            </View>
          </View>
          {muscleBalanceRows.length ? (
            <>
              <View style={styles.balanceList}>
                {muscleBalanceRows.map((row) => (
                  <View key={row.muscle} style={styles.balanceRow}>
                    <View style={styles.balanceRowTop}>
                      <Text style={styles.balanceMuscle}>{row.muscle}</Text>
                      <Text style={styles.balanceSets}>{row.sets}/{row.target} sets</Text>
                    </View>
                    <View style={styles.balanceTrack}>
                      <View style={[styles.balanceFill, { width: `${Math.max(8, row.ratio * 100)}%` }]} />
                    </View>
                  </View>
                ))}
              </View>
              {undertrainedMuscles.length ? (
                <View style={styles.balanceCallout}>
                  <Text style={styles.balanceCalloutTitle}>Undertrained right now</Text>
                  <Text style={styles.balanceCalloutText}>
                    {undertrainedMuscles.map((row) => row.muscle).join(', ')}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.emptyText}>Complete more workouts to see muscle balance.</Text>
          )}
        </View>

        <View style={styles.tabRow}>
          {VIEW_TABS.map((tab) => {
            const isActive = activeView === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setActiveView(tab.id)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeView === 'muscles' && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View>
                <Text style={styles.cardTitle}>Muscle Volume</Text>
                <Text style={styles.cardSub}>Weekly set trends across your main muscle groups</Text>
              </View>
              <View style={styles.totalSetsPill}>
                <Text style={styles.totalSetsText}>{totalSets} sets</Text>
              </View>
            </View>
            {volumeData.length ? (
              <>
                <View style={styles.chartWrap}>
                  <VictoryChart
                    width={SCREEN_WIDTH - 64}
                    height={240}
                    padding={{ top: 16, bottom: 36, left: 44, right: 16 }}
                  >
                    <VictoryAxis
                      style={{
                        axis: { stroke: 'rgba(255,255,255,0.08)' },
                        tickLabels: { fill: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
                      }}
                    />
                    <VictoryAxis
                      dependentAxis
                      style={{
                        axis: { stroke: 'transparent' },
                        tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
                        grid: { stroke: 'rgba(255,255,255,0.05)' },
                      }}
                    />
                    {muscleTrend.series.map((entry) => {
                      const item = volumeData.find((volume) => volume.muscle === entry.muscle);
                      const color = item?.color ?? COLORS.accent;
                      const isActive = activeMuscle === entry.muscle;
                      return (
                        <VictoryLine
                          key={entry.muscle}
                          data={entry.data}
                          x="week"
                          y="sets"
                          style={{
                            data: {
                              stroke: color,
                              strokeWidth: isActive ? 3 : 1.5,
                              opacity: isActive ? 1 : 0.3,
                            },
                          }}
                        />
                      );
                    })}
                  </VictoryChart>
                </View>
                <View style={styles.selectorRow}>
                  {volumeData.map((item) => (
                    <TouchableOpacity
                      key={item.muscle}
                      style={[styles.selectorChip, activeMuscle === item.muscle && styles.selectorChipActive]}
                      onPress={() => setSelectedMuscle(item.muscle)}
                    >
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.selectorChipText, activeMuscle === item.muscle && styles.selectorChipTextActive]}>
                        {item.muscle}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>No completed workout sets yet.</Text>
            )}
            {activeMuscle ? (
              <View style={styles.historyBlock}>
                <Text style={styles.cardSub}>{activeMuscle} recent sessions</Text>
                {muscleWorkoutHistory.length ? (
                  muscleWorkoutHistory.slice(0, 5).map((entry) => (
                    <View key={entry.id} style={styles.workoutHistoryRow}>
                      <Text style={styles.workoutHistoryDate}>{entry.date}</Text>
                      <Text style={styles.workoutHistoryMeta}>{entry.exercises} exercises</Text>
                      <Text style={styles.workoutHistorySets}>{entry.sets} sets</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No workouts found for this muscle.</Text>
                )}
              </View>
            ) : null}
          </View>
        )}

        {activeView === 'exercises' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Lift Progression</Text>
            <Text style={styles.cardSub}>Track the strongest trend for your key lifts</Text>
            <View style={styles.chartWrap}>
              <VictoryChart
                width={SCREEN_WIDTH - 64}
                height={240}
                padding={{ top: 16, bottom: 36, left: 44, right: 16 }}
              >
                <VictoryAxis
                  style={{
                    axis: { stroke: 'rgba(255,255,255,0.08)' },
                    tickLabels: { fill: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  style={{
                    axis: { stroke: 'transparent' },
                    tickLabels: { fill: COLORS.textMuted, fontSize: 10 },
                    grid: { stroke: 'rgba(255,255,255,0.05)' },
                    }}
                  />
                <VictoryLine
                  data={exerciseData}
                  x="week"
                  y="weight"
                  style={{ data: { stroke: COLORS.accent, strokeWidth: 3 } }}
                />
              </VictoryChart>
            </View>

            <View style={styles.selectorRow}>
              {exerciseOptions.map((exercise) => (
                <TouchableOpacity
                  key={exercise.id}
                  style={[styles.selectorChip, activeExercise === exercise.id && styles.selectorChipActive]}
                  onPress={() => setSelectedExercise(exercise.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.liftDot, { backgroundColor: exercise.color }]} />
                  <Text style={[styles.selectorChipText, activeExercise === exercise.id && styles.selectorChipTextActive]}>
                    {exercise.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.liftSummaryRow}>
              {exerciseOptions
                .filter((exercise) => exercise.id === activeExercise)
                .map((exercise) => (
                  <View key={exercise.id} style={styles.liftSummaryPill}>
                    <Text style={styles.liftSummaryLabel}>Latest</Text>
                    <Text style={[styles.liftSummaryValue, { color: exercise.color }]}>{exercise.valueText}</Text>
                    <Text style={styles.liftSummaryGain}>{exercise.gainText}</Text>
                  </View>
                ))}
            </View>
            <View style={styles.historyBlock}>
              <Text style={styles.cardSub}>Recent sessions</Text>
              {exerciseWorkoutHistory.length ? (
                exerciseWorkoutHistory.slice(0, 5).map((entry) => (
                  <View key={entry.id} style={styles.workoutHistoryRow}>
                    <Text style={styles.workoutHistoryDate}>{entry.date}</Text>
                    <Text style={styles.workoutHistoryMeta} numberOfLines={1}>{entry.exercises}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No workouts found for this lift.</Text>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 120 },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 },
  headerLeft: {},
  headerTitle: { fontSize: 32, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500', marginTop: 2 },
  adherencePill: {
    alignItems: 'center', backgroundColor: COLORS.successSoft,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(0,245,160,0.2)',
  },
  adherencePillValue: { fontSize: 20, fontWeight: '900', color: COLORS.success, letterSpacing: -0.5 },
  adherencePillLabel: { fontSize: 10, fontWeight: '600', color: COLORS.success, opacity: 0.7, letterSpacing: 0.3 },

  // Plan card
  planCard: { borderRadius: 20, borderWidth: 1, borderColor: COLORS.borderAccent, marginBottom: 20, overflow: 'hidden' },
  planCardInner: { padding: 18 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  planTopLeft: { flex: 1, paddingRight: 12 },
  planLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  planName: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  planDates: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500', marginTop: 4 },
  planStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planStatValue: { fontSize: 22, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: -0.5 },
  planStatLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, marginTop: 2 },
  planStatDiv: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },
  signalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 16,
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  signalTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.2,
  },
  signalWindow: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  signalList: {
    gap: 8,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  signalLabel: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginRight: 10,
  },
  signalCount: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.accent,
  },
  signalEmpty: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  actionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    backgroundColor: 'rgba(108,99,255,0.08)',
    padding: 14,
    marginBottom: 16,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  actionTitle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  actionBody: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    fontWeight: '500',
  },
  coachMetaRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  coachMetaText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },

  weekRow: { flexDirection: 'row', gap: 4, marginBottom: 6, alignItems: 'flex-end' },
  weekSlot: { flex: 1, position: 'relative', alignItems: 'center' },
  weekBar: { height: 6, width: '100%', borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  weekBarDone: { backgroundColor: `${COLORS.accent}60` },
  weekBarCurrent: { backgroundColor: COLORS.accent },
  weekDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent, position: 'absolute', bottom: -1, shadowColor: COLORS.accent, shadowOpacity: 0.8, shadowRadius: 4 },
  weekLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  weekLabelText: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },
  focusRail: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  focusChip: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  focusChipText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  overviewCard: {
    width: (SCREEN_WIDTH - 50) / 2,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardElevated,
  },
  overviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  overviewValue: { marginTop: 8, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  overviewMeta: { marginTop: 4, fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  insightRow: { gap: 12, marginBottom: 16 },
  insightColumn: { marginBottom: 0 },
  adherenceCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
  },
  adherenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  streakBadge: {
    minWidth: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,245,160,0.25)',
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  streakBadgeValue: { fontSize: 20, fontWeight: '900', color: COLORS.success },
  streakBadgeLabel: { fontSize: 10, fontWeight: '700', color: COLORS.success },
  adherenceRail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  adherenceDayWrap: { alignItems: 'center', flex: 1, gap: 6 },
  adherenceDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  adherenceDotDone: {
    backgroundColor: COLORS.success,
    borderColor: 'rgba(0,245,160,0.3)',
  },
  adherenceDotToday: {
    transform: [{ scale: 1.12 }],
    shadowColor: COLORS.accent,
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  adherenceDayLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  adherenceDayLabelToday: { color: COLORS.textPrimary },

  // Tabs
  tabRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 4, gap: 2, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: COLORS.accent },
  tabText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  tabTextActive: { color: '#fff' },
  goalCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
  },
  goalCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  goalCardTitle: { marginTop: 6, fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  goalRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  goalMetric: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  goalMetricCaption: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },
  goalMetricValue: { marginTop: 4, fontSize: 13, fontWeight: '800', color: COLORS.textPrimary },

  // Card base
  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  cardSub: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500', marginTop: 4 },
  totalSetsPill: { backgroundColor: COLORS.accentSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.borderAccent },
  totalSetsText: { fontSize: 12, fontWeight: '800', color: COLORS.accent },

  // Volume
  volumeList: { gap: 12 },
  emptyText: { fontSize: 13, fontWeight: '500', color: COLORS.textMuted },
  volumeRow: {},
  volumeRowActive: {
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    borderRadius: 10,
    padding: 8,
    backgroundColor: COLORS.accentSoft,
  },
  volumeRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  volumeLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  volumeCount: { fontSize: 13, fontWeight: '800' },
  barTrack: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    width: (SCREEN_WIDTH - 50) / 2,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  statValue: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  statUnit: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginTop: 1, marginBottom: 6 },
  statLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },

  // Chart
  chartWrap: { marginVertical: 8, marginHorizontal: -4 },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  selectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectorChipActive: {
    borderColor: COLORS.borderAccent,
    backgroundColor: COLORS.accentSoft,
  },
  selectorChipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  selectorChipTextActive: {
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },

  // Lift list
  liftList: { gap: 10, marginTop: 16 },
  liftRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  liftRowActive: {
    borderColor: COLORS.borderAccent,
    backgroundColor: COLORS.accentSoft,
  },
  liftDot: { width: 10, height: 10, borderRadius: 5 },
  liftName: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  liftValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  liftGain: { fontSize: 12, fontWeight: '700', color: COLORS.success, minWidth: 54, textAlign: 'right' },
  liftSummaryRow: { marginTop: 12 },
  liftSummaryPill: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  liftSummaryLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  liftSummaryValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  liftSummaryGain: {
    marginLeft: 'auto',
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '700',
  },
  keyLiftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  keyLiftCard: {
    width: (SCREEN_WIDTH - 50) / 2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 14,
  },
  keyLiftName: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  keyLiftValue: { marginTop: 10, fontSize: 28, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: -0.8 },
  keyLiftMeta: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  keyLiftChange: { marginTop: 12, fontSize: 12, fontWeight: '700', color: COLORS.success },
  keyLiftChangeDown: { color: COLORS.pink },
  balanceList: { gap: 12 },
  balanceRow: { gap: 6 },
  balanceRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceMuscle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  balanceSets: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  balanceTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  balanceFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },
  balanceCallout: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    backgroundColor: COLORS.accentSoft,
    padding: 12,
  },
  balanceCalloutTitle: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  balanceCalloutText: { marginTop: 6, fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  workoutHistoryList: { gap: 8 },
  workoutHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  workoutHistoryDate: { width: 92, fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  workoutHistoryMeta: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  workoutHistorySets: { fontSize: 12, fontWeight: '800', color: COLORS.accent },
  historyBlock: { marginTop: 16, gap: 8 },

});
