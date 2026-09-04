// Inline stroke icons for the tab nav. Each renders at whatever size its wrapper
// gives it (the nav chip sets 14x14) and inherits color via currentColor.
import type { SVGProps } from 'react';

type IconProps = { className?: string };

function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 11.5 12 4l8 7.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.3" strokeWidth="1.8" />
      <path d="M5 20c1.2-3.8 4-5.6 7-5.6s5.8 1.8 7 5.6" strokeWidth="1.8" strokeLinecap="round" />
    </Icon>
  );
}

export function GoalsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4.3" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </Icon>
  );
}

export function ScanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9a2 2 0 0 1 2-2h1.6l1-1.6h6.8l1 1.6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.1" strokeWidth="1.7" />
    </Icon>
  );
}

export function PlanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6" y="4.5" width="12" height="16" rx="1.6" strokeWidth="1.7" />
      <path d="M9 4.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v.5" strokeWidth="1.7" />
      <path d="M9 12.5l2 2 4-4.3" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function GreenwashingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 19c-1-7 3-13 14-14 1 10-4 15-14 14z" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6 18c3-4 6-7 12-11.5" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  );
}

export function NutritionIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6" strokeWidth="1.8" />
      <path d="M15 15l5 5" strokeWidth="1.8" strokeLinecap="round" />
    </Icon>
  );
}

export function AboutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.8" strokeWidth="1.7" />
      <path d="M4.5 7l7.5 6 7.5-6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  // A real toothed cog. The previous version was a circle with 8 radiating
  // spokes, which at the nav's actual 12px render size read as a starburst
  // rather than a settings control.
  return (
    <Icon {...props}>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" strokeWidth="1.6" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeWidth="1.6" strokeLinejoin="round" />
    </Icon>
  );
}

export type NavIconKey =
  | 'home' | 'profile' | 'goals' | 'scan' | 'plan'
  | 'greenwashing' | 'nutrition' | 'about' | 'settings';

export const NAV_ICONS: Record<NavIconKey, (props: IconProps) => JSX.Element> = {
  home: HomeIcon,
  profile: ProfileIcon,
  goals: GoalsIcon,
  scan: ScanIcon,
  plan: PlanIcon,
  greenwashing: GreenwashingIcon,
  nutrition: NutritionIcon,
  about: AboutIcon,
  settings: SettingsIcon,
};


// ─────────────────────────────────────────────────────────────────────────────
// Header logo mark
// ─────────────────────────────────────────────────────────────────────────────

/** The 13 filled cells of a 5x5 grid that trace a blocky capital N:
 *  both outer columns, plus a 3-cell diagonal joining them.
 *
 *      X . . . X
 *      X X . . X
 *      X . X . X
 *      X . . X X
 *      X . . . X
 */
const N_CELLS: [number, number][] = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],   // left column
  [1, 1], [2, 2], [3, 3],                    // diagonal
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],   // right column
];

// Geometry, derived from the viewBox so the ratios stay honest: gap = 25% of a
// cell, stroke = 9%, corner radius = 17%. The grid is inset by half a stroke so
// the outermost borders aren't clipped by the viewBox edge.
//
// The gap is wider than it looks like it needs to be, and that's the whole point:
// at the header's real 26px the cells are ~4px across, so a tighter gap
// antialiases into a soft blob. Rendered at true size and compared against 15%
// and 33% variants, 25% is where the boxes read as distinct without the letter
// falling apart into disconnected dots.
const CELL = 16.420;
const PITCH = 20.525;      // cell + gap
const OFFSET = 0.739;    // stroke / 2
const RADIUS = 2.791;
const STROKE = 1.478;

/**
 * The app's header mark: a pixel-font "N", drawn as 13 discrete boxes.
 *
 * Two deliberate choices, both about staying legible at 26px (and 22px on
 * mobile), which is the entire job here:
 *
 *  - `fill="var(--accent)"`, not `currentColor`. The mark should be the theme's
 *    accent in every theme, independent of the .logo button's hover text colour.
 *  - `stroke="var(--card)"` — the header's own background. Bordering each cell in
 *    the background colour is what keeps adjacent boxes visually separate at tiny
 *    sizes, and because it's a token it stays correct in every theme without a
 *    per-theme override.
 *
 * There is no backing rect: the 12 unfilled grid positions simply aren't drawn,
 * so the header shows through and the border reads as a gap rather than a ring.
 */
export function NLogoMark({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="var(--accent)"
      stroke="var(--card)"
      strokeWidth={STROKE}
      className={className}
      aria-hidden="true"
    >
      {N_CELLS.map(([row, col]) => (
        <rect
          key={`${row}-${col}`}
          x={OFFSET + col * PITCH}
          y={OFFSET + row * PITCH}
          width={CELL}
          height={CELL}
          rx={RADIUS}
          ry={RADIUS}
        />
      ))}
    </svg>
  );
}
