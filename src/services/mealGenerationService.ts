import { supabase } from '../lib/supabaseClient';

type MacroTargets = {
  protein_g: number;
  carbs_g: number;
  fats_g: number;
};

export type GenerateMealsParams = {
  user_id: string;
  plan_id: string;
  date: string;
  calorie_target: number;
  macro_targets: MacroTargets;
  meal_count: number;
  dietary_tags?: string[];
  excluded_ingredients?: string[];
  preferred_ingredients?: string[];
  cuisine?: string;
  max_ready_time_minutes?: number;
  force_regenerate?: boolean;
};

export type GenerateMealsResponse = {
  cached: boolean;
  plan_id: string;
  date: string;
  calorie_target: number;
  macro_targets: MacroTargets;
  meals: Array<{
    meal_type: string;
    title: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    source_url?: string;
    ingredients?: string[];
  }>;
};

export const generateMealsForDay = async (
  params: GenerateMealsParams
): Promise<GenerateMealsResponse> => {
  const { data, error } = await supabase.functions.invoke('generate-meals', {
    body: params,
  });
  console.log("from fron")
  console.log(data)
  if (error) {
    throw error;
  }

  return data as GenerateMealsResponse;
};
