export type ScoreEnum = 'Great' | 'OK' | 'Avoid' | 'Unidentified';

export interface NutritionalFacts {
  calories?: number;
  serving_size?: string;
  total_fat_g?: number;
  saturated_fat_g?: number;
  trans_fat_g?: number;
  cholesterol_mg?: number;
  sodium_mg?: number;
  total_carbohydrate_g?: number;
  dietary_fiber_g?: number;
  total_sugars_g?: number;
  added_sugars_g?: number;
  protein_g?: number;
  vitamin_d_pct?: number;
  calcium_pct?: number;
  iron_pct?: number;
  potassium_pct?: number;
  flagged_ingredients: string[];
  detected_ingredients: string[];
}

export interface ProductItem {
  brand: string;
  product_name: string;
  nutritional_facts: NutritionalFacts;
  scoring: ScoreEnum;
  reasoning: string;
  reasoning_by_factor: string[];
  bounding_box: [number, number, number, number];
  data_source?: string;
  processing_level?: number;
}

export interface ShelfAnalysisResponse {
  products: ProductItem[];
  total_products_found: number;
  analysis_notes?: string;
}

export interface UserProfile {
  id: string;
  name?: string;
  allergies_and_conditions: string[];
  free_text_goals?: string;
  dietary_philosophy?: string;
  philosophy_customizations?: string;
  custom_philosophy_text?: string;
  avoided_ingredients: string[];
  processed_food_tolerance: number;
  created_at: string;
  updated_at: string;
}

export interface AllergyOption {
  key: string;
  description: string;
}

export interface PhilosophyOption {
  key: string;
  summary: string;
  description: string;
  avoid_categories: string[];
  favour_categories: string[];
}

export interface IngredientCategory {
  category: string;
  examples: string[];
  concern: string;
}

export interface ProfileOptions {
  allergies_and_conditions: AllergyOption[];
  dietary_philosophies: PhilosophyOption[];
  ingredient_categories: IngredientCategory[];
  processed_food_tolerance_labels: Record<string, string>;
}

export interface NutritionPlanStep {
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface NutritionPlanResponse {
  summary: string;
  daily_targets: Record<string, string>;
  weekly_focus_areas: string[];
  steps: NutritionPlanStep[];
  foods_to_emphasise: string[];
  foods_to_limit: string[];
  supplements_to_consider: string[];
  lifestyle_notes: string[];
}

export const SCORE_COLORS: Record<ScoreEnum, string> = {
  Great: '#22c55e',
  OK: '#eab308',
  Avoid: '#ef4444',
  Unidentified: '#6b7280',
};

export const SCORE_BG: Record<ScoreEnum, string> = {
  Great: 'rgba(34,197,94,0.2)',
  OK: 'rgba(234,179,8,0.2)',
  Avoid: 'rgba(239,68,68,0.2)',
  Unidentified: 'rgba(107,114,128,0.2)',
};

export const NOVA_LABELS: Record<number, string> = {
  1: 'Unprocessed',
  2: 'Minimally processed',
  3: 'Processed',
  4: 'Ultra-processed',
};

export const NOVA_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#84cc16',
  3: '#eab308',
  4: '#ef4444',
};
