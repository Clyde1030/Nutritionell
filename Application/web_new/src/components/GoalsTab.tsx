'use client';
import { useEffect, useState } from 'react';
import { GOAL_PROMPTS } from '@/lib/data';
import { getProfile, saveProfile } from '@/lib/storage';
import s from './GoalsTab.module.css';

export default function GoalsTab() {
  const [goals, setGoals] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { setGoals(getProfile()?.free_text_goals ?? ''); }, []);

  const addPrompt = (p: string) => setGoals(prev => prev.trim() ? `${prev.trim()}\n${p}` : p);

  const handleSave = () => {
    saveProfile({ free_text_goals: goals.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
          {GOAL_PROMPTS.map(p => (
            <button key={p} className={s.promptChip} onClick={() => addPrompt(p)}>+ {p}</button>
          ))}
        </div>

        <button className={`${s.saveBtn} ${saved ? s.saveBtnSaved : ''}`} onClick={handleSave}>
          {saved ? '✓ Goals saved' : 'Save Goals'}
        </button>
      </div>
    </div>
  );
}
