import { NextRequest, NextResponse } from 'next/server';
import { computeConcernScore } from '@/lib/concern-scoring';

const USDA_API_KEY = process.env.USDA_API_KEY;
const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const SAMPLE_SIZE = 200;

// Legacy concern-level map — now derived from the 3-tier scoring system
// at runtime via deriveConcernLevel(), kept only as a fast-path cache
const CONCERN_LEVELS: Record<string, 'low' | 'medium' | 'high'> = {
  'red 40': 'high', 'red 40 lake': 'high', 'red #40': 'high',
  'yellow 5': 'high', 'yellow 5 lake': 'high', 'yellow #5': 'high',
  'yellow 6': 'high', 'yellow 6 lake': 'high', 'yellow #6': 'high',
  'blue 1': 'medium', 'blue 1 lake': 'medium', 'blue #1': 'medium',
  'blue 2': 'medium', 'blue 2 lake': 'medium',
  'red 3': 'high',
  'titanium dioxide': 'high',
  'high fructose corn syrup': 'high', 'hfcs': 'high',
  'corn syrup': 'medium', 'corn syrup solids': 'medium',
  'sodium benzoate': 'medium', 'potassium benzoate': 'medium',
  'sodium nitrite': 'high', 'sodium nitrate': 'high',
  'potassium bromate': 'high',
  'bha': 'high', 'bht': 'high', 'tbhq': 'medium',
  'aspartame': 'high', 'acesulfame potassium': 'medium', 'acesulfame k': 'medium',
  'sucralose': 'medium', 'saccharin': 'high',
  'carrageenan': 'medium',
  'polysorbate 80': 'high', 'polysorbate 60': 'medium',
  'msg': 'medium', 'monosodium glutamate': 'medium',
  'artificial flavors': 'medium', 'artificial flavor': 'medium',
  'artificial colors': 'medium', 'artificial color': 'medium',
  'natural flavors': 'low', 'natural flavor': 'low',
  'citric acid': 'low',
  'soy lecithin': 'low', 'soy protein isolate': 'low',
  'guar gum': 'low', 'xanthan gum': 'low', 'locust bean gum': 'low',
  'cellulose gum': 'low', 'cellulose gel': 'low',
  'mono and diglycerides': 'medium', 'mono & diglycerides': 'medium',
  'sodium phosphate': 'medium', 'calcium phosphate': 'low',
  'partially hydrogenated': 'high',
  'palm oil': 'medium', 'palm kernel oil': 'medium',
  'canola oil': 'low', 'soybean oil': 'low', 'sunflower oil': 'low',
  'modified food starch': 'low', 'modified corn starch': 'low',
  'maltodextrin': 'medium', 'dextrose': 'low',
  'sodium erythorbate': 'low', 'sodium phosphates': 'medium',
  'caramel color': 'medium',
};

