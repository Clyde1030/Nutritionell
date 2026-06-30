'use client';
import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell,
} from 'recharts';
import s from './IngredientAnalyticsTab.module.css';
import usdaIngredientsData from '@/lib/datasets/usda-ingredients.json';

// ── Types ──

interface CooccurItem {
  ingredient: string;
  frequency: number;
  concern_level: 'low' | 'medium' | 'high';
}

interface CategoryItem {
  name: string;
  count: number;
  percentage: number;
}

interface ProductItem {
  name: string;
  brand: string;
  category: string;
}

interface NutrientProfile {
  avg_calories: number | null;
  avg_sugar_g: number | null;
  avg_fat_g: number | null;
  avg_protein_g: number | null;
  avg_sodium_mg: number | null;
  avg_fiber_g: number | null;
  sample_size: number;
}

interface TierBreakdown {
  level1: {
    score: number; weight: number; weighted_contribution: number;
    veto: boolean; trigger: string; data_available: boolean;
    profile: {
      banned_or_restricted: boolean; iarc_group: string;
      southampton_six: boolean; adi_restricted: boolean;
      adi_value?: string; regulatory_notes: string; data_available: boolean;
    };
  };
  level2: {
    score: number; weight: number; weighted_contribution: number;
    nova_level: number | null; nova_label: string; data_available: boolean;
  };
  level3: {
    score: number; weight: number; weighted_contribution: number;
    cspi_rating: string; cspi_label: string; data_available: boolean;
  };
  final_score: number; risk_label: string; vetoed: boolean;
  data_coverage?: { l1: boolean; l2: boolean; l3: boolean };
}

interface SafetyProfile {
  name: string; risk_score: number; risk_label: string; category: string;
  fda_status: string; daily_limit: string; facts: string[]; ai_summary: string;
  cooccurrences: CooccurItem[];
  categories?: CategoryItem[];
  products?: ProductItem[];
  nutrient_profile?: NutrientProfile;
  total_products_analyzed?: number;
  tier_breakdown?: TierBreakdown;
}

const QUICK_SEARCHES = [
  'Red 40', 'Carrageenan', 'Aspartame', 'BHA', 'Sodium Nitrite',
  'High Fructose Corn Syrup', 'Polysorbate 80', 'Titanium Dioxide',
  'Yellow 5', 'Sucralose', 'MSG', 'Potassium Bromate',
];

const TIER_COLORS = { l1: '#a78bfa', l2: '#38bdf8', l3: '#fb923c' };
const PIE_COLORS = ['#7c6aff', '#22d3a5', '#38bdf8', '#fb923c', '#ff5c7a', '#eab308', '#84cc16', '#e879f9', '#6b7280', '#f472b6', '#34d399', '#fbbf24', '#818cf8', '#a3e635', '#f87171'];

type CooccurView = 'ingredients' | 'categories' | 'products';
type DirectorySort = 'alpha' | 'frequency';
type DirectoryFilter = 'all' | 'common' | 'additives' | 'dyes' | 'sweeteners' | 'preservatives' | 'oils';

const USDA_INGREDIENTS: { name: string; frequency: number; prevalence_pct: number }[] = usdaIngredientsData.ingredients;

const FILTER_KEYWORDS: Record<DirectoryFilter, string[]> = {
  all: [],
  common: [],
  additives: ['gum', 'lecithin', 'starch', 'cellulose', 'polysorbate', 'monoglyceride', 'diglyceride', 'carrageenan', 'maltodextrin', 'dextrose', 'edta', 'phosphate', 'siloxane'],
  dyes: ['red ', 'yellow ', 'blue ', 'green ', 'caramel color', 'annatto', 'titanium dioxide', 'color'],
  sweeteners: ['sugar', 'syrup', 'aspartame', 'sucralose', 'saccharin', 'stevia', 'monk fruit', 'erythritol', 'xylitol', 'sorbitol', 'acesulfame', 'neotame', 'honey', 'fructose', 'dextrose', 'maltose'],
  preservatives: ['benzoate', 'sorbate', 'nitrite', 'nitrate', 'bha', 'bht', 'tbhq', 'sulfite', 'sulfur dioxide', 'propionate', 'tocopherol'],
  oils: ['oil', 'shortening', 'lard', 'tallow', 'butter'],
};

