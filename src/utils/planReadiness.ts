import { User } from '../types/domain';

export const PLAN_INPUT_LABELS = {
  name: 'Name',
  sex: 'Sex',
  age: 'Age',
  heightCm: 'Height',
  experienceLevel: 'Experience level',
  trainingSplit: 'Training split',
  eatingMode: 'Eating mode',
} as const;

export type PlanInputKey = keyof typeof PLAN_INPUT_LABELS;

export const getMissingPlanInputs = (user?: User | null): PlanInputKey[] => {
  if (!user) {
    return ['name', 'sex', 'age', 'heightCm', 'experienceLevel', 'trainingSplit', 'eatingMode'];
  }

  const missing: PlanInputKey[] = [];
  if (!user.name?.trim()) missing.push('name');
  if (!user.sex) missing.push('sex');
  if (!Number.isFinite(user.age) || user.age <= 0) missing.push('age');
  if (!Number.isFinite(user.heightCm) || user.heightCm <= 0) missing.push('heightCm');
  if (!user.experienceLevel) missing.push('experienceLevel');
  if (!user.trainingSplit) missing.push('trainingSplit');
  if (!user.eatingMode) missing.push('eatingMode');
  return missing;
};

export const hasRequiredPlanInputs = (user?: User | null): boolean =>
  getMissingPlanInputs(user).length === 0;
