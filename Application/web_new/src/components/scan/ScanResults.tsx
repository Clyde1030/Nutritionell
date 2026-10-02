'use client';
/**
 * Scan results: the shelf photo, the sideways product strip under it, and the
 * product detail sheet.
 *
 * One component serves both the scored view (signed-in + approved) and the
 * unscored one (anonymous or pending) via `scored`. They are the same screen —
 * same photo markers, same strip, same sheet — with scores either present or
 * replaced by neutral facts. Keeping them as one component is the point: the two
 * views drifted apart last time they were written separately.
 *
 * The strip is in SHELF ORDER by default, so a user standing in the aisle can
 * map a card back to the thing in front of them. Position numbers come from
 * lib/shelfOrder and are positions, not ranks — re-sorting or filtering the
 * strip never renumbers anything.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BBox } from '@/lib/shelfOrder';
import { ordinal, shelfOrder } from '@/lib/shelfOrder';
import type { ProductItem, ScoreEnum, ShelfAnalysisResponse } from '@/lib/types';
import { NOVA_COLORS, NOVA_LABELS, SCORE_BG, SCORE_COLORS, SCORE_LABELS } from '@/lib/types';
import FindOnShelf from './FindOnShelf';
import s from './ScanResults.module.css';

/* ── Icons ─────────────────────────────────────────────────────────────────── */

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const CloseIcon = () => <Svg size={15}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
const ChevronLeft = () => <Svg size={16}><path d="M15 18 9 12l6-6" /></Svg>;
const ChevronRight = () => <Svg size={16}><path d="m9 18 6-6-6-6" /></Svg>;
const PinIcon = () => (
  <Svg size={13}>
    <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </Svg>
);
/** Same three concentric rings as the app's GoalsIcon. */
const TargetIcon = () => (
  <Svg size={18}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4.3" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Svg>
);

/* ── Strip items ───────────────────────────────────────────────────────────── */

export interface StripItem {
  productIndex: number;
  product: ProductItem;
  /** Every box this product occupies. The product's own box sorts first. */
  facings: BBox[];
  num: number;
  row: number;
  col: number;
}

function boxDistance(a: BBox, b: BBox): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]);
}

/**
 * Every product to show, in shelf order, with all of its facings.
 *
 * `detections` carries the duplicate facings; it's absent on the non-streaming
 * fallback path, where a product's only known facing is its own box.
 */
export function buildStripItems(
  result: ShelfAnalysisResponse,
  scored: boolean,
): { items: StripItem[]; rowMeans: number[] } {
  const shown = result.products
    .map((product, productIndex) => ({ product, productIndex }))
    // The signed-out view leaves unidentified detections out entirely, so it
    // numbers only what it shows and there are no gaps in the strip.
    .filter(({ product }) => scored || product.scoring !== 'Unidentified');

  const { info, rowMeans } = shelfOrder(
    shown.map(({ product, productIndex }) => ({ id: productIndex, bbox: product.bounding_box })),
  );

  const dets = result.detections?.length ? result.detections : null;

  const items = shown.map(({ product, productIndex }) => {
    const own = dets
      ? dets.filter((d) => d.product_index === productIndex).map((d) => d.bounding_box)
      : [];
    const facings = own.length
      ? [...own].sort((a, b) => boxDistance(a, product.bounding_box) - boxDistance(b, product.bounding_box))
      : [product.bounding_box];
    const position = info[productIndex] ?? { num: 0, row: 1, col: 1 };
    return { productIndex, product, facings, ...position };
  });

  items.sort((a, b) => a.num - b.num);
  return { items, rowMeans };
}

/** "Row 2 of 3 · 5th from left" — or just the position when there's one row. */
function locationLine(item: StripItem, rowCount: number): string {
  const where = `${ordinal(item.col)} from left`;
  return rowCount > 1 ? `Row ${item.row} of ${rowCount} · ${where}` : where;
}

function displayName(p: ProductItem): string {
  if (p.scoring === 'Unidentified') return "Couldn't read label";
  return p.variant ? `${p.product_name} · ${p.variant}` : p.product_name;
}

/** The neutral facts that stand in for a score when nothing was scored. */
function neutralFacts(p: ProductItem): string[] {
  const nf = p.nutritional_facts;
  const out: string[] = [];
  if (p.processing_level != null) out.push(`NOVA ${p.processing_level}`);
  if (nf?.calories != null) out.push(`${Math.round(nf.calories)} cal`);
  return out;
}

