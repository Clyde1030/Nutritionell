'use client';
import s from './ScanTab.module.css';

interface Props { onClose: () => void; }

const STAGES = [
  {
    n: '1',
    title: 'Detect products (our own model, on our server)',
    body: 'Your photo is first run through our YOLOv11 detector to find where each product is. This step is pure computer vision — no third-party AI, and the image is not sent anywhere yet.',
  },
  {
    n: '2',
    title: 'Identify each product (Gemini)',
    body: 'Each detected product crop is sent to Google Gemini as an expert grocery-recognition AI. It identifies the product from visual evidence — brand logos, package colors, artwork, shape — not OCR, then looks up the canonical ingredients and nutrition facts for that exact commercial product. If multiple flavors/variants look equally plausible, it lists them as possible variants and lowers its confidence rather than guessing. No profile data is included in this step.',
  },
  {
    n: '3',
    title: 'Score against your profile (Gemini)',
    body: 'The identified products, plus USDA nutrition data, are scored against your profile using a deterministic four-step method (see below). This is the only step that includes personal data about you.',
  },
];

// Kept in sync by hand with _SCORING_SAFETY_BLOCK / _SCORING_METHODOLOGY_BLOCK /
// _SCORING_CONSISTENCY_BLOCK in backend/app/services/gemini_service.py — this is
// the literal methodology text baked into the scoring prompt sent to Gemini for
// every scan. If those constants change, update this too.
const LIVE_SCORING_METHODOLOGY = `--------------------------------------------------
SAFETY
--------------------------------------------------

Do not promote unhealthy eating behaviors.

Never encourage:

- excessive calorie restriction
- fear-based messaging
- labeling foods as morally "good" or "bad"
- skipping meals
- extreme dieting

Keep explanations factual, neutral, and evidence-based.

Discuss only how well a product aligns with the user's stated preferences.

--------------------------------------------------
SCORING METHODOLOGY
--------------------------------------------------

Evaluate products in FOUR steps.

==============================
STEP 1 - HARD EXCLUSIONS
==============================

Immediately assign:

"Doesn't Fit"

if ANY of the following are true.

1.
Contains a user allergy.

2.
Contains an ingredient explicitly listed under "Avoid Ingredients."

3.
Conflicts with the user's dietary philosophy.

Examples:

- meat for vegan
- dairy for dairy-free
- gluten for celiac
- alcohol when avoided

4.
Exceeds the user's stated processing tolerance.

5.
Conflicts with a medical condition explicitly listed in the profile.

If ANY hard exclusion exists:

final_score = "Doesn't Fit"

Skip Steps 2-3.

Still provide reasoning.

==============================
STEP 2 - DIMENSION SCORING
==============================

If no hard exclusions exist, score the product in FIVE independent dimensions.

------------------------------

A. Dietary Philosophy

Score:

+2 = Strongly aligns
+1 = Mostly aligns
0 = Neutral
-1 = Minor conflict
-2 = Major conflict

------------------------------

B. Health Goal Alignment

Evaluate ALL stated health goals.

Examples:

- increase protein
- reduce sodium
- increase fiber
- lower added sugar
- lower cholesterol
- Mediterranean eating

If multiple goals exist:

Average the goal scores.

Scoring:

+2 = Strongly supports
+1 = Moderately supports
0 = Neutral
-1 = Moderately conflicts
-2 = Strongly conflicts

------------------------------

C. Ingredient Quality

Evaluate ingredient quality ONLY.

Do NOT double-count nutrition.

Examples of positive qualities:

- whole foods
- simple ingredients
- recognizable ingredients

Examples of negative qualities:

- artificial colors
- artificial preservatives
- hydrogenated oils
- high fructose corn syrup
- ingredients the user prefers to limit

Scoring:

+2 = Excellent ingredient quality
+1 = Good
0 = Neutral
-1 = Several concerning ingredients
-2 = Many concerning ingredients

------------------------------

D. Processing Level

Use NOVA.

NOVA 1: +1
NOVA 2: 0
NOVA 3: -0.5
NOVA 4: -1

If NOVA is unknown: 0

------------------------------

E. Nutrition Quality

Evaluate only nutrition facts.

Consider:

- protein
- fiber
- added sugar
- sodium
- saturated fat
- trans fat
- cholesterol

Evaluate relative to the user's goals.

Scoring:

+2 = Excellent
+1 = Good
0 = Neutral
-1 = Poor
-2 = Very poor

==============================
STEP 3 - TOTAL SCORE
==============================

Compute:

total_score =
  philosophy_score
  + goal_score
  + ingredient_score
  + processing_score
  + nutrition_score

Do NOT modify the score.

Do NOT use intuition.

Do NOT rebalance categories.

Assign:

7-9         Great Fit
4-6         Just OK Fit
0-3         Neutral Fit
Below 0     Doesn't Fit

==============================
STEP 4 - REASONING
==============================

Generate reasoning ONLY AFTER scoring.

The reasoning MUST be consistent with the scores.

The reasoning should reference only relevant factors.

Mention:

- philosophy compatibility
- allergies
- avoided ingredients
- processing level
- nutrition profile
- health goals

Do NOT mention factors that are irrelevant.

Maximum 400 characters.

--------------------------------------------------
CONSISTENCY RULES
--------------------------------------------------

Products with similar nutrition and ingredients should receive similar scores.

Do NOT score based on:

- package design
- marketing claims
- popularity
- brand reputation

Only use:

- ingredients
- nutrition facts
- dietary tags
- allergens
- NOVA
- user profile

If information is missing:

Treat the missing category as Neutral.

Do NOT infer unknown values.`;

