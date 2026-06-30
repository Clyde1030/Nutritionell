'use client';
import { useState } from 'react';
import { getProfile } from '@/lib/storage';
import type { NutritionPlanResponse, NutritionPlanStep } from '@/lib/types';
import s from './PlanTab.module.css';

const PRIORITY_COLOR = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--green)' };
const PRIORITY_LABEL = { high: 'High priority', medium: 'Medium', low: 'Lower priority' };

export default function PlanTab() {
  const [plan, setPlan] = useState<NutritionPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    const profile = getProfile();
    if (!profile) { alert('Please complete your Profile first.'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? `Server ${r.status}`); }
      setPlan(await r.json());
    } catch (e: any) {
      alert(`Generation failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={s.centered}>
        <div className={s.spinner} />
        <p className={s.loadTitle}>Building your plan</p>
        <p className={s.sub}>This takes about 10 seconds…</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className={s.emptyPage}>
        <div className={s.emptyContainer}>
          <div className={s.emptyIcon}>📋</div>
          <h1 className={s.emptyTitle}>Your Nutrition Plan</h1>
          <p className={s.sub}>Based on your philosophy, goals, allergies, and ingredient preferences, the AI generates a personalised step-by-step nutrition roadmap.</p>
          <div className={s.requirementsCard}>
            {[
              'Complete your Profile (Profile tab)',
              'Set your Health Goals (Goals tab)',
              'Add GEMINI_API_KEY to web/.env.local for real AI — mock works without it',
            ].map(t => (
              <div key={t} className={s.reqRow}>
                <span className={s.reqIcon}>✓</span>
                <span className={s.reqText}>{t}</span>
              </div>
            ))}
          </div>
          <button className={s.generateBtn} onClick={generate}>Generate My Plan</button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <div className={s.container}>
        <div className={s.planHeader}>
          <h1 className={s.title}>My Plan</h1>
          <button className={s.regenBtn} onClick={generate}>Regenerate</button>
        </div>

        <div className={s.summaryCard}><p className={s.summaryText}>{plan.summary}</p></div>

        {Object.keys(plan.daily_targets).length > 0 && (
          <Section title="Daily Targets">
            <div className={s.targetGrid}>
              {Object.entries(plan.daily_targets).map(([k, v]) => (
                <div key={k} className={s.targetTile}><p className={s.targetValue}>{v}</p><p className={s.targetLabel}>{k}</p></div>
              ))}
            </div>
          </Section>
        )}

        {plan.weekly_focus_areas.length > 0 && (
          <Section title="This Week">
            {plan.weekly_focus_areas.map((a, i) => (
              <div key={i} className={s.focusRow}><div className={s.focusDot} /><p className={s.focusText}>{a}</p></div>
            ))}
          </Section>
        )}

        {plan.steps.length > 0 && (
          <Section title="Action Steps">
            {plan.steps.map((step, i) => <StepCard key={i} step={step} index={i + 1} />)}
          </Section>
        )}

        {plan.foods_to_emphasise.length > 0 && (
          <Section title="Eat More">
            <div className={s.foodGrid}>
              {plan.foods_to_emphasise.map((f, i) => <span key={i} className={s.foodTag} style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>{f}</span>)}
            </div>
          </Section>
        )}

        {plan.foods_to_limit.length > 0 && (
          <Section title="Limit or Avoid">
            <div className={s.foodGrid}>
              {plan.foods_to_limit.map((f, i) => <span key={i} className={s.foodTag} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>{f}</span>)}
            </div>
          </Section>
        )}

        {plan.supplements_to_consider.length > 0 && (
          <Section title="Supplements to Consider">
            {plan.supplements_to_consider.map((item, i) => <p key={i} className={s.bullet}>· {item}</p>)}
          </Section>
        )}

        {plan.lifestyle_notes.length > 0 && (
          <Section title="Lifestyle Notes">
            {plan.lifestyle_notes.map((note, i) => <p key={i} className={s.bullet}>· {note}</p>)}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className={s.section}><p className={s.sectionTitle}>{title}</p>{children}</div>;
}

function StepCard({ step, index }: { step: NutritionPlanStep; index: number }) {
  const color = PRIORITY_COLOR[step.priority] ?? PRIORITY_COLOR.medium;
  return (
    <div className={s.stepCard} style={{ borderLeftColor: color }}>
      <div className={s.stepTop}>
        <span className={s.stepNum}>{index}</span>
        <span className={s.stepTitle}>{step.title}</span>
        <span className={s.priorityTag} style={{ borderColor: color, color }}>{PRIORITY_LABEL[step.priority]}</span>
      </div>
      <p className={s.stepDetail}>{step.detail}</p>
    </div>
  );
}
