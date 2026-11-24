import { listPlans } from '@/db';
import { Bad } from '@/errors';
import { cloneSample, createProject } from '@/store';
import { body, handle, workspace } from '@/web';

export const GET = () => handle(async () => ({ plans: await listPlans(await workspace()) }));

export const POST = (req: Request) =>
  handle(async () => {
    const ws = await workspace();
    const b = await body(req);
    if (b.op === 'sample') return { id: (await cloneSample(ws)).id };
    if (b.op === 'create') return { id: (await createProject(ws, b)).id };
    throw new Bad('Unknown request');
  });
