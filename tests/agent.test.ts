import { describe, expect, it } from 'vitest';
import sample from '../data/sample/vobiz.json';
import { chatTurn, inSupport, unsupportedNumbers, validateProposals, type Deps } from '../src/chat/agent';
import type { Project } from '../src/store';

const plan = sample as unknown as Project;
const meta = new Map([
  ['IND', { iso3: 'IND', iso2: 'IN', name: 'India' }],
  ['SGP', { iso3: 'SGP', iso2: 'SG', name: 'Singapore' }],
  ['ARE', { iso3: 'ARE', iso2: 'AE', name: 'United Arab Emirates' }],
]);
const deps = (ok = true, text = 'Acme builds voice agents'): Deps => ({ meta: async () => meta, probe: async () => ({ ok, text }) });
const without = (iso: string) => ({ ...plan, regions: plan.regions.map((r) => ({ ...r, countries: r.countries.filter((c) => c !== iso) })) }) as Project;

describe('number and evidence guards', () => {
  it('flags figures that are in no source, allows rounding, small numbers and years', () => {
    const support = 'Revenue 1,250 in 2024. Share 12.34%.';
    expect(unsupportedNumbers('It was 1250, about 12.3%, in 2024, across 5 regions.', support)).toEqual([]);
    expect(unsupportedNumbers('It grew 87% to 4,500.', support).sort()).toEqual(['4,500', '87']);
  });
  it('accepts evidence only when it is a verbatim excerpt of the data', () => {
    expect(inSupport('Singapore  is open', 'x singapore is open y')).toBe(true);
    expect(inSupport('Singapore is closed', 'x singapore is open y')).toBe(false);
    expect(inSupport('short', 'short')).toBe(false);
  });
});

describe('validateProposals', () => {
  const p = without('IND');
  it('matches country names to ISO codes, drops unknown names, skips countries already in the plan', async () => {
    const r = await validateProposals([{ type: 'add_countries', countries: ['India', 'Narnia', 'Singapore'] }], p, deps());
    const add = r.ok.find((x) => x.type === 'add_countries')!;
    expect((add.args as any).iso3s).toEqual(['IND']);
    expect(r.dropped.join(' ')).toMatch(/Narnia/);
    expect(r.dropped.join(' ')).toMatch(/already in the plan/);
  });
  it('proposes a competitor only if its website opens, and warns when the page does not mention the name', async () => {
    expect((await validateProposals([{ type: 'add_competitor', name: 'Acme', domain: 'acme.com' }], p, deps(false))).ok).toHaveLength(0);
    const good = await validateProposals([{ type: 'add_competitor', name: 'Acme', domain: 'https://acme.com/' }], p, deps());
    expect(good.ok[0].warn).toBeUndefined();
    const odd = await validateProposals([{ type: 'add_competitor', name: 'Zorblax', domain: 'acme.com' }], p, deps());
    expect(odd.ok[0].warn).toMatch(/does not mention/);
  });
  it('refuses to rule a country out without a reason, rejects unknown types and caps the list at four', async () => {
    expect((await validateProposals([{ type: 'mark_out', country: 'Singapore', reason: '' }], p, deps())).ok).toHaveLength(0);
    expect((await validateProposals([{ type: 'delete_everything' }], p, deps())).dropped[0]).toMatch(/cannot do/);
    const many = Array.from({ length: 8 }, (_, i) => ({ type: 'add_note', text: `note ${i}` }));
    expect((await validateProposals(many, p, deps())).ok).toHaveLength(4);
  });
  it('gives the same proposal the same id', async () => {
    const a = await validateProposals([{ type: 'export', what: 'competitors' }], p, deps());
    const b = await validateProposals([{ type: 'export', what: 'competitors' }], p, deps());
    expect(a.ok[0].id).toBe(b.ok[0].id);
    expect((a.ok[0].args as any).format).toBe('xlsx');
  });
});

describe('chatTurn', () => {
  it('re-asks once when the answer invents a number, and warns if it still does', async () => {
    const answers = [{ answer: 'You will win 98765 deals.', evidence: [], proposals: [] }, { answer: 'You will win 98765 deals.', evidence: [], proposals: [] }];
    let calls = 0;
    const t = await chatTurn(plan, 'how many deals?', [], false, 'Overview', deps(), async () => answers[calls++]);
    expect(calls).toBe(2);
    expect(t.warnings.join(' ')).toMatch(/98765/);
  });
  it('keeps only evidence found in the plan and returns validated proposals', async () => {
    const t = await chatTurn(without('IND'), 'add India', [], false, 'Countries', deps(), async () => ({
      answer: 'India is not in the plan yet. Shall I add it?',
      evidence: ['## Countries', 'this sentence is not in the plan at all'],
      proposals: [{ type: 'add_countries', countries: ['India'] }],
    }));
    expect(t.evidence).toEqual(['## Countries']);
    expect(t.proposals.map((x) => x.type)).toEqual(['add_countries']);
  });
});
