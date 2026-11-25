import { cookies } from 'next/headers';
import { connect } from '@/google';
import { originOf, workspace } from '@/web';

export async function GET(req: Request) {
  const origin = originOf(req);
  const q = new URL(req.url).searchParams;
  const [nonce, plan] = (q.get('state') ?? '').split('.');
  const jar = await cookies();
  const back = (flag: string) => Response.redirect(`${origin}/p/${/^[a-z0-9-]{3,60}$/i.test(plan ?? '') ? plan : ''}${flag}#outreach`, 302);
  if (!nonce || nonce !== jar.get('gtm_oauth')?.value) return back('?gmail=error');
  jar.delete({ name: 'gtm_oauth', path: '/api/google' });
  const code = q.get('code');
  if (q.get('error') || !code) return back('?gmail=error');
  try {
    await connect(await workspace(), origin, code);
    return back('?gmail=connected');
  } catch (e) {
    console.error(e);
    return back('?gmail=error');
  }
}
