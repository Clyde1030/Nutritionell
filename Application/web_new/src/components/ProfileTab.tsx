'use client';
import { useEffect, useState } from 'react';
import { ENDPOINTS } from '@/lib/api';
import { getProfileId, setProfileId as persistProfileId } from '@/lib/storage';
import type { PhilosophyOption, ProfileOptions, UserProfile } from '@/lib/types';
import s from './ProfileTab.module.css';

// Dietary Preferences are grouped into three independent categories.
const DIET_TYPE_KEYS = [
  'No Preference', 'Vegan', 'Vegetarian', 'Pescatarian', 'Mediterranean',
  'Keto', 'Paleo', 'Carnivore', 'Whole30', 'Standard American Diet',
];
const EATING_PATTERN_KEYS = ['Intermittent Fasting'];
const NUTRITION_PHIL_KEYS = ['Chris Masterjohn'];

export default function ProfileTab({ onSaved }: { onSaved?: () => void }) {
  const [options, setOptions] = useState<ProfileOptions | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [profileId, setLocalProfileId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [sex, setSex] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [philosophy, setPhilosophy] = useState('No Preference');   // Diet Type
  const [eatingPattern, setEatingPattern] = useState('');           // '' = None
  const [nutritionPhil, setNutritionPhil] = useState('');           // '' = None
  const [isCustom, setIsCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customizations, setCustomizations] = useState({ stricter: '', lenient: '', extra: '' });
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyOther, setAllergyOther] = useState('');
  const [avoided, setAvoided] = useState<string[]>([]);
  const [avoidedOther, setAvoidedOther] = useState('');
  const [tolerance, setTolerance] = useState(3);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Modals
  const [infoModal, setInfoModal] = useState<{ title: string; body: string; extra?: React.ReactNode } | null>(null);
  const [philModal, setPhilModal] = useState<PhilosophyOption | null>(null);
  const [customizeModal, setCustomizeModal] = useState<PhilosophyOption | null>(null);
  const [buildModal, setBuildModal] = useState(false);

  useEffect(() => {
    setLocalProfileId(getProfileId());
    fetch(ENDPOINTS.profileOptions)
      .then(r => r.json())
      .then(setOptions)
      .catch(() => setConnectionError(true));
  }, []);

  useEffect(() => {
    if (!profileId || !options) return;
    const knownAllergy = new Set(options.allergies_and_conditions.map(a => a.key));
    const knownIngredient = new Set(options.ingredient_categories.map(c => c.category));
    fetch(ENDPOINTS.getProfile(profileId))
      .then(r => r.json())
      .then((p: UserProfile) => {
        setName(p.name ?? '');
        setSex(p.sex ?? '');
        setAgeGroup(p.age_group ?? '');
        // Split known selections from free-text "Other" entries
        const al = p.allergies_and_conditions ?? [];
        setAllergies(al.filter(x => knownAllergy.has(x)));
        setAllergyOther(al.filter(x => !knownAllergy.has(x)).join(', '));
        const av = p.avoided_ingredients ?? [];
        setAvoided(av.filter(x => knownIngredient.has(x)));
        setAvoidedOther(av.filter(x => !knownIngredient.has(x)).join(', '));
        setTolerance(p.processed_food_tolerance ?? 3);
        if (p.dietary_philosophy === 'custom') { setIsCustom(true); setCustomText(p.custom_philosophy_text ?? ''); }
        else setPhilosophy(p.dietary_philosophy ?? 'No Preference');
        try {
          const c = JSON.parse(p.philosophy_customizations || '{}');
          setCustomizations({ stricter: (c.stricter ?? []).join('\n'), lenient: (c.lenient ?? []).join('\n'), extra: (c.extra ?? []).join('\n') });
          setEatingPattern(c.eatingPattern ?? '');
          setNutritionPhil(c.nutritionPhilosophy ?? '');
        } catch {}
      })
      .catch(() => {});
  }, [profileId, options]);

  const toggle = (arr: string[], setArr: (v: string[]) => void, key: string) =>
    setArr(arr.includes(key) ? arr.filter(x => x !== key) : [...arr, key]);

  const handleSave = async () => {
    setSaveNotice(null);
    const c = {
      stricter: customizations.stricter.split('\n').map(x => x.trim()).filter(Boolean),
      lenient: customizations.lenient.split('\n').map(x => x.trim()).filter(Boolean),
      extra: customizations.extra.split('\n').map(x => x.trim()).filter(Boolean),
      eatingPattern: eatingPattern || '',
      nutritionPhilosophy: nutritionPhil || '',
    };
    const mergedAllergies = [...allergies, ...(allergyOther.trim() ? [allergyOther.trim()] : [])];
    const mergedAvoided = [...avoided, ...(avoidedOther.trim() ? [avoidedOther.trim()] : [])];
    const body = {
      name: name.trim() || undefined,
      sex: sex || undefined,
      age_group: ageGroup || undefined,
      allergies_and_conditions: mergedAllergies,
      dietary_philosophy: isCustom ? 'custom' : philosophy,
      philosophy_customizations: JSON.stringify(c),
      custom_philosophy_text: isCustom ? customText : undefined,
      avoided_ingredients: mergedAvoided,
      processed_food_tolerance: tolerance,
    };
    setSaving(true);
    try {
      const url = profileId ? ENDPOINTS.updateProfile(profileId) : ENDPOINTS.createProfile;
      const r = await fetch(url, {
        method: profileId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail ?? `Server error ${r.status}`);
      }
      const savedProfile: UserProfile = await r.json();
      persistProfileId(savedProfile.id);
      setLocalProfileId(savedProfile.id);
      setSaved(true);
      setSaveNotice('Profile saved! Now head over to the Goals tab to set your goals.');
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (connectionError) {
    return (
      <div className={s.page}>
        <div className={s.container}>
          <div className={s.warning}>⚠️ Cannot reach the backend — make sure it&apos;s running on port 8000.</div>
        </div>
      </div>
    );
  }

  if (!options) {
    return (
      <div className={s.page}>
        <div className={s.container}>
          <p className={s.sub}>Connecting to server…</p>
        </div>
      </div>
    );
  }

  // Build the three preference groups from the flat option list
  const byKey = (k: string) => options.dietary_philosophies.find(p => p.key === k);
  const dietTypeOpts = DIET_TYPE_KEYS.map(byKey).filter(Boolean) as PhilosophyOption[];
  const eatingOpts = EATING_PATTERN_KEYS.map(byKey).filter(Boolean) as PhilosophyOption[];
  const nutriOpts = NUTRITION_PHIL_KEYS.map(byKey).filter(Boolean) as PhilosophyOption[];

  const philData = philosophy !== 'No Preference' ? byKey(philosophy) : undefined;
  const eatingData = eatingPattern ? byKey(eatingPattern) : undefined;
  const nutriData = nutritionPhil ? byKey(nutritionPhil) : undefined;

  const TOL_LABELS = ['None', 'Minimal', 'Low', 'Moderate', 'No limit'];
  // Plain-language meaning of each level, anchored to the NOVA processing scale
  // (1 = unprocessed whole foods … 4 = ultra-processed).
  const TOL_DESCRIPTIONS = [
    'Whole, unprocessed foods only (NOVA 1) — fresh produce, plain meat, eggs, nuts, dried beans. No packaged/processed items.',
    'Mostly whole foods, plus simple processed staples (NOVA 1–2) — e.g. plain yogurt, olive oil, butter, canned beans, flour.',
    'Everyday processed foods are fine (up to NOVA 3) — bread, cheese, canned vegetables, cured meats — but ultra-processed items are flagged.',
    'Most packaged foods are okay; only heavily ultra-processed items (NOVA 4) — sodas, packaged snacks, instant meals — get flagged.',
    'No limit on processing — every product is considered, including ultra-processed foods (NOVA 4).',
  ];

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

        {/* Sex */}
        <section className={s.section}>
          <div className={s.labelRow}>
            <label className={s.label} style={{ marginBottom: 0 }}>Sex <span className={s.hint}>(optional)</span></label>
            <button
              className={s.infoBtnInline}
              onClick={() => setInfoModal({
                title: 'Why we ask for sex',
                body: 'Nutritional needs differ by sex — for example, iron, calcium, and calorie targets vary. Sharing this helps us tailor recommendations more precisely. It’s entirely optional and only used to personalise your analysis.',
              })}
            >ℹ</button>
          </div>
          <div className={s.segmentRow}>
            {options.sex_options.map(o => (
              <button key={o.key} className={`${s.segment} ${sex === o.key ? s.segmentOn : ''}`}
                onClick={() => setSex(sex === o.key ? '' : o.key)}>{o.key}</button>
            ))}
          </div>
        </section>

        {/* Age Group */}
        <section className={s.section}>
          <div className={s.labelRow}>
            <label className={s.label} style={{ marginBottom: 0 }}>Age Group <span className={s.hint}>(optional)</span></label>
            <button
              className={s.infoBtnInline}
              onClick={() => setInfoModal({
                title: 'Why we ask for age group',
                body: 'Nutrient needs shift across life stages — bone health, sodium sensitivity, protein needs, and growth requirements all vary by age. Sharing this helps us tailor guidance more precisely. It’s entirely optional and only used to personalise your analysis.',
              })}
            >ℹ</button>
          </div>
          <div className={s.pillRow}>
            {options.age_group_options.map(o => (
              <button key={o.key} className={`${s.pill} ${ageGroup === o.key ? s.pillActive : ''}`}
                onClick={() => setAgeGroup(ageGroup === o.key ? '' : o.key)}>{o.key}</button>
            ))}
          </div>
        </section>

        {/* Dietary Preferences */}
        <section className={s.section}>
          <label className={s.label}>Dietary Preferences</label>

          {/* Diet Type */}
          <div className={s.prefCategory}>Diet Type</div>
          {isCustom ? (
            <div className={`${s.infoCard} ${s.infoCardAccent}`}>
              <p className={`${s.infoCardTitle} ${s.accentText}`}>Custom philosophy active</p>
              <p className={s.infoCardBody}>{customText || 'No text yet — click Edit to add your rules'}</p>
              <div className={s.actionRow}>
                <button className={`${s.actionBtn} ${s.actionBtnAccent}`} onClick={() => setBuildModal(true)}>Edit</button>
                <button className={s.actionBtn} onClick={() => setIsCustom(false)}>Use a preset</button>
              </div>
            </div>
          ) : (
            <>
              <div className={s.pillRow}>
                {dietTypeOpts.map(p => (
                  <button key={p.key} className={`${s.pill} ${philosophy === p.key ? s.pillActive : ''}`}
                    onClick={() => setPhilosophy(p.key)}>{p.key === 'No Preference' ? 'None' : p.key}</button>
                ))}
              </div>
              {philData && (
                <div className={s.infoCard}>
                  <p className={s.infoCardTitle}>{philData.key}</p>
                  <p className={s.infoCardBody}>{philData.summary}</p>
                  <div className={s.actionRow}>
                    <button className={s.actionBtn} onClick={() => setPhilModal(philData)}>Learn more</button>
                    <button className={s.actionBtn} onClick={() => setCustomizeModal(philData)}>Customize</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Eating Pattern */}
          <div className={s.prefCategory}>Eating Pattern</div>
          <div className={s.pillRow}>
            <button className={`${s.pill} ${eatingPattern === '' ? s.pillActive : ''}`} onClick={() => setEatingPattern('')}>None</button>
            {eatingOpts.map(p => (
              <button key={p.key} className={`${s.pill} ${eatingPattern === p.key ? s.pillActive : ''}`}
                onClick={() => setEatingPattern(p.key)}>{p.key}</button>
            ))}
          </div>
          {eatingData && (
            <div className={s.infoCard}>
              <p className={s.infoCardTitle}>{eatingData.key}</p>
              <p className={s.infoCardBody}>{eatingData.summary}</p>
              <div className={s.actionRow}>
                <button className={s.actionBtn} onClick={() => setPhilModal(eatingData)}>Learn more</button>
              </div>
            </div>
          )}

          {/* Nutrition Philosophy */}
          <div className={s.prefCategory}>Nutrition Philosophy</div>
          <div className={s.pillRow}>
            <button className={`${s.pill} ${nutritionPhil === '' ? s.pillActive : ''}`} onClick={() => setNutritionPhil('')}>None</button>
            {nutriOpts.map(p => (
              <button key={p.key} className={`${s.pill} ${nutritionPhil === p.key ? s.pillActive : ''}`}
                onClick={() => setNutritionPhil(p.key)}>{p.key}</button>
            ))}
          </div>
          {nutriData && (
            <div className={s.infoCard}>
              <p className={s.infoCardTitle}>{nutriData.key}</p>
              <p className={s.infoCardBody}>{nutriData.summary}</p>
              <div className={s.actionRow}>
                <button className={s.actionBtn} onClick={() => setPhilModal(nutriData)}>Learn more</button>
              </div>
            </div>
          )}

          {/* Standalone Build My Own */}
          {!isCustom && (
            <button className={s.buildOwnBtn} onClick={() => setBuildModal(true)}>
              ✎ Build My Own Philosophy
            </button>
          )}
        </section>

        {/* Allergies */}
        <section className={s.section}>
          <label className={s.label}>Allergies & Conditions <span className={s.hint}>— click ℹ for details</span></label>
          <div className={s.listGroup}>
            {options.allergies_and_conditions.map(a => (
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
            <div className={s.otherRow}>
              <span className={s.otherLabel}>Other</span>
              <input className={s.otherInput} value={allergyOther} onChange={e => setAllergyOther(e.target.value)}
                placeholder="Describe another allergy or condition" />
            </div>
          </div>
        </section>

        {/* Ingredients to avoid */}
        <section className={s.section}>
          <label className={s.label}>Ingredients to Avoid <span className={s.hint}>— click ℹ for examples</span></label>
          <div className={s.listGroup}>
            {options.ingredient_categories.map(cat => (
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
            <div className={s.otherRow}>
              <span className={s.otherLabel}>Other</span>
              <input className={s.otherInput} value={avoidedOther} onChange={e => setAvoidedOther(e.target.value)}
                placeholder="Describe another ingredient to avoid" />
            </div>
          </div>
        </section>

        {/* Processing tolerance */}
        <section className={s.section}>
          <label className={s.label}>Processed Food Tolerance</label>
          <p className={s.sublabel}>
            How strict scoring is about processing, on the NOVA scale (1 = unprocessed
            whole foods, 4 = ultra-processed). Pick the most processed level you&apos;re
            comfortable with.
          </p>
          <div className={s.tolRow}>
            {[0, 1, 2, 3, 4].map(n => (
              <button key={n} className={`${s.tolSeg} ${tolerance === n ? s.tolSegOn : ''}`}
                onClick={() => setTolerance(n)} title={TOL_DESCRIPTIONS[n]}>{TOL_LABELS[n]}</button>
            ))}
          </div>
          <div className={s.tolDescBox}>
            <span className={s.tolDescLevel}>Level {tolerance} · {TOL_LABELS[tolerance]}</span>
            <span className={s.tolDescText}>{TOL_DESCRIPTIONS[tolerance]}</span>
          </div>
        </section>

        <button className={`${s.saveBtn} ${saved ? s.saveBtnSaved : ''}`} onClick={handleSave} disabled={saving}>
          {saved ? '✓ Saved' : saving ? 'Saving…' : profileId ? 'Update Profile' : 'Save Profile'}
        </button>
        {saveNotice && <div className={s.saveNotice}>{saveNotice}</div>}
      </div>

      {/* Info modal */}
      {infoModal && (
        <div className={s.modalOverlay} onClick={() => setInfoModal(null)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <button className={s.modalCloseX} onClick={() => setInfoModal(null)} aria-label="Close">✕</button>
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
            <button className={s.modalCloseX} onClick={() => setPhilModal(null)} aria-label="Close">✕</button>
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
            <button className={s.modalCloseX} onClick={() => setCustomizeModal(null)} aria-label="Close">✕</button>
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
            <button className={s.modalCloseX} onClick={() => setBuildModal(false)} aria-label="Close">✕</button>
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
