'use client';
import { useRef, useState } from 'react';
import { getProfile } from '@/lib/storage';
import type { ProductItem, ScoreEnum, ShelfAnalysisResponse } from '@/lib/types';
import { NOVA_COLORS, NOVA_LABELS, SCORE_BG, SCORE_COLORS } from '@/lib/types';
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

  const analyze = async (file: File) => {
    setView('analyzing');
    setStatus('Uploading image…');
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    try {
      const profile = getProfile();
      const fd = new FormData();
      fd.append('image', file);
      if (profile) fd.append('profile', JSON.stringify(profile));

      setStatus('Identifying products…');
      const r = await fetch('/api/analyze', { method: 'POST', body: fd });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? `Server ${r.status}`); }

      setStatus('Scoring against your profile…');
      const data: ShelfAnalysisResponse = await r.json();
      setResult(data);
      setView('results');
    } catch (e: any) {
      alert(`Analysis failed: ${e.message}`);
      setView('picker');
    }
  };

  const fetchRecommendations = async (products: ProductItem[]) => {
    const avoidProducts = products.filter(p => p.scoring === 'Avoid');
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
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
    analyze(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0] ?? null);
  };

  if (view === 'analyzing') {
    return (
      <div className={s.analyzing}>
        <div className={s.spinner} />
        <p className={s.analyzingTitle}>Analyzing shelf</p>
        <p className={s.analyzingStatus}>{status}</p>
      </div>
    );
  }

  if (view === 'results' && result) {
    const counts = result.products.reduce((acc, p) => {
      acc[p.scoring] = (acc[p.scoring] ?? 0) + 1; return acc;
    }, {} as Record<ScoreEnum, number>);

    return (
      <div className={s.resultsPage}>
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
          {(['Great', 'OK', 'Avoid', 'Unidentified'] as ScoreEnum[]).map(sc =>
            counts[sc] ? (
              <div key={sc} className={s.chip} style={{ borderColor: SCORE_COLORS[sc] }}>
                <span className={s.chipCount} style={{ color: SCORE_COLORS[sc] }}>{counts[sc]}</span>
                <span className={s.chipLabel}>{sc}</span>
              </div>
            ) : null
          )}
          <button className={s.newScanBtn} onClick={() => { setResult(null); setView('picker'); }}>New scan</button>
        </div>

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
              FAISS cosine similarity against USDA macros — suggests healthier alternatives for "Avoid" items
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

        {/* Drop zone */}
        <div className={s.dropZone}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}>
          <div className={s.dropIcon}>🖼️</div>
          <p className={s.dropTitle}>Drop an image here or click to upload</p>
          <p className={s.dropSub}>JPEG, PNG, WebP • Works best with a clear photo of a grocery shelf</p>
          <input ref={fileRef} type="file" accept="image/*" className={s.fileInput}
            onChange={e => handleFile(e.target.files?.[0] ?? null)} />
        </div>

        {/* Camera capture on mobile */}
        <button className={s.cameraBtn} onClick={() => {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
          input.onchange = () => handleFile(input.files?.[0] ?? null);
          input.click();
        }}>
          📷  Take a Photo
        </button>

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

        {!getProfile() && (
          <div className={s.warning}>⚠️ Set up your profile first for personalised scoring</div>
        )}
      </div>
    </div>
  );
}

function ProductRow({ product, onPress }: { product: ProductItem; onPress: () => void }) {
  const color = SCORE_COLORS[product.scoring];
  const bg = SCORE_BG[product.scoring];
  return (
    <button className={s.productRow} style={{ borderLeftColor: color }} onClick={onPress}>
      <div className={s.productTop}>
        <span className={s.scorePill} style={{ background: bg, borderColor: color, color }}>{product.scoring}</span>
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
        <span className={s.detailScore} style={{ color }}>{product.scoring}</span>
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
      <p className={s.detailBrand}>{product.brand}</p>
      <p className={s.detailName}>{product.product_name}</p>
      {nf.detected_ingredients.length > 0 && (
        <div className={s.detailSection}>
          <p className={s.detailSectionLabel}>Detected Ingredients</p>
          <p className={s.detailIngredients}>{nf.detected_ingredients.join(', ')}</p>
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