// Curated safety profiles for well-researched additives (scientific literature, not USDA)
const SAFETY_PROFILES: Record<string, {
  name: string; risk_score: number; risk_label: string; category: string;
  fda_status: string; daily_limit: string; facts: string[]; ai_summary: string;
}> = {
  'red 40': {
    name: 'Red 40 (Allura Red AC)',
    risk_score: 72, risk_label: 'High Concern', category: 'Synthetic Food Dye',
    fda_status: 'GRAS — approved with ADI limit', daily_limit: '7 mg/kg body weight (ADI)',
    facts: [
      'Red 40 is the most widely used food dye in the US, found in ~40% of products containing artificial colors.',
      'Banned or requires warning labels in the EU (subject to "Southampton Six" warning).',
      'A 2021 California OEHHA report found sufficient evidence linking synthetic dyes to neurobehavioral effects in children.',
      'Made from petroleum-derived naphthalene; the manufacturing process produces known carcinogenic byproducts.',
      'FDA\'s safety approval dates to 1971 and has not been re-evaluated with modern toxicology methods.',
    ],
    ai_summary: 'Red 40 (Allura Red AC) is a petroleum-derived azo dye and the most prevalent synthetic colorant in the US food supply. While the FDA maintains its GRAS status with an ADI of 7 mg/kg, the evidence landscape has shifted significantly since its 1971 approval.\n\nThe primary concern is neurobehavioral: multiple randomized controlled trials (notably the 2007 McCann/Southampton study) demonstrated statistically significant increases in hyperactivity in children exposed to synthetic dye mixtures containing Red 40. The EU now requires products with Red 40 to carry the warning: "may have an adverse effect on activity and attention in children."\n\nBiologically, Red 40 is metabolized by gut bacteria into aromatic amines, some of which are structurally similar to known carcinogens. A 2022 McMaster University study in mice found that chronic exposure to Allura Red disrupted the gut microbiome, promoted intestinal inflammation, and increased susceptibility to colitis.\n\nFor most adults in normal dietary quantities, acute toxicity risk is low. However, for children, individuals with ADHD, or those with inflammatory bowel conditions, the risk-benefit ratio of consuming Red 40 — which provides zero nutritional value — warrants consideration.',
  },
  'carrageenan': {
    name: 'Carrageenan',
    risk_score: 55, risk_label: 'Moderate Concern', category: 'Thickener / Stabilizer',
    fda_status: 'GRAS — approved for food use', daily_limit: '75 mg/kg body weight (JECFA ADI)',
    facts: [
      'Extracted from red seaweed — technically "natural" but heavily processed via alkaline extraction.',
      'Degraded carrageenan (poligeenan) is a known inflammatory agent and tumor promoter in animal studies.',
      'The National Organic Standards Board voted to remove carrageenan from the approved organic list in 2016.',
      'Common in plant-based milks, deli meats, infant formula, and ice cream as a texturizer.',
      'Some studies show food-grade carrageenan triggers NF-kB inflammatory pathway activation in human intestinal cells.',
    ],
    ai_summary: 'Carrageenan is a polysaccharide extracted from red seaweed, used as a thickener and emulsifier in a wide range of processed foods. The safety debate centers on the distinction between food-grade carrageenan and its degraded form, poligeenan.\n\nPoligeenan is unambiguously harmful — it is used as a standard inflammatory agent in laboratory research. The concern is whether food-grade carrageenan degrades into poligeenan under acidic stomach conditions. In vitro studies suggest partial degradation occurs, though the extent in vivo remains debated.\n\nDr. Joanne Tobacman\'s research at the University of Illinois showed that food-grade carrageenan activates NF-kB and triggers inflammatory cascades in human intestinal epithelial cells at concentrations achievable through normal dietary intake. However, regulatory bodies (FDA, EFSA, JECFA) maintain that the evidence for harm at dietary levels is insufficient.\n\nFor individuals with IBS, IBD, or other GI conditions, avoiding carrageenan is a reasonable precaution. For the general population, occasional exposure is likely low-risk, but daily consumption through multiple products warrants awareness.',
  },
  'aspartame': {
    name: 'Aspartame',
    risk_score: 62, risk_label: 'Moderate-High Concern', category: 'Artificial Sweetener',
    fda_status: 'Approved — ADI of 50 mg/kg/day', daily_limit: '50 mg/kg body weight (FDA ADI)',
    facts: [
      'In 2023, IARC classified aspartame as "possibly carcinogenic to humans" (Group 2B).',
      'JECFA simultaneously reaffirmed the 40 mg/kg ADI, stating the cancer evidence was "not convincing."',
      'Metabolized into phenylalanine, aspartic acid, and methanol — dangerous for people with PKU.',
      'Found in over 6,000 products worldwide including diet sodas, sugar-free gum, and tabletop sweeteners.',
      'Some studies link regular consumption to altered gut microbiome composition and glucose intolerance.',
    ],
    ai_summary: 'Aspartame is the most studied artificial sweetener in history, and also the most controversial. It was approved by the FDA in 1981 and is approximately 200x sweeter than sugar.\n\nThe 2023 dual assessment created a complex narrative: IARC classified it as Group 2B ("possibly carcinogenic") based on limited evidence of hepatocellular carcinoma in humans, while JECFA found the same evidence unconvincing and maintained the existing ADI. Both assessments acknowledged that typical dietary exposure falls well below the ADI.\n\nBeyond cancer, emerging research focuses on metabolic effects. A 2022 Cell paper showed that saccharin and sucralose (and to a lesser extent aspartame) altered the gut microbiome in ways that impaired glycemic response — paradoxically worsening the metabolic issues artificial sweeteners aim to address.\n\nFor individuals with PKU, aspartame is strictly contraindicated due to its phenylalanine content. For the general population, the evidence suggests moderation is prudent, particularly for daily consumers of diet beverages.',
  },
  'sodium nitrite': {
    name: 'Sodium Nitrite',
    risk_score: 68, risk_label: 'High Concern', category: 'Preservative / Curing Agent',
    fda_status: 'GRAS — permitted in cured meats at regulated levels', daily_limit: '0.2 mg/kg body weight (EFSA ADI)',
    facts: [
      'Used in cured and processed meats (bacon, hot dogs, deli meats) to prevent Clostridium botulinum growth.',
      'Reacts with amino acids at high temperatures to form nitrosamines — classified as probable carcinogens (IARC Group 2A).',
      'WHO/IARC classified processed meats as Group 1 carcinogens in 2015, with nitrites as a contributing factor.',
      'Also occurs naturally in vegetables like beets and spinach, but plant-based nitrates include protective antioxidants.',
      'EFSA lowered the ADI in 2017 after reviewing new evidence on nitrosamine formation.',
    ],
    ai_summary: 'Sodium nitrite serves a dual purpose in cured meats: it prevents deadly botulism and creates the characteristic pink color and cured flavor. However, its safety profile is complicated by nitrosamine formation.\n\nWhen nitrite-cured meats are cooked at high temperatures (grilling, frying), nitrites react with amino acids to form N-nitroso compounds (nitrosamines), which are potent carcinogens. This reaction is the primary mechanistic basis for the IARC Group 1 classification of processed meats.\n\nThe context matters: nitrates in vegetables (which convert to nitrites in the body) are generally protective because they arrive with vitamin C and polyphenols that inhibit nitrosamine formation. Processed meats lack these protective co-factors.\n\nThe epidemiological evidence is substantial: a 2019 meta-analysis in the International Journal of Cancer found that each 50g/day increase in processed meat consumption was associated with an 18% increased risk of colorectal cancer. Reducing processed meat intake is one of the more evidence-backed dietary cancer prevention strategies.',
  },
};