// ── Main Component ──

export default function IngredientAnalyticsTab() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SafetyProfile | null>(null);
  const [cooccurView, setCooccurView] = useState<CooccurView>('ingredients');
  const [dirFilter, setDirFilter] = useState<DirectoryFilter>('all');
  const [dirSort, setDirSort] = useState<DirectorySort>('frequency');
  const [dirSearch, setDirSearch] = useState('');
  const [dirPage, setDirPage] = useState(0);
  const DIR_PAGE_SIZE = 10;

  const filteredIngredients = useMemo(() => {
    let list = USDA_INGREDIENTS;
    if (dirFilter === 'common') {
      list = list.filter(i => i.prevalence_pct >= 1);
    } else if (dirFilter !== 'all') {
      const keywords = FILTER_KEYWORDS[dirFilter];
      list = list.filter(i => keywords.some(k => i.name.includes(k)));
    }
    if (dirSearch) {
      const q = dirSearch.toLowerCase();
      list = list.filter(i => i.name.includes(q));
    }
    if (dirSort === 'alpha') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [dirFilter, dirSort, dirSearch]);

  const clearSearch = () => {
    setResult(null);
    setQuery('');
  };

  const search = async (ingredient?: string) => {
    const term = (ingredient ?? query).trim();
    if (!term) return;
    setQuery(term);
    setLoading(true);
    setCooccurView('ingredients');
    try {
      const r = await fetch('/api/ingredient-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredient: term }),
      });
      if (!r.ok) throw new Error(`Server ${r.status}`);
      setResult(await r.json());
    } catch (e: any) {
      alert(`Search failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const riskColor = (score: number) =>
    score >= 70 ? 'var(--red)' : score >= 40 ? 'var(--yellow)' : 'var(--green)';
  const concernColor = (level: string) =>
    level === 'high' ? '#ef4444' : level === 'medium' ? '#eab308' : '#22c55e';
  const tierScoreColor = (score: number) =>
    score >= 80 ? '#ef4444' : score >= 50 ? '#eab308' : score >= 25 ? '#fb923c' : '#22c55e';

  if (loading) {
    return (
      <div className={s.page}>
        <div className={s.spinner} />
        <p className={s.loadingText}>Researching {query}...</p>
      </div>
    );
  }

  if (result) {
    const tb = result.tier_breakdown;
    const np = result.nutrient_profile;
    const cats = result.categories ?? [];
    const prods = result.products ?? [];

    // Build network graph bubbles for ingredients view
    const bubbles = result.cooccurrences.map((c, i) => {
      const angle = (i / result.cooccurrences.length) * 2 * Math.PI - Math.PI / 2;
      const radius = 120;
      return { ...c, cx: 200 + Math.cos(angle) * radius, cy: 180 + Math.sin(angle) * radius, r: 12 + c.frequency * 0.3 };
    });

    // Nutrient radar data
    const radarData = np ? [
      { metric: 'Calories', value: Math.min(100, (np.avg_calories ?? 0) / 4), raw: np.avg_calories },
      { metric: 'Sugar', value: Math.min(100, (np.avg_sugar_g ?? 0) * 2), raw: np.avg_sugar_g },
      { metric: 'Fat', value: Math.min(100, (np.avg_fat_g ?? 0) * 3), raw: np.avg_fat_g },
      { metric: 'Protein', value: Math.min(100, (np.avg_protein_g ?? 0) * 4), raw: np.avg_protein_g },
      { metric: 'Sodium', value: Math.min(100, (np.avg_sodium_mg ?? 0) / 10), raw: np.avg_sodium_mg },
      { metric: 'Fiber', value: Math.min(100, (np.avg_fiber_g ?? 0) * 10), raw: np.avg_fiber_g },
    ] : [];

    return (
      <div className={s.page}>
        <div className={s.header}>
          <h1 className={s.title}>Nutrition Analytics</h1>
          <p className={s.sub}>Research results for &ldquo;{result.name}&rdquo;
            {result.total_products_analyzed ? ` — ${result.total_products_analyzed} products analyzed from USDA` : ''}
          </p>
        </div>

        <div className={s.searchWrap}>
          <input className={s.searchInput} value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()} placeholder="Search another ingredient..." />
          <button className={s.searchBtn} onClick={() => search()}>Search</button>
          {result && <button className={s.searchBtn} onClick={clearSearch} style={{ background: 'var(--surface)', color: 'var(--sub)' }}>Clear</button>}
        </div>

        {/* ── Composite Score ── */}
        <div className={s.safetyCard}>
          <div className={s.safetyHeader}>
            <span className={s.safetyName}>{result.name}</span>
            <span style={{ fontSize: 12, color: 'var(--sub)', background: 'var(--surface)', padding: '4px 10px', borderRadius: 20 }}>{result.category}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 12 }}>Composite Concern Score</p>
          <div className={s.gaugeWrap}>
            <div className={s.gaugeTrack}>
              <div className={s.gaugeFill} style={{ width: `${result.risk_score}%`, background: riskColor(result.risk_score) }} />
            </div>
            <span className={s.gaugeLabel} style={{ color: riskColor(result.risk_score) }}>{result.risk_score}/100</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: riskColor(result.risk_score) }}>{result.risk_label}</span>
            {tb?.vetoed && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#ef4444', padding: '3px 10px', borderRadius: 12 }}>VETO — Score Locked at 100</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 12 }}>
              <p style={{ fontSize: 11, color: 'var(--sub)', marginBottom: 4 }}>FDA Status</p>
              <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{result.fda_status}</p>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 12 }}>
              <p style={{ fontSize: 11, color: 'var(--sub)', marginBottom: 4 }}>Daily Limit</p>
              <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{result.daily_limit}</p>
            </div>
          </div>
          {tb?.data_coverage && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--sub)' }}>Data sources:</span>
              {[
                { key: 'l1', label: 'IARC/FDA/EFSA', available: tb.data_coverage.l1 },
                { key: 'l2', label: 'NOVA', available: tb.data_coverage.l2 },
                { key: 'l3', label: 'CSPI', available: tb.data_coverage.l3 },
              ].map(src => (
                <span key={src.key} style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 10,
                  background: src.available ? 'rgba(34,211,165,0.1)' : 'rgba(245,158,11,0.1)',
                  color: src.available ? 'var(--green)' : 'var(--yellow)',
                  border: `1px solid ${src.available ? 'rgba(34,211,165,0.2)' : 'rgba(245,158,11,0.2)'}`,
                }}>
                  {src.available ? '✓' : '~'} {src.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Tier Breakdown ── */}
        {tb && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 20 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Scoring Breakdown</p>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                {!tb.vetoed ? (<>
                  <div style={{ width: `${tb.level1.weighted_contribution}%`, background: TIER_COLORS.l1 }} />
                  <div style={{ width: `${tb.level2.weighted_contribution}%`, background: TIER_COLORS.l2 }} />
                  <div style={{ width: `${tb.level3.weighted_contribution}%`, background: TIER_COLORS.l3 }} />
                  <div style={{ flex: 1, background: 'var(--surface)' }} />
                </>) : <div style={{ width: '100%', background: '#ef4444' }} />}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--sub)' }}>
                {[['l1', 'L1: Strict Science (50%)'], ['l2', 'L2: Processing (30%)'], ['l3', 'L3: Consumer (20%)']].map(([k, label]) => (
                  <span key={k}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: TIER_COLORS[k as keyof typeof TIER_COLORS], marginRight: 4 }} />{label}</span>
                ))}
              </div>
            </div>

            <TierRow color={TIER_COLORS.l1} level="Level 1" title="Strict Science" weight="50%" score={tb.level1.score}
              contribution={tb.vetoed ? 'VETO → 100' : `${tb.level1.weighted_contribution} pts`} veto={tb.level1.veto}
              explanation={getL1Explanation(tb.level1.score)}>
              <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.6 }}>
                <p style={{ marginBottom: 6 }}><strong style={{ color: 'var(--text)' }}>Trigger:</strong> {tb.level1.trigger}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <StatusPill label="EFSA/FDA" active={tb.level1.profile.banned_or_restricted} danger />
                  <StatusPill label={`IARC ${tb.level1.profile.iarc_group === 'not_evaluated' ? 'N/E' : tb.level1.profile.iarc_group}`}
                    active={['1', '2A', '2B'].includes(tb.level1.profile.iarc_group)} danger={['1', '2A'].includes(tb.level1.profile.iarc_group)} />
                  <StatusPill label="Southampton 6" active={tb.level1.profile.southampton_six} danger />
                  <StatusPill label="ADI Restricted" active={tb.level1.profile.adi_restricted} />
                </div>
                {tb.level1.profile.adi_value && <p style={{ marginTop: 6 }}>ADI: {tb.level1.profile.adi_value}</p>}
              </div>
            </TierRow>

            <TierRow color={TIER_COLORS.l2} level="Level 2" title="Processing (NOVA)" weight="30%" score={tb.level2.score}
              contribution={tb.vetoed ? 'Bypassed' : `${tb.level2.weighted_contribution} pts`} dimmed={tb.vetoed}
              explanation={getL2Explanation(tb.level2.score, tb.level2.nova_level)}>
              <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.6 }}>
                {tb.level2.nova_level !== null ? (<>
                  <p><strong style={{ color: 'var(--text)' }}>NOVA {tb.level2.nova_level}</strong> — {tb.level2.nova_label}</p>
                  <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                    {[1, 2, 3, 4].map(n => (
                      <div key={n} style={{ flex: 1, height: 6, borderRadius: 3, background: n <= (tb.level2.nova_level ?? 0) ? (n <= 1 ? '#22c55e' : n <= 2 ? '#84cc16' : n <= 3 ? '#eab308' : '#ef4444') : 'var(--surface)' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 4 }}><span>Unprocessed</span><span>Ultra-Processed</span></div>
                </>) : (
                  <p style={{ fontStyle: 'italic' }}>{tb.level2.nova_label}</p>
                )}
                {!tb.level2.data_available && <p style={{ fontSize: 10, color: 'var(--yellow)', marginTop: 6 }}>Default score (50) — no NOVA classification in dataset</p>}
              </div>
            </TierRow>

            <TierRow color={TIER_COLORS.l3} level="Level 3" title="Consumer Advocacy" weight="20%" score={tb.level3.score}
              contribution={tb.vetoed ? 'Bypassed' : `${tb.level3.weighted_contribution} pts`} dimmed={tb.vetoed}
              explanation={getL3Explanation(tb.level3.score, tb.level3.cspi_label)}>
              <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.6 }}>
                <p><strong style={{ color: 'var(--text)' }}>CSPI Chemical Cuisine:</strong>{' '}
                  <span style={{ color: tierScoreColor(tb.level3.score), fontWeight: 700 }}>&ldquo;{tb.level3.cspi_label}&rdquo;</span></p>
                <p style={{ marginTop: 4, fontSize: 11 }}>Source: Center for Science in the Public Interest</p>
                {!tb.level3.data_available && <p style={{ fontSize: 10, color: 'var(--yellow)', marginTop: 4 }}>Default score (30) — not rated by CSPI</p>}
              </div>
            </TierRow>

            <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 12, marginTop: 12, fontSize: 12, color: 'var(--sub)', fontFamily: 'monospace' }}>
              {tb.vetoed
                ? <p>Level 1 triggered <span style={{ color: '#ef4444', fontWeight: 700 }}>VETO</span> → Final Score locked at <strong style={{ color: '#ef4444' }}>100</strong></p>
                : <p>Score = ({tb.level1.score} × 0.50) + ({tb.level2.score} × 0.30) + ({tb.level3.score} × 0.20) = <strong style={{ color: riskColor(tb.final_score) }}>{tb.final_score}</strong></p>
              }
            </div>
          </div>
        )}

        {/* ── Nutrient Profile ── */}
        {np && np.sample_size > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
                Average Nutrient Profile
              </p>
              <p style={{ fontSize: 11, color: 'var(--sub)', marginBottom: 12 }}>
                Across {np.sample_size} products containing this ingredient (per 100g)
              </p>
              {[
                { label: 'Calories', value: np.avg_calories, unit: 'kcal', color: '#7c6aff' },
                { label: 'Sugar', value: np.avg_sugar_g, unit: 'g', color: '#ff5c7a' },
                { label: 'Total Fat', value: np.avg_fat_g, unit: 'g', color: '#eab308' },
                { label: 'Protein', value: np.avg_protein_g, unit: 'g', color: '#22d3a5' },
                { label: 'Sodium', value: np.avg_sodium_mg, unit: 'mg', color: '#fb923c' },
                { label: 'Fiber', value: np.avg_fiber_g, unit: 'g', color: '#38bdf8' },
              ].map(n => (
                <div key={n.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{n.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: n.color }}>{n.value !== null ? `${n.value} ${n.unit}` : '—'}</span>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Nutrient Radar</p>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#1f1f2e" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#9896b0', fontSize: 11 }} />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Radar name="Profile" dataKey="value" stroke="#7c6aff" fill="#7c6aff" fillOpacity={0.25} />
                  <Tooltip contentStyle={{ background: '#111118', border: '1px solid #1f1f2e', borderRadius: 8, color: '#f1f0ff', fontSize: 12 }}
                    formatter={(_: any, __: any, props: any) => {
                      const d = props.payload;
                      const unit = d.metric === 'Calories' ? 'kcal' : d.metric === 'Sodium' ? 'mg' : 'g';
                      return [`${d.raw ?? '—'} ${unit}`, d.metric];
                    }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Co-occurrence Section with Toggle ── */}
        {(result.cooccurrences.length > 0 || cats.length > 0) && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                {cooccurView === 'ingredients' ? 'Ingredient Co-occurrence' : cooccurView === 'categories' ? 'Product Category Distribution' : 'Products Containing This Ingredient'}
              </p>
              <div style={{ display: 'flex', gap: 4 }}>
                {([['ingredients', 'Ingredients'], ['categories', 'Categories'], ['products', 'Products']] as [CooccurView, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => setCooccurView(key)} style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    background: cooccurView === key ? 'var(--accent)' : 'var(--surface)',
                    color: cooccurView === key ? '#fff' : 'var(--sub)',
                    transition: 'all 0.15s',
                  }}>{label}</button>
                ))}
              </div>
            </div>

            {/* Ingredients View */}
            {cooccurView === 'ingredients' && result.cooccurrences.length > 0 && (
              <>
                <svg viewBox="0 0 400 360" className={s.networkSvg}>
                  {bubbles.map((b, i) => (
                    <line key={`l${i}`} x1={200} y1={180} x2={b.cx} y2={b.cy} stroke={concernColor(b.concern_level)} strokeWidth={1} strokeOpacity={0.3} />
                  ))}
                  <circle cx={200} cy={180} r={24} fill="var(--accent)" fillOpacity={0.3} stroke="var(--accent)" strokeWidth={2} />
                  <text x={200} y={184} textAnchor="middle" fill="var(--text)" fontSize={9} fontWeight={700}>
                    {result.name.length > 12 ? result.name.slice(0, 10) + '...' : result.name}
                  </text>
                  {bubbles.map((b, i) => (
                    <g key={`b${i}`}>
                      <circle cx={b.cx} cy={b.cy} r={b.r} fill={concernColor(b.concern_level)} fillOpacity={0.2} stroke={concernColor(b.concern_level)} strokeWidth={1.5} />
                      <text x={b.cx} y={b.cy + 3} textAnchor="middle" fill="var(--text)" fontSize={8}>
                        {b.ingredient.length > 14 ? b.ingredient.slice(0, 12) + '..' : b.ingredient}
                      </text>
                    </g>
                  ))}
                </svg>
                <div className={s.cooccurList}>
                  {result.cooccurrences.map((c, i) => (
                    <div key={i} className={s.cooccurItem}>
                      <span className={s.cooccurName}>{c.ingredient}</span>
                      <div className={s.cooccurBar}>
                        <div className={s.cooccurTrack}><div className={s.cooccurFill} style={{ width: `${c.frequency}%`, background: concernColor(c.concern_level) }} /></div>
                        <span className={s.cooccurPct}>{c.frequency}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 10, color: 'var(--sub)', marginTop: 8 }}>Source: USDA FoodData Central — co-occurrence frequency across {result.total_products_analyzed ?? '?'} branded products</p>
              </>
            )}

            {/* Categories View */}
            {cooccurView === 'categories' && cats.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={cats.slice(0, 10)} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={50} paddingAngle={2} label={false}>
                        {cats.slice(0, 10).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#111118', border: '1px solid #1f1f2e', borderRadius: 8, color: '#f1f0ff', fontSize: 12 }}
                        formatter={(value: any, name: any) => [`${value} products`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  {cats.map((cat, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{cat.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--sub)', minWidth: 50, textAlign: 'right' }}>{cat.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Products View */}
            {cooccurView === 'products' && prods.length > 0 && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, padding: '8px 0', borderBottom: '2px solid var(--border)', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase' }}>Product</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase' }}>Brand</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase' }}>Category</span>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {prods.map((p, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{p.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--sub)' }}>{p.brand}</span>
                      <span style={{ fontSize: 11, color: 'var(--sub)' }}>{p.category}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 10, color: 'var(--sub)', marginTop: 8 }}>Showing {prods.length} of {result.total_products_analyzed ?? '?'} products from USDA FoodData Central</p>
              </div>
            )}
          </div>
        )}

        {/* ── Category Bar Chart ── */}
        {cats.length > 0 && cooccurView !== 'categories' && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Where This Ingredient Is Found</p>
            <ResponsiveContainer width="100%" height={Math.max(200, cats.length * 32)}>
              <BarChart data={cats.slice(0, 10)} layout="vertical" margin={{ left: 120 }}>
                <XAxis type="number" tick={{ fill: '#9896b0', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9896b0', fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip contentStyle={{ background: '#111118', border: '1px solid #1f1f2e', borderRadius: 8, color: '#f1f0ff', fontSize: 12 }}
                  formatter={(value: any) => [`${value} products`, 'Count']} />
                <Bar dataKey="count" fill="#7c6aff" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Key Facts ── */}
        <div className={s.safetyCard} style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Key Facts</p>
          <ul className={s.factList}>
            {result.facts.map((fact, i) => <li key={i} className={s.factItem}><span className={s.factIcon}>•</span>{fact}</li>)}
          </ul>
        </div>

        {/* ── AI Summary ── */}
        <div className={s.aiCard}>
          <p className={s.aiTitle}>AI Safety Summary</p>
          <p className={s.aiText}>{result.ai_summary}</p>
        </div>
      </div>
    );
  }

  // ── Ingredient Directory (empty state) ──
  const pagedIngredients = filteredIngredients.slice(dirPage * DIR_PAGE_SIZE, (dirPage + 1) * DIR_PAGE_SIZE);
  const totalPages = Math.ceil(filteredIngredients.length / DIR_PAGE_SIZE);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Nutrition Analytics</h1>
        <p className={s.sub}>
          Research any food ingredient — get its safety profile, FDA status, biological impact, and discover what other processed ingredients commonly appear alongside it.
        </p>
      </div>
      <div className={s.searchWrap}>
        <input className={s.searchInput} value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()} placeholder='Search an ingredient (e.g. "Red 40", "Carrageenan")' />
        <button className={s.searchBtn} onClick={() => search()}>Search</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 10 }}>Popular searches</p>
      <div className={s.quickChips}>
        {QUICK_SEARCHES.map(q => <button key={q} className={s.chip} onClick={() => search(q)}>{q}</button>)}
      </div>

      {/* ── Ingredient Directory ── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Ingredient Directory</p>
            <p style={{ fontSize: 11, color: 'var(--sub)' }}>
              {USDA_INGREDIENTS.length} ingredients from USDA FoodData Central — click any to analyze
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--sub)' }}>Sort:</span>
            {(['frequency', 'alpha'] as DirectorySort[]).map(s => (
              <button key={s} onClick={() => { setDirSort(s); setDirPage(0); }} style={{
                padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: dirSort === s ? 'var(--accent)' : 'var(--surface)', color: dirSort === s ? '#fff' : 'var(--sub)',
              }}>{s === 'frequency' ? 'Most Common' : 'A → Z'}</button>
            ))}
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {([
            ['all', 'All'], ['common', 'Common (≥1%)'], ['additives', 'Additives'],
            ['dyes', 'Dyes & Colors'], ['sweeteners', 'Sweeteners'], ['preservatives', 'Preservatives'], ['oils', 'Fats & Oils'],
          ] as [DirectoryFilter, string][]).map(([key, label]) => (
            <button key={key} onClick={() => { setDirFilter(key); setDirPage(0); }} style={{
              padding: '5px 12px', borderRadius: 20, border: '1px solid',
              borderColor: dirFilter === key ? 'var(--accent)' : 'var(--border)',
              background: dirFilter === key ? 'var(--accent-glow)' : 'transparent',
              color: dirFilter === key ? 'var(--accent)' : 'var(--sub)',
              cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>

        {/* Directory search */}
        <input
          value={dirSearch}
          onChange={e => { setDirSearch(e.target.value); setDirPage(0); }}
          placeholder="Filter ingredients..."
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: 13, outline: 'none', marginBottom: 12,
          }}
        />

        <p style={{ fontSize: 11, color: 'var(--sub)', marginBottom: 8 }}>
          Showing {filteredIngredients.length} ingredients
          {dirFilter !== 'all' || dirSearch ? ' (filtered)' : ''}
        </p>

        {/* Ingredient grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
          {pagedIngredients.map((ing, i) => {
            const barWidth = Math.max(4, Math.min(100, ing.prevalence_pct * 8));
            return (
              <button key={i} onClick={() => search(ing.name)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-glow)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ing.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <div style={{ width: 60, height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${barWidth}%`, height: '100%', background: ing.prevalence_pct >= 5 ? '#7c6aff' : ing.prevalence_pct >= 1 ? '#38bdf8' : 'var(--sub)', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--sub)' }}>{ing.prevalence_pct}%</span>
                  </div>
                </div>
                <span style={{ fontSize: 14, color: 'var(--sub)', flexShrink: 0 }}>→</span>
              </button>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <button onClick={() => setDirPage(Math.max(0, dirPage - 1))} disabled={dirPage === 0}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: dirPage === 0 ? 'var(--border)' : 'var(--text)', cursor: dirPage === 0 ? 'default' : 'pointer', fontSize: 12 }}>
              Previous
            </button>
            <span style={{ fontSize: 12, color: 'var(--sub)' }}>
              Page {dirPage + 1} of {totalPages}
            </span>
            <button onClick={() => setDirPage(Math.min(totalPages - 1, dirPage + 1))} disabled={dirPage >= totalPages - 1}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: dirPage >= totalPages - 1 ? 'var(--border)' : 'var(--text)', cursor: dirPage >= totalPages - 1 ? 'default' : 'pointer', fontSize: 12 }}>
              Next
            </button>
          </div>
        )}

        <p style={{ fontSize: 10, color: 'var(--sub)', marginTop: 12, textAlign: 'center' }}>
          Source: USDA FoodData Central — extracted from {usdaIngredientsData._meta.sample_size.toLocaleString()} branded products.
          Prevalence = % of sampled products containing this ingredient.
        </p>
      </div>
    </div>
  );
}

