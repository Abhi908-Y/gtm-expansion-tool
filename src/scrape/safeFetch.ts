import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// The site takes URLs from strangers and fetches them from our server. Refuse anything that resolves to an internal address.
export function isPrivateIp(ip: string): boolean {
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:') && v6.includes('.')) return isPrivateIp(v6.slice(7));
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
}

/** DNS can fail briefly under load (EAI_AGAIN). Retry a few times before giving up. */
async function resolve(host: string) {
  for (let i = 0; ; i++) {
    try {
      return await lookup(host, { all: true });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (i >= 3 || !['EAI_AGAIN', 'ETIMEOUT', 'ESERVFAIL'].includes(code)) throw e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

export async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) throw new Error(`${hostname} is not a public website`);
  const addrs = isIP(host) ? [{ address: host }] : await resolve(host);
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error(`${hostname} is not a public website`);
}

// shortcut: the address is checked before connecting, not pinned to the connection, so a DNS-rebinding attacker could still slip through; pin the IP if this ever fronts sensitive networks
/** fetch that checks every hop of a redirect chain against the public-host rule. */
export async function safeFetch(url: string, init: RequestInit = {}, maxHops = 5): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    const u = new URL(current);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http and https are allowed');
    await assertPublicHost(u.hostname);
    const res = await fetch(current, { ...init, redirect: 'manual' });
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) {
      current = new URL(next, current).toString();
      continue;
    }
    return res;
  }
  throw new Error('too many redirects');
}