/* ── Shelf photo with numbered markers ─────────────────────────────────────── */

function ShelfPhoto({
  imageUrl, items, scored, filter, onOpen,
}: {
  imageUrl: string;
  items: StripItem[];
  scored: boolean;
  filter: 'all' | ScoreEnum;
  onOpen: (item: StripItem) => void;
}) {
  return (
    <div className={s.imageWrap}>
      <img src={imageUrl} alt="Scanned shelf" className={s.resultImg} />
      {items.map((item) =>
        item.facings.map((bbox, f) => {
          const [ymin, xmin, ymax, xmax] = bbox;
          const color = scored ? SCORE_COLORS[item.product.scoring] : 'rgba(255,255,255,0.9)';
          const dimmed = filter !== 'all' && item.product.scoring !== filter;
          return (
            <button
              key={`${item.productIndex}-${f}`}
              type="button"
              className={s.marker}
              onClick={() => onOpen(item)}
              aria-label={`Open #${item.num} ${displayName(item.product)}`}
              style={{
                top: `${ymin * 100}%`, left: `${xmin * 100}%`,
                width: `${(xmax - xmin) * 100}%`, height: `${(ymax - ymin) * 100}%`,
                borderColor: color,
                opacity: dimmed ? 0.22 : 1,
              }}
            >
              <span
                className={s.markerPin}
                style={{ boxShadow: `0 0 0 1.5px ${scored ? color : 'var(--neutral-border)'}` }}
              >
                {item.num}
              </span>
            </button>
          );
        }),
      )}
    </div>
  );
}

/* ── Strip ─────────────────────────────────────────────────────────────────── */

function ProductCard({
  item, scored, cardRef, onPress,
}: {
  item: StripItem;
  scored: boolean;
  cardRef: (el: HTMLButtonElement | null) => void;
  onPress: () => void;
}) {
  const { product } = item;
  const color = SCORE_COLORS[product.scoring];
  const facts = neutralFacts(product);
  const label = scored
    ? `#${item.num} ${displayName(product)}, ${SCORE_LABELS[product.scoring]}`
    : `#${item.num} ${displayName(product)}`;

  return (
    <button type="button" ref={cardRef} className={s.card} onClick={onPress} aria-label={label}>
      <span className={s.cardTile}>
        {product.crop_image && <img src={product.crop_image} alt="" className={s.cardCrop} />}
        <span
          className={s.cardNum}
          style={{ boxShadow: `0 0 0 1.5px ${scored ? color : 'var(--neutral-border)'}` }}
        >
          {item.num}
        </span>
        {item.facings.length > 1 && (
          <span className={s.cardSpots}>{item.facings.length} spots</span>
        )}
      </span>

      <span className={s.cardBody}>
        {/* Always rendered, even when empty, so the pills below line up across cards. */}
        <span className={s.cardBrand}>
          {product.scoring === 'Unidentified' ? '' : product.brand}
        </span>
        <span className={s.cardName}>{displayName(product)}</span>
        {scored ? (
          <span className={s.cardPill} style={{ background: SCORE_BG[product.scoring] }}>
            <span className={s.cardDot} style={{ background: color }} />
            {SCORE_LABELS[product.scoring]}
          </span>
        ) : facts.length > 0 ? (
          <span className={s.cardNeutralPill}>{facts.join(' · ')}</span>
        ) : null}
      </span>
    </button>
  );
}

