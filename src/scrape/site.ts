import { fetchPage, type Opts, type Page, type Result } from './fetchPage';

// Pages that answer "what do they sell, to whom, where, and how big are they".
const WANTED = /(customer|case-stud|success|pricing|about|compan|careers|jobs|coverage|countries|country|global|international|network|numbers|locations|regions|partner|integrat|docs|news|press|blog)/i;
// Where the country lists tend to live.
const COVERAGE = /(coverage|countries|country|international|global-?(reach|coverage|network)|locations|availability|phone-numbers)/i;

export type Site = { start: string; pages: Page[]; failures: Extract<Result, { ok: false }>[] };

/**
 * Home page plus up to `maxSubpages` same-site pages chosen by path. Never leaves the site.
 * `deep` follows up to three more links from the best coverage page, because country lists are rarely linked from the home page.
 */
export async function scrapeSite(url: string, opts: Opts & { maxSubpages?: number; deep?: boolean } = {}): Promise<Site> {
  const max = opts.maxSubpages ?? 4;
  const site: Site = { start: url, pages: [], failures: [] };
  const home = await fetchPage(url, opts);
  if (!home.ok) {
    site.failures.push(home);
    return site;
  }
  site.pages.push(home.page);
  const seen = new Set([home.page.url]);

  const take = async (u: string) => {
    if (seen.has(u)) return null;
    seen.add(u);
    const r = await fetchPage(u, opts);
    if (r.ok) {
      site.pages.push(r.page);
      return r.page;
    }
    site.failures.push(r);
    return null;
  };

  const picked: string[] = [];
  const sections = new Set<string>();
  // coverage-looking links first, so they are not crowded out by blog and news links
  const ranked = [...home.page.links].sort((a, b) => Number(COVERAGE.test(b.url + ' ' + b.label)) - Number(COVERAGE.test(a.url + ' ' + a.label)));
  for (const l of ranked) {
    const path = new URL(l.url).pathname;
    if (path === '/' || !WANTED.test(path + ' ' + l.label)) continue;
    const prefix = path.replace(/^\/[a-z]{2}(-[a-z]{2,4})?(?=\/)/i, '').split('/').slice(1, 3).join('/'); // one page per section and language: /blog/a, /blog/b and /fr-fr/x do not each take a slot
    if (sections.has(prefix)) continue;
    sections.add(prefix);
    picked.push(l.url);
    if (picked.length >= max) break;
  }
  let coverage: Page | null = null;
  for (const p of picked) {
    const page = await take(p);
    if (page && !coverage && COVERAGE.test(p)) coverage = page;
  }

  if (opts.deep && coverage) {
    const more = coverage.links.filter((l) => COVERAGE.test(l.url + ' ' + l.label)).slice(0, 3);
    for (const l of more) await take(l.url);
  }
  return site;
}
