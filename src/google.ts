// Gmail through Google's OAuth. The only scope asked for is gmail.compose: create drafts and send, nothing that reads mail.
import { deleteSecret, getSecret, putSecret } from './db';
import { Bad } from './errors';
import { seal, unseal } from './secrets';

const SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const SECRET = 'google';

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_SECRET);
export const redirectUri = (origin: string) => `${origin}/api/google/callback`;

export function authUrl(origin: string, state: string) {
  const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(origin), response_type: 'code', scope: `${SCOPE} email`, access_type: 'offline', prompt: 'consent', state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function token(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }), signal: AbortSignal.timeout(20000) });
  const d = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error_description?: string; error?: string };
  if (!res.ok || !d.access_token) throw new Bad(`Google sign-in failed: ${d.error_description ?? d.error ?? res.status}`, 502);
  return d;
}

export async function connect(ws: string, origin: string, code: string) {
  const d = await token({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(origin) });
  if (!d.refresh_token) throw new Bad('Google did not return a long-lived sign-in. Remove this app at myaccount.google.com/permissions and connect again.', 502);
  const email = await profileEmail(d.access_token!).catch(() => '');
  await putSecret(ws, SECRET, seal(JSON.stringify({ refresh: d.refresh_token, email })));
}

type Link = { refresh: string; email: string };
const linked = async (ws: string): Promise<Link | null> => {
  const s = await getSecret(ws, SECRET);
  if (!s) return null;
  try {
    return JSON.parse(unseal(s)) as Link;
  } catch {
    return null; // APP_SECRET changed: treat as not connected
  }
};

export async function gmailStatus(ws: string) {
  if (!googleConfigured()) return { configured: false, connected: false, email: '' };
  const l = await linked(ws);
  return { configured: true, connected: !!l, email: l?.email ?? '' };
}
export const disconnect = (ws: string) => deleteSecret(ws, SECRET);

export async function accessFor(ws: string): Promise<string> {
  if (!googleConfigured()) throw new Bad('Gmail is not set up on this site yet.', 503);
  const l = await linked(ws);
  if (!l) throw new Bad('Connect your Gmail first.', 400);
  try {
    return (await token({ refresh_token: l.refresh, grant_type: 'refresh_token' })).access_token!;
  } catch {
    await disconnect(ws);
    throw new Bad('Google no longer accepts this connection. Connect your Gmail again.', 401);
  }
}

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
export const validEmail = (s: unknown): s is string => typeof s === 'string' && EMAIL.test(s);

/** A plain-text RFC 2822 message, base64url as the Gmail API wants it. The subject is encoded, so it cannot inject headers. */
export function buildRaw({ to, subject, body }: { to?: string | null; subject: string; body: string }): string {
  if (to && !validEmail(to)) throw new Bad('That is not a valid email address');
  const head = [to ? `To: ${to}` : '', `Subject: =?UTF-8?B?${Buffer.from(subject.replace(/[\r\n]+/g, ' '), 'utf8').toString('base64')}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64'].filter(Boolean).join('\r\n');
  const b64 = Buffer.from(body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  return Buffer.from(`${head}\r\n\r\n${b64}`, 'utf8').toString('base64url');
}

async function gmail(at: string, path: string, body?: object) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const d = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(d?.error?.message ?? `Gmail returned HTTP ${res.status}`);
  return d;
}
export const profileEmail = async (at: string) => (await gmail(at, 'profile')).emailAddress as string;
export const createDraft = async (at: string, raw: string) => (await gmail(at, 'drafts', { message: { raw } })).id as string;
export const sendMessage = async (at: string, raw: string) => (await gmail(at, 'messages/send', { raw })).id as string;
