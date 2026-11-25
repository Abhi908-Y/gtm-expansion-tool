import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { Bad } from './errors';

const COOKIE = 'gtm_ws';
const valid = (v: string | undefined) => (v && /^[a-f0-9]{32}$/.test(v) ? v : null);

/** Read the visitor's workspace id without creating one (for pages). */
export async function peekWorkspace() {
  return valid((await cookies()).get(COOKIE)?.value);
}

/** Read it, or give this browser a new private workspace (for API routes). */
export async function workspace() {
  const jar = await cookies();
  const have = valid(jar.get(COOKIE)?.value);
  if (have) return have;
  const id = randomBytes(16).toString('hex');
  jar.set(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365, path: '/' });
  return id;
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof Bad) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function body(req: Request): Promise<any> {
  const text = await req.text();
  if (text.length > 20000) throw new Bad('Request too large', 413);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Bad('Invalid request');
  }
}

/** The public address the visitor used, which Google must redirect back to. */
export function originOf(req: Request) {
  const h = req.headers;
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
}
