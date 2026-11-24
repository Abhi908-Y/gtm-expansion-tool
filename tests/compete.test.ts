import { describe, expect, it } from 'vitest';
import { analyse, cleanDomain, summarise, validateAnalysis, type Competitor } from '../src/compete/compete';

const src = [{ url: 'https://t.com/coverage', text: 'Telnyx owns its private network and offers phone numbers in Singapore and Germany. Customers include Acme Robotics.' }];
const allowed = new Set(['SGP', 'DEU', 'ARE']);

describe('validateAnalysis', () => {
  it('keeps verbatim evidence, drops invented or out-of-scope claims', () => {
    const v = validateAnalysis(
      {
        type: 'telco', type_quote: 'owns its private network', type_url: 'https://t.com/coverage', role: 'rival',
        presence: [
          { iso3: 'SGP', quote: 'phone numbers in Singapore and Germany', url: 'https://t.com/coverage' },
          { iso3: 'ARE', quote: 'offices across the Emirates', url: 'https://t.com/coverage' },
          { iso3: 'XXX', quote: 'phone numbers in Singapore and Germany', url: 'https://t.com/coverage' },
        ],
        customers: [{ name: 'Acme Robotics', quote: 'Customers include Acme Robotics', url: 'https://t.com/coverage' }],
      },
      src,
      allowed,
    );
    expect(v.type).toBe('telco');
    expect(Object.keys(v.presence)).toEqual(['SGP']);
    expect(v.customers).toHaveLength(1);
    expect(v.dropped).toBe(2);
  });
  it('falls back to unclassified when the type has no real quote', () => {
    const v = validateAnalysis({ type: 'platform', type_quote: 'a cloud communications platform', type_url: 'https://t.com/coverage' }, src, allowed);
    expect(v.type).toBe('unclassified');
  });
});

describe('analyse', () => {
  const comp: Competitor = { name: 'Telnyx', domain: 't.com', status: 'accepted' };
  const countries = [{ iso3: 'SGP', name: 'Singapore' }, { iso3: 'DEU', name: 'Germany' }];
  it('uses the model answer but only validated parts', async () => {
    const r = await analyse(comp, {
      company: 'Vobiz', countries,
      scrape: async () => ({ pages: src, failures: [] }),
      ask: async () => ({ type: 'telco', type_quote: 'owns its private network', type_url: 'https://t.com/coverage', role: 'rival', presence: [{ iso3: 'DEU', quote: 'phone numbers in Singapore and Germany', url: 'https://t.com/coverage' }] }),
    });
    expect(r.type).toBe('telco');
    expect(Object.keys(r.presence!)).toEqual(['DEU']);
    expect(r.analysedAt).toBeTruthy();
  });
  it('does not call the model when no page could be read', async () => {
    let called = false;
    const r = await analyse(comp, { company: 'V', countries, scrape: async () => ({ pages: [], failures: ['t.com: blocked'] }), ask: async () => { called = true; return {}; } });
    expect(called).toBe(false);
    expect(r.failures).toEqual(['t.com: blocked']);
    expect(r.analysedAt).toBeUndefined();
  });
});

describe('summarise', () => {
  const regions = [{ name: 'SEA', countries: ['SGP', 'IDN'] }, { name: 'EU', countries: ['DEU'] }];
  const claim = { quote: 'q'.repeat(12), url: 'u' };
  const cs: Competitor[] = [
    { name: 'Wide', domain: 'w.com', status: 'accepted', analysedAt: 'x', presence: { SGP: claim, DEU: claim } },
    { name: 'Narrow', domain: 'n.com', status: 'accepted', analysedAt: 'x', presence: { IDN: claim } },
    { name: 'Idea', domain: 'i.com', status: 'suggested', analysedAt: 'x', presence: { SGP: claim } },
    { name: 'Todo', domain: 't.com', status: 'accepted' },
  ];
  it('labels global, local and not-analysed, and ignores suggestions', () => {
    const s = summarise(regions, { SGP: 'Singapore', IDN: 'Indonesia', DEU: 'Germany' }, cs);
    expect(s.rows.map((r) => [r.name, r.reach])).toEqual([['Wide', 'Global'], ['Narrow', 'Local: SEA'], ['Todo', 'Not analysed']]);
    expect(s.perCountry.find((c) => c.iso3 === 'SGP')).toMatchObject({ global: ['Wide'], local: [] });
    expect(s.perCountry.find((c) => c.iso3 === 'IDN')).toMatchObject({ global: [], local: ['Narrow'] });
  });
});

describe('cleanDomain', () => {
  it('normalises and rejects junk', () => {
    expect(cleanDomain('https://www.Twilio.com/en-us')).toBe('twilio.com');
    expect(cleanDomain('not a domain')).toBeNull();
    expect(cleanDomain('169.254.169.254')).toBeNull();
    expect(cleanDomain('http://127.0.0.1:8080/x')).toBeNull();
    expect(cleanDomain('localhost')).toBeNull();
  });
});

import { aliasesFor, findMentions } from '../src/compete/compete';
import { cleanText } from '../src/scrape/clean';
import { robotsPolicy } from '../src/scrape/robots';

describe('findMentions', () => {
  const pages = [{ url: 'https://c.com/coverage', text: '', full: 'Vietnam +84 local numbers available\nSee our UK office in London\nPlease visit the buku page\nMr Singapore Smith is our customer' }];
  const countries = [{ iso3: 'VNM', name: 'Viet Nam' }, { iso3: 'GBR', name: 'United Kingdom' }, { iso3: 'SGP', name: 'Singapore' }];
  it('finds country lines under common aliases, case-sensitively for short ones', () => {
    const m = findMentions(pages, countries);
    expect(m.find((x) => x.iso3 === 'VNM')?.line).toBe('Vietnam +84 local numbers available');
    expect(m.find((x) => x.iso3 === 'GBR')?.line).toBe('See our UK office in London');
    expect(aliasesFor('GBR', 'United Kingdom')).toContain('UK');
    expect(findMentions([{ url: 'u', text: 'we like the buku page for books', full: 'we like the buku page for books' }], [{ iso3: 'GBR', name: 'United Kingdom' }])).toEqual([]);
  });
});

describe('cleanText full mode', () => {
  it('keeps short country-list lines that the prompt text drops', () => {
    const html = '<ul><li>Singapore</li><li>Germany</li></ul><p>This sentence has plenty of words so it survives the filter easily.</p>';
    expect(cleanText(html)).not.toContain('Singapore');
    expect(cleanText(html, false, true)).toContain('Singapore');
  });
});

describe('robotsPolicy', () => {
  it('follows RFC 9309', () => {
    expect([200, 403, 404, 429, 500].map(robotsPolicy)).toEqual(['parse', 'allow', 'allow', 'retry', 'deny']);
  });
});
