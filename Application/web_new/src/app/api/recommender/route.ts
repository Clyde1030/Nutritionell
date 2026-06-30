import { NextRequest, NextResponse } from 'next/server';

interface Alternative {
  brand: string;
  product_name: string;
  similarity_score: number;
  scoring: 'Great' | 'OK';
  reason: string;
  macros: { calories: number; protein_g: number; fat_g: number; carbs_g: number; sugar_g: number };
}

const ALTERNATIVES_DB: Record<string, Alternative[]> = {
  'cereal': [
    {
      brand: 'Nature\'s Path', product_name: 'Heritage Flakes',
      similarity_score: 0.91, scoring: 'Great',
      reason: 'Organic whole grains, only 4g sugar, high fiber. Closest macro profile to your avoided product with dramatically better ingredient quality.',
      macros: { calories: 120, protein_g: 4, fat_g: 1, carbs_g: 24, sugar_g: 4 },
    },
    {
      brand: 'Barbara\'s', product_name: 'Morning Oat Crunch',
      similarity_score: 0.87, scoring: 'OK',
      reason: 'Similar crunch texture, 6g sugar vs 12g. No HFCS. NOVA 3 but cleaner ingredient list.',
      macros: { calories: 130, protein_g: 3, fat_g: 1.5, carbs_g: 26, sugar_g: 6 },
    },
  ],
  'snack bar': [
    {
      brand: 'RXBar', product_name: 'Chocolate Sea Salt',
      similarity_score: 0.89, scoring: 'Great',
      reason: 'Whole food ingredients only (egg whites, dates, nuts). 12g protein, 13g sugar from dates only. NOVA 1.',
      macros: { calories: 210, protein_g: 12, fat_g: 9, carbs_g: 24, sugar_g: 13 },
    },
    {
      brand: 'Epic', product_name: 'Beef Habanero Cherry Bar',
      similarity_score: 0.82, scoring: 'Great',
      reason: 'Grass-fed beef based, 10g protein, only 9g sugar. Zero seed oils, minimal processing.',
      macros: { calories: 130, protein_g: 10, fat_g: 5, carbs_g: 13, sugar_g: 9 },
    },
  ],
  'default': [
    {
      brand: 'Simple Mills', product_name: 'Almond Flour Crackers',
      similarity_score: 0.84, scoring: 'Great',
      reason: 'Clean almond flour base, no seed oils, low sugar. Similar satisfying crunch with dramatically better ingredients.',
      macros: { calories: 150, protein_g: 3, fat_g: 8, carbs_g: 17, sugar_g: 1 },
    },
    {
      brand: 'Hu Kitchen', product_name: 'Simple Dark Chocolate',
      similarity_score: 0.79, scoring: 'Great',
      reason: 'Organic cacao, coconut sugar only. No emulsifiers, no soy lecithin. Rich flavor with cleaner profile.',
      macros: { calories: 200, protein_g: 3, fat_g: 15, carbs_g: 17, sugar_g: 11 },
    },
  ],
};

function categorize(productName: string): string {
  const lower = productName.toLowerCase();
  if (lower.includes('cereal') || lower.includes('flakes') || lower.includes('cheerios') || lower.includes('oats')) return 'cereal';
  if (lower.includes('bar') || lower.includes('granola')) return 'snack bar';
  return 'default';
}

export async function POST(req: NextRequest) {
  try {
    const { products } = await req.json();
    if (!Array.isArray(products)) {
      return NextResponse.json({ error: 'Missing products array' }, { status: 400 });
    }

    // TODO: Replace mock with real FAISS/cosine similarity against USDA macro vectors.
    // Pipeline: embed each product's macro profile → query nearest neighbors from
    // a pre-built USDA vector index → filter to "Great"/"OK" scoring only.
    await new Promise(r => setTimeout(r, 600));

    const recommendations: Record<string, Alternative[]> = {};
    for (const product of products) {
      if (product.scoring === 'Avoid') {
        const category = categorize(product.product_name);
        recommendations[product.product_name] = ALTERNATIVES_DB[category] ?? ALTERNATIVES_DB['default'];
      }
    }

    return NextResponse.json({ recommendations });
  } catch (err: any) {
    console.error('Recommender error:', err.message);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
