// M2 gates + M3 scoring + verdicts. Pure functions: same inputs always give the same answer.
import type { Val } from '../data/sources';

export type Crit = 'demand' | 'ai' | 'competition' | 'ease' | 'partner';
export const READINESS = ['Ready now', 'Ready via partner', 'Needs local paperwork', 'Outbound only', 'Not checked'] as const;
export type Readiness = (typeof READINESS)[number];

export type Rubric = {
  weights: Record<Crit, number>;
  bands: { gdp_bn: number[]; ai_people_pct: number[]; ai_firms_pct: number[]; english: number[]; ict_pct: number[]; time_diff_h: number[] };
  priority: [number, number, number];
  native_english: string[];
};
export type RegionCfg = { name: string; ai: 'microsoft' | 'eurostat'; partner: 'eurostat' | 'desk'; countries: string[] };
export type CountryCfg = {
  tz?: string;
  readiness?: Readiness;
  desk?: Partial<Record<'competition' | 'rules' | 'partner', number>>;
  reasons?: Record<string, string>; // reason typed by the human for each desk score or gate call
  humanGate?: { fail: boolean; reason: string };
};
export type Lists = {
  ofac_comprehensive: { countries: string[]; as_of: string; url: string };
  fatf_call_for_action: { countries: string[]; as_of: string; url: string };
  broad_sanctions?: { countries: string[]; as_of: string; url: string };
};
export type CountryData = {
  name: string;
  iso2: string;
  gdp?: Val | null;
  aiMicrosoft?: Val | null;
  aiEurostat?: Val | null;
  english?: Val | null;
  ict?: Val | null;
  capitalLon?: number | null;
};

export type Gate = { id: string; name: string; status: 'pass' | 'fail' | 'unreviewed'; reason: string; url?: string };

export function evaluateGates(iso3: string, lists: Lists, cfg: CountryCfg): { out: boolean; gates: Gate[] } {
  const g1 = lists.ofac_comprehensive.countries.includes(iso3);
  const g2 = lists.fatf_call_for_action.countries.includes(iso3);
  const h = cfg.humanGate;
  const g4 = !!lists.broad_sanctions?.countries.includes(iso3) && h?.fail !== false; // reinstated by the user with a reason
  const gates: Gate[] = [
    { id: 'G-01', name: 'Comprehensive sanctions', status: g1 ? 'fail' : 'pass', reason: g1 ? `Under a comprehensive US embargo (OFAC, as of ${lists.ofac_comprehensive.as_of})` : 'Not on the OFAC comprehensive list', url: lists.ofac_comprehensive.url },
    { id: 'G-02', name: 'FATF call-for-action list', status: g2 ? 'fail' : 'pass', reason: g2 ? `On the FATF call-for-action list (as of ${lists.fatf_call_for_action.as_of})` : 'Not on the FATF call-for-action list', url: lists.fatf_call_for_action.url },
    { id: 'G-04', name: 'Broad US, EU or UK sanctions', status: g4 ? 'fail' : 'pass', reason: g4 ? 'Under broad US, EU and UK sanctions covering most banking, energy and technology trade. Reinstate with a reason if you have a legal route.' : 'Not on the broad-sanctions list', url: lists.broad_sanctions?.url },
    { id: 'G-03', name: 'Legal route, payment route, any service (human call)', status: h ? (h.fail ? 'fail' : 'pass') : 'unreviewed', reason: h ? h.reason : 'Not reviewed yet' },
  ];
  return { out: gates.some((x) => x.status === 'fail'), gates };
}

/** Thresholds [t0..t3]: below t0 scores 1, at or above t3 scores 5. `lowerIsBetter` flips it. */
export function band(v: number, t: number[], lowerIsBetter = false): number {
  return 1 + t.filter((x) => (lowerIsBetter ? v <= x : v >= x)).length;
}

export function utcOffsetHours(tz: string, at = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3] ?? 0) / 60) : 0;
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

