import { cleanDomain } from '../compete/compete';
import { Bad } from '../errors';
import { compute, type Project } from '../store';
import type { Json } from './checks';
import { runCompany, runIcp, runIndustry, runOutreach, runPeople, runVerify, runVerifyMessages, type Base } from './steps';

export type Account = {
  id: string;
  name: string;
  source: 'icp' | 'competitor_customer' | 'manual';
  note?: string;
  website?: string;
  region?: string;
  industry?: Json;
  company?: Json;
  people?: Json;
  outreach?: Json;
  verify?: { removed: string[]; rows: number; stale: number; at: string };
  messages?: Json;
  doNotUse: string[];
};
export type Outreach = { icp?: Json; accounts: Account[] };
export const STEPS = ['industry', 'company', 'people', 'verify', 'draft', 'check'] as const;
export type Step = (typeof STEPS)[number];

/** Everything the model is told about us, built from the plan so far. */
export function baseFor(p: Project): Base {
  const facts = p.profile ? Object.entries(p.profile.profile.fields).flatMap(([k, claims]) => claims.slice(0, 3).map((c) => `- ${k.replace(/_/g, ' ')}: ${c.text}`)) : [];
  const top = compute(p).regions.flatMap((r) => r.countries).filter((c) => c.total != null).sort((a, b) => b.total! - a.total!).slice(0, 8);
  const customers = [...new Set((p.competitors ?? []).filter((c) => c.status === 'accepted').flatMap((c) => (c.customers ?? []).map((x) => x.name)))];
  return {
    company: p.company,
    whatIDo: p.context || p.profile?.profile.fields.what_they_sell[0]?.text || `a company at ${p.website}`,
    known: facts.join('\n'),
    regions: p.regions.map((r) => r.name).join(', '),
    topCountries: top.map((c) => `${c.name} (${c.total!.toFixed(0)}${c.verdict ? ', ' + c.verdict : ''})`).join(', '),
    competitorCustomers: customers,
  };
}

/** Named customers and partners found on competitors' pages that are not yet accounts. Each carries the quote it came from. */
export function suggestedAccounts(p: Project) {
  const have = new Set((p.outreach?.accounts ?? []).map((a) => a.name.toLowerCase()));
  const seen = new Map<string, { name: string; via: string[]; url: string; quote: string }>();
  for (const c of (p.competitors ?? []).filter((x) => x.status === 'accepted'))
    for (const cu of c.customers ?? []) {
      const k = cu.name.toLowerCase();
      if (have.has(k)) continue;
      const e = seen.get(k) ?? { name: cu.name, via: [], url: cu.url, quote: cu.quote };
      if (!e.via.includes(c.name)) e.via.push(c.name);
      seen.set(k, e);
    }
  return [...seen.values()].slice(0, 60);
}

const need = (v: unknown, msg: string) => {
  if (!v) throw new Bad(msg);
};

/** Run one step for one account. Re-running a step clears what depended on it, so nothing stale is left standing. */
export async function researchStep(p: Project, a: Account, step: Step) {
  const base = baseFor(p);
  const icp = p.outreach?.icp;
  if (step === 'industry') {
    need(icp, 'Build the ICP first.');
    a.industry = await runIndustry(base, icp!, a.name);
    a.company = a.people = a.outreach = a.messages = a.verify = undefined;
    a.doNotUse = [];
  } else if (step === 'company') {
    need(a.industry, 'Run the industry step first.');
    a.company = await runCompany(base, a.name, a.industry!);
    a.website = cleanDomain(String(a.company.website ?? '')) ?? a.website;
    a.people = a.outreach = a.messages = a.verify = undefined;
    a.doNotUse = [];
  } else if (step === 'people') {
    need(a.company, 'Run the company step first.');
    a.people = await runPeople(base, a.name, a.company!);
    a.outreach = a.messages = a.verify = undefined;
  } else if (step === 'verify') {
    need(a.company && a.people, 'Run the company and people steps first.');
    const results = [await runVerify('industry', a.industry ?? {}), await runVerify('company', a.company!), await runVerify('people', a.people!)];
    a.industry = { ...results[0].section, _sources: a.industry?._sources };
    a.company = { ...results[1].section, _sources: a.company?._sources };
    a.people = { ...results[2].section, _sources: a.people?._sources };
    a.doNotUse = [...new Set([...a.doNotUse, ...results.flatMap((r) => r.do_not_use)])];
    a.verify = { removed: results.flatMap((r) => r.removed), rows: results.reduce((t, r) => t + r.rows.length, 0), stale: results.reduce((t, r) => t + r.stale, 0), at: new Date().toISOString() };
    a.outreach = a.messages = undefined;
  } else if (step === 'draft') {
    need(a.company && a.people, 'Run the company and people steps first.');
    a.outreach = await runOutreach(base, a.name, a.company!, a.people!, a.industry ?? {}, a.doNotUse);
    a.messages = undefined;
  } else if (step === 'check') {
    need(a.outreach, 'Write the drafts first.');
    a.messages = await runVerifyMessages(a.outreach!, { icp, industry: a.industry, company: a.company, people: a.people }, a.doNotUse, base.known);
  }
}

export async function buildIcp(p: Project) {
  const o = (p.outreach ??= { accounts: [] });
  o.icp = await runIcp(baseFor(p));
}
