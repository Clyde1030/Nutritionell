// App color themes. The picker lives in the Settings tab; the chosen theme is
// persisted here and re-applied on load. These palettes are taken verbatim from the
// canonical source (DataSci_210/Nutritionell/Application/web_new — the DevColorToolbar
// PALETTES). DEFAULT is "Light Mode"; its values mirror :root in globals.css so a
// first-time visitor sees it with no flash.

export interface Palette {
  name: string;
  mode: 'light' | 'dark';
  vars: Record<string, string>;
}

export const DEFAULT_THEME = 'Light Mode';

export const PALETTES: Palette[] = [
  // ── Light ────────────────────────────────────────────────────────────────
  {
    name: 'Light Mode', mode: 'light',
    vars: {
      '--bg': '#e8f6f4', '--card': '#ffffff', '--surface': '#f1faf8',
      '--border': '#cfe8e2', '--text': '#17356f', '--sub': '#516585',
      '--accent': '#20d6a4', '--accent-glow': 'rgba(32,214,164,0.2)',
      '--green': '#1ebc90', '--red': '#d94f5c', '--yellow': '#efbf4c',
    },
  },
  {
    name: 'Light Mode Classic', mode: 'light',
    vars: {
      '--bg': '#f5f5f7', '--card': '#ffffff', '--surface': '#eeeef2',
      '--border': '#d4d4d8', '--text': '#18181b', '--sub': '#71717a',
      '--accent': '#6d28d9', '--accent-glow': 'rgba(109,40,217,0.1)',
      '--green': '#16a34a', '--red': '#dc2626', '--yellow': '#ca8a04',
    },
  },
  // ── Dark ─────────────────────────────────────────────────────────────────
  {
    name: 'Default Dark', mode: 'dark',
    vars: {
      '--bg': '#09090f', '--card': '#111118', '--surface': '#16161f',
      '--border': '#1f1f2e', '--text': '#f1f0ff', '--sub': '#9896b0',
      '--accent': '#7c6aff', '--accent-glow': 'rgba(124,106,255,0.15)',
      '--green': '#22d3a5', '--red': '#ff5c7a', '--yellow': '#f59e0b',
    },
  },
  {
    name: 'High Contrast', mode: 'dark',
    vars: {
      '--bg': '#000000', '--card': '#0a0a0a', '--surface': '#141414',
      '--border': '#333333', '--text': '#ffffff', '--sub': '#b0b0b0',
      '--accent': '#a78bfa', '--accent-glow': 'rgba(167,139,250,0.2)',
      '--green': '#4ade80', '--red': '#f87171', '--yellow': '#fbbf24',
    },
  },
  {
    name: 'Ocean', mode: 'dark',
    vars: {
      '--bg': '#0b1426', '--card': '#0f1d35', '--surface': '#132744',
      '--border': '#1e3a5f', '--text': '#e0f2fe', '--sub': '#7dd3fc',
      '--accent': '#38bdf8', '--accent-glow': 'rgba(56,189,248,0.15)',
      '--green': '#2dd4bf', '--red': '#fb7185', '--yellow': '#fbbf24',
    },
  },
  {
    name: 'Warm Earth', mode: 'dark',
    vars: {
      '--bg': '#1a1210', '--card': '#231a16', '--surface': '#2d211c',
      '--border': '#3d2e26', '--text': '#fdf2e9', '--sub': '#c4a882',
      '--accent': '#e07c3e', '--accent-glow': 'rgba(224,124,62,0.15)',
      '--green': '#65a30d', '--red': '#ef4444', '--yellow': '#eab308',
    },
  },
  {
    name: 'Cyberpunk', mode: 'dark',
    vars: {
      '--bg': '#0a0014', '--card': '#12001f', '--surface': '#1a0030',
      '--border': '#2d0052', '--text': '#f0e6ff', '--sub': '#c084fc',
      '--accent': '#e879f9', '--accent-glow': 'rgba(232,121,249,0.2)',
      '--green': '#00ff88', '--red': '#ff2d55', '--yellow': '#ffea00',
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
