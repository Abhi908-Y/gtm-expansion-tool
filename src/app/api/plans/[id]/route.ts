import { viewFor } from '@/actions';
import { loadProject } from '@/store';
import { handle, workspace } from '@/web';

export const GET = (_: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async () => (async () => { const ws = await workspace(); return viewFor(ws, await loadProject(ws, (await ctx.params).id)); })());
