'use client';
import { useEffect, useRef, useState } from 'react';
import { ENDPOINTS, USE_MOCK_ANALYZE } from '@/lib/api';
import { getProfileId } from '@/lib/storage';
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

type Stage =
  | 'idle' | 'uploading' | 'detecting' | 'detected' | 'identifying'
  | 'identified' | 'analyzing' | 'scoring' | 'complete';

interface ScanProgress {
  stage: Stage;
  detectBoxes: number[][];                              // [ymin,xmin,ymax,xmax]
  idDets: { bbox: number[]; identified: boolean }[];
  planDets: { bbox: number[]; status: string }[];
  detected: number; identified: number;
  unique: number; duplicate: number; unidentified: number;
  detectMs?: number; identifyMs?: number;
  analysisDone: number; analysisTotal: number;
  stageStart: number;                                   // Date.now() when the active stage began
}

const EMPTY_PROG: ScanProgress = {
  stage: 'idle', detectBoxes: [], idDets: [], planDets: [],
  detected: 0, identified: 0, unique: 0, duplicate: 0, unidentified: 0,
  analysisDone: 0, analysisTotal: 0, stageStart: 0,
};

// Which of the 3 headline steps (0=detect, 1=identify, 2=analysis) a stage belongs to.
const STAGE_STEP: Record<Stage, number> = {
  idle: 0, uploading: 0, detecting: 0, detected: 0,
  identifying: 1, identified: 1,
  analyzing: 2, scoring: 2, complete: 3,
};

function fmtMs(ms: number): string {
  if (ms >= 60000) { const m = Math.floor(ms / 60000); const sec = Math.round((ms % 60000) / 1000); return `${m}m ${String(sec).padStart(2, '0')}s`; }
  return `${(ms / 1000).toFixed(1)}s`;
}

// Boxes + colours to draw over the image during the live analyzing view.
function liveStageBoxes(prog: ScanProgress): { bbox: number[]; color: string }[] {
  if (prog.stage === 'analyzing' || prog.stage === 'scoring') {
    return prog.planDets.map(d => ({
      bbox: d.bbox,
      color: d.status === 'unique' ? STAGE_COLORS.unique
        : d.status === 'duplicate' ? STAGE_COLORS.duplicate : STAGE_COLORS.unidentified,
    }));
  }
  if (prog.stage === 'identified') {
    return prog.idDets.map(d => ({ bbox: d.bbox, color: d.identified ? STAGE_COLORS.identified : STAGE_COLORS.notIdentified }));
  }
  const boxes = prog.detectBoxes.length ? prog.detectBoxes : prog.idDets.map(d => d.bbox);
  return boxes.map(b => ({ bbox: b, color: STAGE_COLORS.detected }));
}

