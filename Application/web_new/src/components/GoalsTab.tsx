'use client';
import { useEffect, useState } from 'react';
import { ENDPOINTS } from '@/lib/api';
import { GOAL_PROMPTS } from '@/lib/data';
import { getProfileId } from '@/lib/storage';
import type { UserProfile } from '@/lib/types';
import s from './GoalsTab.module.css';

export default function GoalsTab() {
  const [goals, setGoals] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const id = getProfileId();
    setProfileId(id);
    if (!id) return;
    fetch(ENDPOINTS.getProfile(id))
      .then(r => r.json())
      .then((p: UserProfile) => setGoals(p.free_text_goals ?? ''))
      .catch(() => {});
  }, []);

  const addPrompt = (p: string) =>
    setGoals(prev => (prev.includes(p) ? prev : prev.trim() ? `${prev.trim()}\n${p}` : p));

  const handleSave = async () => {
    if (!profileId) { alert('Please complete your Profile first.'); return; }
    setSaving(true);
    try {
      const r = await fetch(ENDPOINTS.updateProfile(profileId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ free_text_goals: goals.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail ?? `Server error ${r.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
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

        {!profileId && (
          <p className={s.sub} style={{ marginTop: 12 }}>⚠️ Set up your profile first — goals save to it.</p>
        )}

        <button className={`${s.saveBtn} ${saved ? s.saveBtnSaved : ''}`} onClick={handleSave} disabled={saving}>
          {saved ? '✓ Goals saved' : saving ? 'Saving…' : 'Save Goals'}
        </button>
      </div>
    </div>
  );
}
