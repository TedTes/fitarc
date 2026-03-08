import { RuntimeMealEntry, RuntimeMealsByType } from '../services/mealRuntimeService';

export const MEAL_ORDER = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Meal'] as const;

export const SWAP_REASONS = [
  { key: 'preference', label: 'Preference' },
  { key: 'availability', label: 'Not available' },
  { key: 'time', label: 'Time constraints' },
] as const;

export type SwapReasonKey = (typeof SWAP_REASONS)[number]['key'];

export const sumMacro = (
  entries: RuntimeMealEntry[],
  key: 'calories' | 'protein' | 'carbs' | 'fats'
): number => Math.round(entries.reduce((sum, entry) => sum + ((entry[key] as number | null | undefined) ?? 0), 0));

export const sortedSlots = (mealsByType: RuntimeMealsByType): Array<[string, RuntimeMealEntry[]]> =>
  Object.entries(mealsByType).sort(([a], [b]) => {
    const ai = MEAL_ORDER.indexOf(a as (typeof MEAL_ORDER)[number]);
    const bi = MEAL_ORDER.indexOf(b as (typeof MEAL_ORDER)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  }) as Array<[string, RuntimeMealEntry[]]>;

export const flattenMeals = (mealsByType: RuntimeMealsByType): RuntimeMealEntry[] =>
  Object.values(mealsByType).flat();

export const findMealEntry = (
  mealsByType: RuntimeMealsByType,
  locator: { id?: string; mealType: string; foodName: string; displayOrder?: number | null }
): RuntimeMealEntry | null => {
  const entries = flattenMeals(mealsByType);
  if (locator.id) {
    const byId = entries.find((entry) => entry.id === locator.id);
    if (byId) return byId;
  }
  return (
    entries.find(
      (entry) =>
        entry.mealType === locator.mealType &&
        entry.foodName === locator.foodName &&
        (entry.displayOrder ?? null) === (locator.displayOrder ?? null)
    ) ?? null
  );
};

const slug = (value?: string | null): string =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const buildStructuredMealSwapReason = (params: {
  userReason: SwapReasonKey;
  from: RuntimeMealEntry;
  to: RuntimeMealEntry;
}): string => {
  const { userReason, from, to } = params;
  const fromCalories = Number(from.calories ?? 0);
  const toCalories = Number(to.calories ?? 0);
  const calorieShift =
    fromCalories > 0
      ? toCalories > fromCalories
        ? 'up'
        : toCalories < fromCalories
          ? 'down'
          : 'same'
      : 'unknown';

  return [
    `swap_reason:user_${userReason}`,
    `slot:${slug(from.mealType) || 'meal'}`,
    `from:${slug(from.foodName) || 'unknown'}`,
    `to:${slug(to.foodName) || 'unknown'}`,
    `calorie_shift:${calorieShift}`,
  ].join('|');
};
