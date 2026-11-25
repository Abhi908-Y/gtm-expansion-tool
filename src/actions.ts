// Everything a visitor can do to a plan. The API routes are thin wrappers around this.
import { analyse, cleanDomain } from './compete/compete';
import { Bad } from './errors';
import { geminiChat, geminiConfigured, geminiJson, geminiSearchJson } from './research/gemini';
import { chatContext, chatSystem } from './chat/context';
import { runProfile } from './research/runProfile';
import { READINESS } from './screen/screen';
import { scrapeSite } from './scrape/site';
import { randomBytes } from 'node:crypto';
import { baseFor, buildIcp, pickCandidates, researchStep, STEPS, suggestedAccounts, type Step } from './outreach/pipeline';
import { runPlaybook } from './strategy/playbook';
import { DEFAULTS, funnel, regionFacts, validateAssumptions } from './strategy/strategy';
import { competeView, compute, countryNames, loadProject, runScreen, saveProject, type Project } from './store';

/**
 * Run several slow jobs at once inside ONE request, so their results are saved together (separate requests that each
 * load and save the whole plan would overwrite each other). One failure does not lose the others.
 */
async function settle<T>(items: T[], label: (t: T) => string, fn: (t: T) => Promise<void>): Promise<string[]> {
  const rs = await Promise.allSettled(items.map(fn));
  const failed = rs.flatMap((r, i) => (r.status === 'rejected' ? [`${label(items[i])}: ${r.reason instanceof Error ? r.reason.message : r.reason}`] : []));
  if (items.length && failed.length === items.length) throw new Bad(failed[0] + (failed.length > 1 ? ` (and ${failed.length - 1} more)` : ''), 502);
  return failed;
}

const needGemini = () => {
  const why = geminiConfigured();
  if (why) throw new Bad(`${why}. The site owner needs to add it.`, 503);
};

export function view(p: Project) {
  const computed = compute(p);
  const compete = competeView(p);
  return {
    project: { ...p, indicators: undefined },
    computed,
    compete,
    suggested: (p.competitors ?? []).filter((c) => c.status === 'suggested'),
    outreach: p.outreach ?? { accounts: [] },
    suggestedAccounts: suggestedAccounts(p),
    strategy: {
      assumptions: p.strategy?.assumptions ?? DEFAULTS,
      playbooks: p.strategy?.playbooks ?? {},
      facts: regionFacts(computed.regions, compete.perCountry, p.baseTz, (c) => p.countries[c]?.tz),
    },
    notes: p.notes ?? [],
    chat: p.chat ?? [],
    gemini: !geminiConfigured(),
  };
}

