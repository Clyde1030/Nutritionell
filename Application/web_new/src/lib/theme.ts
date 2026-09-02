// App color themes. The picker lives in the Settings tab; the chosen theme is
// persisted here and re-applied on load. DEFAULT is "Avocado"; its values mirror
// :root in globals.css so a first-time visitor sees it with no flash.

export interface Palette {
  name: string;
  mode: 'light' | 'dark';
  vars: Record<string, string>;
}

export const DEFAULT_THEME = 'Avocado';

export const PALETTES: Palette[] = [
  // ── Light ────────────────────────────────────────────────────────────────
  {
    name: 'Avocado', mode: 'light',
    vars: {
      '--accent': 'oklch(42% 0.15 155)', '--accent-glow': 'oklch(42% 0.15 155 / 0.1)',
      '--bg': 'oklch(98% 0.006 80)', '--card': 'oklch(100% 0 0)',
      '--surface': 'oklch(96% 0.01 80)', '--border': 'oklch(92% 0.008 80)',
      '--text': 'oklch(24% 0.02 80)', '--sub': 'oklch(48% 0.015 80)',
      '--accent-ink': '#ffffff',
      '--green': 'oklch(56% 0.15 150)', '--green-bg': 'oklch(93% 0.045 150)',
      '--red': 'oklch(55% 0.18 25)', '--red-bg': 'oklch(55% 0.18 25 / 0.06)',
      '--yellow': 'oklch(55% 0.14 85)', '--yellow-bg': 'oklch(55% 0.14 85 / 0.07)',
      '--radius': '20px', '--radius-btn': '999px', '--radius-nav': '999px',
      '--shadow': '0 10px 26px oklch(40% 0.03 80 / 0.08)',
      '--f-display': "'Fredoka', sans-serif", '--f-body': "'Karla', sans-serif",
    },
  },
  {
    name: 'Eggplant', mode: 'light',
    vars: {
      '--accent': 'oklch(42% 0.15 322)', '--accent-glow': 'oklch(42% 0.15 322 / 0.1)',
      '--bg': 'oklch(98% 0.006 80)', '--card': 'oklch(100% 0 0)',
      '--surface': 'oklch(96% 0.01 80)', '--border': 'oklch(92% 0.008 80)',
      '--text': 'oklch(24% 0.02 80)', '--sub': 'oklch(48% 0.015 80)',
      '--accent-ink': '#ffffff',
      '--green': 'oklch(56% 0.15 150)', '--green-bg': 'oklch(93% 0.045 150)',
      '--red': 'oklch(55% 0.18 25)', '--red-bg': 'oklch(55% 0.18 25 / 0.06)',
      '--yellow': 'oklch(55% 0.14 85)', '--yellow-bg': 'oklch(55% 0.14 85 / 0.07)',
      '--radius': '20px', '--radius-btn': '999px', '--radius-nav': '999px',
      '--shadow': '0 10px 26px oklch(40% 0.03 80 / 0.08)',
      '--f-display': "'Fredoka', sans-serif", '--f-body': "'Karla', sans-serif",
    },
  },
  // ── Dark ─────────────────────────────────────────────────────────────────
  {
    name: 'Neon Kale', mode: 'dark',
    vars: {
      '--bg': 'oklch(15% 0.015 260)', '--card': 'oklch(20% 0.018 260)',
      '--surface': 'oklch(26% 0.02 260)', '--border': 'oklch(32% 0.02 260)',
      '--text': 'oklch(96% 0.003 260)', '--sub': 'oklch(70% 0.015 260)',
      '--accent': 'oklch(85% 0.19 135)', '--accent-ink': 'oklch(15% 0.02 260)',
      '--accent-glow': 'oklch(85% 0.19 135 / 0.14)',
      '--green': 'oklch(75% 0.18 150)', '--green-bg': 'oklch(75% 0.18 150 / 0.16)',
      '--red': 'oklch(68% 0.19 25)', '--red-bg': 'oklch(68% 0.19 25 / 0.12)',
      '--yellow': 'oklch(80% 0.15 85)', '--yellow-bg': 'oklch(80% 0.15 85 / 0.12)',
      '--radius': '12px', '--radius-btn': '10px', '--radius-nav': '8px',
      '--shadow': 'none',
      '--f-display': "'Space Grotesk', sans-serif", '--f-body': "'Work Sans', sans-serif",
    },
  },
];

const THEME_KEY = 'nutritionell_theme';

export function paletteByName(name: string | null): Palette {
  return PALETTES.find(p => p.name === name) ?? PALETTES[0];
}

export function applyPalette(palette: Palette): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  Object.entries(palette.vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

export function getStoredTheme(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  return window.localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME;
}

export function setStoredTheme(name: string): void {
  window.localStorage.setItem(THEME_KEY, name);
}

/** Apply the persisted theme (or the default) — call once on app mount. */
export function initTheme(): void {
  applyPalette(paletteByName(getStoredTheme()));
}