// ── Dictionary-based explanations ──

const L1_EXPLANATIONS: Record<number, string> = {
  100: 'Banned or restricted by FDA/EFSA, or classified IARC Group 1 (carcinogenic to humans) or Group 2A (probably carcinogenic). Final score is locked at 100.',
  80: 'On the EU "Southampton Six" list. Products containing this ingredient must carry the label: "may have an adverse effect on activity and attention in children."',
  50: 'Has a restricted Acceptable Daily Intake (ADI) — regulators set a low daily limit, meaning safety margins are tight.',
  40: 'Classified IARC Group 2B — "possibly carcinogenic to humans." Limited evidence in humans, less than sufficient in animals.',
  0: 'No regulatory flags. FDA GRAS or IARC Group 3 (not classifiable as carcinogenic). Other levels still apply.',
};
const L2_EXPLANATIONS: Record<string, string> = {
  'null': 'No NOVA classification available for this ingredient. NOVA classifies whole foods, not individual additives. Default score of 50 applied.',
  '1': 'NOVA 1 — Unprocessed or minimally processed. Exists in nature in roughly the same form.',
  '2': 'NOVA 2 — Processed culinary ingredient. Extracted from whole foods via pressing, refining, or milling.',
  '3': 'NOVA 3 — Processed food ingredient. Made by combining NOVA 1/2 items with preservation or fermentation methods.',
  '4': 'NOVA 4 — Ultra-processed substance. Industrial formulation made through chemical processes like hydrogenation, hydrolysis, or extrusion.',
};
const L3_EXPLANATIONS: Record<string, string> = {
  'Safe': 'CSPI "Safe" — No significant health concerns found in their independent review of the scientific literature.',
  'Cut Back': 'CSPI "Cut Back" — Not dangerous, but most people consume too much. Concern is about quantity, not toxicity.',
  'Caution': 'CSPI "Caution" — Some studies raise concerns, but evidence is not strong enough for a full "Avoid" recommendation.',
  'Certain People Should Avoid': 'CSPI "Certain People Should Avoid" — Generally tolerable, but specific populations (e.g., PKU, sulfite-sensitive) should not consume.',
  'Avoid': 'CSPI "Avoid" — Sufficient evidence of health risks. CSPI recommends consumers actively avoid this ingredient.',
  'Not Rated by CSPI': 'Not in the CSPI Chemical Cuisine database. Default score of 30 applied.',
};

