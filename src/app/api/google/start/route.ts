import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { authUrl, googleConfigured } from '@/google';
import { originOf, workspace } from '@/web';

export async function GET(req: Request) {
  const origin = originOf(req);
  const plan = new URL(req.url).searchParams.get('plan') ?? '';
  if (!/^[a-z0-9-]{3,60}$/i.test(plan)) return new Response('Bad request', { status: 400 });
  if (!googleConfigured()) return Response.redirect(`${origin}/p/${plan}?gmail=off#outreach`, 302);
  await workspace(); // make sure this browser has a workspace to attach the connection to
  const nonce = randomBytes(12).toString('hex');
  (await cookies()).set('gtm_oauth', nonce, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 600, path: '/api/google' });
  return Response.redirect(authUrl(origin, `${nonce}.${plan}`), 302);
}
