'use client';
import { useEffect, useRef, useState } from 'react';
import { ENDPOINTS, USE_MOCK_ANALYZE } from '@/lib/api';
import { getProfileId } from '@/lib/storage';
import type { ProductItem, ScoreEnum, ShelfAnalysisResponse } from '@/lib/types';
import { NOVA_COLORS, NOVA_LABELS, SCORE_BG, SCORE_COLORS, SCORE_LABELS, SCORE_DESCRIPTIONS } from '@/lib/types';
import CameraCapture from './CameraCapture';
import TransparencyOverview from './TransparencyOverview';
import s from './ScanTab.module.css';

interface Alternative {
  brand: string;
  product_name: string;
  similarity_score: number;
  scoring: 'Great' | 'OK';
  reason: string;
  macros: { calories: number; protein_g: number; fat_g: number; carbs_g: number; sugar_g: number };
}

type View = 'picker' | 'analyzing' | 'results';
const SCAN_STATE_KEY = 'nutritionell_scan_state_v1';

type PersistedScanState = {
  view: View;
  status: string;
  imageUrl: string;
  result: ShelfAnalysisResponse | null;
  selected: ProductItem | null;
  recommenderOn: boolean;
  recommendations: Record<string, Alternative[]>;
  errorMsg: string | null;
  detectedCount: number | null;
  progress: { done: number; total: number } | null;
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });

