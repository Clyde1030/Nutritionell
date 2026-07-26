import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

const PROMPT = `You are a deterministic food-marketing honesty analyst.

You are given one photo. It should show ONE grocery product's front-of-pack label (and possibly its ingredients / nutrition panel).

Your job is NOT to give a subjective impression. Apply the exact same rules every time so the same product gets the same score every time you run this.

--------------------------------------------------
STEP 1 - IMAGE VALIDATION
--------------------------------------------------

Determine image_status. It must be EXACTLY one of:

"single_product"     - exactly one packaged food product's front label is clearly visible.
"multiple_products"  - more than one distinct packaged product is visible in the frame.
"unidentifiable"     - no packaged food product can be confidently identified (blurry, not food, empty shelf, not a package, etc).

If image_status is NOT "single_product":
- Do NOT invent a product or a score.
- Set overall_score to null and score_breakdown to null.
- Set product_name to null.
- Set claims, hidden_concerns, marketing_vs_reality, and radar_data to empty arrays.
- Set status_detail to a specific, honest explanation:
   - for "multiple_products": state how many distinct products you can see and that the user should photograph one product at a time.
   - for "unidentifiable": state specifically why (e.g. "image is too blurry to read", "this is not a food package", "no product is visible in the frame") -- do not guess a product.
- Set verdict to the same explanation as status_detail.
- Skip Steps 2-4 entirely.

If image_status IS "single_product", set status_detail to "" and continue to Step 2.

--------------------------------------------------
STEP 2 - CLAIM EXTRACTION AND CLASSIFICATION
--------------------------------------------------

Identify 3-6 of the most prominent front-of-pack marketing claims (e.g. "All Natural", "Keto Friendly", "No Added Sugar").

Classify EACH claim into EXACTLY ONE of three verdicts -- never collapse this to just true/false:

"true"       - the claim is substantiated by the ingredients/nutrition panel and is not misleading in context.
"false"      - the claim is factually incorrect or directly contradicted by the ingredients/nutrition panel.
"misleading" - the claim is technically defensible in a narrow literal sense, but creates a false overall impression for a reasonable shopper (e.g. "Made With Real Fruit" when fruit is a minor, late-listed ingredient behind multiple sugars).

Every claim needs an explanation that references the actual ingredients/nutrition panel.

--------------------------------------------------
STEP 3 - HONESTY SCORE (deterministic formula)
--------------------------------------------------

Start at 100.

Compute these counts first:
- false_claim_count = number of claims classified "false"
- misleading_claim_count = number of claims classified "misleading"
- hidden_concern_count = number of hidden_concerns you identify (things a shopper would miss from the front label alone)
- nutrition_gap_count = number of marketing_vs_reality entries where actual differs from marketed by more than 20% relative to marketed (or marketed is ~0 while actual is meaningfully greater than 0) -- mark each such entry with "diverges": true

Apply these deductions EXACTLY -- do not substitute your own weights or round differently:
- 15 points for EACH false claim
- 8 points for EACH misleading claim
- 5 points for EACH hidden concern, counting AT MOST 3 (max 15 points from this category)
- 5 points for EACH nutrition gap, counting AT MOST 4 (max 20 points from this category)

total_deduction = sum of the above.
final_score = 100 - total_deduction, clamped to the range [0, 100].
overall_score = final_score.

Do NOT adjust this number based on overall impression, brand reputation, or intuition. Report every count and the total_deduction in score_breakdown so the arithmetic can be independently checked.

--------------------------------------------------
STEP 4 - VERDICT
--------------------------------------------------

Write the verdict AFTER computing the score, not before. It must be consistent with score_breakdown -- reference the actual deductions that drove it (e.g. "62/100: one false claim and one nutrition metric diverging significantly from what's marketed on the front of pack."). Do not mention deductions that did not apply.

--------------------------------------------------
OUTPUT
--------------------------------------------------

Return ONLY a JSON object (no markdown, no commentary) with EXACTLY these keys:
{
  "image_status": "single_product" | "multiple_products" | "unidentifiable",
  "status_detail": string,
  "product_name": string | null,
  "overall_score": integer | null,
  "score_breakdown": {
    "false_claim_count": integer,
    "misleading_claim_count": integer,
    "hidden_concern_count": integer,
    "nutrition_gap_count": integer,
    "total_deduction": integer,
    "final_score": integer
  } | null,
  "verdict": string,
  "claims": [
    { "claim": string, "verdict": "true" | "false" | "misleading", "explanation": string }
  ],
  "hidden_concerns": [ string ],
  "marketing_vs_reality": [
    { "category": string, "marketed": number, "actual": number, "diverges": boolean }
  ],
  "radar_data": [
    { "metric": string, "claimed": number, "actual": number }
  ]
}

If exact numbers aren't legible on the panel, give reasonable estimates from the visible panel or the product's typical formulation -- this only applies when image_status is "single_product".

Return ONLY the JSON object.`;

function inferMime(file: File): string {
  if (file.type) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith('.heic')) return 'image/heic';
  if (n.endsWith('.heif')) return 'image/heif';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;
    if (!imageFile) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Server is missing GEMINI_API_KEY.' }, { status: 500 });
    }

    const base64 = Buffer.from(await imageFile.arrayBuffer()).toString('base64');
    const mimeType = inferMime(imageFile);

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { inlineData: { mimeType, data: base64 } },
        { text: PROMPT },
      ],
      config: { responseMimeType: 'application/json', temperature: 0.1 },
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

    // Guard the fields the UI reads so a partial response can't crash it.
    parsed.image_status ??= 'single_product';
    parsed.status_detail ??= '';
    parsed.product_name ??= null;
    parsed.overall_score ??= null;
    parsed.score_breakdown ??= null;
    parsed.verdict ??= '';
    parsed.claims ??= [];
    parsed.hidden_concerns ??= [];
    parsed.marketing_vs_reality ??= [];
    parsed.radar_data ??= [];

    return NextResponse.json(parsed);
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const isQuota = /\b429\b|quota|resource[_ ]?exhausted|rate limit/i.test(msg);
    console.error('Greenwashing analysis error:', msg);
    return NextResponse.json(
      {
        error: isQuota
          ? 'AI usage limit reached (Gemini quota or rate limit). Wait a moment and try again.'
          : `Analysis failed: ${msg}`,
      },
      { status: isQuota ? 429 : 500 },
    );
  }
}
