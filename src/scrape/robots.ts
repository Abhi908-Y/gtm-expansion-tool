import { safeFetch } from './safeFetch';

// robots.txt gate. If we cannot establish permission, we do not fetch.
export const USER_AGENT = 'GTMResearchBot/0.1 (public-page research; respects robots.txt)';
const UA_TOKEN = 'gtmresearchbot';

export type Rules = { allow: string[]; disallow: string[] };

/** Picks the group for our token, else the `*` group. Consecutive User-agent lines share a group. */
export function parseRobots(text: string): Rules {
  const star: Rules = { allow: [], disallow: [] };
  const ours: Rules = { allow: [], disallow: [] };
  let sawOurs = false;
  let agents: string[] = [];
  let collecting = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const i = line.indexOf(':');
    if (i === -1) continue;
    const field = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (field === 'user-agent') {
      if (!collecting) {
        agents = [];
        collecting = true;
      }
      agents.push(value.toLowerCase());
    } else if (field === 'allow' || field === 'disallow') {
      collecting = false;
      for (const a of agents) {
        const t = a === UA_TOKEN ? ours : a === '*' ? star : null;
        if (!t) continue;
        if (a === UA_TOKEN) sawOurs = true;
        t[field].push(value);
      }
    }
  }
  return sawOurs ? ours : star;
}

// shortcut: handles prefix rules and a trailing *, not mid-path wildcards or $; upgrade if a site needs them
export function isPathAllowed(rules: Rules, path: string): boolean {
  const len = (p: string) => (p === '' ? -1 : path.startsWith(p.replace(/\*+$/, '')) ? p.replace(/\*+$/, '').length : -1);
  const dis = Math.max(-1, ...rules.disallow.map(len));
  const alw = Math.max(-1, ...rules.allow.map(len));
  return dis === -1 || alw >= dis;
}

export type RobotsResult = { allowed: true; rules: Rules } | { allowed: false; code: 'robots_disallow' | 'robots_unreachable'; detail: string };

const cache = new Map<string, Promise<RobotsResult>>();

/** One robots.txt fetch per host per process. */
export function checkRobots(host: string, path: string): Promise<RobotsResult> {
  let p = cache.get(host);
  if (!p) {
    p = load(host);
    cache.set(host, p);
  }
  return p.then((r) => {
    if (!r.allowed && r.code === 'robots_unreachable') cache.delete(host); // a transient failure must not block the host for the life of the process
    return r;
  }).then((r) =>
    r.allowed && !isPathAllowed(r.rules, path)
      ? { allowed: false as const, code: 'robots_disallow' as const, detail: `${host}/robots.txt disallows ${path}` }
      : r,
  );
}

/** RFC 9309: a 4xx answer means "no robots file" (everything allowed), except 429 (slow down, ask again). A 5xx means we cannot know, so we do not fetch. */
export const robotsPolicy = (status: number): 'parse' | 'allow' | 'retry' | 'deny' =>
  status >= 200 && status < 300 ? 'parse' : status === 429 ? 'retry' : status >= 400 && status < 500 ? 'allow' : 'deny';

async function load(host: string, attempt = 0): Promise<RobotsResult> {
  try {
    const res = await safeFetch(`https://${host}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    const policy = robotsPolicy(res.status);
    if (policy === 'allow') return { allowed: true, rules: { allow: [], disallow: [] } };
    if (policy === 'retry' && attempt < 1) {
      await new Promise((r) => setTimeout(r, 4000));
      return load(host, attempt + 1);
    }
    if (policy !== 'parse') return { allowed: false, code: 'robots_unreachable', detail: `${host}/robots.txt returned HTTP ${res.status}` };
    return { allowed: true, rules: parseRobots(await res.text()) };
  } catch (e) {
    return { allowed: false, code: 'robots_unreachable', detail: `${host} unreachable: ${e instanceof Error ? e.message : e}` };
  }
}
