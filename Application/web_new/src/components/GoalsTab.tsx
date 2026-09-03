'use client';
import { useEffect, useState } from 'react';
import { ApiError, ENDPOINTS, authJson } from '@/lib/api';
import { GOAL_PROMPTS } from '@/lib/data';
import type { UserProfile } from '@/lib/types';
import s from './GoalsTab.module.css';

export default function GoalsTab() {
  const [goals, setGoals] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // The profile comes from the auth token — no id is sent or stored client-side.
  useEffect(() => {
    authJson<UserProfile>(ENDPOINTS.profile)
      .then(p => setGoals(p.free_text_goals ?? ''))
      .catch(() => { /* 401 is handled centrally in authFetch */ });
  }, []);

  const addPrompt = (p: string) =>
    setGoals(prev => (prev.includes(p) ? prev : prev.trim() ? `${prev.trim()}\n${p}` : p));

  const handleSave = async () => {
    setSaving(true);
    try {
      await authJson<UserProfile>(ENDPOINTS.profile, {
        method: 'PUT',
        body: JSON.stringify({ free_text_goals: goals.trim() }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      // A 401 already cleared the session and reopened the login modal; don't
      // stack an alert on top of it.
      if (!(e instanceof ApiError && e.status === 401)) {
        alert(`Save failed: ${e.message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.container}>
        <div className={s.header}>
          <h1 className={s.title}>Health Goals</h1>
          <p className={s.sub}>The AI references these when explaining every product score</p>
        </div>

        <textarea
          className={s.textarea}
          value={goals}
          onChange={e => { setGoals(e.target.value); setSaved(false); }}
          placeholder={"Describe your goals in plain language…\n\ne.g. I want to build muscle while reducing body fat. I need more protein and less added sugar. I want to improve gut health and avoid ultra-processed foods."}
          rows={8}
        />

        <p className={s.sectionLabel}>Quick add</p>
        <div className={s.promptGrid}>
          {GOAL_PROMPTS.map(p => {
            const added = goals.includes(p);
            return (
              <button key={p} className={`${s.promptChip} ${added ? s.promptChipAdded : ''}`}
                onClick={() => addPrompt(p)} disabled={added}>
                {added ? '✓' : '+'} {p}
              </button>
            );
          })}
        </div>

        <button className={`${s.saveBtn} ${saved ? s.saveBtnSaved : ''}`} onClick={handleSave} disabled={saving}>
          {saved ? '✓ Goals saved' : saving ? 'Saving…' : 'Save Goals'}
        </button>
      </div>
    </div>
  );
}
