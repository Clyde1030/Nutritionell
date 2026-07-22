export type ScoreEnum = 'Great Fit' | 'Just OK Fit' | 'Neutral Fit' | "Doesn't Fit" | 'Unidentified';

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

export interface ScoreBreakdown {
  hard_exclusion: boolean;
  hard_exclusion_reasons: string[];
  philosophy_score?: number;
  goal_score?: number;
  ingredient_score?: number;
  processing_score?: number;
  nutrition_score?: number;
  total_score?: number;
}

export interface ProductItem {
  brand: string;
  product_name: string;
  variant?: string;
  canonical_search_name?: string;
  nutritional_facts: NutritionalFacts;
  scoring: ScoreEnum;
  score_breakdown?: ScoreBreakdown;
  reasoning: string;
  reasoning_by_factor: string[];
  bounding_box: [number, number, number, number];
  data_source?: string;
  processing_level?: number;
  allergens: string[];
  dietary_tags: string[];
  crop_image?: string;
}

export interface ShelfAnalysisResponse {
  products: ProductItem[];
  total_products_found: number;
  analysis_notes?: string;
}

export interface UserProfile {
  id: string;
  name?: string;
  sex?: string;
  age_group?: string;
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

export interface SexOption {
  key: string;
  description: string;
}

export interface AgeGroupOption {
  key: string;
  description: string;
}

export interface ProfileOptions {
  sex_options: SexOption[];
  age_group_options: AgeGroupOption[];
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

// The scoring key IS the display label now (the backend's deterministic
// scoring prompt returns "Great Fit" / "Just OK Fit" / "Neutral Fit" /
// "Doesn't Fit" / "Unidentified" directly) — this map is an identity lookup
// kept so existing call sites (SCORE_LABELS[p.scoring]) don't need to change.
export const SCORE_LABELS: Record<ScoreEnum, string> = {
  'Great Fit': 'Great Fit',
  'Just OK Fit': 'Just OK Fit',
  'Neutral Fit': 'Neutral Fit',
  "Doesn't Fit": "Doesn't Fit",
  Unidentified: 'Unidentified',
};

// Mirrors the backend's deterministic total_score bands (score_breakdown.total_score):
// 7-9 Great Fit / 4-6 Just OK Fit / 0-3 Neutral Fit / below 0 Doesn't Fit
// (or an instant "Doesn't Fit" from a Step 1 hard exclusion, skipping scoring).
export const SCORE_DESCRIPTIONS: Record<ScoreEnum, string> = {
  'Great Fit': "Total score 7-9 — strongly aligns with your dietary philosophy, health goals, ingredient quality, processing level, and nutrition profile.",
  'Just OK Fit': "Total score 4-6 — no hard exclusions, and it leans positive, but only moderately supports your goals and preferences.",
  'Neutral Fit': "Total score 0-3 — no hard exclusions and no meaningful conflicts, but it doesn't meaningfully advance your goals either.",
  "Doesn't Fit": "Contains an allergy, an avoided ingredient, conflicts with your dietary philosophy or a medical condition, or exceeds your processing tolerance — an instant hard exclusion — or the five scored dimensions summed below 0.",
  Unidentified: "The product couldn't be confidently identified from the photo, so we couldn't evaluate it against your profile.",
};

export const SCORE_COLORS: Record<ScoreEnum, string> = {
  'Great Fit': '#22c55e',
  'Just OK Fit': '#eab308',
  'Neutral Fit': '#38bdf8',
  "Doesn't Fit": '#ef4444',
  Unidentified: '#6b7280',
};

export const SCORE_BG: Record<ScoreEnum, string> = {
  'Great Fit': 'rgba(34,197,94,0.2)',
  'Just OK Fit': 'rgba(234,179,8,0.2)',
  'Neutral Fit': 'rgba(56,189,248,0.2)',
  "Doesn't Fit": 'rgba(239,68,68,0.2)',
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
