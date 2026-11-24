import { decodeEntities } from '../scrape/clean';
import { USER_AGENT } from '../scrape/robots';

export type NewsItem = { title: string; link: string; source: string; published: string };

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1].replace(/<!\[CDATA\[|\]\]>/g, '')).trim() : '';
};

export function parseNewsRss(xml: string): NewsItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => ({
    title: tag(m[1], 'title'),
    link: tag(m[1], 'link'),
    source: tag(m[1], 'source'),
    published: tag(m[1], 'pubDate'),
  }));
}

/** Google News RSS: free, no key. Links are Google redirect URLs; titles carry the headline and outlet. */
export async function googleNews(query: string, opts: { region?: string; lang?: string; limit?: number } = {}): Promise<NewsItem[]> {
  const { region = 'IN', lang = 'en', limit = 15 } = opts;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}-${region}&gl=${region}&ceid=${region}:${lang}`;
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Google News RSS returned HTTP ${res.status}`);
  return parseNewsRss(await res.text()).slice(0, limit);
}
