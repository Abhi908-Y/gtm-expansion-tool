// Everything a visitor can do to a plan. The API routes are thin wrappers around this.
import { analyse, cleanDomain } from './compete/compete';
import { Bad } from './errors';
import { geminiConfigured, geminiJson, geminiSearchJson } from './research/gemini';
import { chatTurn, validateProposals } from './chat/agent';
import { loadMeta } from './data/sources';
import { PRESETS, TZ } from './data/regions';
import { accessFor, buildRaw, createDraft, disconnect, gmailStatus, sendMessage, validEmail } from './google';
import { contactsOf } from './outreach/export';
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

/** The plan as the page needs it, plus whether this browser's Gmail is connected. */
export async function viewFor(ws: string, p: Project) {
  return { ...view(p), gmail: await gmailStatus(ws) };
}

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
      if (Array.isArray(b.isos)) {
        if (!READINESS.includes(b.readiness)) throw new Bad('Unknown readiness');
        const valid = new Set(p.regions.flatMap((r) => r.countries));
        for (const iso of b.isos) if (valid.has(iso)) (p.countries[iso] ??= {}).readiness = b.readiness;
        break;
      }
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
      // The conversation lives in the browser. The server never writes the plan here, so a chat message can never overwrite research that is saving at the same moment.
      const hist = (Array.isArray(b.history) ? b.history : [])
        .filter((m: any) => (m?.role === 'user' || m?.role === 'model') && typeof m.text === 'string')
        .slice(-12)
        .map((m: any) => ({ role: m.role as 'user' | 'model', text: m.text.slice(0, 4000) }));
      const t = await chatTurn(p, message, hist, !!b.web, String(b.screen ?? '').slice(0, 30));
      return { ok: true, failed, reply: t.answer, evidence: t.evidence, proposals: t.proposals, dropped: t.dropped, warnings: t.warnings, sources: t.sources };
    }

    case 'regions': {
      const have = new Set(p.regions.flatMap((r) => r.countries));
      const put = (name: string, base: { ai: 'microsoft' | 'eurostat'; partner: 'eurostat' | 'desk' }, iso: string[]) => {
        const fresh = iso.filter((c) => !have.has(c));
        if (!fresh.length) throw new Bad('Those countries are already in the plan');
        let r = p.regions.find((x) => x.name === name);
        if (!r) p.regions.push((r = { name, ai: base.ai, partner: base.partner, countries: [] }));
        for (const c of fresh) {
          r.countries.push(c);
          p.countries[c] = { ...(p.countries[c] ?? {}), ...(TZ[c] ? { tz: TZ[c] } : {}) };
        }
      };
      if (b.op === 'add_preset') {
        const pre = PRESETS.find((x) => x.id === b.id);
        if (!pre) throw new Bad('Unknown region');
        if (p.regions.some((r) => r.name === pre.name)) throw new Bad(`${pre.name} is already in the plan`);
        put(pre.name, pre, pre.countries);
      } else if (b.op === 'add_countries') {
        const meta = await loadMeta();
        const iso = (Array.isArray(b.iso3s) ? b.iso3s : []).filter((c: unknown): c is string => typeof c === 'string' && meta.has(c)).slice(0, 20);
        if (!iso.length) throw new Bad('No valid countries to add');
        put('Other countries', { ai: 'microsoft', partner: 'desk' }, iso);
      } else throw new Bad('Unknown regions action');
      await runScreen(p, false); // score the new countries from cached public data
      break;
    }

    case 'apply': {
      // Re-check the proposal from scratch: the browser can send anything.
      const v = await validateProposals([b.raw], p);
      const pr = v.ok[0];
      if (!pr) throw new Bad(v.dropped[0] ?? 'That change is no longer valid.');
      const a = pr.args;
      const sub = (action: string, body: object) => act(ws, id, action, body);
      switch (pr.type) {
        case 'add_countries': await sub('regions', { op: 'add_countries', iso3s: a.iso3s }); break;
        case 'add_region': await sub('regions', { op: 'add_preset', id: a.id }); break;
        case 'add_competitor':
          await sub('competitor', { op: 'add', name: a.name, domain: a.domain });
          if (a.analyse) await sub('competitor', { op: 'analyse', domains: [a.domain] }).catch((e) => failed.push(`${a.name} was added but could not be analysed: ${e.message}`));
          break;
        case 'remove_competitors': for (const d of a.domains) await sub('competitor', { op: 'remove', domain: d }); break;
        case 'add_account': await sub('account', { op: 'add', name: a.name, website: a.website, source: 'manual' }); break;
        case 'remove_accounts': for (const aid of a.ids) await sub('account', { op: 'remove', id: aid }); break;
        case 'set_readiness': await sub('country', { isos: a.iso3s, readiness: a.readiness }); break;
        case 'mark_out': await sub('country', { iso3: a.iso3, humanGate: { fail: true, reason: a.reason } }); break;
        case 'set_assumptions': await sub('strategy', { op: 'assumptions', assumptions: a.assumptions }); break;
        case 'add_note': await sub('note', { op: 'add', text: a.text }); break;
        default: throw new Bad('That action runs in the browser, not on the server.');
      }
      return { ok: true, failed, done: pr.label };
    }

    case 'gmail': {
      if (b.op === 'disconnect') {
        await disconnect(ws);
        return { ok: true, failed };
      }
      if (b.op !== 'draft' && b.op !== 'send') throw new Bad('Unknown Gmail action');
      const mode: 'draft' | 'send' = b.op === 'send' ? 'send' : 'draft';
      const sender = String(b.senderName ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
      if (mode === 'send' && b.confirm !== true) throw new Bad('Confirm the send first');
      if (mode === 'send' && !sender) throw new Bad('Enter your name first: it replaces [Your name] in the sign-off.');
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 40) as { id: string; person: string }[];
      if (!items.length) throw new Bad('Tick at least one person');
      const n = [1, 2, 3].includes(Number(b.n)) ? Number(b.n) : 1;
      const at = await accessFor(ws);
      const results: { account: string; person: string; status: 'ok' | 'skipped' | 'failed'; note: string }[] = [];
      for (const it of items) {
        const acc = p.outreach?.accounts.find((x) => x.id === it.id);
        const c = acc && contactsOf(acc).find((x) => String(x.person.name) === String(it.person));
        const r = { account: acc?.name ?? '?', person: String(it.person), status: 'skipped' as 'ok' | 'skipped' | 'failed', note: '' };
        results.push(r);
        const email = c?.draft?.emails?.[n - 1];
        const to = validEmail(c?.person.email) ? (c!.person.email as string) : null;
        const done = (m: 'draft' | 'send') => acc!.log?.some((l) => l.person === r.person && l.n === n && l.mode === m && l.status === 'ok');
        if (!acc || !c || !email?.body) r.note = 'No draft written yet';
        else if (mode === 'send' && !to) r.note = 'No email address published';
        else if (mode === 'send' && c.draft?.issues?.length) r.note = 'The draft breaks the length or phrase rules';
        else if (mode === 'send' && !c.check) r.note = 'Grade the drafts first';
        else if (mode === 'send' && c.check?.verdict === 'blocked') r.note = 'Blocked by the draft grader';
        else if (done('send')) r.note = 'Already sent';
        else if (mode === 'draft' && done('draft') && !b.again) r.note = 'Already in your Gmail drafts';
        else {
          try {
            const raw = buildRaw({ to, subject: String(email.subject), body: String(email.body).replace('[Your name]', sender || '[Your name]') });
            if (mode === 'send') await sendMessage(at, raw);
            else await createDraft(at, raw);
            r.status = 'ok';
            r.note = mode === 'send' ? 'Sent' : to ? 'Draft created' : 'Draft created without a recipient';
          } catch (e) {
            r.status = 'failed';
            r.note = e instanceof Error ? e.message.slice(0, 200) : 'Gmail failed';
          }
        }
        if (acc) (acc.log ??= []).push({ at: new Date().toISOString(), person: r.person, n, mode, to: to ?? undefined, status: r.status, note: r.note });
        if (mode === 'send') await new Promise((ok) => setTimeout(ok, 400)); // send slowly: bursts look like spam to mail providers
      }
      await saveProject(ws, p);
      return { ok: true, failed, results };
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
