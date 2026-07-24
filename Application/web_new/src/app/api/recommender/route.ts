import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

// Real, on-demand alternative recommender: given ONE scanned product and WHY it
// scored the way it did for this user, Gemini suggests better-fitting, widely
// available alternatives in the same category. This replaces the old hardcoded
// dummy database. Called per-product from the Scan detail panel.

interface Alternative {
  brand: string;
  product_name: string;
  reason: string;
  better_because: string;
  macros: { calories: number; protein_g: number; fat_g: number; carbs_g: number; sugar_g: number };
}

const PROMPT = (productJson: string) => `You are a grocery nutrition assistant recommending better product alternatives.

You are given ONE product the user scanned, including how it scored for THIS user and the reasoning explaining why (which reflects the user's dietary philosophy, allergies, avoided ingredients, processing tolerance, and health goals).

PRODUCT (JSON):
${productJson}

Suggest 3 REAL, widely-available alternative products in the SAME category that would fit this user BETTER, directly addressing the reasons this product fell short (e.g. if it was flagged for high added sugar or a specific avoided ingredient, pick alternatives that fix exactly that).

Rules:
- Recommend real commercial products (brand + product name) that actually exist. Do NOT invent products.
- Each alternative must genuinely improve on the specific issues in the reasoning — do not suggest something that shares the same problem or triggers the same allergy/avoided ingredient.
- Use canonical/typical macros for each product; approximate is fine.
- Keep it in the same product category (a cereal alternative for a cereal, a bar for a bar).

Return ONLY a JSON object (no markdown) with this exact shape:
{
  "alternatives": [
    {
      "brand": string,
      "product_name": string,
      "reason": string,            // 1 sentence: what this product is / why it's a good pick
      "better_because": string,    // 1 short phrase: the specific improvement vs the scanned product
      "macros": { "calories": number, "protein_g": number, "fat_g": number, "carbs_g": number, "sugar_g": number }
    }
  ]
}

Return ONLY the JSON object.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const product = body?.product;
    if (!product) return NextResponse.json({ error: 'Missing product' }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Server is missing GEMINI_API_KEY.', alternatives: [] }, { status: 500 });
    }

    // Trim the product to the fields that matter for a recommendation (keeps the prompt small).
    const nf = product.nutritional_facts ?? {};
    const slim = {
      brand: product.brand, product_name: product.product_name, variant: product.variant ?? null,
      scoring: product.scoring, reasoning: product.reasoning,
      flagged_ingredients: nf.flagged_ingredients ?? [],
      allergens: product.allergens ?? [], dietary_tags: product.dietary_tags ?? [],
      processing_level: product.processing_level ?? null,
      nutrition: {
        calories: nf.calories, protein_g: nf.protein_g, total_fat_g: nf.total_fat_g,
        total_carbohydrate_g: nf.total_carbohydrate_g, total_sugars_g: nf.total_sugars_g,
        added_sugars_g: nf.added_sugars_g, sodium_mg: nf.sodium_mg,
      },
    };

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ text: PROMPT(JSON.stringify(slim)) }],
      config: { responseMimeType: 'application/json', temperature: 0.4 },
    });

    const text = response.text ?? '';
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Could not parse the AI response.');
      parsed = JSON.parse(m[0]);
    }

    const alternatives: Alternative[] = Array.isArray(parsed?.alternatives) ? parsed.alternatives : [];
    return NextResponse.json({ alternatives });
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const isQuota = /\b429\b|quota|resource[_ ]?exhausted|rate limit/i.test(msg);
    console.error('Recommender error:', msg);
    return NextResponse.json(
      {
        error: isQuota
          ? 'AI usage limit reached (Gemini quota or rate limit). Try again in a moment.'
          : `Could not load alternatives: ${msg}`,
        alternatives: [],
      },
      { status: isQuota ? 429 : 500 },
    );
  }
}
