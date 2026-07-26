import { useEffect, useState } from 'react';

// Recharts needs concrete color strings (CSS var() doesn't resolve inside SVG
// presentation attributes), so we read the active theme's CSS variables at runtime.
// Defaults mirror the light default theme in case a read runs before styles apply.
export interface ChartColors {
  sub: string; border: string; card: string; text: string; accent: string;
  green: string; red: string; yellow: string;
}

export function useChartColors(): ChartColors {
  const [c, setC] = useState<ChartColors>({
    sub: '#71717a', border: '#d4d4d8', card: '#ffffff', text: '#18181b',
    accent: '#6d28d9', green: '#16a34a', red: '#dc2626', yellow: '#ca8a04',
  });
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    setC({
      sub: v('--sub', '#71717a'), border: v('--border', '#d4d4d8'), card: v('--card', '#ffffff'),
      text: v('--text', '#18181b'), accent: v('--accent', '#6d28d9'), green: v('--green', '#16a34a'),
      red: v('--red', '#dc2626'), yellow: v('--yellow', '#ca8a04'),
    });
  }, []);
  return c;
}