export async function act(ws: string, id: string, action: string, b: any) {
  const p = await loadProject(ws, id);
  if (p.isSample && !['screen', 'chat', 'note'].includes(action)) throw new Bad('This is the read-only Vobiz example. Start your own plan to change things.', 403);
  const list = (p.competitors ??= []);
  let failed: string[] = [];

  switch (action) {
    case 'screen':
      await runScreen(p, !!b.force);
      break;

    case 'profile':
      p.profile = await runProfile(p.company, p.website);
      break;

    case 'country': {
      const iso3 = String(b.iso3 ?? '');
      if (!p.regions.some((r) => r.countries.includes(iso3))) throw new Bad('Unknown country');
      const c = (p.countries[iso3] ??= {});
      if (b.readiness !== undefined) {
        if (!READINESS.includes(b.readiness)) throw new Bad('Unknown readiness');
        c.readiness = b.readiness;
      }
      if (b.desk) {
        for (const [k, v] of Object.entries(b.desk as Record<string, number | null>)) {
          if (!['competition', 'rules', 'partner'].includes(k)) throw new Bad(`Unknown field ${k}`);
          if (v === null) {
            delete c.desk?.[k as 'rules'];
            delete c.reasons?.[k];
          } else {
            if (!Number.isInteger(v) || v < 1 || v > 5) throw new Bad('Analyst scores are whole numbers from 1 to 5');
            const reason = String(b.reason ?? '').trim();
            if (!reason) throw new Bad('A reason is required for an analyst score');
            (c.desk ??= {})[k as 'rules'] = v;
            (c.reasons ??= {})[k] = reason.slice(0, 300);
          }
        }
      }
      if (b.humanGate !== undefined) {
        if (b.humanGate === null) delete c.humanGate;
        else {
          const reason = String(b.humanGate.reason ?? '').trim();
          if (!reason) throw new Bad('A reason is required for a gate call');
          c.humanGate = { fail: !!b.humanGate.fail, reason: reason.slice(0, 300) };
        }
      }
      break;
    }

    case 'competitor': {
      const domain = cleanDomain(String(b.domain ?? ''));
      if (b.op === 'add') {
        const name = String(b.name ?? '').trim().slice(0, 80);
        if (!name || !domain) throw new Bad('A name and a valid website are required');
        if (list.some((c) => c.domain === domain)) throw new Bad(`${domain} is already in the list`);
        list.push({ name, domain, status: 'accepted' });
        break;
      }
      if (b.op === 'accept_all') {
        let n = list.filter((c) => c.status === 'accepted').length;
        for (const c of list) if (c.status === 'suggested' && n < Math.min(Number(b.max) || 10, 20)) (c.status = 'accepted'), n++;
        break;
      }
      if (b.op === 'analyse') {
        needGemini();
        const ctx = {
          company: p.company,
          countries: Object.entries(countryNames(p)).map(([iso3, name]) => ({ iso3, name })),
          ask: geminiJson,
          scrape: async (d: string) => {
            const site = await scrapeSite(d, { maxSubpages: 6, deep: true });
            return { pages: site.pages.map((x) => ({ url: x.url, text: x.text, full: x.full })), failures: site.failures.map((f) => `${f.code}: ${f.url} (${f.detail})`) };
          },
        };
        const todo: string[] = [];
        for (const d of Array.isArray(b.domains) ? b.domains : [b.domain]) {
          const c = cleanDomain(String(d));
          if (c && todo.length < 4) todo.push(c);
        }
        if (!todo.length) throw new Bad('Unknown competitor');
        failed = await settle(todo, (d) => d, async (d) => {
          const i = list.findIndex((c) => c.domain === d);
          if (i < 0) throw new Bad('Unknown competitor');
          list[i] = await analyse(list[i], ctx);
        });
        break;
      }
      const i = list.findIndex((c) => c.domain === domain);
      if (i < 0) throw new Bad('Unknown competitor');
      if (b.op === 'remove') list.splice(i, 1);
      else if (b.op === 'accept') list[i].status = 'accepted';
      else throw new Bad('Unknown competitor action');
      break;
    }

    case 'icp':
      needGemini();
      await buildIcp(p);
      break;

    case 'account': {
      const o = (p.outreach ??= { accounts: [] });
      if (b.op === 'add') {
        const name = String(b.name ?? '').trim().slice(0, 100);
        if (!name) throw new Bad('Enter the company name');
        if (o.accounts.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new Bad(name + ' is already an account');
        if (o.accounts.length >= 60) throw new Bad('A plan holds up to 60 accounts');
        o.accounts.push({
          id: randomBytes(3).toString('hex'),
          name,
          source: ['icp', 'competitor_customer'].includes(b.source) ? b.source : 'manual',
          note: b.note ? String(b.note).slice(0, 300) : undefined,
          website: cleanDomain(String(b.website ?? '')) ?? undefined,
          region: b.region ? String(b.region).slice(0, 80) : undefined,
          doNotUse: [],
        });
      } else if (b.op === 'add_top') {
        for (const c of pickCandidates(o.icp, o.accounts, Math.min(Number(b.n) || 3, 5)))
          o.accounts.push({ id: randomBytes(3).toString('hex'), name: String(c.name).slice(0, 100), source: 'icp', website: cleanDomain(String(c.website ?? '')) ?? undefined, region: c.region ? String(c.region).slice(0, 80) : undefined, note: c.why_fit ? String(c.why_fit).slice(0, 300) : undefined, doNotUse: [] });
      } else if (b.op === 'remove') o.accounts = o.accounts.filter((x) => x.id !== b.id);
      else throw new Bad('Unknown account action');
      break;
    }

    case 'research': {
      needGemini();
      if (!STEPS.includes(b.step)) throw new Bad('Unknown step');
      const ids: string[] = (Array.isArray(b.ids) ? b.ids : [b.id]).slice(0, 5);
      const accs = (p.outreach?.accounts ?? []).filter((x) => ids.includes(x.id));
      if (!accs.length) throw new Bad('Unknown account');
      failed = await settle(accs, (a) => a.name, (a) => researchStep(p, a, b.step as Step));
      break;
    }

    case 'strategy': {
      const s = (p.strategy ??= { assumptions: DEFAULTS, playbooks: {} });
      if (b.op === 'assumptions') {
        const a = validateAssumptions(b.assumptions);
        if (!a) throw new Bad('Leads must be a whole number from 1 to 50,000 and each rate between 0.1% and 100%.');
        s.assumptions = a;
      } else if (b.op === 'playbook') {
        needGemini();
        if (!p.ranAt) throw new Bad('Screen the countries first: the playbook follows the entry order.');
        const all = view(p).strategy.facts;
        const wanted: string[] = Array.isArray(b.regions) ? b.regions : [b.region];
        const todo = all.filter((x) => wanted.includes(x.name) && x.byVerdict.length).slice(0, 4);
        if (!todo.length) throw new Bad('Unknown region');
        failed = await settle(todo, (x) => x.name, async (v) => {
          s.playbooks[v.name] = { ...(await runPlaybook(baseFor(p), v, p.outreach?.icp, funnel(s.assumptions))), builtAt: new Date().toISOString() };
        });
      } else throw new Bad('Unknown strategy action');
      break;
    }

    case 'chat': {
      needGemini();
      const message = String(b.message ?? '').trim().slice(0, 4000);
      if (!message) throw new Bad('Type a question first');
      const hist = (p.chat ??= []);
      const r = await geminiChat(chatSystem(chatContext(p), !!b.web), hist.slice(-12), message, !!b.web);
      const at = new Date().toISOString();
      hist.push({ role: 'user', text: message, at }, { role: 'model', text: r.text, at, sources: b.web ? r.sources.slice(0, 6) : undefined });
      p.chat = hist.slice(-40);
      break;
    }

    case 'note': {
      const notes = (p.notes ??= []);
      if (b.op === 'add') {
        const text = String(b.text ?? '').trim().slice(0, 2000);
        if (!text) throw new Bad('Write the note first');
        if (notes.length >= 30) throw new Bad('A plan holds up to 30 notes');
        notes.push({ id: randomBytes(3).toString('hex'), text, at: new Date().toISOString() });
      } else if (b.op === 'remove') p.notes = notes.filter((n) => n.id !== b.id);
      else throw new Bad('Unknown note action');
      break;
    }

    case 'discover': {
      needGemini();
      const { data } = await geminiSearchJson(
        `Using Google Search, find up to 12 companies that compete with or could partner with ${p.company}. About ${p.company}: ${p.context || p.website}\nAlready known (exclude): ${list.map((c) => c.name).join(', ') || 'none'}\nReturn {"candidates":[{"name":"...","domain":"example.com","why":"one short sentence"}]}`,
      );
      let added = 0;
      for (const c of ((data as any)?.candidates ?? []) as { name?: string; domain?: string; why?: string }[]) {
        const d = cleanDomain(String(c.domain ?? ''));
        if (!c.name || !d || list.some((x) => x.domain === d)) continue;
        list.push({ name: String(c.name).slice(0, 80), domain: d, status: 'suggested', note: String(c.why ?? '').slice(0, 200) });
        added++;
      }
      await saveProject(ws, p);
      return { ok: true, added };
    }

    default:
      throw new Bad('Unknown action', 404);
  }
  await saveProject(ws, p);
  return { ok: true, failed };
}
