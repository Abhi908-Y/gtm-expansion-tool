// Turns raw HTML into short readable text plus same-site links. No dependencies on purpose.
export const TOKEN_CAP = 2000; // ~4 chars per token; a budget so every AI call stays cheap

const BLOCK_TAGS =
  /<\/?(?:p|div|section|article|header|footer|main|aside|ul|ol|li|h[1-6]|br|tr|td|th|table|blockquote|figcaption|dd|dt|label|option)\b[^>]*>/gi;
const STRIP_ELEMENTS = /<(script|style|noscript|svg|iframe|template|form|select|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi;
const STRIP_SELF_CLOSING = /<(?:img|input|source|link|meta|hr)\b[^>]*\/?>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', trade: '™', reg: '®', copy: '©',
};

function codePoint(n: number): string {
  try {
    return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  } catch {
    return '';
  }
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[String(n).toLowerCase()] ?? m);
}

export const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
  return t || null;
}

export type Link = { url: string; label: string };

/** Same-host links only (ignoring www.), so a crawl can never leave the site it was pointed at. */
export function extractLinks(html: string, baseUrl: string): Link[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const host = (h: string) => h.replace(/^www\./, '');
  const out: Link[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(m[1]).trim();
    if (!href || href.startsWith('#') || /^(?:mailto|tel|javascript):/i.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || host(u.hostname) !== host(base.hostname)) continue;
    u.hash = '';
    const url = u.toString().replace(/\/$/, '') || u.origin;
    if (seen.has(url)) continue;
    seen.add(url);
    const label = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 80);
    out.push({ url, label });
    if (out.length >= 150) break;
  }
  return out;
}

/**
 * `isMarkdown` is for Jina Reader output, which is already prose.
 * `full` keeps every line (country lists and price tables are made of short lines) and a much larger cap; it is evidence, not prompt text.
 */
export function cleanText(input: string, isMarkdown = false, full = false): string {
  let s = input;
  if (isMarkdown) {
    s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^#{1,6}\s*/gm, '');
  } else {
    s = s.replace(COMMENTS, ' ').replace(STRIP_ELEMENTS, ' ').replace(STRIP_SELF_CLOSING, ' ');
    s = s.replace(BLOCK_TAGS, '\n').replace(/<[^>]+>/g, ' ');
  }
  s = decodeEntities(s).replace(/[ \t ]+/g, ' ');

  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const raw of s.split(/\n+/)) {
    const b = raw.trim();
    if (full ? b.length < 2 : wordCount(b) < 8 && !b.startsWith('|')) continue; // nav labels, buttons, legal fragments; keep table rows (prices)
    const key = b.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push(b);
  }

  let text = blocks.join('\n');
  const cap = full ? 150_000 : TOKEN_CAP * 4;
  if (text.length > cap) {
    text = text.slice(0, cap);
    const cut = text.lastIndexOf('\n'); // end on a block so a quote is never cut mid-sentence
    if (cut > cap * 0.5) text = text.slice(0, cut);
  }
  return text;
}
