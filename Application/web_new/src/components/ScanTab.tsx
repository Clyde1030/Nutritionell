'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError, ENDPOINTS, USE_MOCK_ANALYZE, authFetch, readDetail } from '@/lib/api';
import { getMaxDetections, getYoloModel } from '@/lib/storage';
import { useAuth } from '@/lib/AuthContext';
import {
  CameraGlyph, DropZone, HowItWorksCard, LandingHero, PrimaryCta, WhatToKnowCard,
  landingStyles as L,
} from '@/components/landing/Landing';
import type { PerformanceSummary, ProductItem, ScoreEnum, ShelfAnalysisResponse } from '@/lib/types';
import { SCORE_BG, SCORE_COLORS, SCORE_LABELS, SCORE_DESCRIPTIONS, STAGE_COLORS } from '@/lib/types';
import ScanResults from '@/components/scan/ScanResults';
import CameraCapture from './CameraCapture';
import TransparencyOverview from './TransparencyOverview';
import s from './ScanTab.module.css';
import a from './AnonymousResults.module.css';

type View = 'picker' | 'analyzing' | 'results';

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

export default function ScanTab({
  onSignIn,
  onNavigate,
}: {
  onSignIn: () => void;
  onNavigate: (tab: string) => void;
}) {
  const { status } = useAuth();
  const [view, setView] = useState<View>('picker');
  const [imageUrl, setImageUrl] = useState('');
  const [result, setResult] = useState<ShelfAnalysisResponse | null>(null);
  // Set by tapping a card in the live analyzing view; the results screen opens
  // on that product once the scan completes.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showTransparency, setShowTransparency] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prog, setProg] = useState<ScanProgress>(EMPTY_PROG);
  const [liveProducts, setLiveProducts] = useState<LiveProduct[]>([]);
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
    setSelectedIndex(null);
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
                  onPress={() => lp.product && setSelectedIndex(lp.product_index)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'results' && result) {
    // An unscored payload (anonymous, or signed in but awaiting approval) renders
    // the same screen with the scores withheld — see ScanResults.
    const scored = result.scored !== false;
    const named = result.products.filter(p => p.scoring !== 'Unidentified').length;
    const newScan = () => { setResult(null); setSelectedIndex(null); setView('picker'); };

    return (
      <ScanResults
        scored={scored}
        result={result}
        imageUrl={imageUrl}
        initialProductIndex={selectedIndex}
        onNewScan={newScan}
        header={scored ? (
          <p className={s.resultsIntro}>Let&apos;s see which products fit your goals! 🎯</p>
        ) : (
          <div className={a.head}>
            <h1 className={a.title}>{named} product{named === 1 ? '' : 's'} found</h1>
            <button className={a.newScan} onClick={newScan}>New scan</button>
          </div>
        )}
        footer={scored ? (
          <>
            {result.performance && (
              <details className={s.drawer}>
                <summary className={s.drawerSummary}>⏱️ Scan performance</summary>
                <div className={s.drawerBody}><PerformanceCard perf={result.performance} /></div>
              </details>
            )}
            <details className={s.drawer}>
              <summary className={s.drawerSummary}>❔ What each score means</summary>
              <div className={s.drawerBody}><ScoreLegend /></div>
            </details>
          </>
        ) : (
          <SignInNudge authState={result.auth_state ?? 'anonymous'} onSignIn={onSignIn} />
        )}
      />
    );
  }

  // ── Landing (public) ──────────────────────────────────────────────────────
  return (
    <div className={L.wrap}>
      <LandingHero
        glyph={<CameraGlyph />}
        headline="Shelf Scan"
        subhead="Point your camera at a grocery shelf. Get nutrition info on every product."
        onHowItWorks={() => document.getElementById('scan-how')?.scrollIntoView({ behavior: 'smooth' })}
        onWhatToKnow={() => document.getElementById('scan-know')?.scrollIntoView({ behavior: 'smooth' })}
      />

      {errorMsg && (
        <div className={s.errorBanner}>
          <span>⚠️ {errorMsg}</span>
          <button className={s.errorDismiss} onClick={() => setErrorMsg(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <DropZone
        title="Drop an image here or tap to upload"
        caption="JPEG, PNG, WebP, or iPhone photo · Works best with a clear shot of a shelf"
        onClick={() => fileRef.current?.click()}
        onDrop={handleDrop}
      />
      <input ref={fileRef} type="file" accept="image/*,.heic,.heif" className={s.fileInput}
        onChange={e => handleFile(e.target.files?.[0] ?? null)} />

      <PrimaryCta label="Take a Photo" onClick={() => setShowCamera(true)} />

      {/* Reflects the user's Settings choice; read at render so it stays current. */}
      <p className={L.ctaCaption}>
        Analyzing up to {getMaxDetections()} products per scan ·{' '}
        <button onClick={() => onNavigate('settings')}>Settings</button>
      </p>

      <HowItWorksCard
        id="scan-how"
        steps={[
          { title: 'Upload a photo', detail: 'Snap a grocery shelf or pick an image from your camera roll.' },
          { title: 'Every product is found', detail: 'Detection locates each item on the shelf, not just the one in front.' },
          { title: 'Each one is identified', detail: 'Brand, product and variant are read off the packaging.' },
          { title: 'See the results', detail: 'Nutrition info for everyone — a fit score if you\u2019re signed in.' },
        ]}
      />

      <WhatToKnowCard
        id="scan-know"
        sections={[
          { label: 'Privacy', body: 'We don\u2019t blur faces yet, so try to avoid people in frame. We never store your images.' },
          { label: 'Signed in vs. not', body: 'Not signed in, you still get full nutrition facts, processing level, and flagged ingredients. Sign in for a fit score against your allergies and goals.' },
          { label: 'Scan settings', body: 'Change how many products are analyzed per scan any time in Settings.' },
        ]}
      />

      <button className={s.transparencyBtn} onClick={() => setShowTransparency(true)}>
        Transparency Overview — see exactly what we send before you scan
      </button>

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

/* ─────────────────────────────────────────────────────────────────────────────
   The sign-in nudge under unscored results.

   The results themselves are the shared ScanResults screen in its unscored mode;
   only this closing card is specific to being signed out. Deliberately the one
   piece of accent green on that screen — an unscored result must read as
   informational, never as a judgement.
   ───────────────────────────────────────────────────────────────────────────── */

function SignInNudge({ authState, onSignIn }: { authState: string; onSignIn: () => void }) {
  const pending = authState === 'pending';
  return (
    <div className={a.nudge}>
      <span className={a.nudgeTile} aria-hidden="true">
        <CameraGlyph />
      </span>
      {pending ? (
        <>
          <p className={a.nudgeTitle}>Your account is awaiting approval</p>
          <p className={a.nudgeText}>
            Once an admin approves you, every scan is scored against your allergies,
            goals and dietary philosophy — no need to sign up again.
          </p>
        </>
      ) : (
        <>
          <p className={a.nudgeTitle}>Want to know if these products meet your dietary needs?</p>
          <p className={a.nudgeText}>
            Sign in to score every product against your allergies, goals, and dietary philosophy.
          </p>
          <button className={a.nudgeBtn} onClick={onSignIn}>Sign In</button>
        </>
      )}
    </div>
  );
}
