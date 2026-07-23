'use client';
import { useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import GreenwashingTransparency from './GreenwashingTransparency';
import { ENDPOINTS } from '@/lib/api';
import s from './GreenwashingTab.module.css';

interface ClaimVerdict {
  claim: string;
  verdict: 'true' | 'false' | 'misleading';
  explanation: string;
}

interface ScoreBreakdown {
  false_claim_count: number;
  misleading_claim_count: number;
  hidden_concern_count: number;
  nutrition_gap_count: number;
  total_deduction: number;
  final_score: number;
}

interface GreenwashResult {
  image_status: 'single_product' | 'multiple_products' | 'unidentifiable';
  status_detail: string;
  product_name: string | null;
  overall_score: number | null;
  score_breakdown: ScoreBreakdown | null;
  verdict: string;
  claims: ClaimVerdict[];
  hidden_concerns: string[];
  marketing_vs_reality: { category: string; marketed: number; actual: number; diverges?: boolean }[];
  radar_data: { metric: string; claimed: number; actual: number }[];
}

const CLAIM_STYLES: Record<ClaimVerdict['verdict'], { label: string; bg: string; color: string }> = {
  true: { label: 'True', bg: 'rgba(34,211,165,0.15)', color: 'var(--green)' },
  false: { label: 'False', bg: 'rgba(255,92,122,0.15)', color: 'var(--red)' },
  misleading: { label: 'Misleading', bg: 'rgba(234,179,8,0.15)', color: 'var(--yellow)' },
};

type View = 'upload' | 'analyzing' | 'results';

export default function GreenwashingTab() {
  const [view, setView] = useState<View>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [result, setResult] = useState<GreenwashResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showTransparency, setShowTransparency] = useState(false);

  const analyze = async (file: File) => {
    setView('analyzing');
    setImageUrl(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await fetch(ENDPOINTS.greenwashingAnalyze, { method: 'POST', body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail ?? data.error ?? `Server ${r.status}`);
      setResult(data);
      setView('results');
    } catch (e: any) {
      alert(e.message ?? 'Analysis failed.');
      setView('upload');
    }
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    const ok = file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name);
    if (!ok) { alert('Please select an image file (JPEG, PNG, or an iPhone photo).'); return; }
    analyze(file);
  };

  if (view === 'analyzing') {
    return (
      <div className={s.page}>
        <div className={s.spinner} />
        <p className={s.loadingText}>Analyzing marketing claims against ingredient reality...</p>
      </div>
    );
  }

  if (view === 'results' && result && result.image_status !== 'single_product') {
    return (
      <div className={s.page}>
        <div className={s.header}>
          <h1 className={s.title}>Couldn&apos;t score this photo</h1>
        </div>
        <div className={s.singleItemNote}>
          {result.image_status === 'multiple_products' ? '📦' : '❓'}{' '}
          <strong>{result.image_status === 'multiple_products' ? 'Multiple products detected.' : 'Product not identified.'}</strong>{' '}
          {result.status_detail || (result.image_status === 'multiple_products'
            ? 'This photo shows more than one product — photograph one product at a time for an accurate Honesty Score.'
            : "We couldn't confidently identify a packaged food product in this photo.")}
        </div>
        {imageUrl && (
          <div className={s.previewWrap}>
            <img src={imageUrl} alt="Uploaded" className={s.previewImg} />
          </div>
        )}
        <button className={s.newBtn} onClick={() => { setResult(null); setImageUrl(''); setView('upload'); }}>
          Try Another Photo
        </button>
      </div>
    );
  }

  if (view === 'results' && result && result.overall_score != null) {
    const overallScore = result.overall_score;
    const scoreColor = overallScore >= 70 ? 'var(--green)' : overallScore >= 40 ? 'var(--yellow)' : 'var(--red)';
    return (
      <div className={s.page}>
        <div className={s.header}>
          <h1 className={s.title}>Greenwashing Analysis</h1>
          <p className={s.sub}>{result.product_name}</p>
        </div>

        {imageUrl && (
          <div className={s.previewWrap}>
            <img src={imageUrl} alt="Product" className={s.previewImg} />
          </div>
        )}

        <div className={s.verdictCard}>
          <div className={s.verdictRow}>
            <span className={s.verdictLabel}>Honesty Score</span>
            <span className={s.verdictScore} style={{ color: scoreColor }}>{overallScore}/100</span>
          </div>
          <div style={{ height: 8, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', width: `${overallScore}%`, background: scoreColor, borderRadius: 4, transition: 'width 0.6s ease' }} />
          </div>
          <p className={s.verdictText}>{result.verdict}</p>
        </div>

        {/* How We Calculate This — the actual deterministic formula + score bands, in
            addition to the Transparency Overview's exact-prompt view (reachable from
            the upload screen) */}
        <div className={s.methodCard}>
          <p className={s.methodTitle}>How we calculate this</p>
          <p className={s.methodIntro}>
            The Honesty Score is a fixed, repeatable formula, not a subjective AI judgment —
            the same product should score the same way every time.
          </p>
          {result.score_breakdown && (
            <div className={s.transparencyBox} style={{ marginBottom: 12 }}>
              <div className={s.factsRow}><span>Starting score</span><span>100</span></div>
              <div className={s.factsRow}><span>False claims × 15</span><span>−{result.score_breakdown.false_claim_count * 15}</span></div>
              <div className={s.factsRow}><span>Misleading claims × 8</span><span>−{result.score_breakdown.misleading_claim_count * 8}</span></div>
              <div className={s.factsRow}><span>Hidden concerns × 5 (max 3)</span><span>−{Math.min(result.score_breakdown.hidden_concern_count, 3) * 5}</span></div>
              <div className={s.factsRow}><span>Nutrition gaps × 5 (max 4)</span><span>−{Math.min(result.score_breakdown.nutrition_gap_count, 4) * 5}</span></div>
              <div className={s.factsRowBold}><span>Final score</span><span>{result.score_breakdown.final_score}</span></div>
            </div>
          )}
          <div className={s.methodRow}>
            <span className={s.methodDot} style={{ background: '#7c6aff' }} />
            <div>
              <p className={s.methodLabel}>Claim verification</p>
              <p className={s.methodDesc}>Each front-of-pack marketing claim (e.g. &quot;All Natural&quot;) is classified as true, false, or misleading against the actual ingredients and nutrition panel — −15 per false claim, −8 per misleading claim.</p>
            </div>
          </div>
          <div className={s.methodRow}>
            <span className={s.methodDot} style={{ background: '#ff5c7a' }} />
            <div>
              <p className={s.methodLabel}>Marketing vs. reality gap</p>
              <p className={s.methodDesc}>Nutrition metrics where the actual amount diverges &gt;20% from what the front label implies — −5 per gap, up to 4 counted.</p>
            </div>
          </div>
          <div className={s.methodRow}>
            <span className={s.methodDot} style={{ background: 'var(--yellow)' }} />
            <div>
              <p className={s.methodLabel}>Hidden concerns</p>
              <p className={s.methodDesc}>Things a shopper would likely miss from the front label alone — −5 per concern, up to 3 counted.</p>
            </div>
          </div>
          <p className={s.methodBandsLabel}>Score bands</p>
          <div className={s.methodBand}><span className={s.methodBandDot} style={{ background: 'var(--green)' }} />70–100 · Marketing mostly matches reality</div>
          <div className={s.methodBand}><span className={s.methodBandDot} style={{ background: 'var(--yellow)' }} />40–69 · Some claims are misleading</div>
          <div className={s.methodBand}><span className={s.methodBandDot} style={{ background: 'var(--red)' }} />0–39 · Marketing is significantly misleading</div>
        </div>

        <div className={s.section}>
          <p className={s.sectionTitle}>Claim Verification</p>
          {result.claims.map((c, i) => {
            const style = CLAIM_STYLES[c.verdict] ?? CLAIM_STYLES.misleading;
            return (
              <div key={i} className={s.claimCard} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={s.claimLabel}>{c.claim}</span>
                  <span className={s.claimStatus} style={{ background: style.bg, color: style.color }}>
                    {style.label}
                  </span>
                </div>
                {c.explanation && <p className={s.methodDesc}>{c.explanation}</p>}
              </div>
            );
          })}
        </div>

        <div className={s.chartWrap}>
          <p className={s.chartTitle}>Marketing Claims vs. Actual Composition</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={result.marketing_vs_reality} barGap={4}>
              <XAxis dataKey="category" tick={{ fill: '#9896b0', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9896b0', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#111118', border: '1px solid #1f1f2e', borderRadius: 8, color: '#f1f0ff', fontSize: 12 }} />
              <Bar dataKey="marketed" fill="#7c6aff" name="Marketed" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" fill="#ff5c7a" name="Actual" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={s.chartWrap}>
          <p className={s.chartTitle}>Nutritional Radar: Claimed vs Actual</p>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={result.radar_data}>
              <PolarGrid stroke="#1f1f2e" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#9896b0', fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: '#9896b0', fontSize: 10 }} />
              <Radar name="Claimed" dataKey="claimed" stroke="#7c6aff" fill="#7c6aff" fillOpacity={0.2} />
              <Radar name="Actual" dataKey="actual" stroke="#ff5c7a" fill="#ff5c7a" fillOpacity={0.2} />
              <Tooltip contentStyle={{ background: '#111118', border: '1px solid #1f1f2e', borderRadius: 8, color: '#f1f0ff', fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {result.hidden_concerns.length > 0 && (
          <div className={s.section}>
            <p className={s.sectionTitle}>Hidden Concerns</p>
            {result.hidden_concerns.map((c, i) => (
              <div key={i} className={s.insightCard}>
                <p className={s.insightText}>{c}</p>
              </div>
            ))}
          </div>
        )}

        <button className={s.newBtn} onClick={() => { setResult(null); setImageUrl(''); setView('upload'); }}>
          Analyze Another Product
        </button>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Greenwashing Detection</h1>
        <p className={s.sub}>
          Upload a photo of a single product&apos;s front label. The AI reads its marketing claims and checks them against the product&apos;s actual ingredients and nutrition.
        </p>
      </div>

      <div className={s.singleItemNote}>
        📸 <strong>One product at a time.</strong> This check sends a single item straight to the AI — no shelf scanning — so frame just one product&apos;s front label for the most accurate read.
      </div>

      <div
        className={s.uploadZone}
        onClick={() => fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0] ?? null); }}
        onDragOver={e => e.preventDefault()}
      >
        <div className={s.uploadIcon}>🔍</div>
        <p className={s.uploadTitle}>Drop a single product image or click to upload</p>
        <p className={s.uploadSub}>Show the front of one product with its marketing claims like &quot;All Natural&quot;, &quot;Keto&quot;, or &quot;No Added Sugar&quot;</p>
        <input ref={fileRef} type="file" accept="image/*,.heic,.heif" className={s.fileInput} onChange={e => handleFile(e.target.files?.[0] ?? null)} />
      </div>

      {/* Transparency + privacy */}
      <button className={s.transparencyBtn} onClick={() => setShowTransparency(true)}>
        🔎  Transparency Overview — see exactly what we send before you check
      </button>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginTop: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>What This Detects</p>
        {[
          ['🏷️', 'False "Natural" claims', 'Products marketed as natural but containing synthetic additives'],
          ['📊', 'Hidden sugar patterns', 'Foods labeled "healthy" with statistically anomalous sugar content'],
          ['🧪', 'Ingredient misrepresentation', 'Marketing that obscures ultra-processed ingredients'],
          ['⚖️', 'Regulatory gaps', 'Claims that exploit loose FDA labeling regulations'],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</p>
              <p style={{ fontSize: 12, color: 'var(--sub)' }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {showTransparency && <GreenwashingTransparency onClose={() => setShowTransparency(false)} />}
    </div>
  );
}