const PROFILE_FIELDS = [
  'Name and sex (if provided)',
  'Dietary preferences (diet type, eating pattern, nutrition philosophy)',
  'Allergies & conditions',
  'Ingredients you avoid',
  'Processed-food tolerance',
  'Your health goals',
];

export default function TransparencyOverview({ onClose }: Props) {
  return (
    <div className={s.detailOverlay} onClick={onClose}>
      <div className={s.detailPanel} onClick={e => e.stopPropagation()}>
        <div className={s.detail}>
          <button className={s.detailClose} onClick={onClose}>✕ Close</button>
          <h2 className={s.transparencyTitle}>Transparency Overview</h2>
          <p className={s.transparencySub}>
            Exactly what happens when you scan a shelf, and what data is sent — review it before you scan.
          </p>

          <p className={s.detailSectionLabel} style={{ marginTop: 18 }}>The pipeline</p>
          {STAGES.map(st => (
            <div key={st.n} className={s.transparencyStage}>
              <span className={s.howNum}>{st.n}</span>
              <div>
                <p className={s.transparencyStageTitle}>{st.title}</p>
                <p className={s.transparencyStageBody}>{st.body}</p>
              </div>
            </div>
          ))}

          <p className={s.detailSectionLabel} style={{ marginTop: 16 }}>What we send about you (scoring step only)</p>
          <div className={s.transparencyBox}>
            {PROFILE_FIELDS.map(f => <p key={f} className={s.detailFactor}>· {f}</p>)}
          </div>

          <p className={s.detailSectionLabel} style={{ marginTop: 16 }}>The scoring methodology (full text, as sent to Gemini)</p>
          <div className={s.transparencyBox}>
            <p className={s.transparencyMono}>
              &quot;You are a deterministic nutrition scoring AI. Your job is NOT to provide subjective
              opinions — apply the exact same rules to every product.&quot;
            </p>
            <pre className={s.transparencyMonoBlock}>{LIVE_SCORING_METHODOLOGY}</pre>
          </div>

          <p className={s.detailSectionLabel} style={{ marginTop: 16 }}>Privacy</p>
          <div className={s.transparencyBox}>
            <p className={s.detailFactor}>· We do not store your images.</p>
            <p className={s.detailFactor}>· The model focuses on products and ignores background noise.</p>
            <p className={s.detailFactor}>· Faces are not blurred yet — try to avoid people in frame.</p>
          </div>

          <button className={s.transparencyDone} onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
