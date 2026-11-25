// M8 numbers. Everything here is plain arithmetic on the plan's own data: no model is involved.
import { utcOffsetHours, type scoreRegion } from '../screen/screen';

export type Assumptions = { leads: number; conversation: number; meeting: number; pilot: number; proposal: number; win: number };
/** Planning rates from the build brief. They are placeholders to be replaced by real conversion rates after the research weeks. */
export const DEFAULTS: Assumptions = { leads: 1000, conversation: 0.08, meeting: 0.4, pilot: 1 / 3, proposal: 0.7, win: 0.5 };

export function validateAssumptions(raw: any): Assumptions | null {
  const leads = Number(raw?.leads);
  if (!Number.isInteger(leads) || leads < 1 || leads > 50000) return null;
  const out: Assumptions = { ...DEFAULTS, leads };
  for (const k of ['conversation', 'meeting', 'pilot', 'proposal', 'win'] as const) {
    const v = Number(raw?.[k]);
    if (!(v >= 0.001 && v <= 1)) return null;
    out[k] = v;
  }
  return out;
}

export type Funnel = { leads: number; conversations: number; meetings: number; pilots: number; proposals: number; customers: number };
export function funnel(a: Assumptions): Funnel {
  const conversations = a.leads * a.conversation;
  const meetings = conversations * a.meeting;
  const pilots = meetings * a.pilot;
  const proposals = pilots * a.proposal;
  return { leads: a.leads, conversations, meetings, pilots, proposals, customers: proposals * a.win };
}

export const WEEKS = 13;
export type Kpi = 'contacted' | 'conversations' | 'meetings' | 'pilots' | 'proposals' | 'customers';
export const KPIS: { key: Kpi; label: string; from: keyof Funnel }[] = [
  { key: 'contacted', label: 'Leads contacted', from: 'leads' },
  { key: 'conversations', label: 'Conversations', from: 'conversations' },
  { key: 'meetings', label: 'Qualified meetings', from: 'meetings' },
  { key: 'pilots', label: 'Pilots started', from: 'pilots' },
  { key: 'proposals', label: 'Proposals', from: 'proposals' },
  { key: 'customers', label: 'Customers', from: 'customers' },
];
/** Weeks (inclusive) in which each stage happens, following the brief: research 1-2, outreach 3-6, pilots and proposals 7-10, close 11-13. */
export const WINDOWS: Record<Kpi, [number, number]> = { contacted: [3, 10], conversations: [3, 11], meetings: [4, 10], pilots: [7, 10], proposals: [9, 12], customers: [11, 13] };
export const phaseOf = (w: number) => (w <= 2 ? 'Research' : w <= 6 ? 'Outreach' : w <= 10 ? 'Pilots and proposals' : 'Close and expand');

/** Whole numbers per week that add up to round(total), spread as evenly as possible across the window (largest remainder). */
export function spread(total: number, from: number, to: number): number[] {
  const out = Array(WEEKS).fill(0);
  const n = to - from + 1;
  const whole = Math.round(total);
  const base = Math.floor(whole / n);
  let extra = whole - base * n;
  for (let w = from; w <= to; w++) out[w - 1] = base;
  for (let w = to; extra > 0; w--, extra--) out[w - 1]++; // leftovers go to the later weeks, where the funnel is fuller
  return out;
}

export function weeklyPlan(f: Funnel) {
  const cols = Object.fromEntries(KPIS.map((k) => [k.key, spread(f[k.from], ...WINDOWS[k.key])])) as Record<Kpi, number[]>;
  return Array.from({ length: WEEKS }, (_, i) => ({ week: i + 1, phase: phaseOf(i + 1), ...(Object.fromEntries(KPIS.map((k) => [k.key, cols[k.key][i]])) as Record<Kpi, number>) }));
}

// ---------- region facts, from the screening and competitor data ----------
type Region = ReturnType<typeof scoreRegion>;
export type PerCountry = { iso3: string; name: string; region: string; global: string[]; local: string[] };
export const VERDICT_ORDER = ['Beachhead', 'Second wave', 'Check coverage', 'Fix coverage first'] as const;

export function regionFacts(regions: Region[], perCountry: PerCountry[], baseTz: string, tzOf: (iso3: string) => string | undefined) {
  const base = utcOffsetHours(baseTz);
  return regions.map((r, i) => {
    const scored = r.countries.filter((c) => c.total != null);
    const byVerdict = VERDICT_ORDER.map((v) => ({ verdict: v, countries: scored.filter((c) => c.verdict === v).map((c) => ({ iso3: c.iso3, name: c.name, total: c.total!, readiness: c.readiness })) })).filter((g) => g.countries.length);
    const diffs = scored.flatMap((c) => { const tz = tzOf(c.iso3); return tz ? [Math.abs(utcOffsetHours(tz) - base)] : []; });
    const here = perCountry.filter((x) => x.region === r.name);
    const globals = [...new Set(here.flatMap((x) => x.global))];
    const locals = [...new Set(here.flatMap((x) => x.local))];
    const out = r.countries.filter((c) => c.out);
    const beach = byVerdict.find((g) => g.verdict === 'Beachhead')?.countries ?? [];
    const fix = byVerdict.find((g) => g.verdict === 'Fix coverage first')?.countries ?? [];
    const reasons = [
      `${scored.filter((c) => c.priority === 'Priority 1' || c.priority === 'Priority 2').length} of ${scored.length} scored countries are Priority 1 or 2, averaging ${r.avgTop ?? 'n/a'}.`,
      beach.length ? `${beach.length} beachhead${beach.length > 1 ? 's' : ''} (strong score and ready to sell): ${beach.map((c) => c.name).join(', ')}.` : 'No beachhead yet: either no country scores high enough or none is confirmed ready to sell.',
      fix.length ? `${fix.length} strong market${fix.length > 1 ? 's' : ''} need coverage fixed first: ${fix.map((c) => c.name).join(', ')}.` : '',
      diffs.length ? `Time difference from your team: ${Math.min(...diffs)} to ${Math.max(...diffs)} hours.` : '',
      globals.length + locals.length ? `Competitors with evidence here: ${globals.length} global, ${locals.length} local.` : 'No competitor evidence recorded for these countries yet.',
      out.length ? `${out.length} ${out.length > 1 ? 'countries are' : 'country is'} ruled out by the gates: ${out.map((c) => c.name).join(', ')}.` : '',
    ].filter(Boolean);
    return { name: r.name, rank: i + 1, avgTop: r.avgTop, beachheads: r.beachheads, byVerdict, timeDiff: diffs.length ? ([Math.min(...diffs), Math.max(...diffs)] as [number, number]) : null, globals, locals, out: out.map((c) => c.name), reasons };
  });
}

export const csvEscape = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvEscape).join(',')).join('\n');