export type Cell = { score: number; raw: string | null; url?: string; estimated: boolean; note?: string };
export type Scored = {
  iso3: string;
  name: string;
  out: boolean;
  gates: Gate[];
  cells?: Record<'demand' | 'ai' | 'competition' | 'english' | 'time' | 'rules' | 'partner', Cell>;
  criteria?: Record<Crit, number>;
  total?: number;
  priority?: string;
  readiness: Readiness;
  verdict?: string;
};

export function priorityLabel(total: number, cut: [number, number, number]): string {
  return total >= cut[0] ? 'Priority 1' : total >= cut[1] ? 'Priority 2' : total >= cut[2] ? 'Watch' : 'Deprioritise';
}

export function verdict(priority: string, r: Readiness): string {
  if (priority !== 'Priority 1' && priority !== 'Priority 2') return priority;
  if (r === 'Not checked') return 'Check coverage';
  if (r === 'Ready now' || r === 'Ready via partner') return priority === 'Priority 1' ? 'Beachhead' : 'Second wave';
  return 'Fix coverage first';
}

export type Setup = {
  rubric: Rubric;
  baseTz: string;
  regions: RegionCfg[];
  countries: Record<string, CountryCfg>;
  data: Record<string, CountryData>;
  lists: Lists;
};

type Raw = { iso3: string; score: number | null; raw: string | null; url?: string; note?: string };

export function scoreRegion(region: RegionCfg, s: Setup, now = new Date()) {
  const { rubric: R } = s;
  const baseOff = utcOffsetHours(s.baseTz, now);
  const results: Scored[] = [];
  const live: string[] = [];
  for (const iso3 of region.countries) {
    const cfg = s.countries[iso3] ?? {};
    const d = s.data[iso3] ?? { name: iso3, iso2: '' };
    const g = evaluateGates(iso3, s.lists, cfg);
    results.push({ iso3, name: d.name, out: g.out, gates: g.gates, readiness: cfg.readiness ?? 'Not checked' });
    if (!g.out) live.push(iso3);
  }

  const parts: Record<string, Raw[]> = { demand: [], ai: [], competition: [], english: [], time: [], rules: [], partner: [] };
  for (const iso3 of live) {
    const cfg = s.countries[iso3] ?? {};
    const d = s.data[iso3] ?? ({ name: iso3, iso2: '' } as CountryData);
    const desk = (k: 'competition' | 'rules' | 'partner'): Raw => {
      const v = cfg.desk?.[k];
      return { iso3, score: v ?? null, raw: v != null ? `analyst: ${v}` : null, note: cfg.reasons?.[k] };
    };
    parts.demand.push(d.gdp ? { iso3, score: band(d.gdp.value, R.bands.gdp_bn), raw: `$${Math.round(d.gdp.value).toLocaleString()}bn`, url: d.gdp.url } : { iso3, score: null, raw: null });
    const ai = region.ai === 'eurostat' ? d.aiEurostat : d.aiMicrosoft;
    parts.ai.push(
      ai
        ? { iso3, score: band(ai.value, region.ai === 'eurostat' ? R.bands.ai_firms_pct : R.bands.ai_people_pct), raw: `${ai.value}% ${region.ai === 'eurostat' ? 'of firms' : 'of people'} (${ai.as_of})`, url: ai.url }
        : { iso3, score: null, raw: null },
    );
    parts.competition.push(desk('competition'));
    if (d.english) parts.english.push({ iso3, score: band(d.english.value, R.bands.english), raw: `EF ${d.english.value}`, url: d.english.url, note: d.english.note });
    else if (R.native_english.includes(iso3)) parts.english.push({ iso3, score: 5, raw: 'native English (not ranked by EF)', note: 'assumption: unranked native-English countries score 5' });
    else parts.english.push({ iso3, score: null, raw: null });
    const tz = cfg.tz;
    const lonOff = d.capitalLon != null ? Math.round(d.capitalLon / 15) : null;
    const off = tz ? utcOffsetHours(tz, now) : lonOff;
    parts.time.push(off == null ? { iso3, score: null, raw: null } : { iso3, score: band(Math.abs(off - baseOff), R.bands.time_diff_h, true), raw: `${Math.abs(off - baseOff)}h from base${tz ? '' : ' (estimated from longitude)'}`, note: tz ? undefined : 'no time zone set' });
    parts.rules.push(desk('rules'));
    if (region.partner === 'eurostat') {
      parts.partner.push(d.ict ? { iso3, score: band(d.ict.value, R.bands.ict_pct), raw: `${d.ict.value}% of jobs (${d.ict.as_of})`, url: d.ict.url } : { iso3, score: null, raw: null });
    } else parts.partner.push(desk('partner'));
  }

  // Missing data: median of the countries in this region that have it, flagged as an estimate. No data at all: neutral 3, flagged.
  const filled: Record<string, Map<string, Cell>> = {};
  for (const [k, list] of Object.entries(parts)) {
    const known = list.filter((x) => x.score != null).map((x) => x.score as number);
    const fallback = known.length ? median(known) : 3;
    filled[k] = new Map(
      list.map((x) => [
        x.iso3,
        x.score != null
          ? { score: x.score, raw: x.raw, url: x.url, estimated: false, note: x.note }
          : { score: fallback, raw: null, estimated: true, note: known.length ? `no data: median of ${known.length} countries in region` : 'no data for any country in region: neutral 3' },
      ]),
    );
  }

  for (const r of results) {
    if (r.out) continue;
    const c = (k: string) => filled[k].get(r.iso3)!;
    const ease = (c('english').score + c('time').score + c('rules').score) / 3;
    r.cells = { demand: c('demand'), ai: c('ai'), competition: c('competition'), english: c('english'), time: c('time'), rules: c('rules'), partner: c('partner') };
    r.criteria = { demand: c('demand').score, ai: c('ai').score, competition: c('competition').score, ease, partner: c('partner').score };
    r.total = Math.round((Object.keys(R.weights) as Crit[]).reduce((t, k) => t + (r.criteria![k] * R.weights[k]) / 5, 0) * 10) / 10;
    r.priority = priorityLabel(r.total, R.priority);
    r.verdict = verdict(r.priority, r.readiness);
  }
  const ranked = results.filter((r) => !r.out && (r.priority === 'Priority 1' || r.priority === 'Priority 2'));
  return {
    name: region.name,
    countries: results.sort((a, b) => (b.total ?? -1) - (a.total ?? -1)),
    avgTop: ranked.length ? Math.round((ranked.reduce((t, r) => t + r.total!, 0) / ranked.length) * 10) / 10 : null,
    beachheads: results.filter((r) => r.verdict === 'Beachhead').length,
  };
}

