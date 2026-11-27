import { crmAct } from '@/crm/actions';
import { Bad } from '@/errors';
import { handle, workspace } from '@/web';

export const maxDuration = 300; // sending 40 emails, one every half second, plus Gmail's own time

export const POST = (req: Request, ctx: { params: Promise<{ action: string }> }) =>
  handle(async () => {
    const { action } = await ctx.params;
    const text = await req.text();
    if (text.length > 4_000_000) throw new Bad('Request too large', 413);
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Bad('Invalid request');
    }
    return crmAct(await workspace(), action, body);
  });
