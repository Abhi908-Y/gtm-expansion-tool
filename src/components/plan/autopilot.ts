// "Research everything": runs the whole pipeline for a plan, one stage at a time, from the browser.
// Each stage is a separate request (a request can last at most 5 minutes); slow jobs inside a stage run in parallel on the server.
// Every stage re-reads the plan first, so it only does what is still missing, and a stopped or failed run can simply be started again.
import { call, type State } from '../shared';

export type Phase = { key: string; label: string; state: 'wait' | 'run' | 'ok' | 'skip' | 'fail'; note?: string };

const STEPS = ['industry', 'company', 'people', 'verify', 'draft', 'check'] as const;
const STEP_LABEL: Record<string, string> = { industry: 'industry shifts', company: 'company and trigger', people: 'people', verify: 'grading the research', draft: 'writing drafts', check: 'grading the drafts' };
const HAS: Record<string, (a: any) => boolean> = { industry: (a) => !!a.industry, company: (a) => !!a.company, people: (a) => !!a.people, verify: (a) => !!a.verify, draft: (a) => !!a.outreach, check: (a) => !!a.messages };

type Stage = { key: string; label: string; needed: (s: State) => boolean; run: (s: State, post: (a: string, b?: object) => Promise<any>, note: (t: string) => void) => Promise<string[] | void> };

export const STAGES: Stage[] = [
  { key: 'screen', label: 'Screening the countries', needed: (s) => !s.project.ranAt, run: (_s, post) => post('screen') },
  { key: 'profile', label: 'Reading the company', needed: (s) => !s.project.profile, run: (_s, post) => post('profile') },
  {
    key: 'find',
    label: 'Finding competitors',
    needed: (s) => s.compete.rows.length === 0,
    run: async (s, post) => {
      if (!s.suggested.length) await post('discover');
      await post('competitor', { op: 'accept_all', max: 10 });
    },
  },
  {
    key: 'analyse',
    label: 'Analysing competitors',
    needed: (s) => s.compete.rows.some((r) => !r.analysed),
    run: async (s, post, note) => {
      const todo = s.compete.rows.filter((r) => !r.analysed).map((r) => r.domain);
      const failed: string[] = [];
      for (let i = 0; i < todo.length; i += 4) {
        note(`${Math.min(i + 4, todo.length)} of ${todo.length}`);
        failed.push(...((await post('competitor', { op: 'analyse', domains: todo.slice(i, i + 4) })).failed ?? []));
      }
      return failed;
    },
  },
  { key: 'icp', label: 'Building the ideal customer profile', needed: (s) => !s.outreach.icp, run: (_s, post) => post('icp') },
  { key: 'accounts', label: 'Choosing target accounts', needed: (s) => s.outreach.accounts.length === 0 && !!s.outreach.icp, run: (_s, post) => post('account', { op: 'add_top', n: 3 }) },
  ...STEPS.map((step): Stage => ({
    key: `acc-${step}`,
    label: `Researching accounts: ${STEP_LABEL[step]}`,
    needed: (s) => s.outreach.accounts.some((a) => !HAS[step](a)),
    run: async (s, post) => (await post('research', { ids: s.outreach.accounts.filter((a) => !HAS[step](a)).map((a) => a.id), step })).failed,
  })),
  {
    key: 'playbooks',
    label: 'Writing the regional playbooks',
    needed: (s) => s.project.ranAt != null && s.strategy.facts.some((f) => f.byVerdict.length && !s.strategy.playbooks[f.name]),
    run: async (s, post) => (await post('strategy', { op: 'playbook', regions: s.strategy.facts.filter((f) => f.byVerdict.length && !s.strategy.playbooks[f.name]).map((f) => f.name) })).failed,
  },
];

export async function runAutopilot(id: string, ai: boolean, onUpdate: (phases: Phase[]) => void, refresh: () => Promise<void>, stopped: () => boolean) {
  const post = (a: string, b: object = {}) => call(`/api/plans/${id}/${a}`, b);
  const phases: Phase[] = STAGES.map((s) => ({ key: s.key, label: s.label, state: 'wait' }));
  const push = () => onUpdate(phases.map((p) => ({ ...p })));
  push();
  for (let i = 0; i < STAGES.length; i++) {
    if (stopped()) break;
    const st: State = await call(`/api/plans/${id}`);
    const stage = STAGES[i];
    const needsAi = stage.key !== 'screen';
    if (!stage.needed(st)) phases[i].state = 'skip';
    else if (needsAi && !ai) (phases[i].state = 'skip'), (phases[i].note = 'AI is off on this site');
    else {
      phases[i] = { ...phases[i], state: 'run' };
      push();
      try {
        const failed = (await stage.run(st, post, (t) => ((phases[i].note = t), push()))) as string[] | void;
        phases[i].state = 'ok';
        phases[i].note = failed?.length ? `${failed.length} could not finish: ${failed[0]}` : undefined;
      } catch (e) {
        phases[i].state = 'fail';
        phases[i].note = (e as Error).message;
      }
      await refresh();
    }
    push();
  }
}
