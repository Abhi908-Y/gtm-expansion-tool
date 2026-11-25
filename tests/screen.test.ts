import { describe, expect, it } from 'vitest';
import { band, evaluateGates, scoreRegion, spearman, verdict, type Lists, type Setup } from '../src/screen/screen';

const lists: Lists = {
  ofac_comprehensive: { countries: ['IRN'], as_of: 'x', url: 'u' },
  fatf_call_for_action: { countries: ['MMR'], as_of: 'x', url: 'u' },
};
const rubric = {
  weights: { demand: 30, ai: 20, competition: 15, ease: 20, partner: 15 },
  bands: { gdp_bn: [250, 500, 1000, 2500], ai_people_pct: [15, 25, 35, 50], ai_firms_pct: [15, 22, 30, 36], english: [450, 500, 550, 600], ict_pct: [4, 5, 6, 7.5], time_diff_h: [1.5, 3, 5, 7] },
  priority: [70, 55, 40] as [number, number, number],
  native_english: ['GBR'],
};
const v = (value: number) => ({ value, as_of: '2026', source: 's', url: 'u' });

describe('band', () => {
  it('scores higher-is-better and lower-is-better', () => {
    expect([100, 250, 600, 1500, 3000].map((x) => band(x, rubric.bands.gdp_bn))).toEqual([1, 2, 3, 4, 5]);
    expect([1, 2, 4, 6, 9].map((x) => band(x, rubric.bands.time_diff_h, true))).toEqual([5, 4, 3, 2, 1]);
  });
});

describe('gates', () => {
  it('fails on lists and on a human call, passes otherwise', () => {
    expect(evaluateGates('IRN', lists, {}).out).toBe(true);
    expect(evaluateGates('MMR', lists, {}).out).toBe(true);
    expect(evaluateGates('RUS', lists, { humanGate: { fail: true, reason: 'r' } }).out).toBe(true);
    expect(evaluateGates('GBR', lists, {}).out).toBe(false);
  });
});

describe('verdict matrix', () => {
  it('follows the brief', () => {
    expect(verdict('Priority 1', 'Ready now')).toBe('Beachhead');
    expect(verdict('Priority 1', 'Outbound only')).toBe('Fix coverage first');
    expect(verdict('Priority 2', 'Ready now')).toBe('Second wave');
    expect(verdict('Priority 2', 'Not checked')).toBe('Check coverage');
    expect(verdict('Watch', 'Ready now')).toBe('Watch');
  });
});

describe('scoreRegion', () => {
  const s = (): Setup => ({
    rubric,
    baseTz: 'Asia/Kolkata',
    regions: [],
    lists,
    countries: {
      AAA: { tz: 'Asia/Kolkata', desk: { competition: 5, rules: 5, partner: 5 }, readiness: 'Ready now' },
      BBB: { tz: 'Asia/Kolkata', desk: { competition: 5, rules: 5, partner: 5 } },
      IRN: {},
    },
    data: {
      AAA: { name: 'A', iso2: 'AA', gdp: v(3000), aiMicrosoft: v(60), english: v(650) },
      BBB: { name: 'B', iso2: 'BB', gdp: v(100), aiMicrosoft: v(5), english: v(400) },
      IRN: { name: 'Iran', iso2: 'IR', gdp: v(300) },
    },
  });
  const region = { name: 'R', ai: 'microsoft' as const, partner: 'desk' as const, countries: ['AAA', 'BBB', 'IRN'] };

  it('gives a perfect country 100 and drops gated ones without a score', () => {
    const r = scoreRegion(region, s());
    const a = r.countries.find((c) => c.iso3 === 'AAA')!;
    expect(a.total).toBe(100);
    expect(a.verdict).toBe('Beachhead');
    const iran = r.countries.find((c) => c.iso3 === 'IRN')!;
    expect(iran.out).toBe(true);
    expect(iran.total).toBeUndefined();
  });

  it('fills a missing figure with the regional median and flags it', () => {
    const setup = s();
    delete setup.data.BBB.gdp;
    const b = scoreRegion(region, setup).countries.find((c) => c.iso3 === 'BBB')!;
    expect(b.cells!.demand.estimated).toBe(true);
    expect(b.cells!.demand.score).toBe(5); // only AAA has data (5), so the median is 5
  });

  it('is deterministic', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(JSON.stringify(scoreRegion(region, s(), now))).toBe(JSON.stringify(scoreRegion(region, s(), now)));
  });
});

describe('spearman', () => {
  it('is 1 for the same order and -1 for the opposite', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
  });
});

describe('broad sanctions gate', () => {
  const withBroad: Lists = { ...lists, broad_sanctions: { countries: ['RUS'], as_of: 'x', url: 'u' } };
  it('rules out heavily sanctioned countries by default, and lets the user reinstate one with a reason', () => {
    expect(evaluateGates('RUS', withBroad, {}).out).toBe(true);
    expect(evaluateGates('RUS', withBroad, { humanGate: { fail: false, reason: 'licensed route' } }).out).toBe(false);
    expect(evaluateGates('GBR', withBroad, {}).out).toBe(false);
  });
});
