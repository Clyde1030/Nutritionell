'use client';
/**
 * The shared landing furniture for Scan, Claim Check and Analytics.
 *
 * Scan and Claim Check are meant to read as one family — same header, same
 * ledge, same bottle/can framing, different icon and copy — so this is literally
 * the same markup rather than three reinterpretations of it. Analytics reuses
 * everything except the shelf ledge (nothing is being placed on a shelf in a
 * search tool) and brings its own node cluster instead.
 *
 * Everything here is phone-first: fixed at ~390px and centred by the caller.
 */
import type { ReactNode } from 'react';
import s from './Landing.module.css';

// ── Glyphs for the 60x60 tile ───────────────────────────────────────────────
// All three are white strokes on the accent-green tile, same construction.

export function CameraGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9a2 2 0 0 1 2-2h1.6l1-1.6h6.8l1 1.6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z" />
      <circle cx="12" cy="13" r="3.1" />
    </svg>
  );
}

export function LeafGlyph() {
  // The leaf shape the app already uses for this tab in the nav (NavIcons'
  // GreenwashingIcon), rather than a second, different leaf. The rounder outline
  // the prompt specified reads as a slashed "no entry" circle at the tile's
  // 30px — the vein line crosses a near-circle — where this pointed one still
  // reads as a leaf. Verified side by side in a browser at true size.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 19c-1-7 3-13 14-14 1 10-4 15-14 14z" />
      <path d="M6 18c3-4 6-7 12-11.5" />
    </svg>
  );
}

export function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.3 15.3 21 21" />
    </svg>
  );
}

/**
 * The tile plus its two shelf silhouettes, standing on the ledge.
 *
 * The silhouettes and ledge are decoration, not content — `aria-hidden`, and the
 * headline below carries the meaning.
 */
function ShelfFraming({ glyph }: { glyph: ReactNode }) {
  return (
    <div className={s.shelf}>
      <div className={s.shelfRow}>
        {/* Bottle: cap + body, two stacked shapes, bottom flush with the ledge. */}
        <svg className={s.silhouette} viewBox="0 0 34 64" aria-hidden="true">
          <rect x="13" y="0" width="8" height="9" rx="2.5" fill="var(--accent-glow2)" />
          <path d="M11 9h12c0 5 4 7 4 13v38a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4V22c0-6 4-8 4-13z"
                fill="var(--accent-glow2)" />
        </svg>

        <div className={s.tile}>{glyph}</div>

        {/* Can: rim + body. */}
        <svg className={s.silhouette} viewBox="0 0 34 64" aria-hidden="true">
          <rect x="6" y="0" width="22" height="6" rx="3" fill="var(--accent-glow2)" />
          <rect x="7" y="6" width="20" height="58" rx="4" fill="var(--accent-glow2)" />
        </svg>
      </div>
      <div className={s.ledge} />
      <div className={s.ledgeShadow} />
    </div>
  );
}

export function LandingHero({
  glyph,
  headline,
  subhead,
  onHowItWorks,
  onWhatToKnow,
  framing = 'shelf',
  children,
}: {
  glyph: ReactNode;
  headline: string;
  subhead: string;
  onHowItWorks: () => void;
  onWhatToKnow: () => void;
  /** 'shelf' = tile on the ledge between two silhouettes (Scan, Claim Check).
   *  'bare'  = just the tile, for callers supplying their own framing. */
  framing?: 'shelf' | 'bare';
  /** Rendered in place of the framing when `framing` is 'bare'. */
  children?: ReactNode;
}) {
  return (
    <section className={s.hero}>
      {framing === 'shelf' ? <ShelfFraming glyph={glyph} /> : children}

      <h1 className={s.headline}>{headline}</h1>
      <p className={s.subhead}>{subhead}</p>

      <div className={s.heroBtns}>
        <button className={s.pillBtn} onClick={onHowItWorks}>How it works</button>
        <button className={s.pillBtn} onClick={onWhatToKnow}>What you should know</button>
      </div>
    </section>
  );
}

/** The numbered "How it works" card — 4 steps on every tab that uses it. */
export function HowItWorksCard({
  id, steps,
}: {
  id?: string;
  steps: { title: string; detail: string }[];
}) {
  return (
    <section className={s.card} id={id}>
      <h2 className={s.cardTitle}>How it works</h2>
      <ol className={s.steps}>
        {steps.map((step, i) => (
          <li key={step.title} className={s.step}>
            <span className={s.stepNum}>{i + 1}</span>
            <span className={s.stepBody}>
              <span className={s.stepTitle}>{step.title}</span>
              <span className={s.stepDetail}>{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The labelled "What you should know" card — 3 sections on every tab. */
export function WhatToKnowCard({
  id, sections,
}: {
  id?: string;
  sections: { label: string; body: ReactNode }[];
}) {
  return (
    <section className={s.card} id={id}>
      <h2 className={s.cardTitle}>What you should know</h2>
      <div className={s.knowList}>
        {sections.map((sec) => (
          <div key={sec.label} className={s.knowItem}>
            <p className={s.knowLabel}>{sec.label}</p>
            <p className={s.knowBody}>{sec.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The dashed upload panel shared by Scan and Claim Check. */
export function DropZone({
  title, caption, onClick, onDrop,
}: {
  title: string;
  caption: string;
  onClick: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={s.dropZone}
      onClick={onClick}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <span className={s.dropTile} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      </span>
      <p className={s.dropTitle}>{title}</p>
      <p className={s.dropCaption}>{caption}</p>
    </div>
  );
}

/** The full-width accent CTA under the drop zone. */
export function PrimaryCta({
  label, onClick, disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className={s.cta} onClick={onClick} disabled={disabled}>
      <span className={s.ctaIcon} aria-hidden="true">
        <CameraGlyph />
      </span>
      {label}
    </button>
  );
}

export const landingStyles = s;
