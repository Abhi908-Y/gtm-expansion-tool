import { act } from '@/actions';
import { body, handle, workspace } from '@/web';

export const maxDuration = 300; // one competitor takes about 40 seconds; a profile about 30

export const POST = (req: Request, ctx: { params: Promise<{ id: string; action: string }> }) =>
  handle(async () => {
    const { id, action } = await ctx.params;
    return act(await workspace(), id, action, await body(req));
  });
