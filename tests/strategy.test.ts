import { describe, expect, it } from 'vitest';
import { DEFAULTS, funnel, KPIS, regionFacts, spread, toCsv, validateAssumptions, weeklyPlan, WINDOWS } from '../src/strategy/strategy';

describe('funnel', () => {
  it('reproduces the brief: 1,000 leads give about 80, 32, 11, 7 and 4', () => {
    const f = funnel(DEFAULTS);
    expect([f.conversations, f.meetings, f.pilots, f.proposals, f.customers].map(Math.round)).toEqual([80, 32, 11, 7, 4]);
  });
  it('validates assumptions and rejects nonsense', () => {
    expect(validateAssumptions({ ...DEFAULTS })).toEqual(DEFAULTS);
    expect(validateAssumptions({ ...DEFAULTS, leads: 0 })).toBeNull();
    expect(validateAssumptions({ ...DEFAULTS, win: 1.5 })).toBeNull();
    expect(validateAssumptions({ ...DEFAULTS, meeting: 'x' })).toBeNull();
    expect(validateAssumptions(null)).toBeNull();
  });
});

describe('spread and weeklyPlan', () => {
  it('adds up to the total, only inside the window', () => {
    const s = spread(11, 7, 10);
    expect(s.reduce((a, b) => a + b, 0)).toBe(11);
    expect(s.slice(0, 6).every((x) => x === 0)).toBe(true);
    expect(s.slice(10).every((x) => x === 0)).toBe(true);
    expect(Math.max(...s) - Math.min(...s.slice(6, 10))).toBeLessThanOrEqual(1);
  });
  it('every KPI column sums to its funnel stage and stays in its window', () => {
    const f = funnel({ ...DEFAULTS, leads: 777 });
    const rows = weeklyPlan(f);
    expect(rows).toHaveLength(13);
    for (const k of KPIS) {
      expect(rows.reduce((t, r) => t + r[k.key], 0)).toBe(Math.round(f[k.from]));
      const [a, b] = WINDOWS[k.key];
      rows.forEach((r) => (r.week < a || r.week > b) && expect(r[k.key]).toBe(0));
    }
    expect(rows[0].phase).toBe('Research');
    expect(rows[12].phase).toBe('Close and expand');
  });
});

describe('regionFacts', () => {
  const region: any = {
    name: 'EU', avgTop: 70, beachheads: 1,
    countries: [
      { iso3: 'NLD', name: 'Netherlands', total: 75, priority: 'Priority 1', verdict: 'Beachhead', readiness: 'Ready now', out: false },
      { iso3: 'DEU', name: 'Germany', total: 74, priority: 'Priority 1', verdict: 'Fix coverage first', readiness: 'Outbound only', out: false },
      { iso3: 'RUS', name: 'Russia', out: true },
    ],
  };
  it('groups by verdict in entry order and writes reasons from the data', () => {
    const [r] = regionFacts([region], [{ iso3: 'NLD', name: 'Netherlands', region: 'EU', global: ['Telnyx'], local: ['sipgate'] }], 'Asia/Kolkata', (c) => ({ NLD: 'Europe/Amsterdam', DEU: 'Europe/Berlin' } as any)[c]);
    expect(r.byVerdict.map((g) => g.verdict)).toEqual(['Beachhead', 'Fix coverage first']);
    expect(r.globals).toEqual(['Telnyx']);
    expect(r.out).toEqual(['Russia']);
    expect(r.reasons.join(' ')).toMatch(/Netherlands/);
    expect(r.reasons.join(' ')).toMatch(/1 global, 1 local/);
    expect(r.timeDiff![0]).toBeGreaterThan(2);
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([['a', 'b,c', 'd"e', 'f\ng']])).toBe('a,"b,c","d""e","f\ng"');
  });
});
