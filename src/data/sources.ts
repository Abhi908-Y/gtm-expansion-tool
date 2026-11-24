import efTable from '../../data/static/ef_epi.json';
import { cachedText } from './http';

// One loader per public data source. Each returns values keyed by country code, with the source stored on every value.
export type Val = { value: number; as_of: string; source: string; url: string; note?: string; estimate?: boolean };
export type Meta = { iso3: string; iso2: string; name: string; capital: string; lon: number | null };
type Opt = { force?: boolean };

export async function loadMeta(o: Opt = {}): Promise<Map<string, Meta>> {
  const raw = JSON.parse(await cachedText('https://api.worldbank.org/v2/country/all?format=json&per_page=400', { ttlMs: 30 * 864e5, ...o }));
  const out = new Map<string, Meta>();
  for (const c of raw[1] as { id: string; iso2Code: string; name: string; capitalCity: string; longitude: string; region: { value: string } }[]) {
    if (c.region.value === 'Aggregates') continue;
    out.set(c.id, { iso3: c.id, iso2: c.iso2Code, name: c.name, capital: c.capitalCity, lon: c.longitude ? Number(c.longitude) : null });
  }
  return out;
}

export async function gdpBn(o: Opt = {}): Promise<Map<string, Val>> {
  const url = 'https://www.imf.org/external/datamapper/api/v1/NGDPD';
  const raw = JSON.parse(await cachedText(url, o)).values.NGDPD as Record<string, Record<string, number>>;
  const out = new Map<string, Val>();
  for (const [iso3, years] of Object.entries(raw))
    if (years['2026'] != null) out.set(iso3, { value: years['2026'], as_of: '2026 (IMF projection)', source: 'IMF World Economic Outlook, GDP current prices, US$ bn', url });
  return out;
}

/** Share of working-age people using generative AI. Our World in Data republishes Microsoft's AI Diffusion series. */
export async function aiPeople(o: Opt = {}): Promise<Map<string, Val>> {
  const url = 'https://ourworldindata.org/grapher/estimated-share-people-generative-ai.csv';
  const lines = (await cachedText(url, o)).trim().split(/\r?\n/);
  const out = new Map<string, Val>();
  for (const line of lines.slice(1)) {
    const f = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) ?? [];
    const [, code, day, v] = f;
    const prev = out.get(code);
    if (code && v !== '' && !isNaN(Number(v)) && (!prev || day > prev.as_of))
      out.set(code, { value: Number(v), as_of: day, source: 'AI users, % of working-age population (Microsoft AI Diffusion Report, via Our World in Data)', url });
  }
  return out;
}

/** JSON-stat from Eurostat: latest year with a value per country, keyed by ISO2 (Eurostat codes Greece EL, UK UK). */
async function eurostat(dataset: string, query: string, source: string, o: Opt): Promise<Map<string, Val>> {
  const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?format=JSON&lang=EN&${query}`;
  const d = JSON.parse(await cachedText(url, o)) as { id: string[]; size: number[]; dimension: Record<string, { category: { index: Record<string, number> } }>; value: Record<string, number> };
  const cats = d.id.map((k) => Object.entries(d.dimension[k].category.index).sort((a, b) => a[1] - b[1]).map((e) => e[0]));
  const out = new Map<string, Val>();
  for (const [pos, value] of Object.entries(d.value)) {
    let p = Number(pos);
    const c: Record<string, string> = {};
    for (let i = d.id.length - 1; i >= 0; i--) {
      c[d.id[i]] = cats[i][p % d.size[i]];
      p = Math.floor(p / d.size[i]);
    }
    const prev = out.get(c.geo);
    if (!prev || c.time > prev.as_of) out.set(c.geo, { value, as_of: c.time, source, url });
  }
  return out;
}

export const eurostatAi = (o: Opt = {}) =>
  eurostat('isoc_eb_ai', 'indic_is=E_AI_TANY&size_emp=GE10&unit=PC_ENT&nace_r2=C10-S951_X_K', 'Eurostat isoc_eb_ai: enterprises (10+ staff) using any AI technology, %', o);
export const eurostatIct = (o: Opt = {}) =>
  eurostat('isoc_sks_itspt', 'unit=PC_EMP', 'Eurostat isoc_sks_itspt: ICT specialists, % of total employment', o);

export const toEurostatGeo = (iso2: string) => ({ GR: 'EL', GB: 'UK' } as Record<string, string>)[iso2] ?? iso2;

/** EF English Proficiency Index has no API. The table is stored in data/static with its edition and caveats. */
export async function efEpi(): Promise<Map<string, Val>> {
  const t = efTable as { edition: string; url: string; scores: Record<string, number>; low_confidence: string[] };
  return new Map(
    Object.entries(t.scores).map(([iso3, value]) => [
      iso3,
      { value, as_of: t.edition, source: 'EF English Proficiency Index', url: t.url, note: t.low_confidence.includes(iso3) ? 'low confidence: read from a truncated page, verify' : undefined } as Val,
    ]),
  );
}
