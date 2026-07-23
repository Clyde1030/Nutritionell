export const THEME_STORAGE_KEY = 'nutritionell_mobile_palette_v1';

export type AppPalette = {
  name: string;
  bg: string;
  bar: string;
  card: string;
  border: string;
  text: string;
  sub: string;
  accent: string;
};

export const PALETTES: AppPalette[] = [
  {
    name: 'Default Dark',
    bg: '#09090f',
    bar: '#0d0d14',
    card: '#111118',
    border: '#1f1f2e',
    text: '#f1f0ff',
    sub: '#9896b0',
    accent: '#7c6aff',
  },
  {
    name: 'Light Mode',
    bg: '#e8f6f4',
    bar: '#d9efec',
    card: '#ffffff',
    border: '#b9ded8',
    text: '#1f2937',
    sub: '#4b5563',
    accent: '#20d6a4',
  },
  {
    name: 'Light Mode Classic',
    bg: '#f5f5f7',
    bar: '#ececf1',
    card: '#ffffff',
    border: '#d5d7e0',
    text: '#111827',
    sub: '#4b5563',
    accent: '#6d28d9',
  },
  {
    name: 'High Contrast',
    bg: '#000000',
    bar: '#0a0a0a',
    card: '#101010',
    border: '#2a2a2a',
    text: '#ffffff',
    sub: '#c4c4c4',
    accent: '#a78bfa',
  },
  {
    name: 'Ocean',
    bg: '#0b1426',
    bar: '#0f1d35',
    card: '#122441',
    border: '#274269',
    text: '#e6f1ff',
    sub: '#9bb7d8',
    accent: '#38bdf8',
  },
  {
    name: 'Warm Earth',
    bg: '#1a1210',
    bar: '#221915',
    card: '#2b1f1a',
    border: '#4c372f',
    text: '#f6eee8',
    sub: '#ccb8ab',
    accent: '#e07c3e',
  },
  {
    name: 'Cyberpunk',
    bg: '#0a0014',
    bar: '#120022',
    card: '#1a0030',
    border: '#3a1a63',
    text: '#f6e9ff',
    sub: '#c8a8e0',
    accent: '#e879f9',
  },
];

export const DEFAULT_PALETTE = PALETTES[0];

export function getPaletteByName(name?: string | null): AppPalette {
  if (!name) return DEFAULT_PALETTE;
  return PALETTES.find((p) => p.name === name) ?? DEFAULT_PALETTE;
}
