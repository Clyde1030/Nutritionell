import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;
    if (!imageFile) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    // TODO: Replace with real Gemini vision call to extract marketing claims,
    // then cross-reference against USDA/Open Food Facts ingredient databases.
    await new Promise(r => setTimeout(r, 1200));

    return NextResponse.json({
      product_name: 'Nature Valley Protein Bar — "All Natural"',
      overall_score: 34,
      verdict: 'This product uses several marketing claims that are statistically misleading. While branded as "All Natural", it contains multiple synthetic additives and processed ingredients that contradict the natural positioning. The sugar content is significantly higher than what the front label implies.',
      claims: [
        { claim: '"All Natural"', verified: false, explanation: 'Contains maltodextrin, soy lecithin, and mixed tocopherols — all industrially processed.' },
        { claim: '"Protein Packed"', verified: true, explanation: '10g protein per bar meets the "good source" threshold.' },
        { claim: '"No Artificial Flavors"', verified: true, explanation: 'Ingredient list shows only natural flavor sources.' },
        { claim: '"Made with Whole Grain Oats"', verified: false, explanation: 'Oats are present but are the 3rd ingredient after sugar and corn syrup.' },
        { claim: '"Heart Healthy"', verified: false, explanation: '7g saturated fat (35% DV) conflicts with AHA heart-healthy guidelines.' },
      ],
      hidden_concerns: [
        'Contains 12g added sugars (24% DV) — not prominently disclosed on front label despite "healthy" branding.',
        'Maltodextrin has a glycemic index of 85–105, higher than table sugar, yet is permitted under "All Natural" labeling.',
        'Palm kernel oil is present but not highlighted — associated with environmental and cardiovascular concerns.',
        'The "whole grain" claim relies on FDA\'s loose threshold: any detectable amount qualifies, even if sugar dominates.',
      ],
      marketing_vs_reality: [
        { category: 'Sugar (g)', marketed: 5, actual: 12 },
        { category: 'Fiber (g)', marketed: 5, actual: 2 },
        { category: 'Protein (g)', marketed: 10, actual: 10 },
        { category: 'Sat Fat (g)', marketed: 2, actual: 7 },
        { category: 'Sodium (mg)', marketed: 100, actual: 180 },
      ],
      radar_data: [
        { metric: 'Natural', claimed: 90, actual: 35 },
        { metric: 'Low Sugar', claimed: 80, actual: 25 },
        { metric: 'High Protein', claimed: 85, actual: 70 },
        { metric: 'Heart Healthy', claimed: 75, actual: 30 },
        { metric: 'Whole Grain', claimed: 90, actual: 40 },
        { metric: 'Low Processing', claimed: 85, actual: 20 },
      ],
    });
  } catch (err: any) {
    console.error('Greenwashing analysis error:', err.message);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
