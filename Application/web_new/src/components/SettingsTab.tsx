'use client';
import { useEffect, useState } from 'react';
import {
  getMaxDetections, setMaxDetections,
  MAX_DETECTIONS_DEFAULT, MAX_DETECTIONS_OPTIONS,
} from '@/lib/storage';
import {
  PALETTES, DEFAULT_THEME, paletteByName, applyPalette, getStoredTheme, setStoredTheme,
} from '@/lib/theme';
import s from './SettingsTab.module.css';

export default function SettingsTab() {
  // Start from the defaults so the server and first client render match; sync the
  // real stored values in after mount (localStorage isn't available during SSR).
  const [maxDet, setMaxDet] = useState<number>(MAX_DETECTIONS_DEFAULT);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<string>(DEFAULT_THEME);

  useEffect(() => {
    setMaxDet(getMaxDetections());
    setTheme(getStoredTheme());
  }, []);

  const pick = (n: number) => {
    setMaxDet(n);
    setMaxDetections(n);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const pickTheme = (name: string) => {
    setTheme(name);
    applyPalette(paletteByName(name));
    setStoredTheme(name);
  };

  const lightThemes = PALETTES.filter(p => p.mode === 'light');
  const darkThemes = PALETTES.filter(p => p.mode === 'dark');

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <h1 className={s.title}>Settings</h1>
        <p className={s.subtitle}>
          Preferences that control how Nutritionell looks and scans your shelf. These are
          saved on this device.
        </p>
      </div>

      <section className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>Appearance</h2>
          <span className={s.valuePill}>{theme}</span>
        </div>
        <p className={s.cardText}>
          Choose a color scheme. Light themes are the default; dark themes are available too.
        </p>

        <p className={s.groupLabel}>Light</p>
        <div className={s.themeGrid}>
          {lightThemes.map(p => (
            <ThemeSwatch key={p.name} name={p.name} vars={p.vars} active={theme === p.name} onPick={pickTheme} />
          ))}
        </div>

        <p className={s.groupLabel}>Dark</p>
        <div className={s.themeGrid}>
          {darkThemes.map(p => (
            <ThemeSwatch key={p.name} name={p.name} vars={p.vars} active={theme === p.name} onPick={pickTheme} />
          ))}
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>Maximum products per scan</h2>
          <span className={s.valuePill}>{maxDet}</span>
        </div>
        <p className={s.cardText}>
          How many products a single shelf photo will identify and score. A lower number
          makes each scan noticeably <strong>faster</strong> and more reliable; a higher
          number captures <strong>more of a busy shelf</strong> but takes longer and is
          more likely to time out.
        </p>

        <div className={s.pillRow} role="group" aria-label="Maximum products per scan">
          {MAX_DETECTIONS_OPTIONS.map(n => (
            <button
              key={n}
              type="button"
              className={`${s.pill} ${maxDet === n ? s.pillActive : ''}`}
              aria-pressed={maxDet === n}
              onClick={() => pick(n)}
            >
              {n}
            </button>
          ))}
        </div>

        <div className={s.scaleRow}>
          <span>← Faster scans</span>
          <span>More shelf coverage →</span>
        </div>

        <p className={s.appliesNote}>
          {saved
            ? <span className={s.savedFlash}>✓ Saved — your next scan will use up to {maxDet} products.</span>
            : <>Applies to the <strong>Scan</strong> tab. Default is {MAX_DETECTIONS_DEFAULT}.</>}
        </p>
      </section>
    </div>
  );
}

function ThemeSwatch({
  name, vars, active, onPick,
}: { name: string; vars: Record<string, string>; active: boolean; onPick: (n: string) => void }) {
  return (
    <button
      type="button"
      className={`${s.themeCard} ${active ? s.themeCardActive : ''}`}
      aria-pressed={active}
      onClick={() => onPick(name)}
    >
      <span className={s.themePreview} style={{ background: vars['--bg'], borderColor: vars['--border'] }}>
        <span className={s.themeCardDot} style={{ background: vars['--card'], borderColor: vars['--border'] }} />
        {[vars['--accent'], vars['--green'], vars['--red']].map((c, i) => (
          <span key={i} className={s.themeDot} style={{ background: c }} />
        ))}
      </span>
      <span className={s.themeName}>{name}{active ? ' ✓' : ''}</span>
    </button>
  );
}
