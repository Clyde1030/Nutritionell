"""
Pydantic schemas for UserProfile.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

# ── Allergies & conditions with descriptions ──────────────────────────────────

ALLERGIES_AND_CONDITIONS: List[Dict[str, str]] = [
    {"key": "Peanut Allergy",              "description": "Avoids all peanuts and peanut-derived ingredients: peanut oil, peanut butter, mixed nuts containing peanuts."},
    {"key": "Tree Nut Allergy",            "description": "Avoids almonds, cashews, walnuts, pecans, pistachios, Brazil nuts, and products made in facilities that process tree nuts."},
    {"key": "Celiac/Gluten-Free",          "description": "Avoids wheat, barley, rye, and any ingredient derived from them: flour, malt, semolina, spelt, triticale."},
    {"key": "Dairy/Lactose Intolerance",   "description": "Avoids milk, cheese, butter, cream, yogurt, whey, casein, and lactose-containing additives."},
    {"key": "Soy Allergy",                 "description": "Avoids soybeans, tofu, tempeh, miso, edamame, soy sauce, and soy lecithin (unless highly refined)."},
    {"key": "Egg Allergy",                 "description": "Avoids whole eggs, egg whites, egg yolks, mayonnaise, meringue, albumin, and egg-containing baked goods."},
    {"key": "Shellfish Allergy",           "description": "Avoids shrimp, crab, lobster, clams, oysters, scallops, mussels, and products processed near shellfish."},
    {"key": "Fish Allergy",                "description": "Avoids finfish including salmon, tuna, cod, tilapia, halibut, and fish-derived ingredients like fish sauce and Worcester sauce."},
    {"key": "High Cholesterol",            "description": "Flags saturated fat > 5g/serving, trans fat > 0g, and high dietary cholesterol. Favours soluble fibre and unsaturated fats."},
    {"key": "High Blood Pressure",         "description": "Flags sodium > 600mg/serving and added sugars. Favours potassium-rich and low-sodium products."},
    {"key": "Type 2 Diabetes",             "description": "Flags added sugars, high glycaemic index carbohydrates, and low-fibre products. Favours high-protein, high-fibre options."},
    {"key": "Heart Disease",               "description": "Flags saturated fat, trans fat, excessive sodium, and added sugars. Favours omega-3 rich and whole-food products."},
    {"key": "Kidney Disease",              "description": "Flags high potassium (>200mg), high phosphorus, and high sodium. Requires careful monitoring of protein and mineral intake."},
]

# ── Dietary philosophies with descriptions ────────────────────────────────────

DIETARY_PHILOSOPHIES: List[Dict[str, Any]] = [
    {
        "key": "No Preference",
        "summary": "Balanced general diet guidance.",
        "description": "No specific dietary framework applied. Flags excessive sodium (>20% DV), excessive added sugars (>10% DV), and trans fats. Provides balanced nutritional guidance without restricting any food group.",
        "avoid_categories": [],
        "favour_categories": ["Whole foods", "Balanced macros"],
    },
    {
        "key": "Vegan",
        "summary": "No animal products whatsoever.",
        "description": "Eliminates all animal-derived foods and ingredients. Avoids meat, poultry, fish, dairy, eggs, honey, gelatin, casein, whey, carmine (red dye), and other animal by-products. Focuses on plants, legumes, grains, nuts, and seeds.",
        "avoid_categories": ["Meat", "Dairy", "Eggs", "Honey", "Gelatin", "Animal by-products"],
        "favour_categories": ["Legumes", "Whole grains", "Nuts & seeds", "Vegetables", "Fruits"],
    },
    {
        "key": "Vegetarian",
        "summary": "No meat or fish; dairy and eggs permitted.",
        "description": "Excludes all meat (beef, pork, poultry, game) and fish/seafood. Permits dairy products and eggs. Often motivated by ethics, environment, or health.",
        "avoid_categories": ["Meat", "Poultry", "Fish & seafood"],
        "favour_categories": ["Dairy", "Eggs", "Legumes", "Whole grains", "Vegetables"],
    },
    {
        "key": "Pescatarian",
        "summary": "Vegetarian + fish and seafood.",
        "description": "Excludes land-based meats but permits fish, shellfish, and other seafood. Dairy and eggs are also typically included.",
        "avoid_categories": ["Red meat", "Poultry"],
        "favour_categories": ["Fish & seafood", "Dairy", "Eggs", "Plants"],
    },
    {
        "key": "Keto",
        "summary": "Very low carb, high fat to maintain ketosis.",
        "description": "Restricts net carbohydrates to under 20–50g/day to induce ketosis. Avoids grains, sugar, most fruit, starchy vegetables, and legumes. Prioritises fats (avocado, olive oil, butter, meat) and moderate protein. Scores 'Avoid' for >10g net carbs per serving.",
        "avoid_categories": ["Grains", "Sugar", "Starchy vegetables", "Most fruits", "Legumes"],
        "favour_categories": ["Healthy fats", "Meat & fish", "Low-carb vegetables", "Nuts & seeds"],
    },
    {
        "key": "Paleo",
        "summary": "Ancestral whole foods; no grains, legumes, or dairy.",
        "description": "Mimics the presumed diet of Palaeolithic humans. Eliminates grains, legumes, dairy, refined sugar, seed oils, and processed foods. Focuses on meat, fish, eggs, vegetables, fruits, nuts, and seeds.",
        "avoid_categories": ["Grains", "Legumes", "Dairy", "Refined sugar", "Processed oils"],
        "favour_categories": ["Meat & fish", "Eggs", "Vegetables", "Fruits", "Nuts & seeds"],
    },
    {
        "key": "Mediterranean",
        "summary": "Plant-rich diet with olive oil, fish, and moderate wine.",
        "description": "Based on traditional diets of Mediterranean countries. Emphasises vegetables, fruits, whole grains, legumes, nuts, olive oil, and fish. Limits red meat and processed foods. Associated with strong cardiovascular health outcomes.",
        "avoid_categories": ["Red meat (limit)", "Refined grains", "Added sugars", "Ultra-processed foods"],
        "favour_categories": ["Olive oil", "Fish", "Whole grains", "Legumes", "Vegetables", "Fruit"],
    },
    {
        "key": "Carnivore",
        "summary": "Animal products only.",
        "description": "Eliminates all plant foods. Consists exclusively of meat, fish, eggs, and animal fats. Some variants include dairy. Often used for autoimmune conditions or as an elimination diet.",
        "avoid_categories": ["All plant foods", "Grains", "Vegetables", "Fruit", "Nuts"],
        "favour_categories": ["Beef", "Organ meats", "Fish", "Eggs", "Animal fats"],
    },
    {
        "key": "Whole30",
        "summary": "30-day elimination: no sugar, grains, dairy, or legumes.",
        "description": "A 30-day reset that eliminates added sugar, alcohol, grains, legumes, dairy, and most additives. Designed to identify food sensitivities. Focuses on meat, seafood, eggs, vegetables, fruit, and compatible fats.",
        "avoid_categories": ["Added sugar", "Alcohol", "Grains", "Legumes", "Dairy", "Carrageenan", "MSG", "Sulfites"],
        "favour_categories": ["Meat & seafood", "Eggs", "Vegetables", "Fruit", "Compatible oils"],
    },
    {
        "key": "Intermittent Fasting",
        "summary": "Time-restricted eating; focus on nutrient density.",
        "description": "Focuses on when you eat rather than what you eat. During eating windows, prioritises nutrient-dense whole foods. Flags empty-calorie products and high-sugar items that cause rapid blood sugar spikes.",
        "avoid_categories": ["Empty calories", "High-glycaemic foods", "Ultra-processed snacks"],
        "favour_categories": ["Protein-rich foods", "Healthy fats", "Fibre-rich vegetables"],
    },
    {
        "key": "Chris Masterjohn",
        "summary": "Nutrient density maximised through ancestral foods.",
        "description": "Based on Dr. Chris Masterjohn's research into nutritional biochemistry. Prioritises nutrient density through organ meats, pastured animal products, and traditional foods. Avoids seed oils (canola, soybean, sunflower), refined carbohydrates, and synthetic additives. Favours nose-to-tail eating and fermented foods.",
        "avoid_categories": ["Seed oils", "Refined carbs", "Synthetic additives", "Fortified junk foods"],
        "favour_categories": ["Organ meats", "Pastured meat & dairy", "Fermented foods", "Whole animal foods"],
    },
    {
        "key": "Standard American Diet",
        "summary": "No restrictions; general nutrition flags applied.",
        "description": "The typical Western diet with no deliberate restrictions. General balanced-diet guardrails applied: flags products with excessive saturated fat, sodium above 20% DV, and high added sugars.",
        "avoid_categories": [],
        "favour_categories": ["Balanced macros", "Moderate sodium", "Moderate sugar"],
    },
]

# Keys only (for backwards compat with existing code)
DIETARY_PHILOSOPHY_KEYS: List[str] = [p["key"] for p in DIETARY_PHILOSOPHIES]

# ── Ingredient avoidance categories (EWG / FoodDB inspired) ──────────────────

INGREDIENT_CATEGORIES: List[Dict[str, Any]] = [
    {
        "category": "Artificial Sweeteners",
        "examples": ["aspartame", "sucralose", "saccharin", "acesulfame-K", "neotame"],
        "concern": "Possible gut microbiome disruption; some linked to metabolic effects.",
    },
    {
        "category": "Artificial Colors",
        "examples": ["Red 40", "Yellow 5", "Yellow 6", "Blue 1", "Blue 2", "Red 3", "Green 3"],
        "concern": "Some linked to hyperactivity in children; several under regulatory review.",
    },
    {
        "category": "Artificial Preservatives",
        "examples": ["BHA", "BHT", "TBHQ", "sodium benzoate", "potassium sorbate"],
        "concern": "BHA/BHT listed as possible carcinogens; some cause allergic reactions.",
    },
    {
        "category": "High-Fructose Corn Syrup",
        "examples": ["high-fructose corn syrup", "HFCS", "corn syrup solids"],
        "concern": "Linked to obesity, insulin resistance, and fatty liver disease.",
    },
    {
        "category": "Trans Fats",
        "examples": ["partially hydrogenated oil", "hydrogenated vegetable oil"],
        "concern": "Strongly linked to cardiovascular disease. Largely banned but trace amounts allowed.",
    },
    {
        "category": "Seed Oils",
        "examples": ["canola oil", "soybean oil", "sunflower oil", "safflower oil", "corn oil", "cottonseed oil"],
        "concern": "High in omega-6 linoleic acid; excessive consumption may promote inflammation.",
    },
    {
        "category": "MSG & Glutamates",
        "examples": ["monosodium glutamate", "MSG", "autolyzed yeast extract", "hydrolyzed protein"],
        "concern": "Some individuals report sensitivity; used to enhance palatability and may encourage overconsumption.",
    },
    {
        "category": "Nitrates & Nitrites",
        "examples": ["sodium nitrate", "sodium nitrite", "potassium nitrate"],
        "concern": "Found in processed meats; can form nitrosamines which are potentially carcinogenic.",
    },
    {
        "category": "Carrageenan",
        "examples": ["carrageenan", "degraded carrageenan"],
        "concern": "Some research links it to gut inflammation; banned in certified organic foods in the EU.",
    },
    {
        "category": "Emulsifiers",
        "examples": ["polysorbate 80", "carboxymethylcellulose", "soy lecithin", "sunflower lecithin"],
        "concern": "Some emulsifiers may alter gut microbiome composition at high doses.",
    },
    {
        "category": "Refined Sugars",
        "examples": ["sugar", "white sugar", "cane sugar", "dextrose", "maltose", "corn syrup"],
        "concern": "Drives blood sugar spikes, insulin resistance, tooth decay, and excessive calorie intake.",
    },
    {
        "category": "Synthetic Vitamins & Fortification",
        "examples": ["folic acid", "cyanocobalamin", "dl-alpha-tocopherol", "retinyl palmitate"],
        "concern": "Synthetic forms may not be as bioavailable as whole-food sources; excess folic acid may mask B12 deficiency.",
    },
    {
        "category": "Brominated Compounds",
        "examples": ["brominated vegetable oil", "potassium bromate"],
        "concern": "Potassium bromate is a possible carcinogen; banned in many countries but still used in US flour.",
    },
    {
        "category": "Phosphate Additives",
        "examples": ["sodium phosphate", "disodium phosphate", "calcium phosphate", "phosphoric acid"],
        "concern": "High phosphate intake linked to kidney disease progression and cardiovascular risk.",
    },
]

PROCESSED_FOOD_TOLERANCE_LABELS = {
    0: "Unprocessed only — whole foods, no additives",
    1: "Minimally processed — basic prep only (frozen veg, plain canned beans)",
    2: "Low processing — single-ingredient processed (cheese, plain yogurt)",
    3: "Moderate — standard processed foods acceptable",
    4: "High — no restriction on processing level",
}


# ── Request / Response schemas ────────────────────────────────────────────────

class UserProfileCreate(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    allergies_and_conditions: List[str] = Field(default_factory=list)
    free_text_goals: Optional[str] = Field(None, max_length=2000)
    dietary_philosophy: Optional[str] = Field(None)
    philosophy_customizations: Optional[str] = Field(None, description="JSON string")
    custom_philosophy_text: Optional[str] = Field(None, max_length=3000)
    avoided_ingredients: List[str] = Field(default_factory=list)
    processed_food_tolerance: int = Field(default=3, ge=0, le=4)


class UserProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    allergies_and_conditions: Optional[List[str]] = None
    free_text_goals: Optional[str] = Field(None, max_length=2000)
    dietary_philosophy: Optional[str] = None
    philosophy_customizations: Optional[str] = None
    custom_philosophy_text: Optional[str] = Field(None, max_length=3000)
    avoided_ingredients: Optional[List[str]] = None
    processed_food_tolerance: Optional[int] = Field(None, ge=0, le=4)


class UserProfileResponse(BaseModel):
    id: UUID
    name: Optional[str]
    allergies_and_conditions: List[str]
    free_text_goals: Optional[str]
    dietary_philosophy: Optional[str]
    philosophy_customizations: Optional[str]
    custom_philosophy_text: Optional[str]
    avoided_ingredients: List[str]
    processed_food_tolerance: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProfileOptionsResponse(BaseModel):
    allergies_and_conditions: List[Dict[str, str]] = ALLERGIES_AND_CONDITIONS
    dietary_philosophies: List[Dict[str, Any]] = DIETARY_PHILOSOPHIES
    ingredient_categories: List[Dict[str, Any]] = INGREDIENT_CATEGORIES
    processed_food_tolerance_labels: Dict[int, str] = PROCESSED_FOOD_TOLERANCE_LABELS


# ── Nutrition plan ────────────────────────────────────────────────────────────

class NutritionPlanRequest(BaseModel):
    profile_id: str


class NutritionPlanStep(BaseModel):
    title: str
    detail: str
    priority: str  # "high" | "medium" | "low"


class NutritionPlanResponse(BaseModel):
    summary: str
    daily_targets: Dict[str, str]
    weekly_focus_areas: List[str]
    steps: List[NutritionPlanStep]
    foods_to_emphasise: List[str]
    foods_to_limit: List[str]
    supplements_to_consider: List[str]
    lifestyle_notes: List[str]
