import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { PHILOSOPHIES } from '@/lib/data';
import type { NutritionalFacts, ProductItem, ScoreEnum, ShelfAnalysisResponse, UserProfile } from '@/lib/types';

const PHILOSOPHY_MAP = Object.fromEntries(PHILOSOPHIES.map(p => [p.key, p]));
const PROCESSING_LABELS: Record<number, string> = {
  0: 'unprocessed whole foods only', 1: 'minimally processed only',
  2: 'low processing acceptable',   3: 'moderate processing acceptable', 4: 'no restriction',
};

function buildSystemInstruction(profile: UserProfile): string {
  const phil = PHILOSOPHY_MAP[profile.dietary_philosophy ?? 'No Preference'] ?? PHILOSOPHY_MAP['No Preference'];
  let philText = `${profile.dietary_philosophy}: ${phil.description}`;
  if (profile.dietary_philosophy === 'custom' && profile.custom_philosophy_text) {
    philText = `CUSTOM PHILOSOPHY: ${profile.custom_philosophy_text}`;
  }
  let customText = '';
  try {
    const c = JSON.parse(profile.philosophy_customizations || '{}');
    const parts: string[] = [];
    if (c.stricter?.length) parts.push(`Stricter rules: ${c.stricter.join(', ')}`);
    if (c.lenient?.length)  parts.push(`More lenient: ${c.lenient.join(', ')}`);
    if (c.extra?.length)    parts.push(`Extra rules: ${c.extra.join(', ')}`);
    if (parts.length) customText = `\nCustomizations: ${parts.join('; ')}`;
  } catch {}
  const tolerance = PROCESSING_LABELS[profile.processed_food_tolerance ?? 3] ?? 'moderate';

  return `You are the core intelligence engine for Nutritionell, an AI-powered grocery analysis app.

Analyze the provided grocery shelf image. Identify ALL visible food products.

USER PROFILE:
Name: ${profile.name || 'User'}
Dietary Philosophy: ${philText}${customText}
Allergies & Conditions: ${profile.allergies_and_conditions?.join(', ') || 'None'}
Health Goals: ${profile.free_text_goals || 'None provided'}
Ingredients to Always Avoid: ${profile.avoided_ingredients?.join(', ') || 'None'}
Processed Food Tolerance: ${tolerance} (NOVA scale: ${profile.processed_food_tolerance ?? 3}/4)

SCORING RULES:
- "Great": Well-aligned with ALL profile criteria
- "OK": Acceptable with minor concerns
- "Avoid": Conflicts with philosophy, triggers allergy, contains avoided ingredient, or exceeds processing tolerance
- "Unidentified": Label is illegible

REASONING: For each product, your reasoning MUST explicitly address each relevant factor:
philosophy compatibility, allergy triggers, avoided ingredients, processing level, and health goals.`;
}

