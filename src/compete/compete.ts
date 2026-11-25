// M4 competitor intelligence. The model reads pages and proposes; code checks every quote and decides global vs local.
import { norm, type Source } from '../research/profile';

export const TYPES = ['platform', 'telco', 'ai_platform', 'wholesaler', 'other'] as const;
export const ROLES = ['rival', 'partner', 'both', 'unclear'] as const;
export type CType = (typeof TYPES)[number] | 'unclassified';
export type Role = (typeof ROLES)[number];
export type Claim = { quote: string; url: string };
export type Competitor = {
  name: string;
  domain: string;
  status: 'accepted' | 'suggested';
  note?: string;
  type?: CType;
  role?: Role;
  typeEvidence?: Claim;
  presence?: Record<string, Claim>; // iso3 -> where the competitor's own pages say it operates
  customers?: (Claim & { name: string })[];
  analysedAt?: string;
  failures?: string[];
};

const MIN_QUOTE = 12;

export function validateAnalysis(raw: any, sources: Source[], allowed: Set<string>) {
  const byUrl = new Map(sources.map((s) => [s.url, norm(s.text)]));
  const ok = (c: any) => typeof c?.quote === 'string' && c.quote.length >= MIN_QUOTE && typeof c?.url === 'string' && !!byUrl.get(c.url)?.includes(norm(c.quote));
  let dropped = 0;

  const typeOk = TYPES.includes(raw?.type) && ok({ quote: raw?.type_quote, url: raw?.type_url });
  if (!typeOk) dropped++;
  const role: Role = ROLES.includes(raw?.role) ? raw.role : 'unclear';

  const presence: Record<string, Claim> = {};
  for (const p of Array.isArray(raw?.presence) ? raw.presence : []) {
    if (typeof p?.iso3 === 'string' && allowed.has(p.iso3) && ok(p)) presence[p.iso3] ??= { quote: p.quote, url: p.url };
    else dropped++;
  }
  const customers: (Claim & { name: string })[] = [];
  for (const c of Array.isArray(raw?.customers) ? raw.customers : []) {
    if (typeof c?.name === 'string' && c.name.trim() && ok(c) && customers.length < 15) customers.push({ name: c.name.trim(), quote: c.quote, url: c.url });
    else dropped++;
  }
  return {
    type: (typeOk ? raw.type : 'unclassified') as CType,
    role,
    typeEvidence: typeOk ? { quote: raw.type_quote as string, url: raw.type_url as string } : undefined,
    presence,
    customers,
    dropped,
  };
}

export type Ctx = {
  company: string;
  countries: { iso3: string; name: string }[];
  scrape: (domain: string) => Promise<{ pages: (Source & { full?: string })[]; failures: string[] }>;
  ask: (prompt: string) => Promise<unknown>;
};

