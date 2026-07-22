/**
 * 3-tier ingredient concern scoring, backed by authoritative datasets:
 *   Level 1 (50%, can veto) — IARC carcinogenicity, EFSA/FDA bans, EU "Southampton Six",
 *                             and JECFA/EFSA Acceptable Daily Intake (ADI) limits.
 *   Level 2 (30%)           — NOVA processing classification.
 *   Level 3 (20%)           — CSPI "Chemical Cuisine" consumer rating.
 *
 * When NONE of the datasets contain the ingredient we return `insufficient_data: true`
 * so the UI can say "not enough data to score" instead of a misleadingly low number.
 */
import iarc from './datasets/iarc-classifications.json';
import banned from './datasets/fda-efsa-banned.json';
import adiData from './datasets/adi-values.json';
import cspi from './datasets/cspi-chemical-cuisine.json';
import nova from './datasets/nova-classifications.json';

export interface Findings {
  iarc_group: '1' | '2A' | '2B' | '3' | null;
  iarc_label: string | null;
  banned: { jurisdiction: string; action: string; year?: number } | null;
  southampton_six: boolean;
  adi: { value: string; source: string } | null;
  cspi_rating: string | null;
  cspi_notes: string | null;
  nova_level: number | null;
  nova_label: string | null;
}

export interface TierBreakdown {
  level1: {
    score: number; weight: number; weighted_contribution: number;
    veto: boolean; trigger: string; data_available: boolean;
    profile: {
      banned_or_restricted: boolean; iarc_group: string;
      southampton_six: boolean; adi_restricted: boolean;
      adi_value?: string; regulatory_notes: string; data_available: boolean;
    };
  };
  level2: { score: number; weight: number; weighted_contribution: number; nova_level: number | null; nova_label: string; data_available: boolean; };
  level3: { score: number; weight: number; weighted_contribution: number; cspi_rating: string; cspi_label: string; data_available: boolean; };
  final_score: number; risk_label: string; vetoed: boolean;
  data_coverage: { l1: boolean; l2: boolean; l3: boolean };
  insufficient_data: boolean;
}

