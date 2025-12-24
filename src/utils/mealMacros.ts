import { MealsByType, MealEntry } from '../services/mealService';

export type MacroSummary = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  entryCount: number;
};

const addValue = (current: number, value?: number | null): number => {
  if (value == null || Number.isNaN(value)) {
    return current;
  }
  return current + value;
};

export const computeMealMacroTotals = (
  mealsByType: MealsByType | Record<string, MealEntry[]>
): MacroSummary => {
  const summary: MacroSummary = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    entryCount: 0,
  };

  Object.values(mealsByType || {}).forEach((entries) => {
    entries.forEach((entry) => {
      summary.entryCount += 1;
      summary.calories = addValue(summary.calories, entry.calories);
      summary.protein = addValue(summary.protein, entry.protein);
      summary.carbs = addValue(summary.carbs, entry.carbs);
      summary.fats = addValue(summary.fats, entry.fats);
    });
  });

  return summary;
};

export const computeEntriesMacroTotals = (entries: MealEntry[]): MacroSummary => {
  const summary: MacroSummary = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    entryCount: 0,
  };

  entries.forEach((entry) => {
    summary.entryCount += 1;
    summary.calories = addValue(summary.calories, entry.calories);
    summary.protein = addValue(summary.protein, entry.protein);
    summary.carbs = addValue(summary.carbs, entry.carbs);
    summary.fats = addValue(summary.fats, entry.fats);
  });

  return summary;
};

const formatPart = (value: number, suffix: string) =>
  value > 0 ? `${Math.round(value)}${suffix}` : null;

export const formatMacroSummaryLine = (summary: MacroSummary): string => {
  if (!summary.entryCount) return 'No macros logged';
  const parts: string[] = [];
  const calories = formatPart(summary.calories, ' kcal');
  if (calories) parts.push(calories);
  const protein = formatPart(summary.protein, 'g P');
  if (protein) parts.push(protein);
  const carbs = formatPart(summary.carbs, 'g C');
  if (carbs) parts.push(carbs);
  const fats = formatPart(summary.fats, 'g F');
  if (fats) parts.push(fats);
  return parts.length ? parts.join(' · ') : 'No macros logged';
};

export const formatMealEntryMacros = (entry?: MealEntry | null): string => {
  if (!entry) return 'Macros TBD';
  const parts: string[] = [];
  if (typeof entry.calories === 'number') parts.push(`${entry.calories} kcal`);
  if (typeof entry.protein === 'number') parts.push(`P${entry.protein}g`);
  if (typeof entry.carbs === 'number') parts.push(`C${entry.carbs}g`);
  if (typeof entry.fats === 'number') parts.push(`F${entry.fats}g`);
  return parts.length ? parts.join(' · ') : 'Macros TBD';
};
