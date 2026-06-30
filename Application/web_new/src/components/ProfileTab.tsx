'use client';
import { useEffect, useState } from 'react';
import { ALLERGIES, INGREDIENT_CATEGORIES, PHILOSOPHIES, PROCESSING_LABELS } from '@/lib/data';
import { getProfile, saveProfile } from '@/lib/storage';
import type { PhilosophyOption } from '@/lib/types';
import s from './ProfileTab.module.css';

export default function ProfileTab({ onSaved }: { onSaved?: () => void }) {
  const [name, setName] = useState('');
  const [philosophy, setPhilosophy] = useState('No Preference');
  const [isCustom, setIsCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customizations, setCustomizations] = useState({ stricter: '', lenient: '', extra: '' });
  const [allergies, setAllergies] = useState<string[]>([]);
  const [avoided, setAvoided] = useState<string[]>([]);
  const [tolerance, setTolerance] = useState(3);
  const [saved, setSaved] = useState(false);

  // Modals
  const [infoModal, setInfoModal] = useState<{ title: string; body: string; extra?: React.ReactNode } | null>(null);
  const [philModal, setPhilModal] = useState<PhilosophyOption | null>(null);
  const [customizeModal, setCustomizeModal] = useState<PhilosophyOption | null>(null);
  const [buildModal, setBuildModal] = useState(false);

  useEffect(() => {
    const p = getProfile();
    if (!p) return;
    setName(p.name ?? '');
    setAllergies(p.allergies_and_conditions ?? []);
    setTolerance(p.processed_food_tolerance ?? 3);
    setAvoided(p.avoided_ingredients ?? []);
    if (p.dietary_philosophy === 'custom') { setIsCustom(true); setCustomText(p.custom_philosophy_text ?? ''); }
    else setPhilosophy(p.dietary_philosophy ?? 'No Preference');
    try {
      const c = JSON.parse(p.philosophy_customizations || '{}');
      setCustomizations({ stricter: (c.stricter ?? []).join('\n'), lenient: (c.lenient ?? []).join('\n'), extra: (c.extra ?? []).join('\n') });
    } catch {}
  }, []);

  const toggle = (arr: string[], setArr: (v: string[]) => void, key: string) =>
    setArr(arr.includes(key) ? arr.filter(x => x !== key) : [...arr, key]);

  const handleSave = () => {
    const c = {
      stricter: customizations.stricter.split('\n').map(x => x.trim()).filter(Boolean),
      lenient: customizations.lenient.split('\n').map(x => x.trim()).filter(Boolean),
      extra: customizations.extra.split('\n').map(x => x.trim()).filter(Boolean),
    };
    saveProfile({
      name, allergies_and_conditions: allergies,
      dietary_philosophy: isCustom ? 'custom' : philosophy,
      philosophy_customizations: JSON.stringify(c),
      custom_philosophy_text: isCustom ? customText : '',
      avoided_ingredients: avoided,
      processed_food_tolerance: tolerance,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved?.();
  };

  const philData = PHILOSOPHIES.find(p => p.key === philosophy);

  return (
    <div className={s.page}>
      <div className={s.container}>
        <div className={s.header}>
          <h1 className={s.title}>Profile</h1>
          <p className={s.sub}>Everything here shapes how Nutritionell analyses products for you</p>
        </div>

        {/* Name */}
        <section className={s.section}>
          <label className={s.label}>Your Name</label>
          <input className={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Optional" />
        </section>

        {/* Philosophy */}
        <section className={s.section}>
          <label className={s.label}>Dietary Philosophy</label>
          {!isCustom && (
            <div className={s.pillRow}>
              {PHILOSOPHIES.map(p => (
                <button key={p.key} className={`${s.pill} ${philosophy === p.key ? s.pillActive : ''}`}
                  onClick={() => setPhilosophy(p.key)}>{p.key}</button>
              ))}
            </div>
          )}
          {!isCustom && philData && (
            <div className={s.infoCard}>
              <p className={s.infoCardTitle}>{philData.key}</p>
              <p className={s.infoCardBody}>{philData.summary}</p>
              <div className={s.actionRow}>
                <button className={s.actionBtn} onClick={() => setPhilModal(philData)}>Learn more</button>
                <button className={s.actionBtn} onClick={() => setCustomizeModal(philData)}>Customize</button>
                <button className={`${s.actionBtn} ${s.actionBtnAccent}`} onClick={() => setBuildModal(true)}>Build my own</button>
              </div>
            </div>
          )}
          {isCustom && (
            <div className={`${s.infoCard} ${s.infoCardAccent}`}>
              <p className={`${s.infoCardTitle} ${s.accentText}`}>Custom philosophy active</p>
              <p className={s.infoCardBody}>{customText || 'No text yet — click Edit to add your rules'}</p>
              <div className={s.actionRow}>
                <button className={`${s.actionBtn} ${s.actionBtnAccent}`} onClick={() => setBuildModal(true)}>Edit</button>
                <button className={s.actionBtn} onClick={() => setIsCustom(false)}>Use standard</button>
              </div>
            </div>
          )}
        </section>

        {/* Allergies */}
        <section className={s.section}>
          <label className={s.label}>Allergies & Conditions <span className={s.hint}>— click ℹ for details</span></label>
          <div className={s.listGroup}>
            {ALLERGIES.map(a => (
              <div key={a.key} className={s.listRow}>
                <button className={`${s.listCheck} ${allergies.includes(a.key) ? s.listCheckOn : ''}`}
                  onClick={() => toggle(allergies, setAllergies, a.key)}>
                  <span className={`${s.checkbox} ${allergies.includes(a.key) ? s.checkboxOn : ''}`}>
                    {allergies.includes(a.key) && '✓'}
                  </span>
                  <span className={s.listLabel}>{a.key}</span>
                </button>
                <button className={s.infoBtn} onClick={() => setInfoModal({ title: a.key, body: a.description })}>ℹ</button>
              </div>
            ))}
          </div>
        </section>

        {/* Ingredients to avoid */}
        <section className={s.section}>
          <label className={s.label}>Ingredients to Avoid <span className={s.hint}>— click ℹ for examples</span></label>
          <div className={s.listGroup}>
            {INGREDIENT_CATEGORIES.map(cat => (
              <div key={cat.category} className={s.listRow}>
                <button className={`${s.listCheck} ${avoided.includes(cat.category) ? s.listCheckRed : ''}`}
                  onClick={() => toggle(avoided, setAvoided, cat.category)}>
                  <span className={`${s.checkbox} ${avoided.includes(cat.category) ? s.checkboxRed : ''}`}>
                    {avoided.includes(cat.category) && '✓'}
                  </span>
                  <span className={s.listLabel}>{cat.category}</span>
                </button>
                <button className={s.infoBtn} onClick={() => setInfoModal({
                  title: cat.category, body: cat.concern,
                  extra: <><p className={s.sheetSub}>Examples</p><p className={s.sheetBody}>{cat.examples.join(', ')}</p></>,
                })}>ℹ</button>
              </div>
            ))}
          </div>
        </section>

        {/* Processing tolerance */}
        <section className={s.section}>
          <label className={s.label}>Processed Food Tolerance</label>
          <p className={s.toleranceLabel}>{PROCESSING_LABELS[tolerance]}</p>
          <div className={s.segmentRow}>
            {[0, 1, 2, 3, 4].map(n => (
              <button key={n} className={`${s.segment} ${tolerance === n ? s.segmentOn : ''}`}
                onClick={() => setTolerance(n)}>{n}</button>
            ))}
          </div>
          <div className={s.segmentLabels}><span>None</span><span>Any</span></div>
        </section>

        <button className={`${s.saveBtn} ${saved ? s.saveBtnSaved : ''}`} onClick={handleSave}>
          {saved ? '✓ Saved' : 'Save Profile'}
        </button>
      </div>

      {/* Info modal */}
      {infoModal && (
        <div className={s.modalOverlay} onClick={() => setInfoModal(null)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <h3 className={s.modalTitle}>{infoModal.title}</h3>
            <p className={s.sheetBody}>{infoModal.body}</p>
            {infoModal.extra}
            <button className={s.modalClose} onClick={() => setInfoModal(null)}>Done</button>
          </div>
        </div>
      )}

      {/* Philosophy learn more */}
      {philModal && (
        <div className={s.modalOverlay} onClick={() => setPhilModal(null)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <h3 className={s.modalTitle}>{philModal.key}</h3>
            <p className={s.sheetBody}>{philModal.description}</p>
            {philModal.avoid_categories.length > 0 && <>
              <p className={s.sheetSub}>Avoids</p>
              {philModal.avoid_categories.map(c => <p key={c} className={s.bullet}>· {c}</p>)}
            </>}
            {philModal.favour_categories.length > 0 && <>
              <p className={s.sheetSub}>Favours</p>
              {philModal.favour_categories.map(c => <p key={c} className={s.bullet}>· {c}</p>)}
            </>}
            <button className={s.modalClose} onClick={() => setPhilModal(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Customize modal */}
      {customizeModal && (
        <div className={s.modalOverlay} onClick={() => setCustomizeModal(null)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <h3 className={s.modalTitle}>Customize: {customizeModal.key}</h3>
            <p className={s.hint}>One rule per line. Leave blank to use defaults.</p>
            <label className={s.sheetSub}>Make stricter</label>
            <textarea className={s.textarea} rows={3} value={customizations.stricter} onChange={e => setCustomizations(c => ({ ...c, stricter: e.target.value }))} placeholder="e.g. No dairy at all" />
            <label className={s.sheetSub}>Make more lenient</label>
            <textarea className={s.textarea} rows={3} value={customizations.lenient} onChange={e => setCustomizations(c => ({ ...c, lenient: e.target.value }))} placeholder="e.g. Occasional sourdough OK" />
            <label className={s.sheetSub}>Extra rules</label>
            <textarea className={s.textarea} rows={3} value={customizations.extra} onChange={e => setCustomizations(c => ({ ...c, extra: e.target.value }))} placeholder="e.g. Prioritise organic" />
            <button className={s.saveBtn} style={{ marginTop: 12 }} onClick={() => setCustomizeModal(null)}>Apply</button>
          </div>
        </div>
      )}

      {/* Build own modal */}
      {buildModal && (
        <div className={s.modalOverlay} onClick={() => setBuildModal(false)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <h3 className={s.modalTitle}>Build Your Own Philosophy</h3>
            <p className={s.sheetBody}>Write your dietary rules in plain language. The AI uses this exactly as written when scoring products.</p>
            <p className={s.hint} style={{ marginTop: 8, fontStyle: 'italic' }}>Example: "Mostly plant-based with occasional wild fish. No seed oils, no refined sugar. Prioritise fermented foods."</p>
            <textarea className={s.textarea} rows={8} value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Describe your philosophy…" style={{ marginTop: 12 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className={s.cancelBtn} onClick={() => setBuildModal(false)}>Cancel</button>
              <button className={s.saveBtn} style={{ flex: 2, marginTop: 0 }} onClick={() => { setIsCustom(true); setBuildModal(false); }}>Save My Philosophy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
