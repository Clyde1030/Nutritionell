/**
 * ========================================
 * DEV ONLY — Remove or comment out this component import in page.tsx for production builds.
 * ========================================
 */
'use client';
import { useState } from 'react';

interface Palette {
  name: string;
  vars: Record<string, string>;
}

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

export default function DevColorToolbar() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('Default Dark');

  const apply = (palette: Palette) => {
    const root = document.documentElement;
    Object.entries(palette.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    setActive(palette.name);
  };

  const reset = () => {
    const root = document.documentElement;
    Object.keys(PALETTES[0].vars).forEach(k => root.style.removeProperty(k));
    setActive('Default Dark');
  };

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      {open && (
        <div style={{
          background: '#1a1a2e', border: '1px solid #333', borderRadius: 12,
          padding: 16, marginBottom: 8, width: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Color Palettes</span>
            <button onClick={reset} style={{
              color: '#9896b0', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer',
            }}>Reset</button>
          </div>
          {PALETTES.map(p => (
            <button key={p.name} onClick={() => apply(p)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '8px 10px', marginBottom: 4, borderRadius: 8, border: 'none',
              background: active === p.name ? 'rgba(124,106,255,0.2)' : 'transparent',
              cursor: 'pointer', transition: 'background 0.15s',
            }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {[p.vars['--bg'], p.vars['--accent'], p.vars['--green'], p.vars['--red']].map((c, i) => (
                  <div key={i} style={{
                    width: 14, height: 14, borderRadius: 3, background: c,
                    border: '1px solid rgba(255,255,255,0.1)',
                  }} />
                ))}
              </div>
              <span style={{
                color: active === p.name ? '#fff' : '#ccc', fontSize: 12, fontWeight: active === p.name ? 600 : 400,
              }}>{p.name}</span>
            </button>
          ))}

          <div style={{ marginTop: 12, borderTop: '1px solid #333', paddingTop: 12 }}>
            <span style={{ color: '#9896b0', fontSize: 11 }}>Live CSS Variables</span>
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {Object.entries(PALETTES.find(p => p.name === active)?.vars ?? PALETTES[0].vars).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: v, border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
                  <span style={{ color: '#888', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(!open)} style={{
        width: 44, height: 44, borderRadius: 22, border: '2px solid #7c6aff',
        background: 'linear-gradient(135deg, #7c6aff, #e879f9)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(124,106,255,0.4)', fontSize: 18,
        transition: 'transform 0.15s',
      }}>
        {open ? '✕' : '🎨'}
      </button>
    </div>
  );
}
