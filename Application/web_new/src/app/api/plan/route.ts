import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { PHILOSOPHIES } from '@/lib/data';
import type { NutritionPlanResponse, UserProfile } from '@/lib/types';

const PHILOSOPHY_MAP = Object.fromEntries(PHILOSOPHIES.map(p => [p.key, p]));

function buildProfileContext(profile: UserProfile): string {
  const phil = PHILOSOPHY_MAP[profile.dietary_philosophy ?? 'No Preference'] ?? PHILOSOPHY_MAP['No Preference'];
  const philText = profile.dietary_philosophy === 'custom' && profile.custom_philosophy_text
    ? `CUSTOM: ${profile.custom_philosophy_text}`
    : `${profile.dietary_philosophy}: ${phil.description}`;
  return `USER PROFILE:
Name: ${profile.name || 'User'}
Philosophy: ${philText}
Allergies: ${profile.allergies_and_conditions?.join(', ') || 'None'}
Goals: ${profile.free_text_goals || 'None provided'}
Ingredients to Avoid: ${profile.avoided_ingredients?.join(', ') || 'None'}
Processing Tolerance: NOVA ${profile.processed_food_tolerance ?? 3}/4`;
}

function getMockPlan(): NutritionPlanResponse {
  return {
    summary: 'Mock plan — add your GEMINI_API_KEY to web/.env.local for a real personalised plan.',
    daily_targets: { Protein: '120–150g', 'Net Carbs': '<50g', Fat: '130–160g', Calories: '1800–2200 kcal', Fiber: '>25g' },
    weekly_focus_areas: ['Eliminate added sugars', 'Increase healthy fat sources', 'Meal prep 3x per week', 'Track net carbs daily'],
    steps: [
      { title: 'Audit your pantry', detail: 'Remove all items with added sugar, refined grains, and seed oils.', priority: 'high' },
      { title: 'Hit protein targets', detail: 'Aim for 120–150g protein daily from meat, fish, eggs, and full-fat dairy.', priority: 'high' },
      { title: 'Track net carbs', detail: 'Net carbs = total carbs minus fiber. Stay under 50g per day.', priority: 'high' },
      { title: 'Add healthy fats', detail: 'Include avocado, olive oil, butter, and nuts at each meal.', priority: 'medium' },
      { title: 'Meal prep on Sundays', detail: 'Batch-cook proteins and vegetables to avoid reaching for processed foods.', priority: 'medium' },
      { title: 'Electrolytes daily', detail: 'Keto increases excretion of sodium, potassium, magnesium — supplement accordingly.', priority: 'medium' },
    ],
    foods_to_emphasise: ['Grass-fed beef', 'Wild-caught salmon', 'Eggs', 'Avocados', 'Olive oil', 'Leafy greens', 'Broccoli', 'Almonds', 'Full-fat Greek yogurt'],
    foods_to_limit: ['Bread and pasta', 'Rice', 'Sugar', 'Fruit juice', 'Seed oils', 'Processed snacks'],
    supplements_to_consider: ['Magnesium glycinate', 'Electrolyte blend', 'Vitamin D3 + K2'],
    lifestyle_notes: ['Eat within a 10–12 hour window', 'Walk 20 min after dinner', 'Prioritise 7–9 hours sleep'],
  };
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await req.json() as { profile: UserProfile };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('TO_DO') || apiKey.includes('your_') || apiKey.includes('INSERT')) {
      await new Promise(r => setTimeout(r, 600));
      return NextResponse.json(getMockPlan());
    }

    const profileCtx = buildProfileContext(profile);
    const prompt = `You are a professional registered dietitian. Create a detailed personalised nutrition plan.

${profileCtx}

Return ONLY a JSON object with these exact keys:
- summary (2-3 sentence overview)
- daily_targets (object: nutrient name → target value string)
- weekly_focus_areas (array of 3-5 strings)
- steps (array of {title, detail, priority:"high"|"medium"|"low"} — 8-10 items)
- foods_to_emphasise (10-15 specific foods)
- foods_to_limit (8-12 specific foods)
- supplements_to_consider (array with brief reason each)
- lifestyle_notes (array of strings)

No markdown. JSON only.`;

    const ai = new GoogleGenAI({ apiKey });
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

    let responseText: string | null = null;
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { responseMimeType: 'application/json', temperature: 0.3 },
        });
        responseText = response.text ?? null;
        console.log(`✅ Plan used model: ${model}`);
        break;
      } catch (e: any) {
        console.warn(`Plan model ${model} failed: ${e.message?.slice(0, 80)}`);
        if (model === models[models.length - 1]) throw e;
      }
    }

    if (!responseText) return NextResponse.json(getMockPlan());

    let data: any = {};
    try {
      data = JSON.parse(responseText.replace(/```json\n?|\n?```/g, '').trim());
    } catch { return NextResponse.json(getMockPlan()); }

    return NextResponse.json({
      summary: data.summary ?? '',
      daily_targets: data.daily_targets ?? {},
      weekly_focus_areas: data.weekly_focus_areas ?? [],
      steps: (data.steps ?? []).map((s: any) => ({
        title: s.title ?? '', detail: s.detail ?? '', priority: s.priority ?? 'medium',
      })),
      foods_to_emphasise: data.foods_to_emphasise ?? [],
      foods_to_limit: data.foods_to_limit ?? [],
      supplements_to_consider: data.supplements_to_consider ?? [],
      lifestyle_notes: data.lifestyle_notes ?? [],
    } satisfies NutritionPlanResponse);

  } catch (err: any) {
    console.error('Plan error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
