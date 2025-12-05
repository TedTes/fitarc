import { PhasePlan, WorkoutSession, DietMode, User } from '../types/domain';

export const generateMockPhase = (user: User): PhasePlan => {
  const startDate = new Date();
  const expectedWeeks = 8;
  const expectedEndDate = new Date(startDate);
  expectedEndDate.setDate(expectedEndDate.getDate() + expectedWeeks * 7);

  const workoutSessions: WorkoutSession[] = [
    {
      id: 'session_upper_a',
      name: 'Upper Body A',
      dayHint: 'Monday',
      exercises: [
        { name: 'Bench Press', sets: 3, repsRange: '8-10', notes: 'Focus on controlled descent' },
        { name: 'Barbell Row', sets: 3, repsRange: '8-10' },
        { name: 'Overhead Press', sets: 3, repsRange: '8-12' },
        { name: 'Lat Pulldown', sets: 3, repsRange: '10-12' },
        { name: 'Bicep Curls', sets: 2, repsRange: '12-15' },
        { name: 'Tricep Pushdowns', sets: 2, repsRange: '12-15' },
      ],
    },
    {
      id: 'session_lower_a',
      name: 'Lower Body A',
      dayHint: 'Wednesday',
      exercises: [
        { name: 'Squat', sets: 4, repsRange: '6-8', notes: 'Depth below parallel' },
        { name: 'Romanian Deadlift', sets: 3, repsRange: '8-10' },
        { name: 'Leg Press', sets: 3, repsRange: '10-12' },
        { name: 'Leg Curl', sets: 3, repsRange: '10-12' },
        { name: 'Calf Raises', sets: 3, repsRange: '12-15' },
      ],
    },
    {
      id: 'session_upper_b',
      name: 'Upper Body B',
      dayHint: 'Friday',
      exercises: [
        { name: 'Incline Dumbbell Press', sets: 3, repsRange: '8-12' },
        { name: 'Cable Row', sets: 3, repsRange: '10-12' },
        { name: 'Dumbbell Lateral Raise', sets: 3, repsRange: '12-15' },
        { name: 'Face Pulls', sets: 3, repsRange: '15-20' },
        { name: 'Hammer Curls', sets: 2, repsRange: '12-15' },
        { name: 'Overhead Tricep Extension', sets: 2, repsRange: '12-15' },
      ],
    },
  ];

  const dietMode: DietMode = {
    modeType: 'mild_deficit',
    description: 'Small calorie deficit for gradual fat loss while maintaining muscle',
    rules: [
      'Eat 2-3 palm-sized portions of protein daily',
      'Include vegetables with at least 2 meals',
      'Drink water instead of sugary beverages',
      'Stop eating 2-3 hours before bed',
    ],
  };

  return {
    id: `phase_${Date.now()}`,
    currentLevelId: 1,
    targetLevelId: 2,
    targetCardId: 'mock_target_card_1',
    startDate: startDate.toISOString(),
    expectedEndDate: expectedEndDate.toISOString(),
    expectedWeeks: 8,
    phaseType: 'recomp',
    workoutSessions,
    dietMode,
    habitTargets: {
      minStepsPerDay: Number(7000),
      minSleepHours: Number(7),
    },
    status: 'active',
    createdAt: new Date().toISOString(),
  };
};