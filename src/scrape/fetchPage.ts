import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cleanText, extractEmails, extractLinks, extractPhones, extractTitle, wordCount, type Link } from './clean';
import { checkRobots, USER_AGENT } from './robots';
import { safeFetch } from './safeFetch';

// Sites whose terms of use forbid automated collection. Refused before any request is made.
// Use Apollo for company and people data from these instead.
export const BLOCKED_DOMAINS = ['linkedin.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com'];

const THIN_WORDS = 200; // below this the page was probably a JavaScript shell
const FETCH_MS = 12000;
const MAX_BYTES = 2_000_000;
const CACHE_DIR = process.env.VERCEL ? '/tmp/gtm/pages' : '.cache/pages'; // Vercel's disk is read-only except /tmp
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const HOST_GAP_MS = 1000; // polite delay between requests to the same host

export type Page = {
  url: string;
  title: string | null;
  text: string;
  full: string; // every line of the page, kept as evidence (country lists, tables); not for prompts
  words: number;
  links: Link[];
  emails: string[]; // personal-looking addresses published on the page
  phones: string[]; // numbers published on the page
  via: 'plain' | 'reader' | 'cache';
  fetchedAt: string;
};
export type FailCode = 'blocked_domain' | 'robots_disallow' | 'robots_unreachable' | 'not_html' | 'fetch_failed' | 'thin_content' | 'bad_url';
export type Result = { ok: true; page: Page } | { ok: false; code: FailCode; url: string; detail: string };
export type Opts = { reader?: boolean; cache?: boolean };

export function isBlocked(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return BLOCKED_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
}

const lastHit = new Map<string, number>();
async function politely(host: string) {
  const wait = (lastHit.get(host) ?? 0) + HOST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

async function get(url: string, host: string) {
  await politely(host);
  const res = await safeFetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  const type = res.headers.get('content-type') ?? '';
  const body = (await res.text()).slice(0, MAX_BYTES);
  return { status: res.status, type, body };
}

const cachePath = (url: string) => `${CACHE_DIR}/v4-${createHash('sha1').update(url).digest('hex')}.json`;

export async function fetchPage(rawUrl: string, opts: Opts = {}): Promise<Result> {
  const useCache = opts.cache ?? true;
  const useReader = opts.reader ?? true;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { ok: false, code: 'bad_url', url: rawUrl, detail: 'not a valid URL' };
  }
  const url = u.toString();
  if (isBlocked(u.hostname))
    return { ok: false, code: 'blocked_domain', url, detail: `${u.hostname} forbids automated collection in its terms of use; not fetched` };

  if (useCache) {
    try {
      const hit = JSON.parse(await readFile(cachePath(url), 'utf8')) as Page;
      if (Date.now() - Date.parse(hit.fetchedAt) < CACHE_TTL_MS) return { ok: true, page: { ...hit, via: 'cache' } };
    } catch {
      /* cache miss */
    }
  }

  const robots = await checkRobots(u.hostname, u.pathname + u.search);
  if (!robots.allowed) return { ok: false, code: robots.code, url, detail: robots.detail };

  let thin: Page | null = null;
  let error = '';
  try {
    const r = await get(url, u.hostname);
    if (r.status < 200 || r.status >= 300) error = `HTTP ${r.status}`;
    else if (!/html|text\/plain/i.test(r.type)) return { ok: false, code: 'not_html', url, detail: `content-type ${r.type || 'unknown'}` };
    else {
      const text = cleanText(r.body);
      const page: Page = { url, title: extractTitle(r.body), text, full: cleanText(r.body, false, true), words: wordCount(text), links: extractLinks(r.body, url), emails: extractEmails(r.body), phones: extractPhones(r.body), via: 'plain', fetchedAt: new Date().toISOString() };
      if (page.words >= THIN_WORDS) return await keep(page, useCache);
      thin = page;
      error = `only ${page.words} readable words`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Tier 2: Jina Reader renders JavaScript. It sends the (public) URL to a third party.
  if (useReader) {
    try {
      const r = await get(`https://r.jina.ai/${url}`, 'r.jina.ai');
      if (r.status >= 200 && r.status < 300) {
        const text = cleanText(r.body, true);
        const fullText = cleanText(r.body, true, true);
        if (wordCount(text) >= 40)
          return await keep({ url, title: thin?.title ?? null, text, full: fullText, words: wordCount(text), links: thin?.links ?? [], emails: extractEmails(r.body), phones: extractPhones(r.body), via: 'reader', fetchedAt: new Date().toISOString() }, useCache);
      }
    } catch {
      /* fall through */
    }
  }
  if (thin && thin.words > 0) return { ok: true, page: thin }; // a short page is still a page; the caller sees words
  return { ok: false, code: error.startsWith('only') ? 'thin_content' : 'fetch_failed', url, detail: error };
}

async function keep(page: Page, useCache: boolean): Promise<Result> {
  if (useCache) {
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(cachePath(page.url), JSON.stringify(page));
    } catch {
      /* caching is best effort */
    }
  }
  return { ok: true, page };
}