export function rank(a: number[]): number[] {
  return a.map((x) => a.filter((y) => y > x).length + 1 + (a.filter((y) => y === x).length - 1) / 2);
}
export function spearman(a: number[], b: number[]): number | null {
  if (a.length < 3) return null;
  const ra = rank(a), rb = rank(b), n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let c = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    c += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? c / Math.sqrt(da * db) : null;
}

/** How closely our totals follow a reference set (section 8 for Vobiz). Reported, never tuned to match. */
export function compareGolden(regions: ReturnType<typeof scoreRegion>[], golden: Record<string, number>) {
  return regions.map((r) => {
    const rows = r.countries.filter((c) => c.total != null && typeof golden[c.iso3] === 'number');
    const ours = rows.map((c) => c.total!), ref = rows.map((c) => golden[c.iso3]);
    return {
      region: r.name,
      n: rows.length,
      rho: spearman(ours, ref),
      meanAbsDiff: rows.length ? Math.round((rows.reduce((t, c) => t + Math.abs(c.total! - golden[c.iso3]), 0) / rows.length) * 10) / 10 : null,
      rows: rows.map((c) => ({ iso3: c.iso3, name: c.name, ours: c.total!, reference: golden[c.iso3], diff: Math.round((c.total! - golden[c.iso3]) * 10) / 10 })),
    };
  });
}