function StripHeader({
  scored, total, shownCount, filter, sort, onSort,
}: {
  scored: boolean;
  total: number;
  shownCount: number;
  filter: 'all' | ScoreEnum;
  sort: 'shelf' | 'best';
  onSort: (next: 'shelf' | 'best') => void;
}) {
  const eyebrow = filter === 'all'
    ? `On this shelf · ${total}`
    : `${SCORE_LABELS[filter]} · ${shownCount} of ${total}`;
  const caption = sort === 'shelf'
    ? 'Top-left to bottom-right · swipe for more'
    : 'Best fit first · numbers match the photo';

  return (
    <div className={s.stripHead}>
      <div className={s.stripHeadLeft}>
        <p className={s.stripEyebrow}>{eyebrow}</p>
        <p className={s.stripCaption}>{caption}</p>
      </div>
      {scored && (
        <div className={s.segmented} role="group" aria-label="Sort products">
          <button
            type="button" aria-pressed={sort === 'shelf'}
            className={`${s.segment} ${sort === 'shelf' ? s.segmentOn : ''}`}
            onClick={() => onSort('shelf')}
          >
            Shelf order
          </button>
          <button
            type="button" aria-pressed={sort === 'best'}
            className={`${s.segment} ${sort === 'best' ? s.segmentOn : ''}`}
            onClick={() => onSort('best')}
          >
            Best fit
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Detail sheet ──────────────────────────────────────────────────────────── */

function ProductSheet({
  item, scored, rowCount, position, count, onPrev, onNext, onClose, onFind, findBtnRef,
}: {
  item: StripItem;
  scored: boolean;
  rowCount: number;
  /** 1-based position within the CURRENT strip list (respects sort + filter). */
  position: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onFind: () => void;
  findBtnRef: React.RefObject<HTMLButtonElement>;
}) {
  const { product } = item;
  const nf = product.nutritional_facts;
  const unidentified = product.scoring === 'Unidentified';
  const color = SCORE_COLORS[product.scoring];
  const flagged = (nf?.flagged_ingredients ?? []).filter(Boolean);
  const facts = scored ? [] : [
    ...neutralFacts(product),
    ...(nf?.sodium_mg != null ? [`${Math.round(nf.sodium_mg)}mg sodium`] : []),
    ...(nf?.total_sugars_g != null ? [`${nf.total_sugars_g}g sugar`] : []),
  ];

  const nutritionRows: [string, number | undefined, string][] = [
    ['Total Fat', nf?.total_fat_g, 'g'], ['  Saturated Fat', nf?.saturated_fat_g, 'g'],
    ['  Trans Fat', nf?.trans_fat_g, 'g'], ['Cholesterol', nf?.cholesterol_mg, 'mg'],
    ['Sodium', nf?.sodium_mg, 'mg'], ['Total Carbohydrate', nf?.total_carbohydrate_g, 'g'],
    ['  Dietary Fiber', nf?.dietary_fiber_g, 'g'], ['  Total Sugars', nf?.total_sugars_g, 'g'],
    ['  Added Sugars', nf?.added_sugars_g, 'g'], ['Protein', nf?.protein_g, 'g'],
  ];
  const hasNutrition = nf?.calories != null || nutritionRows.some(([, v]) => v != null);

  return (
    <div className={s.sheet}>
      <div className={s.grabHandle} aria-hidden="true" />

      <div className={s.sheetHead}>
        <button type="button" className={s.sheetClose} onClick={onClose}>
          <CloseIcon /> Close
        </button>
        <div className={s.pager}>
          <button
            type="button" className={s.pagerBtn} onClick={onPrev} disabled={position <= 1}
            aria-label="Previous product on the shelf"
          >
            <ChevronLeft />
          </button>
          <span className={s.pagerLabel}>{position} of {count}</span>
          <button
            type="button" className={s.pagerBtn} onClick={onNext} disabled={position >= count}
            aria-label="Next product on the shelf"
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      {/* Hero: the crop, who it is, and where it is on the shelf. */}
      <div className={s.hero}>
        <span className={s.heroTile}>
          {product.crop_image && <img src={product.crop_image} alt="" className={s.heroCrop} />}
          <span
            className={s.heroNum}
            style={{ boxShadow: `0 0 0 1.5px ${scored && !unidentified ? color : 'var(--neutral-border)'}` }}
          >
            {item.num}
          </span>
        </span>
        <div className={s.heroText}>
          <p className={s.heroBrand}>{unidentified ? '' : product.brand}</p>
          <p className={s.heroName}>{unidentified ? "Couldn't read label" : product.product_name}</p>
          {!unidentified && product.variant && <p className={s.heroVariant}>{product.variant}</p>}
          <p className={s.heroWhere}><PinIcon />{locationLine(item, rowCount)}</p>
        </div>
      </div>

      <button type="button" ref={findBtnRef} className={s.findBtn} onClick={onFind}>
        <TargetIcon />
        {item.facings.length > 1 ? `Find on shelf · ${item.facings.length} spots` : 'Find on shelf'}
      </button>

      {unidentified ? (
        <div className={s.unknownBanner}>
          We couldn&apos;t read this label from the photo. A closer photo of this spot should fix it.
        </div>
      ) : scored ? (
        <>
          <div className={s.banner} style={{ background: SCORE_BG[product.scoring], borderColor: color }}>
            <div className={s.bannerTop}>
              <span className={s.bannerScore} style={{ color }}>{SCORE_LABELS[product.scoring]}</span>
              {product.processing_level != null && (
                <span
                  className={s.novaTag}
                  style={{ borderColor: NOVA_COLORS[product.processing_level], color: NOVA_COLORS[product.processing_level] }}
                >
                  NOVA {product.processing_level} · {NOVA_LABELS[product.processing_level]}
                </span>
              )}
            </div>
            <p className={s.bannerReason}>{product.reasoning}</p>
          </div>
          {product.reasoning_by_factor.length > 0 && (
            <div className={s.factorsCard}>
              <p className={s.sectionLabel}>Why this score?</p>
              {product.reasoning_by_factor.map((f, i) => <p key={i} className={s.factor}>{f}</p>)}
            </div>
          )}
          {product.score_breakdown && <ScoreBreakdownCard breakdown={product.score_breakdown} />}
        </>
      ) : (
        (facts.length > 0 || flagged.length > 0) && (
          <div className={s.neutralTags}>
            {facts.map((f) => <span key={f} className={s.neutralTag}>{f}</span>)}
            {flagged.length > 0 && (
              <span className={s.flagTag}>⚑ {flagged.slice(0, 2).join(' & ')}</span>
            )}
          </div>
        )
      )}

      {(nf?.detected_ingredients?.length ?? 0) > 0 && (
        <div className={s.section}>
          <p className={s.sectionLabel}>Ingredients</p>
          <p className={s.sectionBody}>{nf.detected_ingredients.join(', ')}</p>
        </div>
      )}
      {product.allergens.length > 0 && (
        <div className={s.section}>
          <p className={s.sectionLabel}>Allergens</p>
          <p className={s.sectionBody}>{product.allergens.join(', ')}</p>
        </div>
      )}

      {hasNutrition && (
        <div className={s.factsTable}>
          <p className={s.factsTitle}>Nutrition Facts</p>
          {nf.serving_size && <p className={s.factsServing}>Serving: {nf.serving_size}</p>}
          <hr className={s.factsDivider} />
          {nf.calories != null && (
            <>
              <div className={s.factsRowBold}><span>Calories</span><span>{nf.calories}</span></div>
              <hr className={s.factsDivider} />
            </>
          )}
          {nutritionRows.filter(([, v]) => v != null).map(([label, val, unit]) => (
            <div key={label} className={s.factsRow}><span>{label}</span><span>{val}{unit}</span></div>
          ))}
          {scored && flagged.length > 0 && (
            <>
              <hr className={s.factsDivider} />
              <p className={s.flaggedTitle}>⚠️ Flagged Ingredients</p>
              {flagged.map((ing) => <p key={ing} className={s.flaggedItem}>· {ing}</p>)}
            </>
          )}
        </div>
      )}

      {scored && !unidentified && <AlternativesSection product={product} />}

      {!scored && (
        <p className={s.signInHint}>Sign in to see how this product fits your goals.</p>
      )}
    </div>
  );
}

/* ── Sections carried over from the old detail panel ───────────────────────── */

interface Alternative {
  brand: string;
  product_name: string;
  reason: string;
  better_because: string;
  macros: { calories: number; protein_g: number; fat_g: number; carbs_g: number; sugar_g: number };
}

// Cache alternatives per product so reopening a sheet doesn't refetch from Gemini.
const altCache = new Map<string, { alternatives?: Alternative[]; error?: string }>();

function AlternativesSection({ product }: { product: ProductItem }) {
  const key = `${product.brand}|${product.product_name}|${product.variant ?? ''}`;
  // Alternatives only make sense for identified products that aren't already a great fit.
  const show = product.scoring !== 'Unidentified' && product.scoring !== 'Great Fit';
  const [state, setState] = useState<{ loading: boolean; alternatives?: Alternative[]; error?: string }>(
    () => (altCache.has(key) ? { loading: false, ...altCache.get(key)! } : { loading: show }),
  );

  useEffect(() => {
    if (!show || altCache.has(key)) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/recommender', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product }),
        });
        const data = await r.json().catch(() => ({}));
        const res = r.ok
          ? { alternatives: (data.alternatives ?? []) as Alternative[] }
          : { error: data.error ?? `Server ${r.status}`, alternatives: [] as Alternative[] };
        altCache.set(key, res);
        if (!cancelled) setState({ loading: false, ...res });
      } catch (e: any) {
        const res = { error: e?.message ?? 'Could not load alternatives.', alternatives: [] as Alternative[] };
        if (!cancelled) setState({ loading: false, ...res });
      }
    })();
    return () => { cancelled = true; };
  }, [key, show, product]);

  if (!show) return null;

  const label = product.scoring === "Doesn't Fit" ? 'Better-fitting alternatives' : 'Alternatives worth considering';
  return (
    <div className={s.altSection}>
      <p className={s.altTitle}>🔄 {label}</p>
      {state.loading && <p className={s.altLoading}>Finding alternatives tailored to your profile…</p>}
      {!state.loading && state.error && <p className={s.altError}>Couldn&apos;t load alternatives — {state.error}</p>}
      {!state.loading && !state.error && (state.alternatives?.length ?? 0) === 0 && (
        <p className={s.altLoading}>No better alternatives found.</p>
      )}
      {(state.alternatives ?? []).map((alt, i) => (
        <div key={i} className={s.altCard}>
          <div className={s.altCardTop}>
            <span className={s.altName}>{alt.brand} — {alt.product_name}</span>
            {alt.better_because && <span className={s.altBadge}>{alt.better_because}</span>}
          </div>
          <p className={s.altReason}>{alt.reason}</p>
          <div className={s.altMacros}>
            <span>{alt.macros.calories} cal</span>
            <span>{alt.macros.protein_g}g protein</span>
            <span>{alt.macros.fat_g}g fat</span>
            <span>{alt.macros.carbs_g}g carbs</span>
            <span>{alt.macros.sugar_g}g sugar</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoreBreakdownCard({ breakdown }: { breakdown: NonNullable<ProductItem['score_breakdown']> }) {
  if (breakdown.hard_exclusion) {
    return (
      <div className={s.section}>
        <p className={s.sectionLabel}>Score breakdown</p>
        <p className={s.flaggedTitle}>⛔ Hard exclusion — scoring stopped at Step 1</p>
        {breakdown.hard_exclusion_reasons.map((r, i) => <p key={i} className={s.flaggedItem}>· {r}</p>)}
      </div>
    );
  }
  const dims: [string, number | undefined][] = [
    ['Dietary philosophy', breakdown.philosophy_score],
    ['Health goal alignment', breakdown.goal_score],
    ['Ingredient quality', breakdown.ingredient_score],
    ['Processing level (NOVA)', breakdown.processing_score],
    ['Nutrition quality', breakdown.nutrition_score],
  ];
  return (
    <div className={s.section}>
      <p className={s.sectionLabel}>Score breakdown</p>
      {dims.filter(([, v]) => v != null).map(([label, val]) => (
        <div key={label} className={s.factsRow}>
          <span>{label}</span><span>{val! > 0 ? `+${val}` : val}</span>
        </div>
      ))}
      {breakdown.total_score != null && (
        <div className={s.factsRowBold}><span>Total score</span><span>{breakdown.total_score}</span></div>
      )}
    </div>
  );
}

/* ── Orchestrator ──────────────────────────────────────────────────────────── */

const SCORE_RANK: Record<ScoreEnum, number> = {
  'Great Fit': 4, 'Just OK Fit': 3, 'Neutral Fit': 2, "Doesn't Fit": 1, 'Unidentified': 0,
  // Only reachable on the scored view, where this value never appears.
  'Not Scored': 0,
};

const CHIP_ORDER: ScoreEnum[] = ['Great Fit', 'Just OK Fit', 'Neutral Fit', "Doesn't Fit", 'Unidentified'];

export default function ScanResults({
  scored, result, imageUrl, header, onNewScan, footer, initialProductIndex,
}: {
  scored: boolean;
  result: ShelfAnalysisResponse;
  imageUrl: string;
  /** Opens the sheet on this product — set by tapping a card in the live
   *  analyzing view, so the choice survives the switch to the results screen. */
  initialProductIndex?: number | null;
  /** The intro line (scored) or title row (unscored), which differ between views. */
  header: ReactNode;
  onNewScan: () => void;
  /** Drawers (scored) or the sign-in nudge (unscored). */
  footer?: ReactNode;
}) {
  const { items, rowMeans } = useMemo(() => buildStripItems(result, scored), [result, scored]);

  const [sort, setSort] = useState<'shelf' | 'best'>('shelf');
  const [filter, setFilter] = useState<'all' | ScoreEnum>('all');
  const [openIndex, setOpenIndex] = useState<number | null>(initialProductIndex ?? null);  // a productIndex
  const [finding, setFinding] = useState(false);

  const cardRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const findBtnRef = useRef<HTMLButtonElement>(null);

  const visible = useMemo(() => {
    const list = items.filter((it) => filter === 'all' || it.product.scoring === filter);
    if (sort === 'best') {
      // Ties break by position number, so Best fit still reads left to right.
      list.sort((a, b) => SCORE_RANK[b.product.scoring] - SCORE_RANK[a.product.scoring] || a.num - b.num);
    } else {
      list.sort((a, b) => a.num - b.num);
    }
    return list;
  }, [items, filter, sort]);

  const position = openIndex == null ? -1 : visible.findIndex((it) => it.productIndex === openIndex);
  const open = position >= 0 ? visible[position] : null;

  // A filter change can hide whatever the sheet is showing; close rather than
  // stranding a sheet whose pager has nowhere to go.
  useEffect(() => {
    if (openIndex != null && position < 0) { setOpenIndex(null); setFinding(false); }
  }, [openIndex, position]);

  const revealCard = useCallback((productIndex: number) => {
    cardRefs.current[productIndex]?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, []);

  const goTo = useCallback((next: number) => {
    const target = visible[next];
    if (!target) return;
    setOpenIndex(target.productIndex);
    revealCard(target.productIndex);
  }, [visible, revealCard]);

  const closeSheet = useCallback(() => {
    if (openIndex != null) revealCard(openIndex);
    setOpenIndex(null);
  }, [openIndex, revealCard]);

  const counts = useMemo(
    () => items.reduce((acc, it) => {
      acc[it.product.scoring] = (acc[it.product.scoring] ?? 0) + 1;
      return acc;
    }, {} as Partial<Record<ScoreEnum, number>>),
    [items],
  );

  return (
    <div className={s.page}>
      {header}

      <ShelfPhoto
        imageUrl={imageUrl} items={items} scored={scored} filter={filter}
        onOpen={(it) => { setOpenIndex(it.productIndex); revealCard(it.productIndex); }}
      />

      <StripHeader
        scored={scored} total={items.length} shownCount={visible.length}
        filter={filter} sort={sort} onSort={setSort}
      />

      <div className={s.strip}>
        {visible.map((it) => (
          <ProductCard
            key={it.productIndex}
            item={it}
            scored={scored}
            cardRef={(el) => { cardRefs.current[it.productIndex] = el; }}
            onPress={() => setOpenIndex(it.productIndex)}
          />
        ))}
        {visible.length === 0 && <p className={s.emptyStrip}>No products match this filter.</p>}
      </div>

      {scored && (
        <div className={s.summaryBar}>
          {CHIP_ORDER.map((sc) =>
            counts[sc] ? (
              <button
                key={sc}
                type="button"
                className={`${s.chip} ${filter === sc ? s.chipActive : ''}`}
                style={{ borderColor: SCORE_COLORS[sc] }}
                aria-pressed={filter === sc}
                onClick={() => setFilter(filter === sc ? 'all' : sc)}
              >
                <span className={s.chipCount} style={{ color: SCORE_COLORS[sc] }}>{counts[sc]}</span>
                <span className={s.chipLabel}>{SCORE_LABELS[sc]}</span>
              </button>
            ) : null,
          )}
          <button type="button" className={s.newScanBtn} onClick={onNewScan}>New scan</button>
        </div>
      )}

      {footer}

      {open && (
        <div className={s.sheetOverlay} onClick={closeSheet}>
          <div className={s.sheetPanel} onClick={(e) => e.stopPropagation()}>
            <ProductSheet
              item={open}
              scored={scored}
              rowCount={rowMeans.length}
              position={position + 1}
              count={visible.length}
              onPrev={() => goTo(position - 1)}
              onNext={() => goTo(position + 1)}
              onClose={closeSheet}
              onFind={() => setFinding(true)}
              findBtnRef={findBtnRef}
            />
          </div>
        </div>
      )}

      {open && finding && (
        <FindOnShelf
          imageUrl={imageUrl}
          item={open}
          rowMeans={rowMeans}
          onClose={() => {
            setFinding(false);
            // Back to the detail sheet, not the results list.
            findBtnRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

export { locationLine };
