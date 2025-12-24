import { DailyMealPlan, MealPlanMeal } from '../types/domain';

const formatMealTypeLabel = (raw?: string | null) => {
  if (!raw) return 'Meal';
  const normalized = raw.replace(/_/g, ' ').trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const normalizeDateString = (value?: string | null): string =>
  value?.includes('T') ? value.split('T')[0] : value || '';

export const mapMealPlanRow = (row: any, phasePlanId?: string): DailyMealPlan => {
  if (row.meal_date) {
    const normalizedDate = normalizeDateString(row.meal_date);
    const dayCompleted = Boolean(row.completed);
    const grouped: Record<string, MealPlanMeal> = {};
    (row.meal_entries || []).forEach((entry: any) => {
      const key = entry.meal_type || 'meal';
      if (!grouped[key]) {
        grouped[key] = {
          title: formatMealTypeLabel(entry.meal_type),
          items: [],
          completed: dayCompleted,
        };
      }
      const macros: string[] = [];
      if (typeof entry.calories === 'number') macros.push(`${entry.calories} kcal`);
      if (typeof entry.protein_g === 'number') macros.push(`P${entry.protein_g}g`);
      if (typeof entry.carbs_g === 'number') macros.push(`C${entry.carbs_g}g`);
      if (typeof entry.fat_g === 'number') macros.push(`F${entry.fat_g}g`);
      const detail = macros.length ? ` (${macros.join(' • ')})` : '';
      grouped[key].items.push(`${entry.food_name || 'Food'}${detail}`);
    });
    const meals = Object.values(grouped);
    return {
      id: row.id,
      date: normalizedDate,
      phasePlanId: phasePlanId || row.plan_id || 'phase',
      meals,
      completed: dayCompleted,
    };
  }

  const fallbackCompleted = typeof row.completed === 'boolean' ? row.completed : false;
  const meals: MealPlanMeal[] = (row.meals || []).map((meal: any) => ({
    title: meal.title,
    items: meal.items || [],
    completed: typeof meal.completed === 'boolean' ? meal.completed : fallbackCompleted,
  }));
  return {
    id: row.id,
    date: normalizeDateString(row.date),
    phasePlanId: phasePlanId || row.plan_id || 'phase',
    meals,
    completed:
      typeof row.completed === 'boolean'
        ? row.completed
        : meals.every((meal) => meal.completed),
  };
};
