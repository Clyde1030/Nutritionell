'use client';
import { useEffect, useState } from 'react';
import s from './AppearanceTab.module.css';

type Palette = {
  name: string;
  vars: Record<string, string>;
};

const PALETTES: Palette[] = [
  {
    name: 'Default Dark',
    vars: {
      '--bg': '#09090f', '--card': '#111118', '--surface': '#16161f',
      '--border': '#1f1f2e', '--text': '#f1f0ff', '--sub': '#9896b0',
      '--accent': '#7c6aff', '--accent-glow': 'rgba(124,106,255,0.15)',
      '--green': '#22d3a5', '--red': '#ff5c7a', '--yellow': '#f59e0b',
    },
  },
  {
    name: 'Light Mode',
    vars: {
      '--bg': '#e8f6f4', '--card': '#ffffff', '--surface': '#f1faf8',
      '--border': '#cfe8e2', '--text': '#17356f', '--sub': '#516585',
      '--accent': '#20d6a4', '--accent-glow': 'rgba(32,214,164,0.2)',
      '--green': '#1ebc90', '--red': '#d94f5c', '--yellow': '#efbf4c',
    },
  },
  {
    name: 'Light Mode Classic',
    vars: {
      '--bg': '#f5f5f7', '--card': '#ffffff', '--surface': '#eeeef2',
      '--border': '#d4d4d8', '--text': '#18181b', '--sub': '#71717a',
      '--accent': '#6d28d9', '--accent-glow': 'rgba(109,40,217,0.1)',
      '--green': '#16a34a', '--red': '#dc2626', '--yellow': '#ca8a04',
    },
  },
  {
    name: 'High Contrast',
    vars: {
      '--bg': '#000000', '--card': '#0a0a0a', '--surface': '#141414',
      '--border': '#333333', '--text': '#ffffff', '--sub': '#b0b0b0',
      '--accent': '#a78bfa', '--accent-glow': 'rgba(167,139,250,0.2)',
      '--green': '#4ade80', '--red': '#f87171', '--yellow': '#fbbf24',
    },
  },
  {
    name: 'Ocean',
    vars: {
      '--bg': '#0b1426', '--card': '#0f1d35', '--surface': '#132744',
      '--border': '#1e3a5f', '--text': '#e0f2fe', '--sub': '#7dd3fc',
      '--accent': '#38bdf8', '--accent-glow': 'rgba(56,189,248,0.15)',
      '--green': '#2dd4bf', '--red': '#fb7185', '--yellow': '#fbbf24',
    },
  },
  {
    name: 'Warm Earth',
    vars: {
      '--bg': '#1a1210', '--card': '#231a16', '--surface': '#2d211c',
      '--border': '#3d2e26', '--text': '#fdf2e9', '--sub': '#c4a882',
      '--accent': '#e07c3e', '--accent-glow': 'rgba(224,124,62,0.15)',
      '--green': '#65a30d', '--red': '#ef4444', '--yellow': '#eab308',
    },
  },
  {
    name: 'Cyberpunk',
    vars: {
      '--bg': '#0a0014', '--card': '#12001f', '--surface': '#1a0030',
      '--border': '#2d0052', '--text': '#f0e6ff', '--sub': '#c084fc',
      '--accent': '#e879f9', '--accent-glow': 'rgba(232,121,249,0.2)',
      '--green': '#00ff88', '--red': '#ff2d55', '--yellow': '#ffea00',
    },
  },
];

const APPEARANCE_STORAGE_KEY = 'nutritionell_appearance_palette_v1';

function applyPalette(palette: Palette) {
  const root = document.documentElement;
  Object.entries(palette.vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

function paletteByName(name: string | null | undefined) {
  return PALETTES.find((palette) => palette.name === name) ?? PALETTES[0];
}

export default function AppearanceTab() {
  const [active, setActive] = useState('Default Dark');

  useEffect(() => {
    const savedPaletteName = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    const palette = paletteByName(savedPaletteName);
    applyPalette(palette);
    setActive(palette.name);
  }, []);

  const onSelect = (palette: Palette) => {
    applyPalette(palette);
    setActive(palette.name);
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, palette.name);
  };

  const reset = () => {
    const root = document.documentElement;
    Object.keys(PALETTES[0].vars).forEach((k) => root.style.removeProperty(k));
    setActive('Default Dark');
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, PALETTES[0].name);
  };

  return (
    <div className={s.page}>
      <div className={s.container}>
        <div className={s.header}>
          <h1 className={s.title}>Appearance</h1>
          <p className={s.sub}>Choose a color palette for your Nutritionell experience.</p>
        </div>

        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Theme Palette</h2>
            <button className={s.resetBtn} onClick={reset}>Reset</button>
          </div>

          <div className={s.grid}>
            {PALETTES.map((p) => (
              <button
                key={p.name}
                className={`${s.palette} ${active === p.name ? s.paletteActive : ''}`}
                onClick={() => onSelect(p)}
              >
                <div className={s.swatches}>
                  {[p.vars['--bg'], p.vars['--card'], p.vars['--accent'], p.vars['--green']].map((c, i) => (
                    <span key={i} className={s.swatch} style={{ background: c }} aria-hidden="true" />
                  ))}
                </div>
                <span className={s.name}>{p.name}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
