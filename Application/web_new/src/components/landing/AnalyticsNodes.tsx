'use client';
/**
 * Analytics' hero framing: the icon tile at the centre of six ingredient-category
 * nodes, joined by thin connector lines.
 *
 * Scan and Claim Check stand their tile on a shelf ledge; nothing is being placed
 * on a shelf in a search tool, so Analytics gets this instead. Decorative — the
 * headline underneath carries the meaning, so the whole thing is aria-hidden.
 */
import type { ReactNode } from 'react';
import s from './Landing.module.css';

const SIZE = 260;
const C = SIZE / 2;
const R = 85;          // node ring radius
const NODE = 32;       // node circle diameter

/** 12 o'clock first, then evenly spaced clockwise. */
const ANGLES = [-90, -30, 30, 90, 150, 210];

function at(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: C + R * Math.cos(rad), y: C + R * Math.sin(rad) };
}

/** Each glyph is drawn in its own 24x24 box and positioned by the caller.
 *  Flat --accent-strong fills, no two alike. */
const GLYPHS: ReactNode[] = [
  // 12 — lab flask (additives)
  <g key="flask">
    <path d="M10 3h4v1.4h-1v4.2l4.6 8.6a2 2 0 0 1-1.8 3H8.2a2 2 0 0 1-1.8-3L11 8.6V4.4h-1z" />
  </g>,
  // 2 — droplet with a highlight (fats & oils)
  <g key="drop">
    <path d="M12 3.5c3 3.8 5.2 6.6 5.2 9.3A5.2 5.2 0 0 1 12 18a5.2 5.2 0 0 1-5.2-5.2C6.8 10.1 9 7.3 12 3.5z" />
    <ellipse cx="10.1" cy="9.6" rx="1.15" ry="1.7" opacity="0.45" transform="rotate(-20 10.1 9.6)" />
  </g>,
  // 4 — DNA double helix (composition). Straight segments only, no curves.
  <g key="dna" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <polyline points="8,3 15,7 8,11 15,15 8,19" />
    <polyline points="15,3 8,7 15,11 8,15 15,19" />
    <line x1="9.6" y1="7" x2="13.4" y2="7" />
    <line x1="9.6" y1="11" x2="13.4" y2="11" />
    <line x1="9.6" y1="15" x2="13.4" y2="15" />
  </g>,
  // 6 — mason jar (preservatives)
  <g key="jar">
    <rect x="7.5" y="2.6" width="9" height="2.4" rx="0.7" />
    <rect x="9" y="5" width="6" height="2.2" />
    <rect x="6.5" y="7.2" width="11" height="12.4" rx="2.2" />
  </g>,
  // 8 — three overlapping translucent circles (dyes & colours)
  <g key="dyes" opacity="0.55">
    <circle cx="12" cy="8.4" r="4.3" />
    <circle cx="8.6" cy="14.4" r="4.3" />
    <circle cx="15.4" cy="14.4" r="4.3" />
  </g>,
  // 10 — grain / wheat stalk (whole & natural). The most literal of the six.
  <g key="grain">
    <rect x="11.4" y="6" width="1.2" height="14" rx="0.6" />
    <ellipse cx="12" cy="4.4" rx="1.3" ry="2.3" />
    <ellipse cx="9" cy="8.4" rx="1.2" ry="2.1" transform="rotate(-35 9 8.4)" />
    <ellipse cx="15" cy="8.4" rx="1.2" ry="2.1" transform="rotate(35 15 8.4)" />
    <ellipse cx="9" cy="12.6" rx="1.2" ry="2.1" transform="rotate(-35 9 12.6)" />
    <ellipse cx="15" cy="12.6" rx="1.2" ry="2.1" transform="rotate(35 15 12.6)" />
  </g>,
];

export default function AnalyticsNodes({ glyph }: { glyph: ReactNode }) {
  return (
    <div className={s.nodeWrap} aria-hidden="true">
      <svg className={s.nodeSvg} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Connectors first, so the nodes sit on top of them. */}
        {ANGLES.map((a) => {
          const { x, y } = at(a);
          return (
            <line key={`l${a}`} x1={C} y1={C} x2={x} y2={y}
                  stroke="var(--accent-glow2)" strokeWidth="1.5" />
          );
        })}

        {ANGLES.map((a, i) => {
          const { x, y } = at(a);
          return (
            <g key={`n${a}`}>
              <circle cx={x} cy={y} r={NODE / 2} fill="var(--accent-glow)" />
              <g transform={`translate(${x - 9} ${y - 9}) scale(0.75)`} fill="var(--accent-strong)">
                {GLYPHS[i]}
              </g>
            </g>
          );
        })}
      </svg>

      {/* The tile is an HTML element so it shares .tile with Scan/Claim Check. */}
      <div className={s.nodeTile}>{glyph}</div>
    </div>
  );
}
