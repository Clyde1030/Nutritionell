'use client';
import { useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import s from './GreenwashingTab.module.css';

interface ClaimVerdict {
  claim: string;
  verified: boolean;
  explanation: string;
}

interface GreenwashResult {
  product_name: string;
  overall_score: number;
  verdict: string;
  claims: ClaimVerdict[];
  hidden_concerns: string[];
  marketing_vs_reality: { category: string; marketed: number; actual: number }[];
  radar_data: { metric: string; claimed: number; actual: number }[];
}

type View = 'upload' | 'analyzing' | 'results';

export default function GreenwashingTab() {
  const [view, setView] = useState<View>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [result, setResult] = useState<GreenwashResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const analyze = async (file: File) => {
    setView('analyzing');
    setImageUrl(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await fetch('/api/greenwashing', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(`Server ${r.status}`);
      setResult(await r.json());
      setView('results');
    } catch (e: any) {
      alert(`Analysis failed: ${e.message}`);
      setView('upload');
    }
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
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

  if (view === 'results' && result) {
    const scoreColor = result.overall_score >= 70 ? 'var(--green)' : result.overall_score >= 40 ? 'var(--yellow)' : 'var(--red)';
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
            <span className={s.verdictScore} style={{ color: scoreColor }}>{result.overall_score}/100</span>
          </div>
          <div style={{ height: 8, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', width: `${result.overall_score}%`, background: scoreColor, borderRadius: 4, transition: 'width 0.6s ease' }} />
          </div>
          <p className={s.verdictText}>{result.verdict}</p>
        </div>

        <div className={s.section}>
          <p className={s.sectionTitle}>Claim Verification</p>
          {result.claims.map((c, i) => (
            <div key={i} className={s.claimCard}>
              <span className={s.claimLabel}>{c.claim}</span>
              <span className={s.claimStatus} style={{
                background: c.verified ? 'rgba(34,211,165,0.15)' : 'rgba(255,92,122,0.15)',
                color: c.verified ? 'var(--green)' : 'var(--red)',
              }}>
                {c.verified ? 'Verified' : 'Misleading'}
              </span>
            </div>
          ))}
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
          Upload a photo of a product's front label to compare its marketing claims against actual ingredient data from USDA and Open Food Facts.
        </p>
      </div>

      <div
        className={s.uploadZone}
        onClick={() => fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0] ?? null); }}
        onDragOver={e => e.preventDefault()}
      >
        <div className={s.uploadIcon}>🔍</div>
        <p className={s.uploadTitle}>Drop a product image or click to upload</p>
        <p className={s.uploadSub}>Upload the front of a product showing marketing claims like "All Natural", "Keto", "No Added Sugar"</p>
        <input ref={fileRef} type="file" accept="image/*" className={s.fileInput} onChange={e => handleFile(e.target.files?.[0] ?? null)} />
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
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
    </div>
  );
}