export default function ScanTab() {
  const [view, setView] = useState<View>('picker');
  const [status, setStatus] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [result, setResult] = useState<ShelfAnalysisResponse | null>(null);
  const [selected, setSelected] = useState<ProductItem | null>(null);
  const [imgEl, setImgEl] = useState<{ width: number; height: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [recommenderOn, setRecommenderOn] = useState(false);
  const [recommendations, setRecommendations] = useState<Record<string, Alternative[]>>({});
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showTransparency, setShowTransparency] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [detectedCount, setDetectedCount] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    setHasProfile(Boolean(getProfileId()));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCAN_STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as PersistedScanState;

      if (saved.view === 'analyzing') {
        // In-flight requests cannot survive a page refresh; restore safely.
        setView('picker');
        setImageUrl(saved.imageUrl ?? '');
        setErrorMsg('Your previous scan was interrupted by a page refresh. Please run the scan again.');
      } else {
        setView(saved.view ?? 'picker');
        setImageUrl(saved.imageUrl ?? '');
        setResult(saved.result ?? null);
        setSelected(saved.selected ?? null);
        setRecommenderOn(Boolean(saved.recommenderOn));
        setRecommendations(saved.recommendations ?? {});
        setErrorMsg(saved.errorMsg ?? null);
        setDetectedCount(saved.detectedCount ?? null);
        setProgress(saved.progress ?? null);
      }
      setStatus(saved.status ?? '');
    } catch {
      // Ignore malformed saved state.
    }
  }, []);

  useEffect(() => {
    const hasState =
      view !== 'picker' ||
      Boolean(imageUrl) ||
      Boolean(result) ||
      Boolean(errorMsg) ||
      Boolean(detectedCount) ||
      Boolean(progress);

    if (!hasState) {
      localStorage.removeItem(SCAN_STATE_KEY);
      return;
    }

    const payload: PersistedScanState = {
      view,
      status,
      imageUrl,
      result,
      selected,
      recommenderOn,
      recommendations,
      errorMsg,
      detectedCount,
      progress,
    };
    localStorage.setItem(SCAN_STATE_KEY, JSON.stringify(payload));
  }, [
    view,
    status,
    imageUrl,
    result,
    selected,
    recommenderOn,
    recommendations,
    errorMsg,
    detectedCount,
    progress,
  ]);

  const resetScanState = () => {
    setStatus('');
    setImageUrl('');
    setResult(null);
    setSelected(null);
    setImgEl(null);
    setRecommenderOn(false);
    setRecommendations({});
    setLoadingRecs(false);
    setDetectedCount(null);
    setProgress(null);
    setErrorMsg(null);
    setView('picker');
  };

  const analyze = async (file: File) => {
    const profileId = getProfileId();
    if (!profileId) {
      alert('Set up your profile first for personalised scoring.');
      return;
    }

    setErrorMsg(null);
    setView('analyzing');
    setStatus('Uploading image…');
    setDetectedCount(null);
    setProgress(null);
    const url = await fileToDataUrl(file).catch(() => URL.createObjectURL(file));
    setImageUrl(url);

    const makeForm = () => {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('profile_id', profileId);
      return fd;
    };

    // Plain (non-streaming) request — used for mock mode and as a fallback.
    const runPlain = async () => {
      setStatus('Identifying products…');
      const endpoint = USE_MOCK_ANALYZE ? ENDPOINTS.analyzeMock : ENDPOINTS.analyze;
      const r = await fetch(endpoint, { method: 'POST', body: makeForm() });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail ?? `Server ${r.status}`); }
      const data: ShelfAnalysisResponse = await r.json();
      setResult(data);
      setView('results');
    };

    try {
      if (USE_MOCK_ANALYZE) {
        await runPlain();
        return;
      }

      // Try the streaming endpoint for live progress; fall back to plain if the
      // endpoint isn't available (e.g. an older backend deploy).
      let streamed = false;
      try {
        setStatus('Uploading image…');
        const r = await fetch(ENDPOINTS.analyzeStream, { method: 'POST', body: makeForm() });
        if (!r.ok || !r.body) throw new Error('stream-unavailable');
        streamed = true;

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        setStatus('Detecting products…');
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n\n')) >= 0) {
            const raw = buf.slice(0, nl); buf = buf.slice(nl + 2);
            const line = raw.split('\n').find(l => l.startsWith('data:'));
            if (!line) continue;
            const ev = JSON.parse(line.slice(5).trim());
            if (ev.stage === 'detected') {
              setDetectedCount(ev.count);
              setProgress({ done: 0, total: ev.count });
              setStatus(ev.count ? `Found ${ev.count} product${ev.count === 1 ? '' : 's'} — collecting details…` : 'No products detected…');
            } else if (ev.stage === 'progress') {
              setProgress({ done: ev.done, total: ev.total });
              setStatus(`Collecting details — ${ev.done} of ${ev.total} products`);
            } else if (ev.stage === 'scoring') {
              setStatus('Scoring against your profile…');
            } else if (ev.stage === 'complete') {
              setResult(ev.result as ShelfAnalysisResponse);
              setView('results');
            } else if (ev.stage === 'error') {
              throw new Error(ev.detail ?? 'Analysis failed.');
            }
          }
        }
      } catch (streamErr: any) {
        // Only fall back if streaming itself was unavailable — not on a real
        // in-stream analysis error (which we surface to the user).
        if (streamed) throw streamErr;
        await runPlain();
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Unknown error';
      // A rate/quota/credit limit on the AI service surfaces as 429/503 or
      // "temporarily unavailable" / "resource exhausted".
      if (/\b429\b|\b503\b|quota|resource[_ ]?exhausted|temporarily unavailable|rate limit/i.test(msg)) {
        setErrorMsg('The AI service is busy or has hit its usage limit right now — this is usually a temporary API rate or credit limit, not your photo. Wait a moment and try again.');
      } else {
        setErrorMsg(`Analysis failed: ${msg}`);
      }
      setView('picker');
    }
  };

  const fetchRecommendations = async (products: ProductItem[]) => {
    const avoidProducts = products.filter(p => p.scoring === "Doesn't Fit");
    if (avoidProducts.length === 0) return;
    setLoadingRecs(true);
    try {
      const r = await fetch('/api/recommender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: avoidProducts }),
      });
      if (r.ok) {
        const data = await r.json();
        setRecommendations(data.recommendations ?? {});
      }
    } catch { /* silent — recommendations are optional */ }
    finally { setLoadingRecs(false); }
  };

  const handleRecommenderToggle = (on: boolean) => {
    setRecommenderOn(on);
    if (on && result && Object.keys(recommendations).length === 0) {
      fetchRecommendations(result.products);
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
    const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className={s.analyzing}>
        <div className={s.spinner} />
        <p className={s.analyzingTitle}>Analyzing shelf</p>
        {detectedCount != null && (
          <p className={s.detectedCount}>{detectedCount} product{detectedCount === 1 ? '' : 's'} detected</p>
        )}
        <p className={s.analyzingStatus}>{status}</p>
        {progress && progress.total > 0 && (
          <div className={s.progressWrap}>
            <div className={s.progressTrack}>
              <div className={s.progressFill} style={{ width: `${pct}%` }} />
            </div>
            <p className={s.progressLabel}>{progress.done} of {progress.total} products collected</p>
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
          {imgEl && result.products.map((p, i) => {
            const [ymin, xmin, ymax, xmax] = p.bounding_box;
            const color = SCORE_COLORS[p.scoring];
            return (
              <button key={i} className={s.bbox} onClick={() => setSelected(p)} style={{
                top: `${ymin * 100}%`, left: `${xmin * 100}%`,
                width: `${(xmax - xmin) * 100}%`, height: `${(ymax - ymin) * 100}%`,
                borderColor: color,
              }}>
                <span className={s.bboxBadge} style={{ background: color }}>{p.scoring[0]}</span>
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
          <button className={s.newScanBtn} onClick={resetScanState}>New scan</button>
        </div>

        {/* Score legend — what each score means, in addition to the Transparency Overview prompt */}
        <ScoreLegend />

        {/* Nutritional Vector Recommender Toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: '12px 16px', margin: '16px 0',
        }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              Enable Nutritional Vector Recommender
            </p>
            <p style={{ fontSize: 11, color: 'var(--sub)' }}>
              FAISS cosine similarity against USDA macros — suggests healthier alternatives for &quot;Doesn&apos;t Fit&quot; items
            </p>
          </div>
          <button
            onClick={() => handleRecommenderToggle(!recommenderOn)}
            style={{
              width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
              background: recommenderOn ? 'var(--accent)' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0, marginLeft: 12,
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 10, background: '#fff',
              position: 'absolute', top: 3,
              left: recommenderOn ? 25 : 3,
              transition: 'left 0.2s',
            }} />
          </button>
        </div>

        {recommenderOn && loadingRecs && (
          <p style={{ fontSize: 12, color: 'var(--sub)', textAlign: 'center', padding: 8 }}>Loading recommendations...</p>
        )}

        {recommenderOn && Object.keys(recommendations).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>
              Recommended Alternatives
            </p>
            {Object.entries(recommendations).map(([productName, alts]) => (
              <div key={productName} style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600, marginBottom: 6 }}>
                  Instead of: {productName}
                </p>
                {alts.map((alt, i) => (
                  <div key={i} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                    padding: 12, marginBottom: 6, borderLeft: `3px solid var(--green)`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {alt.brand} — {alt.product_name}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: 'var(--green)',
                        background: 'rgba(34,211,165,0.1)', padding: '2px 8px', borderRadius: 12,
                      }}>
                        {Math.round(alt.similarity_score * 100)}% match
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 6 }}>{alt.reason}</p>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--sub)' }}>
                      <span>{alt.macros.calories} cal</span>
                      <span>{alt.macros.protein_g}g protein</span>
                      <span>{alt.macros.fat_g}g fat</span>
                      <span>{alt.macros.carbs_g}g carbs</span>
                      <span>{alt.macros.sugar_g}g sugar</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

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

        {!hasProfile && (
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
