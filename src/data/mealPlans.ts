import { EatingMode } from '../types/domain';

export type MealPlanTemplate = {
  title: string;
  items: string[];
};

export const mealPlanTemplates: Record<EatingMode, MealPlanTemplate[]> = {
  mild_deficit: [
    { title: 'Breakfast', items: ['Protein oats', 'Blueberries', 'Green tea'] },
    { title: 'Lunch', items: ['Grilled chicken bowl', 'Mixed greens'] },
    { title: 'Snack', items: ['Greek yogurt', 'Almond butter'] },
    { title: 'Dinner', items: ['Salmon + roasted veg', 'Sparkling water'] },
  ],
  recomp: [
    { title: 'Breakfast', items: ['Egg white wrap', 'Avocado', 'Orange'] },
    { title: 'Lunch', items: ['Turkey rice bowl', 'Veggies'] },
    { title: 'Snack', items: ['Cottage cheese', 'Berries'] },
    { title: 'Dinner', items: ['Lean beef + potatoes', 'Side salad'] },
  ],
  lean_bulk: [
    { title: 'Breakfast', items: ['Bagel + eggs', 'Greek yogurt parfait'] },
    { title: 'Lunch', items: ['Steak burrito bowl', 'Fruit juice'] },
    { title: 'Snack', items: ['Protein shake', 'Trail mix'] },
    { title: 'Dinner', items: ['Pasta + chicken', 'Garlic bread'] },
  ],
  maintenance: [
    { title: 'Breakfast', items: ['Chia pudding', 'Latte'] },
    { title: 'Lunch', items: ['Sushi bowl', 'Edamame'] },
    { title: 'Snack', items: ['Protein smoothie', 'Rice cakes'] },
    { title: 'Dinner', items: ['Tacos al pastor', 'Roasted peppers'] },
  ],
};