// Names a page might use instead of the World Bank's. Three-letter-or-shorter aliases are matched case-sensitively ("UK", not "uk").
export const ALIASES: Record<string, string[]> = {
  VNM: ['Vietnam'], TUR: ['Turkey', 'Türkiye'], RUS: ['Russia'], ARE: ['UAE', 'Emirates'], GBR: ['United Kingdom', 'UK', 'Britain'], USA: ['United States', 'USA', 'U.S.'],
  KOR: ['South Korea'], IRN: ['Iran'], LAO: ['Laos'], CZE: ['Czech Republic', 'Czechia'], MMR: ['Myanmar', 'Burma'], HKG: ['Hong Kong'], TLS: ['Timor-Leste', 'East Timor'],
  CIV: ["Côte d'Ivoire", 'Ivory Coast'], EGY: ['Egypt'], YEM: ['Yemen'], BRN: ['Brunei'], SYR: ['Syria'], PSE: ['Palestine'], KGZ: ['Kyrgyzstan'], SVK: ['Slovakia'],
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function aliasesFor(iso3: string, name: string): string[] {
  return [...new Set([name, name.split(',')[0], ...(ALIASES[iso3] ?? [])])].filter((a) => a.length > 1);
}

/** Lines of each page that name a target country, copied verbatim. Code finds them; the model only judges what they mean. */
export function findMentions(pages: { url: string; full?: string; text: string }[], countries: { iso3: string; name: string }[], perCountry = 2) {
  const out: { iso3: string; name: string; url: string; line: string }[] = [];
  for (const c of countries) {
    const res = aliasesFor(c.iso3, c.name).map((a) => new RegExp(`(^|[^\\p{L}])${esc(a)}($|[^\\p{L}])`, a.length <= 3 ? 'u' : 'iu'));
    let n = 0;
    for (const p of pages) {
      for (const raw of (p.full ?? p.text).split('\n')) {
        const line = raw.trim();
        if (line.length < 12 || !res.some((r) => r.test(line))) continue;
        out.push({ iso3: c.iso3, name: c.name, url: p.url, line: line.slice(0, 260) });
        if (++n >= perCountry) break;
      }
      if (n >= perCountry) break;
    }
  }
  return out;
}

export async function analyse(c: Competitor, ctx: Ctx): Promise<Competitor> {
  const { pages: read, failures } = await ctx.scrape(c.domain);
  if (!read.length) return { ...c, failures: failures.length ? failures : ['no pages could be read'] };
  const pages = read.map((p) => ({ url: p.url, text: p.full ? `${p.text}\n${p.full}` : p.text })); // what a quote may be checked against
  const mentions = findMentions(read, ctx.countries);
  const list = ctx.countries.map((x) => `${x.iso3} ${x.name}`).join('\n');
  const prompt = `We are ${ctx.company}. Study the competitor "${c.name}" (${c.domain}) using ONLY the sources below. Never guess.
Return JSON:
{"type": "platform|telco|ai_platform|wholesaler|other", "type_quote": "...", "type_url": "...",
 "role": "rival|partner|both|unclear",
 "presence": [{"iso3": "...", "quote": "...", "url": "..."}],
 "customers": [{"name": "...", "quote": "...", "url": "..."}]}
Definitions:
- platform: software or API provider of calling, SMS or SIP (a CPaaS).
- telco: owns or operates a phone network or holds the telecom licence.
- ai_platform: builds voice AI agents or models.
- wholesaler: sells phone numbers or call minutes in bulk to other providers.
- role: "partner" if their customers or products need our kind of telephony (for example voice AI builders); "rival" if they sell what we sell; "both" if either; else "unclear".
Every quote must be copied exactly from a source and be at least ${MIN_QUOTE} characters. "url" is the SOURCE it came from.
presence: only countries where the sources say they offer service, hold numbers, or have an office or licence. Use only these codes:
${list}
customers: named customers or partners only.

COUNTRY MENTIONS: lines copied from the sources that name one of our target countries. For each, decide whether it shows the company offering service there (a coverage list, numbers, an office, a licence). Ignore mentions that are only customers, news, examples or "not available". You may quote these lines.
${mentions.map((m) => `${m.iso3} | ${m.url} | ${m.line}`).join('\n') || '(none found)'}

${read.map((s) => `### SOURCE ${s.url}\n${s.text}`).join('\n\n')}`;
  const v = validateAnalysis(await ctx.ask(prompt), pages, new Set(ctx.countries.map((x) => x.iso3)));
  return { ...c, type: v.type, role: v.role, typeEvidence: v.typeEvidence, presence: v.presence, customers: v.customers, analysedAt: new Date().toISOString(), failures };
}

/** Global = evidenced in two or more of our target regions. Local = evidenced in one. Accepted competitors only. */
export function summarise(regions: { name: string; countries: string[] }[], names: Record<string, string>, competitors: Competitor[]) {
  const regionOf = new Map(regions.flatMap((r) => r.countries.map((c) => [c, r.name] as const)));
  const rows = competitors
    .filter((c) => c.status === 'accepted')
    .map((c) => {
      const counts: Record<string, number> = Object.fromEntries(regions.map((r) => [r.name, 0]));
      for (const iso3 of Object.keys(c.presence ?? {})) if (regionOf.has(iso3)) counts[regionOf.get(iso3)!]++;
      const active = regions.filter((r) => counts[r.name] > 0).map((r) => r.name);
      const reach = !c.analysedAt ? 'Not analysed' : active.length >= 2 ? 'Global' : active.length === 1 ? `Local: ${active[0]}` : 'No evidence';
      return { name: c.name, domain: c.domain, type: c.type ?? null, role: c.role ?? null, counts, reach, customers: c.customers ?? [], typeEvidence: c.typeEvidence ?? null, failures: c.failures ?? [], analysed: !!c.analysedAt };
    });
  const perCountry = regions.flatMap((r) =>
    r.countries.map((iso3) => {
      const here = rows.filter((row) => competitors.find((c) => c.domain === row.domain)?.presence?.[iso3]);
      return { iso3, name: names[iso3] ?? iso3, region: r.name, global: here.filter((x) => x.reach === 'Global').map((x) => x.name), local: here.filter((x) => x.reach.startsWith('Local')).map((x) => x.name) };
    }),
  );
  return { regions: regions.map((r) => r.name), rows, perCountry };
}

export const cleanDomain = (s: string): string | null => {
  try {
    const h = new URL(/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`).hostname.replace(/^www\./, '').toLowerCase();
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) && !/^[\d.]+$/.test(h) ? h : null; // names only: no IP addresses
  } catch {
    return null;
  }
};
