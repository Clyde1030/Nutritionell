'use client';
import s from './PlanTab.module.css';

interface Props { onClose: () => void; }

// Kept in sync by hand with the `prompt` built in generate_nutrition_plan
// (backend/app/services/gemini_service.py) — this is the literal instruction
// sent to Gemini every time a plan is generated. If that prompt changes,
// update this too.
const LIVE_PROMPT = `You are a professional registered dietitian creating a personalised nutrition plan.

[your profile: name, sex, age group, dietary philosophy (+ eating pattern / nutrition philosophy if set), allergies & conditions, health goals, ingredients to avoid, processed-food tolerance]

SAFETY RULE (overrides all other instructions): Do not promote any eating
habits, language, or framing that could encourage disordered eating (e.g.
extreme calorie restriction, glorifying "good" vs. "bad" foods in a
moralising way, fear-based messaging about food, or praising skipping
meals). Every target and step must reflect sound, sustainable nutrition
science — never appearance, weight, or willpower framing. If the user's
stated goals suggest an unhealthy relationship with food or extreme
restriction, favour the more moderate, sustainable interpretation.

Generate a detailed, actionable nutrition plan. Return ONLY a JSON object with these exact keys:
  summary              : string (2-3 sentence overview of this person's nutritional approach)
  daily_targets        : object mapping nutrient names to target values/ranges (e.g. {"Protein": "120-150g", "Net Carbs": "<50g"})
  weekly_focus_areas   : array of strings (3-5 focus areas for the week)
  steps                : array of objects each with {title: string, detail: string, priority: "high"|"medium"|"low"}
                         (8-12 concrete actionable steps)
  foods_to_emphasise   : array of strings (10-15 specific foods to eat more of)
  foods_to_limit       : array of strings (8-12 specific foods to reduce or eliminate)
  supplements_to_consider : array of strings (relevant supplements with brief reason, or empty if none)
  lifestyle_notes      : array of strings (timing, meal frequency, other lifestyle factors)

Return ONLY the JSON object. No markdown.`;

const STAGES = [
  {
    n: '1',
    title: 'Your profile is loaded (FastAPI backend)',
    body: 'Your saved Profile and Goals are read from the database — dietary philosophy, eating pattern, nutrition philosophy, allergies & conditions, ingredients to avoid, processed-food tolerance, and your free-text health goals.',
  },
  {
    n: '2',
    title: 'One Gemini call generates the whole plan',
    body: 'Everything is sent in a single prompt to Gemini, which returns a structured plan: a summary, daily nutrient targets, this week’s focus areas, 8-12 action steps (each with a priority), foods to emphasise/limit, optional supplements, and lifestyle notes. There is no separate scoring or identification step — this is a one-shot generation, not a per-product evaluation like Scan or Greenwashing.',
  },
  {
    n: '3',
    title: 'A safety rule is applied before generation',
    body: 'The prompt includes an explicit rule (shown in full below) instructing Gemini never to promote disordered-eating patterns — extreme restriction, moralising "good/bad" food framing, fear-based messaging, or praising skipped meals — regardless of what your stated goals imply.',
  },
];

const PROFILE_FIELDS = [
  'Name, sex, and age group (if provided)',
  'Dietary philosophy (diet type, eating pattern, nutrition philosophy)',
  'Allergies & conditions',
  'Ingredients you avoid',
  'Processed-food tolerance',
  'Your health goals (Goals tab)',
];

export default function MyPlanTransparency({ onClose }: Props) {
  return (
    <div className={s.transparencyOverlay} onClick={onClose}>
      <div className={s.transparencyPanel} onClick={e => e.stopPropagation()}>
        <button className={s.transparencyClose} onClick={onClose} aria-label="Close">✕</button>
        <h2 className={s.transparencyTitle}>Transparency Overview</h2>
        <p className={s.transparencySub}>
          Exactly what happens when you generate or regenerate your plan, and what is sent to the AI.
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

        <p className={s.transparencyLabel}>What we send about you</p>
        <div className={s.transparencyBox}>
          {PROFILE_FIELDS.map(f => <p key={f} className={s.transparencyFact}>· {f}</p>)}
        </div>

        <p className={s.transparencyLabel}>The exact prompt sent to Gemini</p>
        <div className={s.transparencyBox}>
          <p className={s.transparencyMono}>{LIVE_PROMPT}</p>
        </div>

        <p className={s.transparencyLabel}>Privacy</p>
        <div className={s.transparencyBox}>
          <p className={s.transparencyFact}>· Your plan is generated fresh each time — nothing here changes what Gemini already knows about you beyond this one call.</p>
          <p className={s.transparencyFact}>· This is informational, not medical advice — see the disclaimer on the Home tab.</p>
        </div>

        <button className={s.transparencyDone} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