function getDefaultSafetyProfile(ingredient: string) {
  return {
    name: ingredient,
    risk_score: 45,
    risk_label: 'Moderate Concern',
    category: 'Food Additive',
    fda_status: 'GRAS — Generally Recognized as Safe',
    daily_limit: 'Not specifically established',
    facts: [
      `${ingredient} is found in processed foods as an additive.`,
      'Regulatory status varies between FDA (US), EFSA (EU), and other global agencies.',
      'Long-term safety data may be limited — many additives were approved decades ago under older testing standards.',
      'Individual sensitivity varies; some people report adverse reactions even to GRAS-listed substances.',
    ],
    ai_summary: `${ingredient} is a food additive found in various processed products. While it holds GRAS (Generally Recognized as Safe) status from the FDA, this classification was established under historical testing protocols that may not reflect current toxicological standards.\n\nAs with many food additives, the safety profile depends on dosage, frequency of exposure, and individual susceptibility. Consumers with specific health conditions (e.g., IBS, autoimmune disorders, ADHD) may want to exercise additional caution.\n\nFor a complete analysis, consider consulting the USDA FoodData Central database and recent peer-reviewed literature for the most current safety assessments.`,
  };
}

/**
 * Parse a raw USDA ingredients string into normalized individual ingredient tokens.
 * Handles parenthetical sub-ingredients, comma separation, "CONTAINS 2% OR LESS" blocks, etc.
 */
function parseIngredients(raw: string): string[] {
  if (!raw) return [];
  // Remove parenthetical sub-ingredients for top-level parsing
  let cleaned = raw.replace(/\([^)]*\)/g, ', ');
  // Remove brackets
  cleaned = cleaned.replace(/\[[^\]]*\]/g, ', ');
  // Remove "CONTAINS 2% OR LESS OF THE FOLLOWING:" type prefixes
  cleaned = cleaned.replace(/contains?\s+\d+%?\s+or\s+less\s+(of\s+the\s+following:?)?/gi, '');
  // Split on commas and periods
  const parts = cleaned.split(/[,;.]/).map(s => s.trim().toLowerCase()).filter(s => s.length > 1 && s.length < 60);
  return parts;
}

/**
 * Check if a parsed ingredient token matches a target additive.
 * Handles variations like "red 40", "red #40", "red 40 lake", "fd&c red no. 40".
 */
