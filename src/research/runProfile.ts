import { Bad } from '../errors';
import { scrapeSite } from '../scrape/site';
import { geminiConfigured } from './gemini';
import { googleNews, type NewsItem } from './news';
import { buildProfile, type Profile } from './profile';

export type ProfileDoc = {
  builtAt: string;
  pages: { url: string; words: number; via: string }[];
  failures: string[];
  news: NewsItem[];
  profile: Profile;
};

/** M1: read the company's own pages plus Google News, then let Gemini fill the profile. Unquoted claims are dropped in code. */
export async function runProfile(company: string, website: string): Promise<ProfileDoc> {
  const why = geminiConfigured();
  if (why) throw new Bad(`${why}. The site owner needs to add it.`, 503);
  const site = await scrapeSite(website, { maxSubpages: 5 });
  if (!site.pages.length) throw new Bad(`Could not read ${website}: ${site.failures.map((f) => `${f.code} (${f.detail})`).join('; ') || 'no pages'}`);
  const news = await googleNews(`"${company}"`).catch(() => [] as NewsItem[]);
  const sources = [...site.pages.map((p) => ({ url: p.url, text: p.text })), { url: 'news:google', text: news.map((n) => `${n.title} (${n.published})`).join('\n') }];
  const profile = await buildProfile(company, sources);
  return {
    builtAt: new Date().toISOString(),
    pages: site.pages.map((p) => ({ url: p.url, words: p.words, via: p.via })),
    failures: site.failures.map((f) => `${f.code}: ${f.url}`),
    news,
    profile,
  };
}
