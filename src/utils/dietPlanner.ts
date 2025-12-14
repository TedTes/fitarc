import { DailyMealPlan, MealPlanMeal, User } from '../types/domain';
import { mealPlanTemplates } from '../data/mealPlans';

export const createMealPlanForDate = (
  user: User,
  phasePlanId: string,
  date: string
): DailyMealPlan => {
  const templates = mealPlanTemplates[user.eatingMode] || mealPlanTemplates.maintenance;
  const meals: MealPlanMeal[] = templates.map((template) => ({
    title: template.title,
    items: template.items,
    completed: false,
  }));

  return {
    id: `meal_${phasePlanId}_${date}`,
    date,
    phasePlanId,
    meals,
    completed: false,
  };
};