function getMockResponse(): ShelfAnalysisResponse {
  return {
    total_products_found: 4,
    analysis_notes: 'Mock response — GEMINI_API_KEY not set in web/.env.local',
    products: [
      {
        brand: "Kellogg's", product_name: 'Frosted Flakes', scoring: 'Avoid',
        reasoning: '12g added sugar conflicts with low-sugar goal; HFCS on avoid list; NOVA 4 exceeds processing tolerance.',
        reasoning_by_factor: ['🎯 Goals: 12g added sugar conflicts with less-sugar goal', '🚫 Avoided: Contains HFCS', '🏭 NOVA 4 — ultra-processed', '📖 36g net carbs conflicts with Keto'],
        bounding_box: [0.05, 0.02, 0.45, 0.30], processing_level: 4, data_source: 'mock',
        nutritional_facts: { calories: 150, serving_size: '1 cup (37g)', total_fat_g: 0.5, saturated_fat_g: 0, trans_fat_g: 0, cholesterol_mg: 0, sodium_mg: 190, total_carbohydrate_g: 37, dietary_fiber_g: 1, total_sugars_g: 14, added_sugars_g: 12, protein_g: 2, flagged_ingredients: ['HFCS', 'BHT'], detected_ingredients: ['milled corn', 'sugar', 'HFCS', 'salt', 'BHT'] },
      },
      {
        brand: 'General Mills', product_name: 'Cheerios', scoring: 'OK',
        reasoning: 'Whole grain oats, only 1g sugar. 20g carbs is borderline for Keto.',
        reasoning_by_factor: ['📖 20g carbs borderline Keto', '🎯 1g sugar aligns with low-sugar goal', '🏭 NOVA 2 — within tolerance'],
        bounding_box: [0.05, 0.32, 0.45, 0.62], processing_level: 2, data_source: 'mock',
        nutritional_facts: { calories: 100, serving_size: '1 cup (28g)', total_fat_g: 2, saturated_fat_g: 0.5, trans_fat_g: 0, cholesterol_mg: 0, sodium_mg: 140, total_carbohydrate_g: 20, dietary_fiber_g: 3, total_sugars_g: 1, added_sugars_g: 0, protein_g: 3, flagged_ingredients: [], detected_ingredients: ['whole grain oats', 'sugar', 'salt'] },
      },
      {
        brand: 'Kind', product_name: 'Dark Chocolate Nuts & Sea Salt', scoring: 'Great',
        reasoning: '15g healthy fats, 5g net carbs, 6g protein — ideal for Keto. Clean ingredients.',
        reasoning_by_factor: ['📖 5g net carbs within Keto limit', '🎯 High fat + protein supports goals', '🏭 NOVA 2 — clean'],
        bounding_box: [0.48, 0.02, 0.88, 0.47], processing_level: 2, data_source: 'mock',
        nutritional_facts: { calories: 200, serving_size: '1 bar (40g)', total_fat_g: 15, saturated_fat_g: 2.5, trans_fat_g: 0, cholesterol_mg: 0, sodium_mg: 125, total_carbohydrate_g: 16, dietary_fiber_g: 7, total_sugars_g: 5, added_sugars_g: 4, protein_g: 6, flagged_ingredients: [], detected_ingredients: ['almonds', 'dark chocolate', 'chicory root fiber', 'honey', 'sea salt'] },
      },
      {
        brand: 'Unknown', product_name: 'Unidentified Product', scoring: 'Unidentified',
        reasoning: 'Label illegible — cannot evaluate.',
        reasoning_by_factor: ['❓ Label unreadable'],
        bounding_box: [0.48, 0.52, 0.88, 0.95], processing_level: undefined, data_source: 'mock',
        nutritional_facts: { flagged_ingredients: [], detected_ingredients: [] },
      },
    ],
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;
    const profileRaw = formData.get('profile') as string | null;

    if (!imageFile) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const profile: UserProfile = profileRaw ? JSON.parse(profileRaw) : {
      id: 'anon', name: 'User', allergies_and_conditions: [], free_text_goals: '',
      dietary_philosophy: 'No Preference', philosophy_customizations: '{}',
      custom_philosophy_text: '', avoided_ingredients: [], processed_food_tolerance: 3,
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('TO_DO') || apiKey.includes('your_') || apiKey.includes('INSERT')) {
      await new Promise(r => setTimeout(r, 800));
      return NextResponse.json(getMockResponse());
    }

    // Convert image to base64 inline data
    const imageBytes = await imageFile.arrayBuffer();
    const base64Image = Buffer.from(imageBytes).toString('base64');
    const mimeType = (imageFile.type || 'image/jpeg');

    // Use @google/genai — matches the working notebook exactly
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = buildSystemInstruction(profile);

    const prompt = `Analyze this grocery shelf image and provide a structured safety and compatibility breakdown for every visible product.

For each product return a JSON object with these exact keys:
- brand (string)
- product_name (string)  
- scoring (exactly "Great", "OK", "Avoid", or "Unidentified")
- reasoning (string, max 400 chars, addressing philosophy/allergies/avoided ingredients/processing/goals)
- reasoning_by_factor (array of short bullet strings, one per relevant profile factor)
- bounding_box (array: [ymin, xmin, ymax, xmax] normalised 0.0–1.0)
- processing_level (integer 1-4 NOVA score, or null)
- calories (number or null)
- serving_size (string or null)
- total_fat_g, saturated_fat_g, trans_fat_g, cholesterol_mg, sodium_mg (numbers or null)
- total_carbohydrate_g, dietary_fiber_g, total_sugars_g, added_sugars_g, protein_g (numbers or null)
- flagged_ingredients (array of strings — concerning ingredients found)
- detected_ingredients (array of all ingredient names you can read)

Return ONLY a JSON array of product objects. No markdown, no commentary.`;

    let responseText: string | null = null;
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64Image } },
              ],
            },
          ],
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });
        responseText = response.text ?? null;
        console.log(`✅ Used model: ${model}`);
        break;
      } catch (e: any) {
        console.warn(`Model ${model} failed: ${e.message?.slice(0, 80)}`);
        if (model === models[models.length - 1]) throw e;
      }
    }

    if (!responseText) return NextResponse.json(getMockResponse());

    let parsed: any[];
    try {
      const cleaned = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const raw = JSON.parse(cleaned);
      parsed = Array.isArray(raw) ? raw : raw.products ?? raw.detected_products ?? [raw];
    } catch (e) {
      console.error('JSON parse failed:', responseText.slice(0, 200));
      return NextResponse.json(getMockResponse());
    }

    const products: ProductItem[] = parsed.map((item: any) => {
      const bbox = Array.isArray(item.bounding_box)
        ? item.bounding_box.map(Number).slice(0, 4)
        : [0, 0, 1, 1];
      while (bbox.length < 4) bbox.push(0);

      return {
        brand: item.brand ?? 'Unknown',
        product_name: item.product_name ?? 'Unidentified',
        scoring: (['Great', 'OK', 'Avoid', 'Unidentified'].includes(item.scoring)
          ? item.scoring : 'Unidentified') as ScoreEnum,
        reasoning: item.reasoning ?? 'Could not evaluate.',
        reasoning_by_factor: item.reasoning_by_factor ?? [],
        bounding_box: [bbox[0], bbox[1], bbox[2], bbox[3]] as [number, number, number, number],
        processing_level: item.processing_level ?? undefined,
        data_source: 'gemini',
        nutritional_facts: {
          calories: item.calories ?? undefined,
          serving_size: item.serving_size ?? undefined,
          total_fat_g: item.total_fat_g ?? undefined,
          saturated_fat_g: item.saturated_fat_g ?? undefined,
          trans_fat_g: item.trans_fat_g ?? undefined,
          cholesterol_mg: item.cholesterol_mg ?? undefined,
          sodium_mg: item.sodium_mg ?? undefined,
          total_carbohydrate_g: item.total_carbohydrate_g ?? undefined,
          dietary_fiber_g: item.dietary_fiber_g ?? undefined,
          total_sugars_g: item.total_sugars_g ?? undefined,
          added_sugars_g: item.added_sugars_g ?? undefined,
          protein_g: item.protein_g ?? undefined,
          flagged_ingredients: item.flagged_ingredients ?? [],
          detected_ingredients: item.detected_ingredients ?? [],
        } as NutritionalFacts,
      };
    });

    return NextResponse.json({
      products,
      total_products_found: products.length,
    } satisfies ShelfAnalysisResponse);

  } catch (err: any) {
    console.error('Analyze error:', err.message);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
