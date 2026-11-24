import { describe, expect, it } from 'vitest';
import { parseNewsRss } from '../src/research/news';
import { validateClaims } from '../src/research/profile';

describe('parseNewsRss', () => {
  it('reads title, link, date and outlet', () => {
    const xml = `<rss><channel><item><title>Vobiz raises $1M &amp; grows - Example News</title><link>https://n.example/a</link><pubDate>Mon, 18 May 2026 05:00:00 GMT</pubDate><source url="https://example.com">Example News</source></item></channel></rss>`;
    expect(parseNewsRss(xml)).toEqual([
      { title: 'Vobiz raises $1M & grows - Example News', link: 'https://n.example/a', published: 'Mon, 18 May 2026 05:00:00 GMT', source: 'Example News' },
    ]);
  });
});

describe('validateClaims', () => {
  const sources = [{ url: 'https://x.com/', text: 'Vobiz is telephony infrastructure for AI voice agents, with numbers in 130+ countries.' }];
  it('keeps verbatim quotes and drops invented ones', () => {
    const p = validateClaims(
      {
        fields: {
          what_they_sell: [{ text: 'telephony for AI agents', quote: 'telephony infrastructure for AI voice agents', url: 'https://x.com/' }],
          countries_served: [{ text: '200 countries', quote: 'numbers in 200 countries worldwide', url: 'https://x.com/' }],
          pricing_model: [{ text: 'per minute', quote: 'billed per minute of usage', url: 'https://other.com/' }],
        },
      },
      sources,
    );
    expect(p.fields.what_they_sell).toHaveLength(1);
    expect(p.dropped).toBe(2);
    expect(p.not_stated).toContain('countries_served');
    expect(p.not_stated).toContain('pricing_model');
  });
});
