import { User } from '../types/domain';

type CalorieGoalResult = {
  bmr: number;
  activityFactor: number;
  maintenanceCalories: number;
  goalCalories: number;
};

const getSexOffset = (sex: User['sex']) => {
  if (sex === 'male') return 5;
  if (sex === 'female') return -161;
  return -78;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getActivityFactor = (user: User) => {
  const splitFactor: Record<User['trainingSplit'], number> = {
    full_body: 1.45,
    upper_lower: 1.5,
    push_pull_legs: 1.6,
    bro_split: 1.55,
    custom: 1.5,
  };
  const experienceDelta: Record<User['experienceLevel'], number> = {
    beginner: -0.05,
    intermediate: 0,
    advanced: 0.05,
  };

  const base = splitFactor[user.trainingSplit] ?? 1.5;
  const delta = experienceDelta[user.experienceLevel] ?? 0;
  return clamp(base + delta, 1.2, 1.9);
};

const getGoalAdjustment = (mode: User['eatingMode']) => {
  switch (mode) {
    case 'mild_deficit':
      return -0.15;
    case 'lean_bulk':
      return 0.1;
    case 'recomp':
    case 'maintenance':
    default:
      return 0;
  }
};

export const estimateDailyCalories = (user: User, fallback = 2500): CalorieGoalResult => {
  const { weightKg, heightCm, age } = user;
  if (!weightKg || weightKg <= 0 || heightCm <= 0 || age <= 0) {
    return {
      bmr: fallback,
      activityFactor: 1,
      maintenanceCalories: fallback,
      goalCalories: fallback,
    };
  }

  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + getSexOffset(user.sex);
  const activityFactor = getActivityFactor(user);
  const maintenanceCalories = bmr * activityFactor;
  const goalAdjustment = getGoalAdjustment(user.eatingMode);
  const rawGoal = maintenanceCalories * (1 + goalAdjustment);

  const minCalories =
    user.sex === 'male' ? 1500 : user.sex === 'female' ? 1200 : 1300;
  const goalCalories = clamp(Math.round(rawGoal / 10) * 10, minCalories, 4000);

  return {
    bmr: Math.round(bmr),
    activityFactor,
    maintenanceCalories: Math.round(maintenanceCalories),
    goalCalories,
  };
};