function ingredientMatchesTarget(token: string, target: string): boolean {
  const t = target.toLowerCase();
  if (token === t) return true;
  if (token.includes(t)) return true;
  // Handle # variations: "red #40" should match "red 40"
  if (token.replace(/#/g, '').replace(/\s+/g, ' ').trim() === t) return true;
  // Handle "fd&c" prefix: "fd&c red no. 40" → match "red 40"
  const stripped = token.replace(/fd&c\s*/gi, '').replace(/no\.?\s*/gi, '').trim();
  if (stripped === t || stripped.includes(t)) return true;
  return false;
}

interface USDAAnalytics {
  cooccurrences: { ingredient: string; frequency: number; concern_level: 'low' | 'medium' | 'high'; count: number }[];
  categories: { name: string; count: number; percentage: number }[];
  products: { name: string; brand: string; category: string }[];
  nutrient_profile: {
    avg_calories: number | null;
    avg_sugar_g: number | null;
    avg_fat_g: number | null;
    avg_protein_g: number | null;
    avg_sodium_mg: number | null;
    avg_fiber_g: number | null;
    sample_size: number;
  };
  total_products_analyzed: number;
}

async function fetchUSDAProducts(ingredient: string): Promise<any[]> {
  if (!USDA_API_KEY) return [];
  const searchTerm = ingredient.toLowerCase().trim();
  const allFoods: any[] = [];
  const pagesNeeded = Math.ceil(SAMPLE_SIZE / 50);

  for (let page = 1; page <= pagesNeeded; page++) {
    try {
      const response = await fetch(`${USDA_SEARCH_URL}?api_key=${USDA_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `ingredients:"${searchTerm}"`,
          dataType: ['Branded'],
          pageSize: 50,
          pageNumber: page,
        }),
      });
      if (!response.ok) break;
      const data = await response.json();
      if (!data.foods?.length) break;
      allFoods.push(...data.foods);
      if (allFoods.length >= SAMPLE_SIZE || page >= data.totalPages) break;
    } catch { break; }
  }

  const searchLower = searchTerm;
  return allFoods.filter(food => {
    const ing = (food.ingredients ?? '').toLowerCase();
    return ingredientMatchesTarget(ing, searchLower);
  });
}

function extractNutrient(food: any, nutrientNumber: string): number | null {
  const n = food.foodNutrients?.find((fn: any) => String(fn.nutrientNumber) === nutrientNumber);
  return n?.value ?? null;
}

function computeFullAnalytics(ingredient: string, confirmedProducts: any[]): USDAAnalytics {
  const searchTerm = ingredient.toLowerCase().trim();
  const totalProducts = confirmedProducts.length;

  if (totalProducts < 1) {
    return {
      cooccurrences: [], categories: [], products: [],
      nutrient_profile: { avg_calories: null, avg_sugar_g: null, avg_fat_g: null, avg_protein_g: null, avg_sodium_mg: null, avg_fiber_g: null, sample_size: 0 },
      total_products_analyzed: 0,
    };
  }

  // 1. Ingredient co-occurrences
  const cooccurCounts: Record<string, number> = {};
  for (const food of confirmedProducts) {
    const tokens = parseIngredients(food.ingredients ?? '');
    const seen = new Set<string>();
    for (const token of tokens) {
      if (ingredientMatchesTarget(token, searchTerm)) continue;
      const normalized = normalizeIngredient(token);
      if (!normalized || normalized.length < 2 || seen.has(normalized)) continue;
      seen.add(normalized);
      cooccurCounts[normalized] = (cooccurCounts[normalized] ?? 0) + 1;
    }
  }

  const BORING_THRESHOLD = 0.9;
  const BORING_INGREDIENTS = new Set(['water', 'sugar', 'salt', 'enriched flour', 'wheat flour']);
  const cooccurrences = Object.entries(cooccurCounts)
    .filter(([name, count]) => {
      if (BORING_INGREDIENTS.has(name) && count / totalProducts > BORING_THRESHOLD) return false;
      return count >= 2;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({
      ingredient: name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      frequency: Math.round((count / totalProducts) * 100),
      concern_level: lookupConcern(name),
      count,
    }));

  // 2. Category distribution
  const categoryCounts: Record<string, number> = {};
  for (const food of confirmedProducts) {
    const cat = food.foodCategory ?? 'Unknown';
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }
  const categories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count, percentage: Math.round((count / totalProducts) * 100) }));

  // 3. Sample product names
  const products = confirmedProducts.slice(0, 25).map(food => ({
    name: food.description ?? 'Unknown',
    brand: food.brandOwner ?? food.brandName ?? 'Unknown',
    category: food.foodCategory ?? 'Unknown',
  }));

  // 4. Nutrient profile averages
  // USDA nutrient numbers: 208=Energy, 269=Sugars, 204=Fat, 203=Protein, 307=Sodium, 291=Fiber
  const nutrientSums = { calories: 0, sugar: 0, fat: 0, protein: 0, sodium: 0, fiber: 0 };
  const nutrientCounts = { calories: 0, sugar: 0, fat: 0, protein: 0, sodium: 0, fiber: 0 };

  for (const food of confirmedProducts) {
    const cal = extractNutrient(food, '208');
    const sug = extractNutrient(food, '269');
    const fat = extractNutrient(food, '204');
    const pro = extractNutrient(food, '203');
    const sod = extractNutrient(food, '307');
    const fib = extractNutrient(food, '291');
    if (cal !== null) { nutrientSums.calories += cal; nutrientCounts.calories++; }
    if (sug !== null) { nutrientSums.sugar += sug; nutrientCounts.sugar++; }
    if (fat !== null) { nutrientSums.fat += fat; nutrientCounts.fat++; }
    if (pro !== null) { nutrientSums.protein += pro; nutrientCounts.protein++; }
    if (sod !== null) { nutrientSums.sodium += sod; nutrientCounts.sodium++; }
    if (fib !== null) { nutrientSums.fiber += fib; nutrientCounts.fiber++; }
  }

  const avg = (sum: number, count: number) => count > 0 ? Math.round(sum / count * 10) / 10 : null;

  return {
    cooccurrences,
    categories,
    products,
    nutrient_profile: {
      avg_calories: avg(nutrientSums.calories, nutrientCounts.calories),
      avg_sugar_g: avg(nutrientSums.sugar, nutrientCounts.sugar),
      avg_fat_g: avg(nutrientSums.fat, nutrientCounts.fat),
      avg_protein_g: avg(nutrientSums.protein, nutrientCounts.protein),
      avg_sodium_mg: avg(nutrientSums.sodium, nutrientCounts.sodium),
      avg_fiber_g: avg(nutrientSums.fiber, nutrientCounts.fiber),
      sample_size: totalProducts,
    },
    total_products_analyzed: totalProducts,
  };
}

function normalizeIngredient(token: string): string {
  let s = token.trim().toLowerCase();
  // Remove trailing punctuation
  s = s.replace(/[.:;]+$/, '').trim();
  // Normalize common synonyms
  if (s === 'high fructose corn syrup' || s === 'hfcs' || s === 'hfcs-55' || s === 'hfcs-42') return 'high fructose corn syrup';
  if (s.startsWith('artificial flavor')) return 'artificial flavors';
  if (s.startsWith('natural flavor')) return 'natural flavors';
  if (s.startsWith('artificial color')) return 'artificial colors';
  if (s === 'mono- and diglycerides' || s === 'mono and diglycerides') return 'mono & diglycerides';
  // Remove "fd&c" prefix
  s = s.replace(/^fd&c\s*/i, '').replace(/\bno\.?\s*/gi, '').trim();
  // Normalize # in dye names
  s = s.replace(/#(\d)/g, '$1');
  return s;
}

function lookupConcern(ingredient: string): 'low' | 'medium' | 'high' {
  const lower = ingredient.toLowerCase();
  if (CONCERN_LEVELS[lower]) return CONCERN_LEVELS[lower];
  for (const [key, level] of Object.entries(CONCERN_LEVELS)) {
    if (lower.includes(key) || key.includes(lower)) return level;
  }
  // Fallback: derive from the 3-tier scoring system
  const score = computeConcernScore(ingredient).final_score;
  if (score >= 65) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

export async function POST(req: NextRequest) {
  try {
    const { ingredient } = await req.json();
    if (!ingredient || typeof ingredient !== 'string') {
      return NextResponse.json({ error: 'Missing ingredient parameter' }, { status: 400 });
    }

    const key = ingredient.toLowerCase().trim();
    const safety = SAFETY_PROFILES[key] ?? getDefaultSafetyProfile(ingredient.trim());

    // Compute 3-tier concern score
    const tierBreakdown = computeConcernScore(ingredient);

    // Override the safety profile's risk score/label with the algorithmic score
    safety.risk_score = tierBreakdown.final_score;
    safety.risk_label = tierBreakdown.risk_label;

    // Fetch USDA products and compute all analytics
    const usdaProducts = await fetchUSDAProducts(ingredient);
    const analytics = computeFullAnalytics(ingredient, usdaProducts);

    const dataSource = analytics.cooccurrences.length > 0 ? 'usda' : 'unavailable';

    return NextResponse.json({
      ...safety,
      cooccurrences: analytics.cooccurrences,
      categories: analytics.categories,
      products: analytics.products,
      nutrient_profile: analytics.nutrient_profile,
      total_products_analyzed: analytics.total_products_analyzed,
      data_source: dataSource,
      tier_breakdown: tierBreakdown,
    });
  } catch (err: any) {
    console.error('Ingredient intel error:', err.message);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
