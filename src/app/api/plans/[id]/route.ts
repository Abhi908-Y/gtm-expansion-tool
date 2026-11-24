import { view } from '@/actions';
import { loadProject } from '@/store';
import { handle, workspace } from '@/web';

export const GET = (_: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async () => view(await loadProject(await workspace(), (await ctx.params).id)));
