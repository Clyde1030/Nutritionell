'use client';
/**
 * "Find on shelf": the scanned photo with everything dimmed except this product.
 *
 * The point is to get the user from a card back to the physical shelf, so every
 * facing of the product lights up — the same sauce on two shelves is two places
 * worth walking to, and showing only one would send them to the wrong spot.
 *
 * Drawn on a canvas rather than with DOM overlays because the dimming is a
 * cut-out, not a tint: the mask covers the whole photo and each facing is
 * redrawn from the source image on top of it, at full brightness.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BBox } from '@/lib/shelfOrder';
import { rowOf } from '@/lib/shelfOrder';
import type { StripItem } from './ScanResults';
import { locationLine } from './ScanResults';
import s from './FindOnShelf.module.css';

const ZOOM = 2.4;
const ANIM_MS = 350;

interface Rect { x: number; y: number; w: number; h: number }

/** A normalized [ymin, xmin, ymax, xmax] box as pixels within a w×h surface. */
function rectOf(bbox: BBox, w: number, h: number): Rect {
  const [ymin, xmin, ymax, xmax] = bbox;
  return { x: xmin * w, y: ymin * h, w: (xmax - xmin) * w, h: (ymax - ymin) * h };
}

function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  // Safari only picked up ctx.roundRect in 16.4; this keeps older phones drawing
  // a correct (if hand-rolled) path rather than nothing.
  if (typeof (ctx as any).roundRect === 'function') {
    ctx.beginPath();
    (ctx as any).roundRect(r.x, r.y, r.w, r.h, radius);
    return;
  }
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  ctx.closePath();
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function FindOnShelf({
  imageUrl, item, rowMeans, onClose,
}: {
  imageUrl: string;
  item: StripItem;
  rowMeans: number[];
  onClose: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [labelW, setLabelW] = useState(0);
  const [reduced, setReduced] = useState(false);

  const primary = item.facings[0];
  const extras = item.facings.slice(1);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  /* ── Image + fit ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = imageUrl;
  }, [imageUrl]);

  const measure = useCallback(() => {
    const el = stageRef.current;
    if (!el || !img || !img.naturalWidth) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    setStage({ w: cw, h: ch });
    setFit({ w: img.naturalWidth * scale, h: img.naturalHeight * scale });
  }, [img]);

  useEffect(() => { measure(); }, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [measure]);

  /* ── Draw ────────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !img || !fit) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(fit.w * dpr);
    cv.height = Math.round(fit.h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, fit.w, fit.h);

    // 1. the whole photo, 2. a mask over all of it.
    ctx.drawImage(img, 0, 0, fit.w, fit.h);
    ctx.fillStyle = 'rgba(0,0,0,0.64)';
    ctx.fillRect(0, 0, fit.w, fit.h);

    // 3. each facing redrawn from the source, punching back through the mask.
    for (const f of item.facings) {
      const src = rectOf(f, img.naturalWidth, img.naturalHeight);
      const dst = rectOf(f, fit.w, fit.h);
      ctx.drawImage(img, src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h);
    }

    // 4. outline + glow around each facing.
    for (const f of item.facings) {
      const dst = rectOf(f, fit.w, fit.h);
      ctx.save();
      roundRectPath(ctx, dst, 5);
      // Assigning an unparseable colour is a no-op on canvas, so the rgba line
      // stands in on engines that can't parse oklch yet.
      ctx.shadowColor = 'rgba(17,102,66,0.6)';
      ctx.shadowColor = 'oklch(42% 0.15 155 / 0.6)';
      ctx.shadowBlur = 7;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.stroke();   // twice: one pass leaves the glow too faint over the mask
      ctx.restore();
    }
  }, [img, fit, item]);

  /* ── Zoom transform ──────────────────────────────────────────────────────── */

  // scale() about the centre, then translate so the primary facing lands there,
  // clamped so the view never runs past the edges of the photo.
  const transform = useMemo(() => {
    if (!fit || !stage || !zoomed) return { css: 'none', k: 1, dx: 0, dy: 0 };
    const p = rectOf(primary, fit.w, fit.h);
    const maxDx = Math.max(0, fit.w / 2 - stage.w / (2 * ZOOM));
    const maxDy = Math.max(0, fit.h / 2 - stage.h / (2 * ZOOM));
    const dx = clamp(fit.w / 2 - (p.x + p.w / 2), -maxDx, maxDx);
    const dy = clamp(fit.h / 2 - (p.y + p.h / 2), -maxDy, maxDy);
    return { css: `scale(${ZOOM}) translate(${dx}px, ${dy}px)`, k: ZOOM, dx, dy };
  }, [fit, stage, zoomed, primary]);

  /* ── "#14 is here" label ─────────────────────────────────────────────────── */

  useLayoutEffect(() => {
    if (labelRef.current) setLabelW(labelRef.current.offsetWidth);
  }, [item.num, fit]);

  const label = useMemo(() => {
    if (!fit || !stage) return null;
    const p = rectOf(primary, fit.w, fit.h);
    const { k, dx, dy } = transform;
    // Canvas-space point -> stage-space point under the current transform.
    const toStage = (px: number, py: number) => ({
      x: stage.w / 2 + (px - fit.w / 2 + dx) * k,
      y: stage.h / 2 + (py - fit.h / 2 + dy) * k,
    });
    const top = toStage(p.x + p.w / 2, p.y);
    const bottom = toStage(p.x + p.w / 2, p.y + p.h);
    // Too close to the top edge to sit above it — drop the label below instead.
    const below = top.y < stage.h * 0.12;
    const half = labelW / 2 || 40;
    return {
      left: clamp(top.x, half + 8, Math.max(half + 8, stage.w - half - 8)),
      top: below ? bottom.y + 12 : top.y - 12,
      below,
    };
  }, [fit, stage, primary, transform, labelW]);

  /* ── Escape, focus, scroll lock ──────────────────────────────────────────── */

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const extraLine = extras.length === 1
    ? `Also 1 more spot on Row ${rowOf(rowMeans, extras[0])}`
    : extras.length > 1
      ? `Also ${extras.length} more spots on the shelf`
      : '';

  const name = item.product.scoring === 'Unidentified'
    ? "Couldn't read label"
    : item.product.product_name;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Find on shelf"
      onClick={onClose}
    >
      <div className={s.topBar} onClick={stop}>
        <span className={s.thumb}>
          {item.product.crop_image && <img src={item.product.crop_image} alt="" className={s.thumbImg} />}
        </span>
        <div className={s.topText}>
          <p className={s.eyebrow}>Find on shelf · #{item.num}</p>
          <p className={s.topName}>{name}</p>
        </div>
        <button ref={closeRef} type="button" className={s.closeBtn} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className={s.stage} ref={stageRef}>
        <div
          className={s.zoomWrap}
          onClick={stop}
          style={{
            transform: transform.css,
            transition: reduced ? 'none' : `transform ${ANIM_MS}ms ease`,
          }}
        >
          <canvas
            ref={canvasRef}
            className={s.canvas}
            style={fit ? { width: `${fit.w}px`, height: `${fit.h}px` } : undefined}
          />
        </div>

        {label && (
          <span
            ref={labelRef}
            className={s.hereLabel}
            style={{
              left: `${label.left}px`,
              top: `${label.top}px`,
              transform: `translate(-50%, ${label.below ? '0' : '-100%'})`,
              transition: reduced ? 'none' : `top ${ANIM_MS}ms ease, left ${ANIM_MS}ms ease`,
            }}
          >
            #{item.num} is here
          </span>
        )}
      </div>

      <div className={s.bottom} onClick={stop}>
        <p className={s.where}>{locationLine(item, rowMeans.length)}</p>
        {extraLine && <p className={s.extra}>{extraLine}</p>}

        <button type="button" className={s.zoomBtn} onClick={() => setZoomed((z) => !z)}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
               strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.3 15.3 21 21" />
            {!zoomed && <path d="M10.5 7.8v5.4M7.8 10.5h5.4" />}
          </svg>
          {zoomed ? 'Show whole shelf' : 'Zoom in'}
        </button>
      </div>

      <p className={s.hint}>Tap outside the photo to go back</p>
    </div>
  );
}
