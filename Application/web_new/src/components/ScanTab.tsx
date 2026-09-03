'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError, ENDPOINTS, USE_MOCK_ANALYZE, authFetch, readDetail } from '@/lib/api';
import { getMaxDetections, getYoloModel } from '@/lib/storage';
import type { PerformanceSummary, ProductItem, ScoreEnum, ShelfAnalysisResponse } from '@/lib/types';
import { NOVA_COLORS, NOVA_LABELS, SCORE_BG, SCORE_COLORS, SCORE_LABELS, SCORE_DESCRIPTIONS, STAGE_COLORS } from '@/lib/types';
import CameraCapture from './CameraCapture';
import TransparencyOverview from './TransparencyOverview';
import s from './ScanTab.module.css';

interface Alternative {
  brand: string;
  product_name: string;
  reason: string;
  better_because: string;
  macros: { calories: number; protein_g: number; fat_g: number; carbs_g: number; sugar_g: number };
}

// Cache alternatives per product so reopening a detail panel doesn't refetch from Gemini.
const altCache = new Map<string, { alternatives?: Alternative[]; error?: string }>();

type View = 'picker' | 'analyzing' | 'results';

// Sort/filter of the results list.
type ResultFilter = 'all' | ScoreEnum;
type ResultSort = 'best' | 'worst' | 'az';
const SCORE_RANK: Record<ScoreEnum, number> = {
  'Great Fit': 4, 'Just OK Fit': 3, 'Neutral Fit': 2, "Doesn't Fit": 1, 'Unidentified': 0,
};
const SORT_LABELS: Record<ResultSort, string> = {
  best: 'Best fit first', worst: 'Worst fit first', az: 'Name (A–Z)',
};

type Stage =
  | 'idle' | 'uploading' | 'detecting' | 'detected' | 'identifying'
  | 'identified' | 'analyzing' | 'complete';

// One product streamed in live: identity first, its full analysis fills in later.
interface LiveProduct {
  product_index: number;
  brand: string;
  product_name: string;
  variant?: string;
  crop_image?: string;
  product?: ProductItem;   // set once the product has been analysed
}

// A detection box drawn during the live view; recoloured as its state advances.
interface LiveBox { bbox: number[]; color: string; productIndex?: number }

interface ScanProgress {
  stage: Stage;
  detected: number;
  detectBoxes: number[][];
  boxes: LiveBox[];                                     // per-box live overlay (index = box_index)
  detectMs?: number; identifyMs?: number;
  identified: number;
  idDone: number; idTotal: number; idEtaMs: number;    // identification progress + ETA
  anDone: number; anTotal: number; anEtaMs: number;    // analysis progress + ETA
  stageStart: number;                                  // Date.now() when the active stage began
}

const EMPTY_PROG: ScanProgress = {
  stage: 'idle', detected: 0, detectBoxes: [], boxes: [],
  identified: 0, idDone: 0, idTotal: 0, idEtaMs: 0,
  anDone: 0, anTotal: 0, anEtaMs: 0, stageStart: 0,
};

// Which of the 3 headline steps (0=detect, 1=identify, 2=analysis) a stage belongs to.
const STAGE_STEP: Record<Stage, number> = {
  idle: 0, uploading: 0, detecting: 0, detected: 0,
  identifying: 1, identified: 1,
  analyzing: 2, complete: 3,
};

function fmtMs(ms: number): string {
  if (ms >= 60000) { const m = Math.floor(ms / 60000); const sec = Math.round((ms % 60000) / 1000); return `${m}m ${String(sec).padStart(2, '0')}s`; }
  return `${(ms / 1000).toFixed(1)}s`;
}

// "~12s left" style ETA (blank once we can't estimate).
function fmtEta(ms?: number): string {
  if (!ms || ms <= 0) return '';
  return ` · ~${fmtMs(ms)} left`;
}

