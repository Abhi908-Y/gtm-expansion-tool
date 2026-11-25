import { randomBytes } from 'node:crypto';
import rubricDefault from '../data/rubric.default.json';
import listsData from '../data/static/lists.json';
import sampleData from '../data/sample/vobiz.json';
import { summarise, cleanDomain, type Competitor } from './compete/compete';
import { efEpi, eurostatAi, eurostatIct, gdpBn, aiPeople, loadMeta, toEurostatGeo } from './data/sources';
import { PRESETS, TZ, validTz } from './data/regions';
import { getPlan, putPlan } from './db';
import { Bad } from './errors';
import type { ProfileDoc } from './research/runProfile';
import type { Outreach } from './outreach/pipeline';
import { compareGolden, scoreRegion, type CountryCfg, type CountryData, type Lists, type RegionCfg, type Rubric } from './screen/screen';

export type Project = {
  id: string;
  company: string;
  website: string;
  baseTz: string;
  context: string;
  regions: RegionCfg[];
  countries: Record<string, CountryCfg>;
  rubric: Rubric;
  createdAt?: string;
  isSample?: boolean;
  golden?: Record<string, number>;
  indicators?: Record<string, CountryData>;
  ranAt?: string;
  warnings?: string[];
  competitors?: Competitor[];
  profile?: ProfileDoc;
  outreach?: Outreach;
};

const rid = () => randomBytes(3).toString('hex');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'plan';

export async function loadProject(ws: string, id: string): Promise<Project> {
  const p = await getPlan(ws, id);
  if (!p) throw new Bad('Plan not found', 404);
  return p;
}
export const saveProject = (ws: string, p: Project) => putPlan(ws, p);

export type NewPlan = { company?: unknown; website?: unknown; context?: unknown; baseTz?: unknown; regions?: unknown; extraCountries?: unknown };

export async function createProject(ws: string, raw: NewPlan): Promise<Project> {
  const company = String(raw.company ?? '').trim();
  const website = cleanDomain(String(raw.website ?? ''));
  const context = String(raw.context ?? '').trim();
  const baseTz = String(raw.baseTz ?? '');
  if (!company || company.length > 100) throw new Bad('Enter the company name (up to 100 characters)');
  if (!website) throw new Bad('Enter the company website, for example vobiz.ai');
  if (context.length > 1500) throw new Bad('Keep the description under 1,500 characters');
  if (!validTz(baseTz)) throw new Bad('Pick the time zone of the team that will do the selling');
  const ids = Array.isArray(raw.regions) ? (raw.regions as unknown[]).map(String) : [];
  const regions: RegionCfg[] = PRESETS.filter((r) => ids.includes(r.id)).map(({ id, ...r }) => ({ ...r, countries: [...r.countries] }));
  const have = new Set(regions.flatMap((r) => r.countries));
  const extra = [...new Set(String(raw.extraCountries ?? '').toUpperCase().split(/[\s,;]+/).filter((c) => /^[A-Z]{3}$/.test(c)))].filter((c) => !have.has(c)).slice(0, 40);
  if (extra.length) {
    const known = await loadMeta().catch(() => null); // if the country list is unreachable we cannot check, so accept
    const unknown = known ? extra.filter((c) => !known.has(c)) : [];
    if (unknown.length) throw new Bad(`Unknown country code${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Use 3-letter ISO codes such as NZL.`);
  }
  if (extra.length) regions.push({ name: 'Other countries', ai: 'microsoft', partner: 'desk', countries: extra });
  if (!regions.length) throw new Bad('Pick at least one region or add a country code');
  const countries: Record<string, CountryCfg> = {};
  for (const r of regions) for (const c of r.countries) countries[c] = TZ[c] ? { tz: TZ[c] } : {};
  const p: Project = { id: `${slug(company)}-${rid()}`, company, website, baseTz, context, regions, countries, rubric: structuredClone(rubricDefault) as unknown as Rubric, createdAt: new Date().toISOString(), competitors: [] };
  await putPlan(ws, p);
  return p;
}

/** The finished Vobiz plan, copied into the visitor's workspace so they can explore it without spending anything. */
export async function cloneSample(ws: string): Promise<Project> {
  const p = { ...structuredClone(sampleData), id: `vobiz-${rid()}`, isSample: true, createdAt: new Date().toISOString() } as unknown as Project;
  await putPlan(ws, p);
  return p;
}

/** Pull every indicator for every country in the plan. A failed source becomes a warning, not a crash. */
export async function runScreen(p: Project, force = false) {
  const warnings: string[] = [];
  const safe = async <T>(label: string, f: () => Promise<Map<string, T>>) => {
    try {
      return await f();
    } catch (e) {
      warnings.push(`${label} could not be loaded: ${e instanceof Error ? e.message : e}`);
      return new Map<string, T>();
    }
  };
  const o = { force };
  const [meta, gdp, ai, esAi, esIct, ef] = await Promise.all([
    safe('Country list (World Bank)', () => loadMeta(o)),
    safe('GDP (IMF)', () => gdpBn(o)),
    safe('AI use (Microsoft via OWID)', () => aiPeople(o)),
    safe('AI use in firms (Eurostat)', () => eurostatAi(o)),
    safe('ICT workforce (Eurostat)', () => eurostatIct(o)),
    safe('English level (EF)', () => efEpi()),
  ]);
  const ind: Record<string, CountryData> = {};
  for (const r of p.regions)
    for (const iso3 of r.countries) {
      const m = meta.get(iso3);
      const geo = m ? toEurostatGeo(m.iso2) : '';
      ind[iso3] = { name: m?.name ?? iso3, iso2: m?.iso2 ?? '', capitalLon: m?.lon ?? null, gdp: gdp.get(iso3) ?? null, aiMicrosoft: ai.get(iso3) ?? null, aiEurostat: esAi.get(geo) ?? null, ict: esIct.get(geo) ?? null, english: ef.get(iso3) ?? null };
    }
  p.indicators = ind;
  p.warnings = warnings;
  p.ranAt = new Date().toISOString();
}

export const countryNames = (p: Project) =>
  Object.fromEntries(p.regions.flatMap((r) => r.countries.map((c) => [c, p.indicators?.[c]?.name ?? c] as const)));

export const competeView = (p: Project) => summarise(p.regions, countryNames(p), p.competitors ?? []);

export function compute(p: Project) {
  const lists = listsData as Lists;
  const setup = { rubric: p.rubric, baseTz: p.baseTz, regions: p.regions, countries: p.countries, data: p.indicators ?? {}, lists };
  const regions = p.regions.map((r) => scoreRegion(r, setup)).sort((a, b) => (b.avgTop ?? -1) - (a.avgTop ?? -1));
  return { regions, golden: p.golden ? compareGolden(regions, p.golden) : null };
}
