import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { PhasePlan, DailyAdherenceLog, WorkoutSession } from '../types/domain';

type TodayScreenProps = {
  phase: PhasePlan;
  onLogAdherence: (log: DailyAdherenceLog) => void;
  todayLog: DailyAdherenceLog | null;
};

export const TodayScreen: React.FC<TodayScreenProps> = ({ phase, onLogAdherence, todayLog }) => {
  const [workoutDone, setWorkoutDone] = useState(todayLog?.workoutDone || false);
  const [dietFollowed, setDietFollowed] = useState(todayLog?.dietFollowed || false);
  const [stepsTargetMet, setStepsTargetMet] = useState(todayLog?.habits.stepsTargetMet || false);
  const [sleepTargetMet, setSleepTargetMet] = useState(todayLog?.habits.sleepTargetMet || false);

  useEffect(() => {
    if (todayLog) {
      setWorkoutDone(todayLog.workoutDone);
      setDietFollowed(todayLog.dietFollowed);
      setStepsTargetMet(todayLog.habits.stepsTargetMet || false);
      setSleepTargetMet(todayLog.habits.sleepTargetMet || false);
    }
  }, [todayLog]);

  const getTodayWorkout = (): WorkoutSession | null => {
    const dayOfWeek = new Date().getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[dayOfWeek];

    return phase.workoutSessions.find(session => 
      session.dayHint?.toLowerCase().includes(todayName.toLowerCase())
    ) || null;
  };

  const calculateAdherenceScore = (): number => {
    let score = 0;
    if (workoutDone) score += 40;
    if (dietFollowed) score += 40;
    if (stepsTargetMet) score += 10;
    if (sleepTargetMet) score += 10;
    return score;
  };

  const handleSave = () => {
    const today = new Date().toISOString().split('T')[0];
    const log: DailyAdherenceLog = {
      id: todayLog?.id || `log_${Date.now()}`,
      date: today,
      phasePlanId: phase.id,
      workoutDone,
      dietFollowed,
      habits: {
        stepsTargetMet,
        sleepTargetMet,
      },
      adherenceScore: calculateAdherenceScore(),
      createdAt: new Date().toISOString(),
    };
    onLogAdherence(log);
  };

  const todayWorkout = getTodayWorkout();
  const adherenceScore = calculateAdherenceScore();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Today</Text>
      <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      })}</Text>

      {todayWorkout && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Workout</Text>
            <TouchableOpacity
              style={[styles.checkbox, workoutDone && styles.checkboxChecked]}
              onPress={() => setWorkoutDone(!workoutDone)}
            >
              {workoutDone && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          </View>
          
          <Text style={styles.workoutName}>{todayWorkout.name}</Text>
          
          <View style={styles.exerciseList}>
            {todayWorkout.exercises.map((exercise, index) => (
              <View key={index} style={styles.exerciseRow}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                <Text style={styles.exerciseDetails}>
                  {exercise.sets} × {exercise.repsRange}
                </Text>
              </View>
            ))}
          </View>

          {todayWorkout.exercises.some(e => e.notes) && (
            <View style={styles.notesSection}>
              {todayWorkout.exercises.filter(e => e.notes).map((exercise, index) => (
                <Text key={index} style={styles.note}>
                  • {exercise.name}: {exercise.notes}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {!todayWorkout && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rest Day</Text>
          <Text style={styles.restMessage}>No workout scheduled today. Focus on recovery!</Text>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Diet</Text>
          <TouchableOpacity
            style={[styles.checkbox, dietFollowed && styles.checkboxChecked]}
            onPress={() => setDietFollowed(!dietFollowed)}
          >
            {dietFollowed && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.dietMode}>{phase.dietMode.modeType.replace('_', ' ')}</Text>
        <Text style={styles.dietDescription}>{phase.dietMode.description}</Text>

        <View style={styles.rulesList}>
          <Text style={styles.rulesTitle}>Daily Rules:</Text>
          {phase.dietMode.rules.map((rule, index) => (
            <Text key={index} style={styles.ruleItem}>• {rule}</Text>
          ))}
        </View>
      </View>

      {(phase.habitTargets.minStepsPerDay || phase.habitTargets.minSleepHours) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Habits</Text>
          
          {phase.habitTargets.minStepsPerDay && (
            <TouchableOpacity
              style={styles.habitRow}
              onPress={() => setStepsTargetMet(!stepsTargetMet)}
            >
              <View style={[styles.checkbox, stepsTargetMet && styles.checkboxChecked]}>
                {stepsTargetMet && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.habitText}>
                {phase.habitTargets.minStepsPerDay}+ steps today
              </Text>
            </TouchableOpacity>
          )}

          {phase.habitTargets.minSleepHours && (
            <TouchableOpacity
              style={styles.habitRow}
              onPress={() => setSleepTargetMet(!sleepTargetMet)}
            >
              <View style={[styles.checkbox, sleepTargetMet && styles.checkboxChecked]}>
                {sleepTargetMet && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.habitText}>
                {phase.habitTargets.minSleepHours}h+ sleep
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>Today's Adherence Score</Text>
        <Text style={styles.scoreValue}>{adherenceScore}/100</Text>
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save Progress</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkmark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  workoutName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2196F3',
    marginBottom: 16,
  },
  exerciseList: {
    gap: 12,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  exerciseName: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  exerciseDetails: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  notesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  note: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  restMessage: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  dietMode: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
    textTransform: 'capitalize',
    marginBottom: 8,
  },
  dietDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  rulesList: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
  },
  rulesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  ruleItem: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  habitText: {
    fontSize: 16,
    color: '#333',
  },
  scoreCard: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});