function getL1Explanation(score: number): string { return L1_EXPLANATIONS[score] ?? L1_EXPLANATIONS[0]; }
function getL2Explanation(_s: number, novaLevel: number | null): string { return L2_EXPLANATIONS[String(novaLevel)] ?? L2_EXPLANATIONS['null']; }
function getL3Explanation(_s: number, cspiLabel: string): string { return L3_EXPLANATIONS[cspiLabel] ?? L3_EXPLANATIONS['Not Rated by CSPI']; }

// ── Sub-components ──

function TierRow({ color, level, title, weight, score, contribution, veto, dimmed, explanation, children }: {
  color: string; level: string; title: string; weight: string;
  score: number; contribution: string; veto?: boolean; dimmed?: boolean;
  explanation: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const scoreColor = score >= 80 ? '#ef4444' : score >= 50 ? '#eab308' : score >= 25 ? '#fb923c' : '#22c55e';
  return (
    <div style={{
      borderLeft: `3px solid ${color}`, borderRadius: '0 8px 8px 0',
      padding: '14px 16px', marginBottom: 12, background: 'var(--surface)',
      opacity: dimmed ? 0.5 : 1, transition: 'opacity 0.3s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{level}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
          <span style={{ fontSize: 10, color: 'var(--sub)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{weight}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {veto && <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: 10 }}>VETO</span>}
          <span style={{ fontSize: 18, fontWeight: 800, color: scoreColor }}>{score}</span>
          <span style={{ fontSize: 11, color: 'var(--sub)' }}>→ {contribution}</span>
        </div>
      </div>
      {children}
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 10,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        fontSize: 12, color: 'var(--accent)', fontWeight: 600,
      }}>
        <span style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>&#9654;</span>
        What does this score mean?
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}>
          {explanation}
        </div>
      )}
    </div>
  );
}

function StatusPill({ label, active, danger }: { label: string; active: boolean; danger?: boolean }) {
  const bg = !active ? 'var(--bg)' : danger ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)';
  const color = !active ? 'var(--sub)' : danger ? '#ef4444' : '#eab308';
  const border = !active ? 'var(--border)' : danger ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.3)';
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: bg, color, border: `1px solid ${border}` }}>
      {active ? '⚠ ' : '✓ '}{label}
    </span>
  );
}
