import { describe, expect, it } from 'vitest';
import sample from '../data/sample/vobiz.json';
import { chatContext, chatSystem } from '../src/chat/context';
import { pickCandidates } from '../src/outreach/pipeline';
import type { Project } from '../src/store';

const plan = sample as unknown as Project;

describe('chatContext', () => {
  it('writes the plan as text: company, countries, competitors, an account and the strategy', () => {
    const t = chatContext(plan);
    expect(t).toContain('Vobiz.ai');
    expect(t).toMatch(/## Countries/);
    expect(t).toMatch(/RULED OUT/);
    expect(t).toMatch(/## Competitors/);
    expect(t).toMatch(/## Account: /);
    expect(t).toMatch(/## Strategy/);
    expect(t.length).toBeLessThanOrEqual(45000);
  });
  it('is deterministic and includes the user notes as facts', () => {
    const withNote = { ...plan, notes: [{ id: 'n1', text: 'We already have two pilot customers in Singapore.', at: 'x' }] } as Project;
    expect(chatContext(plan)).toBe(chatContext(plan));
    expect(chatContext(withNote)).toMatch(/Notes added by the user[\s\S]*two pilot customers in Singapore/);
  });
  it('tells the model whether web search is on', () => {
    expect(chatSystem('ctx', true)).toMatch(/may search the web/);
    expect(chatSystem('ctx', false)).toMatch(/Web search is off/);
  });
});

describe('pickCandidates', () => {
  const icp = { candidates: [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }, { name: 'Delta' }] };
  it('takes the first n that are not accounts yet, ignoring case', () => {
    const have = [{ name: 'alpha' }] as any;
    expect(pickCandidates(icp, have, 2).map((c) => c.name)).toEqual(['Beta', 'Gamma']);
    expect(pickCandidates(undefined, [], 3)).toEqual([]);
  });
});
