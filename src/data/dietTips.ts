import { EatingMode } from '../types/domain';

export type DietTip = {
  mode: EatingMode;
  label: string;
  description: string;
  rules: string[];
};

export const dietTips: Record<EatingMode, DietTip> = {
  mild_deficit: {
    mode: 'mild_deficit',
    label: 'Mild Deficit',
    description: 'Gradual, sustainable fat loss while preserving muscle',
    rules: [
      'Eat 2+ palm-sized protein servings per day',
      'Stop eating at 7/10 fullness',
      'Limit sugary drinks and processed snacks',
      'Include vegetables with most meals',
    ],
  },
  recomp: {
    mode: 'recomp',
    label: 'Recomposition',
    description: 'Build muscle while losing fat simultaneously',
    rules: [
      'Prioritize protein at every meal (2-3 servings daily)',
      'Eat near maintenance calories',
      'Focus on whole foods and consistent meal timing',
      'Stay hydrated (8+ glasses water daily)',
    ],
  },
  lean_bulk: {
    mode: 'lean_bulk',
    label: 'Lean Bulk',
    description: 'Build muscle with minimal fat gain',
    rules: [
      'Eat 3+ palm-sized protein servings daily',
      'Add healthy carbs around training',
      'Include healthy fats (nuts, avocado, olive oil)',
      'Eat until comfortably full (8/10 fullness)',
    ],
  },
  maintenance: {
    mode: 'maintenance',
    label: 'Maintenance',
    description: 'Sustain current physique and performance',
    rules: [
      'Eat 2-3 palm-sized protein servings daily',
      'Listen to hunger cues',
      'Include a variety of whole foods',
      'Maintain consistent eating patterns',
    ],
  },
};