function analysisSub(prog: ScanProgress): string {
  if (prog.stage === 'scoring') return `Scoring ${prog.unique} product${prog.unique === 1 ? '' : 's'} against your profile…`;
  if (prog.analysisTotal > 0) return `${prog.unique} unique · ${prog.duplicate} duplicate · ${prog.unidentified} unidentified — collecting data ${prog.analysisDone}/${prog.analysisTotal}`;
  return 'Preparing nutrition analysis…';
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
  const [now, setNow] = useState(0);

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
        setProg(p => ({ ...p, stage: 'detected', detectBoxes: ev.boxes ?? [], detected: ev.count ?? 0, detectMs: ev.detect_ms }));
        break;
      case 'identifying':
        setProg(p => ({ ...p, stage: 'identifying', stageStart: Date.now() }));
        break;
      case 'identified':
        setProg(p => ({
          ...p, stage: 'identified', idDets: ev.detections ?? [],
          detected: ev.count ?? p.detected, identified: ev.identified_count ?? 0, identifyMs: ev.identify_ms,
        }));
        break;
      case 'analysis_plan':
        setProg(p => ({
          ...p, stage: 'analyzing', stageStart: Date.now(), planDets: ev.detections ?? [],
          unique: ev.unique_count ?? 0, duplicate: ev.duplicate_count ?? 0, unidentified: ev.unidentified_count ?? 0,
          analysisTotal: ev.unique_count ?? 0, analysisDone: 0,
        }));
        break;
      case 'analysis_progress':
        setProg(p => ({ ...p, stage: 'analyzing', analysisDone: ev.done ?? 0, analysisTotal: ev.total ?? p.analysisTotal }));
        break;
      case 'scoring':
        setProg(p => ({ ...p, stage: 'scoring' }));
        break;
      case 'complete':
        setResult(ev.result as ShelfAnalysisResponse);
        setView('results');
        break;
      case 'error':
        throw new Error(ev.detail ?? 'Analysis failed.');
    }
  };

  const analyze = async (file: File) => {
    const profileId = getProfileId();
    if (!profileId) {
      alert('Set up your profile first for personalised scoring.');
      return;
    }

    setView('analyzing');
    setResult(null);
    setSelected(null);
    setProg({ ...EMPTY_PROG, stage: 'uploading', stageStart: Date.now() });
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    const makeForm = () => {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('profile_id', profileId);
      return fd;
    };

    // Plain (non-streaming) request — used for mock mode and as a fallback.
    const runPlain = async () => {
      setProg(p => ({ ...p, stage: 'identifying', stageStart: Date.now() }));
      const endpoint = USE_MOCK_ANALYZE ? ENDPOINTS.analyzeMock : ENDPOINTS.analyze;
      const r = await fetch(endpoint, { method: 'POST', body: makeForm() });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail ?? `Server ${r.status}`); }
      const data: ShelfAnalysisResponse = await r.json();
      setResult(data);
      setView('results');
    };

    try {
      if (USE_MOCK_ANALYZE) { await runPlain(); return; }

      // Stream per-stage progress; fall back to plain if the endpoint is unavailable.
      let streamed = false;
      try {
        const r = await fetch(ENDPOINTS.analyzeStream, { method: 'POST', body: makeForm() });
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
        await runPlain();                // streaming unavailable — fall back
      }
    } catch (e: any) {
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
    const boxes = liveStageBoxes(prog);
    const activeStep = STAGE_STEP[prog.stage] ?? 0;
    const elapsedActive = now > prog.stageStart ? now - prog.stageStart : 0;
    const steps = [
      {
        label: 'Detecting products (YOLO)',
        sub: prog.detected ? `${prog.detected} product${prog.detected === 1 ? '' : 's'} detected` : 'Locating products on the shelf…',
        doneMs: prog.detectMs,
      },
      {
        label: 'Identifying products (Gemini)',
        sub: (activeStep > 1 || prog.identified)
          ? `${prog.identified} identified · ${Math.max(prog.detected - prog.identified, 0)} not identified`
          : 'Reading each product label…',
        doneMs: prog.identifyMs,
      },
      {
        label: 'Nutrition analysis',
        sub: analysisSub(prog),
        doneMs: undefined as number | undefined,
      },
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

        {/* Summary bar */}
        <div className={s.summaryBar}>
          {(['Great Fit', 'Just OK Fit', 'Neutral Fit', "Doesn't Fit", 'Unidentified'] as ScoreEnum[]).map(sc =>
            counts[sc] ? (
              <div key={sc} className={s.chip} style={{ borderColor: SCORE_COLORS[sc] }}>
                <span className={s.chipCount} style={{ color: SCORE_COLORS[sc] }}>{counts[sc]}</span>
                <span className={s.chipLabel}>{SCORE_LABELS[sc]}</span>
              </div>
            ) : null
          )}
          <button className={s.newScanBtn} onClick={() => { setResult(null); setView('picker'); }}>New scan</button>
        </div>

        {/* Scan performance summary — per-stage timing + product counts */}
        {result.performance && <PerformanceCard perf={result.performance} />}

        {/* Score legend — what each score means, in addition to the Transparency Overview prompt */}
        <ScoreLegend />

        <p className={s.listHeader}>Products — click for details</p>
        <div className={s.productList}>
          {result.products.map((p, i) => <ProductRow key={i} product={p} onPress={() => setSelected(p)} />)}
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

        {!getProfileId() && (
          <div className={s.warning}>⚠️ Set up your profile first for personalised scoring</div>
        )}
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
  if (stage === 'identified') {
    items = [['Identified', STAGE_COLORS.identified], ['Not identified', STAGE_COLORS.notIdentified]];
  } else if (stage === 'analyzing' || stage === 'scoring') {
    items = [['Unique (analyzed)', STAGE_COLORS.unique], ['Duplicate', STAGE_COLORS.duplicate], ['Unidentified', STAGE_COLORS.unidentified]];
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
