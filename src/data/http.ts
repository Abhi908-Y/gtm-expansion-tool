import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { USER_AGENT } from '../scrape/robots';

const DIR = process.env.VERCEL ? '/tmp/gtm/data' : '.cache/data';

/** GET with a disk cache. If the network fails, a stale copy is better than nothing; if there is none, the error surfaces. */
export async function cachedText(url: string, opts: { ttlMs?: number; force?: boolean } = {}): Promise<string> {
  const { ttlMs = 24 * 3600 * 1000, force = false } = opts;
  const file = `${DIR}/${createHash('sha1').update(url).digest('hex')}.txt`;
  let stale: string | null = null;
  try {
    const age = Date.now() - (await stat(file)).mtimeMs;
    const text = await readFile(file, 'utf8');
    if (!force && age < ttlMs) return text;
    stale = text;
  } catch {
    /* no cache yet */
  }
  try {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
    const text = await res.text();
    await mkdir(DIR, { recursive: true });
    await writeFile(file, text);
    return text;
  } catch (e) {
    if (stale !== null) return stale;
    throw e;
  }
}
