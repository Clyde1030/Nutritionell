'use client';
import s from './GreenwashingTab.module.css';

interface Props { onClose: () => void; }

// Kept in sync by hand with the PROMPT constant in
// src/app/api/greenwashing/route.ts — this is the literal instruction sent to
// Gemini for every Greenwashing check. If that prompt changes, update this too.
const LIVE_PROMPT = `You are a deterministic food-marketing honesty analyst.

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
- Do NOT invent a product or a score. overall_score and score_breakdown become null.
- status_detail must specifically say how many products were seen (for multiple_products)
  or specifically why nothing could be identified (for unidentifiable) — never guess.
- Skip Steps 2-4 entirely.

--------------------------------------------------
STEP 2 - CLAIM EXTRACTION AND CLASSIFICATION
--------------------------------------------------

Identify 3-6 of the most prominent front-of-pack marketing claims. Classify EACH into
EXACTLY ONE of three verdicts — never collapse this to just true/false:

"true"       - substantiated by the ingredients/nutrition panel, not misleading in context.
"false"      - factually incorrect or directly contradicted by the panel.
"misleading" - technically defensible in a narrow literal sense, but creates a false
               overall impression (e.g. "Made With Real Fruit" when fruit is a minor,
               late-listed ingredient behind multiple sugars).

--------------------------------------------------
STEP 3 - HONESTY SCORE (deterministic formula)
--------------------------------------------------

Start at 100. Apply these deductions exactly:
- 15 points for EACH false claim
- 8 points for EACH misleading claim
- 5 points for EACH hidden concern, counting at most 3 (max 15 points)
- 5 points for EACH nutrition metric that diverges >20% from what's marketed, counting
  at most 4 (max 20 points)

final_score = 100 - total_deduction, clamped to [0, 100]. No intuition, no brand-reputation
adjustment — score_breakdown reports every count so the arithmetic can be checked.

--------------------------------------------------
STEP 4 - VERDICT
--------------------------------------------------

Written only after the score, referencing the deductions that actually applied.

--------------------------------------------------
OUTPUT
--------------------------------------------------

Return ONLY a JSON object with: image_status, status_detail, product_name, overall_score,
score_breakdown (false_claim_count, misleading_claim_count, hidden_concern_count,
nutrition_gap_count, total_deduction, final_score), verdict, claims (each with claim,
verdict: "true"|"false"|"misleading", explanation), hidden_concerns, marketing_vs_reality
(marketed vs. actual per metric, plus a "diverges" flag), and radar_data (claimed vs.
actual, 0-100 each).`;

const STAGES = [
  {
    n: '1',
    title: 'You upload one product photo',
    body: 'Unlike Scan, this check has no shelf detection step — no YOLO, no cropping. The single image you upload is sent directly to Gemini.',
  },
  {
    n: '2',
    title: 'Gemini validates the image, then judges the claims (single call)',
    body: 'One call does everything: first it decides whether the photo shows exactly one product, multiple products, or nothing identifiable. Only if it’s exactly one product does it read the front-of-pack marketing claims, classify each as true/false/misleading against the ingredients/nutrition panel, and compute the Honesty Score with a fixed formula (see below) — there is no separate "identify" step like Scan has.',
  },
  {
    n: '3',
    title: 'No profile data is used',
    body: 'This check does not reference your dietary profile, allergies, or goals — it only evaluates whether the marketing on the package is honest about what is actually in the product.',
  },
];

export default function GreenwashingTransparency({ onClose }: Props) {
  return (
    <div className={s.transparencyOverlay} onClick={onClose}>
      <div className={s.transparencyPanel} onClick={e => e.stopPropagation()}>
        <button className={s.transparencyClose} onClick={onClose} aria-label="Close">✕</button>
        <h2 className={s.transparencyTitle}>Transparency Overview</h2>
        <p className={s.transparencySub}>
          Exactly what happens when you run a Greenwashing check, and what is sent to the AI.
        </p>

        <p className={s.transparencyLabel}>The pipeline</p>
        {STAGES.map(st => (
          <div key={st.n} className={s.transparencyStage}>
            <span className={s.transparencyNum}>{st.n}</span>
            <div>
              <p className={s.transparencyStageTitle}>{st.title}</p>
              <p className={s.transparencyStageBody}>{st.body}</p>
            </div>
          </div>
        ))}

        <p className={s.transparencyLabel}>The exact prompt sent to Gemini</p>
        <div className={s.transparencyBox}>
          <p className={s.transparencyMono}>{LIVE_PROMPT}</p>
        </div>

        <p className={s.transparencyLabel}>Privacy</p>
        <div className={s.transparencyBox}>
          <p className={s.transparencyFact}>· We do not store the image you upload.</p>
          <p className={s.transparencyFact}>· No profile data leaves your device for this check.</p>
          <p className={s.transparencyFact}>· The score reflects marketing-vs-reality honesty, not a health or safety judgment.</p>
        </div>

        <button className={s.transparencyDone} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