// ── Normalisation + lookup maps ───────────────────────────────────────────────
function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\(e\s*\d+[a-z]?\)/g, ' ')          // drop E-numbers "(E102)"
    .replace(/fd&c\s*/g, '')
    .replace(/\bno\.?\s*/g, ' ')
    .replace(/#(\d)/g, '$1')
    .replace(/\blake\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Src = Record<string, any>;
const iarcMap = new Map<string, { group: '1' | '2A' | '2B' | '3'; label: string }>();
for (const [key, g] of [['group_1', '1'], ['group_2a', '2A'], ['group_2b', '2B'], ['group_3', '3']] as const) {
  const grp = (iarc as Src)[key];
  for (const a of grp.agents ?? []) iarcMap.set(norm(a.name), { group: g, label: grp.label });
}
const bannedMap = new Map<string, Src>();
for (const b of (banned as Src).banned_or_restricted ?? []) bannedMap.set(norm(b.name), b);
const southamptonSet = new Set<string>();
for (const d of (banned as Src).southampton_six?.dyes ?? []) {
  southamptonSet.add(norm(d.name));
  if (d.fdc_name) southamptonSet.add(norm(d.fdc_name));
}
const adiMap = new Map<string, Src>();
for (const a of (adiData as Src).additives ?? []) adiMap.set(norm(a.name), a);
const cspiMap = new Map<string, { rating: string; label: string; notes: string }>();
for (const [key, label] of [
  ['avoid', 'Avoid'], ['certain_people_should_avoid', 'Certain People Should Avoid'],
  ['caution', 'Caution'], ['cut_back', 'Cut Back'], ['safe', 'Safe'],
] as const) {
  for (const c of (cspi as Src)[key] ?? []) cspiMap.set(norm(c.name), { rating: key, label, notes: c.notes ?? '' });
}
const novaMap = new Map<string, { level: number; label: string }>();
for (const [key, lvl] of [['nova_1', 1], ['nova_2', 2], ['nova_3', 3], ['nova_4', 4]] as const) {
  const grp = (nova as Src)[key];
  for (const ing of grp.ingredients ?? []) novaMap.set(norm(typeof ing === 'string' ? ing : ing.name), { level: lvl, label: grp.label });
}

// Match a query against a map: exact normalised match, else a contained-word match.
function lookup<T>(map: Map<string, T>, query: string): T | undefined {
  const q = norm(query);
  if (map.has(q)) return map.get(q);
  for (const [k, v] of map) if (k === q || k.includes(q) || q.includes(k)) return v;
  return undefined;
}
function inSet(set: Set<string>, query: string): boolean {
  const q = norm(query);
  if (set.has(q)) return true;
  for (const k of set) if (k === q || k.includes(q) || q.includes(k)) return true;
  return false;
}

// ── Findings + score ──────────────────────────────────────────────────────────
export function getFindings(ingredient: string): Findings {
  const ia = lookup(iarcMap, ingredient);
  const bn = lookup(bannedMap, ingredient);
  const ad = lookup(adiMap, ingredient);
  const cs = lookup(cspiMap, ingredient);
  const nv = lookup(novaMap, ingredient);
  return {
    iarc_group: ia?.group ?? null,
    iarc_label: ia?.label ?? null,
    banned: bn ? { jurisdiction: bn.jurisdiction, action: bn.action, year: bn.year } : null,
    southampton_six: inSet(southamptonSet, ingredient),
    adi: ad ? { value: ad.adi_value, source: ad.source } : null,
    cspi_rating: cs?.label ?? null,
    cspi_notes: cs?.notes ?? null,
    nova_level: nv?.level ?? null,
    nova_label: nv?.label ?? null,
  };
}

export function computeConcernScore(ingredient: string): TierBreakdown {
  const f = getFindings(ingredient);

  // ── Level 1: strict science (veto-capable) ──
  const l1Available = !!(f.iarc_group || f.banned || f.southampton_six || f.adi);
  let l1Score = 0;
  let veto = false;
  let trigger = 'No regulatory flags found in IARC, EFSA/FDA, or ADI datasets.';
  if (f.banned) { l1Score = 100; veto = true; trigger = `Banned/restricted: ${f.banned.jurisdiction} — ${f.banned.action}${f.banned.year ? ` (${f.banned.year})` : ''}.`; }
  else if (f.iarc_group === '1' || f.iarc_group === '2A') { l1Score = 100; veto = true; trigger = `IARC Group ${f.iarc_group} — ${f.iarc_label}.`; }
  else if (f.southampton_six) { l1Score = 80; trigger = 'On the EU "Southampton Six" — requires a child-attention warning label.'; }
  else if (f.iarc_group === '2B') { l1Score = 40; trigger = 'IARC Group 2B — possibly carcinogenic to humans.'; }
  else if (f.adi) { l1Score = 40; trigger = `Has a regulated Acceptable Daily Intake (${f.adi.value}).`; }
  else if (f.iarc_group === '3') { l1Score = 0; trigger = 'IARC Group 3 — not classifiable as carcinogenic.'; }

  // ── Level 2: NOVA processing ──
  const l2Available = f.nova_level != null;
  const NOVA_SCORE: Record<number, number> = { 1: 10, 2: 35, 3: 65, 4: 90 };
  const l2Score = l2Available ? NOVA_SCORE[f.nova_level!] : 50;

  // ── Level 3: CSPI consumer rating ──
  const l3Available = f.cspi_rating != null;
  const CSPI_SCORE: Record<string, number> = {
    'Avoid': 90, 'Certain People Should Avoid': 70, 'Caution': 60, 'Cut Back': 40, 'Safe': 10,
  };
  const l3Score = l3Available ? (CSPI_SCORE[f.cspi_rating!] ?? 30) : 30;

  const insufficient = !l1Available && !l2Available && !l3Available;
  const finalScore = veto ? 100 : Math.round(l1Score * 0.5 + l2Score * 0.3 + l3Score * 0.2);
  const riskLabel = insufficient
    ? 'Insufficient Data'
    : finalScore >= 70 ? 'High Concern' : finalScore >= 40 ? 'Moderate Concern' : 'Low Concern';

  return {
    level1: {
      score: l1Score, weight: 0.5, weighted_contribution: Math.round(l1Score * 0.5),
      veto, trigger, data_available: l1Available,
      profile: {
        banned_or_restricted: !!f.banned, iarc_group: f.iarc_group ?? 'not_evaluated',
        southampton_six: f.southampton_six, adi_restricted: !!f.adi,
        adi_value: f.adi?.value, regulatory_notes: '', data_available: l1Available,
      },
    },
    level2: {
      score: l2Score, weight: 0.3, weighted_contribution: Math.round(l2Score * 0.3),
      nova_level: f.nova_level, nova_label: f.nova_label ?? 'No NOVA classification available for this ingredient.',
      data_available: l2Available,
    },
    level3: {
      score: l3Score, weight: 0.2, weighted_contribution: Math.round(l3Score * 0.2),
      cspi_rating: f.cspi_rating ?? 'Not Rated', cspi_label: f.cspi_rating ?? 'Not Rated by CSPI',
      data_available: l3Available,
    },
    final_score: finalScore, risk_label: riskLabel, vetoed: veto,
    data_coverage: { l1: l1Available, l2: l2Available, l3: l3Available },
    insufficient_data: insufficient,
  };
}

// ── Directory of every ingredient we can score (union of all datasets) ────────
export interface DirectoryEntry { name: string; concern_level: 'low' | 'medium' | 'high' | 'unknown'; sources: string[]; }

function buildDirectory(): DirectoryEntry[] {
  const names = new Map<string, string>(); // norm → display name
  const add = (n: string) => { const k = norm(n); if (k && !names.has(k)) names.set(k, n); };
  for (const key of ['group_1', 'group_2a', 'group_2b', 'group_3']) for (const a of (iarc as Src)[key].agents ?? []) add(a.name);
  for (const b of (banned as Src).banned_or_restricted ?? []) add(b.name);
  for (const d of (banned as Src).southampton_six?.dyes ?? []) { add(d.name); if (d.fdc_name) add(d.fdc_name); }
  for (const a of (adiData as Src).additives ?? []) add(a.name);
  for (const key of ['safe', 'cut_back', 'caution', 'certain_people_should_avoid', 'avoid']) for (const c of (cspi as Src)[key] ?? []) add(c.name);
  for (const key of ['nova_1', 'nova_2', 'nova_3', 'nova_4']) for (const ing of (nova as Src)[key].ingredients ?? []) add(typeof ing === 'string' ? ing : ing.name);

  return [...names.values()].map(name => {
    const b = computeConcernScore(name);
    const level = b.insufficient_data ? 'unknown'
      : b.final_score >= 65 ? 'high' : b.final_score >= 35 ? 'medium' : 'low';
    const sources: string[] = [];
    if (b.data_coverage.l1) sources.push('IARC/EFSA/FDA');
    if (b.data_coverage.l2) sources.push('NOVA');
    if (b.data_coverage.l3) sources.push('CSPI');
    return { name, concern_level: level as DirectoryEntry['concern_level'], sources };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export const INGREDIENT_DIRECTORY: DirectoryEntry[] = buildDirectory();