// Final box list: every detection coloured by its mapped product's score
// (unique→own, duplicate→twin, unidentified→gray). Falls back to one box per product.
function finalBoxes(result: ShelfAnalysisResponse): { bbox: number[]; color: string; badge: string; product: ProductItem | null }[] {
  const products = result.products;
  const dets = result.detections && result.detections.length ? result.detections : null;
  if (dets) {
    return dets.map(d => {
      const p = (d.product_index != null && products[d.product_index]) ? products[d.product_index] : null;
      const color = p ? SCORE_COLORS[p.scoring] : SCORE_COLORS['Unidentified'];
      return { bbox: d.bounding_box, color, badge: p ? p.scoring[0] : 'U', product: p };
    });
  }
  return products.map(p => ({ bbox: p.bounding_box, color: SCORE_COLORS[p.scoring], badge: p.scoring[0], product: p }));
}

export default function ScanTab() {
  const [view, setView] = useState<View>('picker');
  const [imageUrl, setImageUrl] = useState('');
  const [result, setResult] = useState<ShelfAnalysisResponse | null>(null);
  const [selected, setSelected] = useState<ProductItem | null>(null);
  const [imgEl, setImgEl] = useState<{ width: number; height: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showTransparency, setShowTransparency] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prog, setProg] = useState<ScanProgress>(EMPTY_PROG);
  const [liveProducts, setLiveProducts] = useState<LiveProduct[]>([]);
  const [now, setNow] = useState(0);
  const [resFilter, setResFilter] = useState<ResultFilter>('all');
  const [resSort, setResSort] = useState<ResultSort>('best');

  // Live elapsed-time ticker for the active stage (only runs while analyzing).
  useEffect(() => {
    if (view !== 'analyzing') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [view]);

  const handleEvent = (ev: any) => {
    switch (ev.stage) {
      case 'detecting':
        setProg(p => ({ ...p, stage: 'detecting', stageStart: Date.now() }));
        break;
      case 'detected':
        setProg(p => ({
          ...p, stage: 'detected', detectBoxes: ev.boxes ?? [], detected: ev.count ?? 0, detectMs: ev.detect_ms,
          boxes: (ev.boxes ?? []).map((b: number[]) => ({ bbox: b, color: STAGE_COLORS.detected })),
        }));
        break;
      case 'identifying':
        setProg(p => ({ ...p, stage: 'identifying', stageStart: Date.now(), idDone: 0, idTotal: ev.total ?? p.detected, idEtaMs: 0 }));
        break;
      case 'identified_item': {
        // Recolour this crop's box by its role, and (if it's a new, non-duplicate
        // product) add a card to the live results list.
        const color = ev.status === 'unique' ? STAGE_COLORS.unique
          : ev.status === 'duplicate' ? STAGE_COLORS.duplicate
            : STAGE_COLORS.unidentified;
        setProg(p => {
          const boxes = p.boxes.slice();
          if (typeof ev.box_index === 'number') {
            boxes[ev.box_index] = { bbox: ev.bbox, color, productIndex: ev.product_index };
          }
          return {
            ...p, stage: 'identifying', boxes,
            idDone: ev.done ?? p.idDone, idTotal: ev.total ?? p.idTotal, idEtaMs: ev.eta_ms ?? 0,
            identified: p.identified + (ev.status !== 'unidentified' ? 1 : 0),
          };
        });
        if (ev.product && ev.status === 'unique') {
          setLiveProducts(prev =>
            prev.some(lp => lp.product_index === ev.product_index)
              ? prev
              : [...prev, {
                  product_index: ev.product_index,
                  brand: ev.product.brand, product_name: ev.product.product_name,
                  variant: ev.product.variant, crop_image: ev.product.crop_image,
                }]);
        }
        break;
      }
      case 'identified':
        setProg(p => ({ ...p, stage: 'identified', identifyMs: ev.identify_ms, identified: ev.identified_count ?? p.identified }));
        break;
      case 'analyzing':
        setProg(p => ({ ...p, stage: 'analyzing', stageStart: Date.now(), anDone: 0, anTotal: ev.total ?? 0, anEtaMs: 0 }));
        break;
      case 'analyzed_item': {
        const prod = ev.product as ProductItem;
        setProg(p => ({
          ...p, stage: 'analyzing',
          anDone: ev.done ?? p.anDone, anTotal: ev.total ?? p.anTotal, anEtaMs: ev.eta_ms ?? 0,
          // recolour every box mapped to this product (its unique facing + duplicates) by its final score
          boxes: p.boxes.map(b => b.productIndex === ev.product_index ? { ...b, color: SCORE_COLORS[prod.scoring] } : b),
        }));
        setLiveProducts(prev => prev.map(lp => lp.product_index === ev.product_index ? { ...lp, product: prod } : lp));
        break;
      }
      case 'complete':
        setResult(ev.result as ShelfAnalysisResponse);
        setView('results');
        break;
      case 'error':
        throw new Error(ev.detail ?? 'Analysis failed.');
    }
  };

  const analyze = async (file: File) => {
    setView('analyzing');
    setResult(null);
    setSelected(null);
    setLiveProducts([]);
    setProg({ ...EMPTY_PROG, stage: 'uploading', stageStart: Date.now() });
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    const makeForm = () => {
      const fd = new FormData();
      fd.append('image', file);
      // No profile_id: the backend scores against the profile that owns the
      // bearer token. Sending one would be ignored, and accepting one is exactly
      // the hole this contract change closed.
      // User-selected cap (Settings tab) on how many products to identify + score.
      fd.append('max_detections', String(getMaxDetections()));
      // User-selected detection model (Settings tab): yolo11n / yolo26s / yolo26s_p2.
      fd.append('yolo_model', getYoloModel());
      return fd;
    };

    // Plain (non-streaming) request — used for mock mode and as a fallback.
    const runPlain = async () => {
      setProg(p => ({ ...p, stage: 'identifying', stageStart: Date.now() }));
      const endpoint = USE_MOCK_ANALYZE ? ENDPOINTS.analyzeMock : ENDPOINTS.analyze;
      const r = await authFetch(endpoint, { method: 'POST', body: makeForm() });
      if (!r.ok) throw new Error(await readDetail(r));
      const data: ShelfAnalysisResponse = await r.json();
      setResult(data);
      setView('results');
    };

    try {
      if (USE_MOCK_ANALYZE) { await runPlain(); return; }

      // Stream per-stage progress; fall back to plain if the endpoint is unavailable.
      let streamed = false;
      try {
        const r = await authFetch(ENDPOINTS.analyzeStream, { method: 'POST', body: makeForm() });
        if (!r.ok || !r.body) throw new Error('stream-unavailable');
        streamed = true;

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n\n')) >= 0) {
            const raw = buf.slice(0, nl); buf = buf.slice(nl + 2);
            const line = raw.split('\n').find(l => l.startsWith('data:'));
            if (!line) continue;
            handleEvent(JSON.parse(line.slice(5).trim()));
          }
        }
      } catch (streamErr: any) {
        if (streamed) throw streamErr;   // real in-stream error — surface it
        // An auth failure isn't "streaming unavailable" — retrying plain would
        // just fail the same way. Let it out to the handler below.
        if (streamErr instanceof ApiError && (streamErr.status === 401 || streamErr.status === 403)) {
          throw streamErr;
        }
        await runPlain();                // streaming unavailable — fall back
      }
    } catch (e: any) {
      // 401 already cleared the session and reopened the login modal; 403
      // pending_approval means the account is awaiting admin approval. Neither
      // is a scan failure, so don't dress them up as one.
      if (e instanceof ApiError && e.status === 401) {
        setView('picker');
        return;
      }
      if (e instanceof ApiError && e.status === 403 && e.detail === 'pending_approval') {
        setErrorMsg('Your account is still pending approval, so scanning is not available yet.');
        setView('picker');
        return;
      }
      const msg = e?.message ?? 'Unknown error';
      if (/\b429\b|\b503\b|quota|resource[_ ]?exhausted|temporarily unavailable|rate limit/i.test(msg)) {
        setErrorMsg('The AI service is busy or has hit its usage limit right now — this is usually a temporary API rate or credit limit, not your photo. Wait a moment and try again.');
      } else {
        setErrorMsg(`Analysis failed: ${msg}`);
      }
      setView('picker');
    }
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    setErrorMsg(null);
    // iPhone HEIC photos are allowed — the backend converts them to JPEG.
    // Their MIME type is sometimes empty, so also accept by extension.
    const isImage = file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name);
    if (!isImage) {
      setErrorMsg('Please select an image file (JPEG, PNG, or an iPhone photo).');
      return;
    }
    analyze(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0] ?? null);
  };

  if (view === 'analyzing') {
    const boxes = prog.boxes;
    const activeStep = STAGE_STEP[prog.stage] ?? 0;
    const elapsedActive = now > prog.stageStart ? now - prog.stageStart : 0;
    const idSub = activeStep > 1
      ? `${prog.identified} identified`
      : prog.idTotal > 0
        ? `${prog.idDone} of ${prog.idTotal} identified${fmtEta(prog.idEtaMs)}`
        : 'Recognizing each product, one at a time…';
    const anSub = prog.anTotal > 0
      ? `${prog.anDone} of ${prog.anTotal} analyzed${fmtEta(prog.anEtaMs)}`
      : activeStep >= 2 ? 'Preparing nutrition analysis…' : 'Waiting for products…';
    const steps = [
      {
        label: 'Detecting products (YOLO)',
        sub: prog.detected ? `${prog.detected} product${prog.detected === 1 ? '' : 's'} detected` : 'Locating products on the shelf…',
        doneMs: prog.detectMs,
      },
      { label: 'Identifying products (Gemini)', sub: idSub, doneMs: prog.identifyMs },
      { label: 'Nutrition analysis', sub: anSub, doneMs: undefined as number | undefined },
    ];

    return (
      <div className={s.resultsPage}>
        <p className={s.resultsIntro}>Analyzing your shelf… 🔎</p>

        <div className={s.imageWrap}>
          <img
            src={imageUrl} alt="Scanning shelf" className={s.resultImg}
            onLoad={e => setImgEl({ width: e.currentTarget.offsetWidth, height: e.currentTarget.offsetHeight })}
          />
          {boxes.map((b, i) => {
            if (!b) return null;
            const [ymin, xmin, ymax, xmax] = b.bbox;
            return (
              <div key={i} className={s.liveBox} style={{
                top: `${ymin * 100}%`, left: `${xmin * 100}%`,
                width: `${(xmax - xmin) * 100}%`, height: `${(ymax - ymin) * 100}%`,
                borderColor: b.color, boxShadow: `0 0 0 1px ${b.color}66`,
              }} />
            );
          })}
        </div>

        <StageLegend stage={prog.stage} />

        <div className={s.stepper}>
          {steps.map((st, i) => {
            const status = activeStep > i ? 'done' : activeStep === i ? 'active' : 'pending';
            const timeStr = status === 'done' && st.doneMs != null ? fmtMs(st.doneMs)
              : status === 'active' ? fmtMs(elapsedActive) : '';
            return (
              <div key={i} className={s.stepRow}>
                <span className={s.stepIcon} style={{ color: status === 'done' ? 'var(--green)' : status === 'active' ? 'var(--accent)' : 'var(--sub)' }}>
                  {status === 'done' ? '✓' : status === 'active' ? <span className={s.miniSpinner} /> : '○'}
                </span>
                <div className={s.stepBody}>
                  <div className={s.stepTop}>
                    <span className={s.stepLabel} style={{ color: status === 'pending' ? 'var(--sub)' : 'var(--text)' }}>{st.label}</span>
                    {timeStr && <span className={s.stepTime}>{timeStr}</span>}
                  </div>
                  {status !== 'pending' && <p className={s.stepSub}>{st.sub}</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live results — products appear here as they're identified, then fill in
            with their score as each is analysed. Duplicates are not listed. */}
        {liveProducts.length > 0 && (
          <div className={s.liveResults}>
            <p className={s.liveResultsHead}>
              Products found so far <span className={s.liveResultsCount}>{liveProducts.length}</span>
            </p>
            <div className={s.liveGrid}>
              {liveProducts.map(lp => (
                <LiveProductCard
                  key={lp.product_index}
                  lp={lp}
                  onPress={() => lp.product && setSelected(lp.product)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'results' && result) {
    const counts = result.products.reduce((acc, p) => {
      acc[p.scoring] = (acc[p.scoring] ?? 0) + 1; return acc;
    }, {} as Record<ScoreEnum, number>);

    return (
      <div className={s.resultsPage}>
        <p className={s.resultsIntro}>Let&apos;s see which products fit your goals! 🎯</p>

        {/* Annotated image */}
        <div className={s.imageWrap}>
          <img
            src={imageUrl} alt="Scanned shelf"
            className={s.resultImg}
            onLoad={e => {
              const el = e.currentTarget;
              setImgEl({ width: el.offsetWidth, height: el.offsetHeight });
            }}
          />
          {imgEl && finalBoxes(result).map((b, i) => {
            const [ymin, xmin, ymax, xmax] = b.bbox;
            return (
              <button key={i} className={s.bbox} onClick={() => b.product && setSelected(b.product)} style={{
                top: `${ymin * 100}%`, left: `${xmin * 100}%`,
                width: `${(xmax - xmin) * 100}%`, height: `${(ymax - ymin) * 100}%`,
                borderColor: b.color, cursor: b.product ? 'pointer' : 'default',
              }}>
                <span className={s.bboxBadge} style={{ background: b.color }}>{b.badge}</span>
              </button>
            );
          })}
        </div>

        {/* Summary bar — chips double as score filters (tap to filter, tap again to clear) */}
        <div className={s.summaryBar}>
          {(['Great Fit', 'Just OK Fit', 'Neutral Fit', "Doesn't Fit", 'Unidentified'] as ScoreEnum[]).map(sc =>
            counts[sc] ? (
              <button
                key={sc}
                className={`${s.chip} ${resFilter === sc ? s.chipActive : ''}`}
                style={{ borderColor: SCORE_COLORS[sc] }}
                aria-pressed={resFilter === sc}
                onClick={() => setResFilter(resFilter === sc ? 'all' : sc)}
              >
                <span className={s.chipCount} style={{ color: SCORE_COLORS[sc] }}>{counts[sc]}</span>
                <span className={s.chipLabel}>{SCORE_LABELS[sc]}</span>
              </button>
            ) : null
          )}
          <button className={s.newScanBtn} onClick={() => { setResult(null); setView('picker'); }}>New scan</button>
        </div>

        {/* Collapsible: Scan performance (per-stage timing + counts) */}
        {result.performance && (
          <details className={s.drawer}>
            <summary className={s.drawerSummary}>⏱️ Scan performance</summary>
            <div className={s.drawerBody}><PerformanceCard perf={result.performance} /></div>
          </details>
        )}

        {/* Collapsible: what each score means */}
        <details className={s.drawer}>
          <summary className={s.drawerSummary}>❔ What each score means</summary>
          <div className={s.drawerBody}><ScoreLegend /></div>
        </details>

        {/* Sort + filter controls */}
        <div className={s.controlsRow}>
          <p className={s.listHeader}>
            Products{resFilter !== 'all' ? ` · ${SCORE_LABELS[resFilter]}` : ''} — tap for details
          </p>
          <div className={s.controlsRight}>
            {resFilter !== 'all' && (
              <button className={s.clearFilter} onClick={() => setResFilter('all')}>Clear filter ✕</button>
            )}
            <label className={s.sortLabel}>
              Sort
              <select className={s.sortSelect} value={resSort} onChange={e => setResSort(e.target.value as ResultSort)}>
                {(['best', 'worst', 'az'] as ResultSort[]).map(k => (
                  <option key={k} value={k}>{SORT_LABELS[k]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className={s.productList}>
          {(() => {
            const shown = result.products
              .map((p, i) => ({ p, i }))
              .filter(({ p }) => resFilter === 'all' || p.scoring === resFilter)
              .sort((a, b) => {
                if (resSort === 'az') return a.p.product_name.localeCompare(b.p.product_name);
                const d = SCORE_RANK[b.p.scoring] - SCORE_RANK[a.p.scoring];
                return resSort === 'best' ? d : -d;
              });
            if (shown.length === 0) {
              return <p className={s.emptyList}>No products match this filter.</p>;
            }
            return shown.map(({ p, i }) => <ProductRow key={i} product={p} onPress={() => setSelected(p)} />);
          })()}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className={s.detailOverlay} onClick={() => setSelected(null)}>
            <div className={s.detailPanel} onClick={e => e.stopPropagation()}>
              <DetailPanel product={selected} onClose={() => setSelected(null)} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Picker
  return (
    <div className={s.pickerPage}>
      <div className={s.pickerContainer}>
        <h1 className={s.title}>Scan a Shelf</h1>
        <p className={s.sub}>Upload a photo of a grocery shelf for AI-powered nutritional analysis</p>

        {errorMsg && (
          <div className={s.errorBanner}>
            <span>⚠️ {errorMsg}</span>
            <button className={s.errorDismiss} onClick={() => setErrorMsg(null)} aria-label="Dismiss">✕</button>
          </div>
        )}

        {/* Drop zone */}
        <div className={s.dropZone}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}>
          <div className={s.dropIcon}>🖼️</div>
          <p className={s.dropTitle}>Drop an image here or click to upload</p>
          <p className={s.dropSub}>JPEG, PNG, WebP, or iPhone (HEIC) • Works best with a clear photo of a grocery shelf</p>
          <input ref={fileRef} type="file" accept="image/*,.heic,.heif" className={s.fileInput}
            onChange={e => handleFile(e.target.files?.[0] ?? null)} />
        </div>

        {/* Reflects the user's Settings choice; read at render so it stays current. */}
        <p className={s.scanSettingNote}>
          Analyzing up to <strong>{getMaxDetections()}</strong> products per scan · change this in <strong>Settings ⚙</strong>
        </p>

        {/* Live camera capture */}
        <button className={s.cameraBtn} onClick={() => setShowCamera(true)}>
          📷  Take a Photo
        </button>

        {/* Transparency + privacy */}
        <button className={s.transparencyBtn} onClick={() => setShowTransparency(true)}>
          🔎  Transparency Overview — see exactly what we send before you scan
        </button>

        <div className={s.privacyNote}>
          <p className={s.privacyTitle}>A note on privacy</p>
          <p className={s.privacyText}>
            Our current version does not blur faces, so try to avoid people in frame. Either way,
            we do not store your images, and our models focus on picking up products while ignoring
            background noise.
          </p>
        </div>

        {/* How it works */}
        <div className={s.howCard}>
          <p className={s.howTitle}>How it works</p>
          {[
            ['1', 'Upload or snap a photo of a grocery shelf'],
            ['2', 'AI identifies every product and reads the label'],
            ['3', 'Products are scored against your profile, goals, and philosophy'],
            ['4', 'Tap any product for full nutrition details and factor-by-factor reasoning'],
          ].map(([n, t]) => (
            <div key={n} className={s.howRow}>
              <span className={s.howNum}>{n}</span>
              <span className={s.howText}>{t}</span>
            </div>
          ))}
        </div>

      </div>

      {showCamera && (
        <CameraCapture
          onCapture={(file) => { setShowCamera(false); handleFile(file); }}
          onClose={() => setShowCamera(false)}
          onFallbackUpload={() => fileRef.current?.click()}
        />
      )}
      {showTransparency && <TransparencyOverview onClose={() => setShowTransparency(false)} />}
    </div>
  );
}

function StageLegend({ stage }: { stage: Stage }) {
  let items: [string, string][];
  if (stage === 'identifying' || stage === 'identified' || stage === 'analyzing') {
    items = [
      ['New product', STAGE_COLORS.unique],
      ['Duplicate', STAGE_COLORS.duplicate],
      ['Unidentified', STAGE_COLORS.unidentified],
    ];
  } else {
    items = [['Detected', STAGE_COLORS.detected]];
  }
  return (
    <div className={s.stageLegend}>
      {items.map(([label, color]) => (
        <span key={label} className={s.stageLegendItem}>
          <span className={s.stageDot} style={{ background: color }} />{label}
        </span>
      ))}
    </div>
  );
}

// A product card in the live analyzing view: identity + crop first, its score
// pill filling in once the product has been analysed.
function LiveProductCard({ lp, onPress }: { lp: LiveProduct; onPress: () => void }) {
  const done = !!lp.product;
  const score = lp.product?.scoring;
  return (
    <button
      type="button"
      className={s.liveCard}
      onClick={done ? onPress : undefined}
      style={{ cursor: done ? 'pointer' : 'default', borderColor: score ? SCORE_COLORS[score] : 'var(--border)' }}
    >
      {lp.crop_image
        ? <img src={lp.crop_image} alt={lp.product_name} className={s.liveCardImg} />
        : <div className={s.liveCardImg} />}
      <div className={s.liveCardBody}>
        <span className={s.liveCardBrand}>{lp.brand}</span>
        <span className={s.liveCardName}>{lp.product_name}</span>
        {done && score
          ? <span className={s.liveCardScore} style={{ color: SCORE_COLORS[score], background: SCORE_BG[score] }}>{SCORE_LABELS[score]}</span>
          : <span className={s.liveCardPending}><span className={s.miniSpinner} /> Analyzing…</span>}
      </div>
    </button>
  );
}

function PerformanceCard({ perf }: { perf: PerformanceSummary }) {
  const times: [string, number | undefined][] = [
    ['Detection (YOLO)', perf.detect_ms],
    ['Identification (Gemini)', perf.identify_ms],
    ['Nutrition analysis', perf.analysis_ms],
    ['Total', perf.total_ms],
  ];
  const counts: [string, number][] = [
    ['Detected', perf.detected_count],
    ['Identified', perf.identified_count],
    ['Unique (analyzed)', perf.unique_count],
    ['Duplicates', perf.duplicate_count],
    ['Unidentified', perf.unidentified_count],
  ];
  return (
    <div className={s.perfCard}>
      <p className={s.perfTitle}>Scan performance</p>
      <div className={s.perfCounts}>
        {counts.map(([l, v]) => (
          <div key={l} className={s.perfCount}><span className={s.perfCountVal}>{v}</span><span className={s.perfCountLabel}>{l}</span></div>
        ))}
      </div>
      <div className={s.perfTimes}>
        {times.filter(([, v]) => v != null).map(([l, v]) => (
          <div key={l} className={l === 'Total' ? s.perfRowBold : s.perfRow}><span>{l}</span><span>{fmtMs(v as number)}</span></div>
        ))}
      </div>
    </div>
  );
}

function ScoreLegend() {
  const rows: ScoreEnum[] = ['Great Fit', 'Just OK Fit', 'Neutral Fit', "Doesn't Fit", 'Unidentified'];
  return (
    <div className={s.legendCard}>
      <p className={s.legendTitle}>What each score means</p>
      <p className={s.legendSub}>
        Scores reflect how well a product fits <em>your</em> goals, dietary philosophy,
        allergies, avoided ingredients, and processing tolerance — not a generic health rating.
      </p>
      {rows.map(sc => (
        <div key={sc} className={s.legendRow}>
          <span className={s.legendDot} style={{ background: SCORE_COLORS[sc] }} />
          <div>
            <p className={s.legendLabel} style={{ color: SCORE_COLORS[sc] }}>{SCORE_LABELS[sc]}</p>
            <p className={s.legendDesc}>{SCORE_DESCRIPTIONS[sc]}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductRow({ product, onPress }: { product: ProductItem; onPress: () => void }) {
  const color = SCORE_COLORS[product.scoring];
  const bg = SCORE_BG[product.scoring];
  return (
    <button className={s.productRow} style={{ borderLeftColor: color }} onClick={onPress}>
      <div className={s.productTop}>
        <span className={s.scorePill} style={{ background: bg, borderColor: color, color }}>{SCORE_LABELS[product.scoring]}</span>
        {product.processing_level != null && (
          <span className={s.novaTag} style={{ borderColor: NOVA_COLORS[product.processing_level], color: NOVA_COLORS[product.processing_level] }}>
            NOVA {product.processing_level} · {NOVA_LABELS[product.processing_level]}
          </span>
        )}
      </div>
      <p className={s.productBrand}>{product.brand}</p>
      <p className={s.productName}>{product.product_name}</p>
      <div className={s.factors}>
        {product.reasoning_by_factor.length > 0
          ? product.reasoning_by_factor.map((f, i) => <p key={i} className={s.factor}>{f}</p>)
          : <p className={s.factor}>{product.reasoning}</p>
        }
      </div>
    </button>
  );
}

function DetailPanel({ product, onClose }: { product: ProductItem; onClose: () => void }) {
  const color = SCORE_COLORS[product.scoring];
  const bg = SCORE_BG[product.scoring];
  const nf = product.nutritional_facts;
  return (
    <div className={s.detail}>
      <button className={s.detailClose} onClick={onClose}>✕ Close</button>
      <div className={s.detailBanner} style={{ background: bg, borderColor: color }}>
        <span className={s.detailScore} style={{ color }}>{SCORE_LABELS[product.scoring]}</span>
        {product.processing_level != null && (
          <span className={s.novaTag} style={{ borderColor: NOVA_COLORS[product.processing_level!], color: NOVA_COLORS[product.processing_level!] }}>
            NOVA {product.processing_level} · {NOVA_LABELS[product.processing_level!]}
          </span>
        )}
        <p className={s.detailReasoning}>{product.reasoning}</p>
      </div>
      {product.reasoning_by_factor.length > 0 && (
        <div className={s.detailFactors}>
          <p className={s.detailSectionLabel}>Why this score?</p>
          {product.reasoning_by_factor.map((f, i) => <p key={i} className={s.detailFactor}>{f}</p>)}
        </div>
      )}
      {product.score_breakdown && <ScoreBreakdownCard breakdown={product.score_breakdown} />}
      <p className={s.detailBrand}>{product.brand}</p>
      <p className={s.detailName}>{product.product_name}{product.variant ? ` — ${product.variant}` : ''}</p>
      {product.crop_image && (
        <div className={s.detailSection}>
          <p className={s.detailSectionLabel}>Cropped from your photo</p>
          <img src={product.crop_image} alt={`${product.brand} ${product.product_name} crop`} className={s.cropImage} />
        </div>
      )}
      {nf.detected_ingredients.length > 0 && (
        <div className={s.detailSection}>
          <p className={s.detailSectionLabel}>Ingredients</p>
          <p className={s.detailIngredients}>{nf.detected_ingredients.join(', ')}</p>
        </div>
      )}
      {product.allergens.length > 0 && (
        <div className={s.detailSection}>
          <p className={s.detailSectionLabel}>Allergens</p>
          <p className={s.detailIngredients}>{product.allergens.join(', ')}</p>
        </div>
      )}
      <div className={s.factsTable}>
        <p className={s.factsTitle}>Nutrition Facts</p>
        {nf.serving_size && <p className={s.factsServing}>Serving: {nf.serving_size}</p>}
        <hr className={s.factsDivider} />
        {nf.calories != null && <div className={s.factsRowBold}><span>Calories</span><span>{nf.calories}</span></div>}
        <hr className={s.factsDivider} />
        {[
          ['Total Fat', nf.total_fat_g, 'g'], ['  Saturated Fat', nf.saturated_fat_g, 'g'], ['  Trans Fat', nf.trans_fat_g, 'g'],
          ['Cholesterol', nf.cholesterol_mg, 'mg'], ['Sodium', nf.sodium_mg, 'mg'],
          ['Total Carbohydrate', nf.total_carbohydrate_g, 'g'], ['  Dietary Fiber', nf.dietary_fiber_g, 'g'],
          ['  Total Sugars', nf.total_sugars_g, 'g'], ['  Added Sugars', nf.added_sugars_g, 'g'],
          ['Protein', nf.protein_g, 'g'],
        ].filter(([, v]) => v != null).map(([label, val, unit]) => (
          <div key={String(label)} className={s.factsRow}>
            <span>{String(label)}</span><span>{val}{unit}</span>
          </div>
        ))}
        {nf.flagged_ingredients.length > 0 && <>
          <hr className={s.factsDivider} />
          <p className={s.flaggedTitle}>⚠️ Flagged Ingredients</p>
          {nf.flagged_ingredients.map(ing => <p key={ing} className={s.flaggedItem}>· {ing}</p>)}
        </>}
      </div>
      <AlternativesSection product={product} />
    </div>
  );
}

function AlternativesSection({ product }: { product: ProductItem }) {
  const key = `${product.brand}|${product.product_name}|${product.variant ?? ''}`;
  // Alternatives only make sense for identified products that aren't already a great fit.
  const show = product.scoring !== 'Unidentified' && product.scoring !== 'Great Fit';
  const [state, setState] = useState<{ loading: boolean; alternatives?: Alternative[]; error?: string }>(
    () => altCache.has(key) ? { loading: false, ...altCache.get(key)! } : { loading: show }
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
      <div className={s.detailSection}>
        <p className={s.detailSectionLabel}>Score breakdown</p>
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
    <div className={s.detailSection}>
      <p className={s.detailSectionLabel}>Score breakdown</p>
      {dims.filter(([, v]) => v != null).map(([label, val]) => (
        <div key={label} className={s.factsRow}>
          <span>{label}</span><span>{val! > 0 ? `+${val}` : val}</span>
        </div>
      ))}
      {breakdown.total_score != null && (
        <div className={s.factsRowBold}>
          <span>Total score</span><span>{breakdown.total_score}</span>
        </div>
      )}
    </div>
  );
}
