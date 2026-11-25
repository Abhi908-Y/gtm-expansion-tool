// The chat assistant. It answers from the plan and can PROPOSE changes; it never changes anything itself.
// Code decides what is trustworthy: numbers must exist in the data, evidence must be a real excerpt, and every proposal is
// validated (countries must exist, a competitor's website must open and mention its name) before the user ever sees it.
import { createHash } from 'node:crypto';
import { cleanDomain, ALIASES } from '../compete/compete';
import { loadMeta } from '../data/sources';
import { PRESETS } from '../data/regions';
import { geminiJson, geminiSearchText } from '../research/gemini';
import { fetchPage } from '../scrape/fetchPage';
import { READINESS } from '../screen/screen';
import { validateAssumptions } from '../strategy/strategy';
import type { Project } from '../store';
import { chatContext } from './context';

type Json = Record<string, any>;
export type Meta = Map<string, { iso3: string; iso2: string; name: string }>;
export type Deps = { meta: () => Promise<Meta>; probe: (domain: string) => Promise<{ ok: boolean; text: string }> };
export const realDeps: Deps = {
  meta: () => loadMeta(),
  probe: async (d) => {
    const r = await fetchPage(`https://${d}`, { reader: false, cache: false });
    return r.ok ? { ok: true, text: `${r.page.title ?? ''} ${r.page.text.slice(0, 4000)}` } : { ok: false, text: '' };
  },
};

export type Proposal = { id: string; type: string; label: string; why?: string; warn?: string; args: Json; raw: Json };

const norm = (s: string) => s.toLowerCase().replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

// ---------- guards on the answer ----------
const numbersIn = (t: string) => [...t.matchAll(/\d[\d,]*\.?\d*/g)].map((m) => ({ raw: m[0], n: parseFloat(m[0].replace(/,/g, '')) })).filter((x) => Number.isFinite(x.n));

/** Figures in an answer that appear nowhere in the data it was given. Small whole numbers and years are ignored; rounding is allowed. */
export function unsupportedNumbers(answer: string, support: string): string[] {
  const have = numbersIn(support).map((x) => x.n);
  const bad = new Set<string>();
  for (const { raw, n } of numbersIn(answer)) {
    const whole = Number.isInteger(n) && !raw.includes('.');
    if (whole && (n < 10 || (n >= 1990 && n <= 2100))) continue;
    const tol = whole ? 0.51 : 0.051;
    if (!have.some((h) => Math.abs(h - n) < tol || (whole && Math.abs(Math.round(h) - n) < 0.5))) bad.add(raw.replace(/[.,]$/, ''));
  }
  return [...bad];
}
export const inSupport = (snippet: string, support: string) => snippet.trim().length >= 6 && norm(support).includes(norm(snippet));

// ---------- proposals ----------
function countryIndex(meta: Meta) {
  const m = new Map<string, string>();
  const add = (k: string, iso: string) => m.set(norm(k), iso);
  for (const c of meta.values()) (add(c.name, c.iso3), add(c.name.split(',')[0], c.iso3), add(c.iso3, c.iso3));
  for (const [iso, list] of Object.entries(ALIASES)) for (const a of list) add(a, iso);
  return m;
}
const idOf = (type: string, args: Json) => createHash('sha1').update(type + JSON.stringify(args)).digest('hex').slice(0, 8);
const list = (v: unknown, n = 12) => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, n) : []);

/** Turn what the model proposed into changes the app is willing to make. Anything that cannot be verified is dropped with a reason. */
export async function validateProposals(rawList: unknown, p: Project, deps: Deps = realDeps): Promise<{ ok: Proposal[]; dropped: string[] }> {
  const ok: Proposal[] = [];
  const dropped: string[] = [];
  let index: Map<string, string> | null = null;
  let metaMap: Meta | null = null;
  const idx = async () => ((metaMap ??= await deps.meta()), (index ??= countryIndex(metaMap)));
  const inPlan = new Set(p.regions.flatMap((r) => r.countries));
  const names = (iso: string[]) => iso.map((i) => metaMap?.get(i)?.name ?? i);

  for (const r of (Array.isArray(rawList) ? rawList : []).slice(0, 4) as Json[]) {
    const type = String(r?.type ?? '');
    const why = r?.why ? String(r.why).slice(0, 200) : undefined;
    const done = (args: Json, label: string, warn?: string) => ok.push({ id: idOf(type, args), type, label, why, warn, args, raw: r });
    try {
      if (type === 'add_countries') {
        const i = await idx();
        const found = list(r.countries, 20).map((n) => ({ n, iso: i.get(norm(n)) }));
        dropped.push(...found.filter((f) => !f.iso).map((f) => `I could not match "${f.n}" to a country, so I left it out.`));
        const fresh = [...new Set(found.flatMap((f) => (f.iso && !inPlan.has(f.iso) ? [f.iso] : [])))];
        if (found.some((f) => f.iso && inPlan.has(f.iso))) dropped.push(`${found.filter((f) => f.iso && inPlan.has(f.iso)).map((f) => f.n).join(', ')} already in the plan.`);
        if (fresh.length) done({ iso3s: fresh }, `Add ${names(fresh).join(', ')} to the plan and score ${fresh.length === 1 ? 'it' : 'them'}`);
      } else if (type === 'add_region') {
        const want = norm(String(r.region ?? ''));
        const pre = PRESETS.find((x) => norm(x.name) === want || x.id === want);
        if (!pre) dropped.push(`There is no preset region called "${r.region}".`);
        else if (p.regions.some((x) => x.name === pre.name)) dropped.push(`${pre.name} is already in the plan.`);
        else done({ id: pre.id }, `Add the region ${pre.name} (${pre.countries.length} countries) and score it`);
      } else if (type === 'add_competitor') {
        const name = String(r.name ?? '').trim().slice(0, 80);
        const domain = cleanDomain(String(r.domain ?? ''));
        if (!name || !domain) dropped.push(`I could not use "${r.name ?? ''}" as a competitor: it needs a name and a valid website.`);
        else if ((p.competitors ?? []).some((c) => c.domain === domain)) dropped.push(`${domain} is already in the competitor list.`);
        else {
          const pr = await deps.probe(domain);
          if (!pr.ok) dropped.push(`I could not open ${domain}, so I did not propose adding ${name}.`);
          else {
            const token = norm(name).split(' ').find((w) => w.length >= 3) ?? '';
            done({ name, domain, analyse: r.analyse !== false }, `Add ${name} (${domain}) as a competitor${r.analyse !== false ? ' and analyse it' : ''}`, token && !norm(pr.text).includes(token) ? `That website does not mention "${name}". Check the address before adding.` : undefined);
          }
        }
      } else if (type === 'remove_competitors') {
        const have = new Map((p.competitors ?? []).map((c) => [c.domain, c.name]));
        const ds = list(r.domains).map((d) => cleanDomain(d)).filter((d): d is string => !!d && have.has(d));
        if (!ds.length) dropped.push('None of those competitors are in the plan.');
        else done({ domains: ds }, `Remove ${ds.map((d) => have.get(d)).join(', ')} from the competitors`);
      } else if (type === 'add_account') {
        const name = String(r.name ?? '').trim().slice(0, 100);
        if (!name) dropped.push('An account needs a company name.');
        else if ((p.outreach?.accounts ?? []).some((a) => a.name.toLowerCase() === name.toLowerCase())) dropped.push(`${name} is already an account.`);
        else done({ name, website: cleanDomain(String(r.website ?? '')) ?? undefined }, `Add ${name} as a target account`);
      } else if (type === 'remove_accounts') {
        const accs = (p.outreach?.accounts ?? []).filter((a) => list(r.names).some((n) => n.toLowerCase() === a.name.toLowerCase()));
        if (!accs.length) dropped.push('None of those accounts are in the plan.');
        else done({ ids: accs.map((a) => a.id) }, `Remove ${accs.map((a) => a.name).join(', ')} from the accounts`);
      } else if (type === 'set_readiness') {
        const i = await idx();
        const iso = [...new Set(list(r.countries, 60).flatMap((n) => (i.get(norm(n)) && inPlan.has(i.get(norm(n))!) ? [i.get(norm(n))!] : [])))];
        if (!READINESS.includes(r.readiness)) dropped.push(`"${r.readiness}" is not a readiness level.`);
        else if (!iso.length) dropped.push('None of those countries are in the plan.');
        else done({ iso3s: iso, readiness: r.readiness }, `Set ${names(iso).join(', ')} to "${r.readiness}"`);
      } else if (type === 'mark_out') {
        const i = await idx();
        const iso = i.get(norm(String(r.country ?? '')));
        const reason = String(r.reason ?? '').trim().slice(0, 300);
        if (!iso || !inPlan.has(iso)) dropped.push(`${r.country} is not in the plan.`);
        else if (reason.length < 5) dropped.push('Ruling a country out needs a reason from you.');
        else done({ iso3: iso, reason }, `Rule ${names([iso])[0]} out: "${reason}"`);
      } else if (type === 'set_assumptions') {
        const cur = p.strategy?.assumptions ?? { leads: 1000, conversation: 0.08, meeting: 0.4, pilot: 1 / 3, proposal: 0.7, win: 0.5 };
        const next = validateAssumptions({ ...cur, ...Object.fromEntries(Object.entries(r).filter(([k]) => k in cur)) });
        if (!next) dropped.push('Those funnel numbers are out of range (leads 1 to 50,000; rates between 0.1% and 100%).');
        else done({ assumptions: next }, `Change the funnel to ${next.leads} leads, ${(next.conversation * 100).toFixed(1)}% reply, ${(next.meeting * 100).toFixed(1)}% meeting, ${(next.pilot * 100).toFixed(1)}% pilot, ${(next.proposal * 100).toFixed(1)}% proposal, ${(next.win * 100).toFixed(1)}% win`);
      } else if (type === 'add_note') {
        const text = String(r.text ?? '').trim().slice(0, 2000);
        if (text.length < 3) dropped.push('A note cannot be empty.');
        else done({ text }, `Save this note: "${text.slice(0, 120)}${text.length > 120 ? '…' : ''}"`);
      } else if (type === 'export') {
        const what = ['competitors', 'countries', 'contacts', 'kpis', 'everything'].includes(r.what) ? r.what : null;
        if (!what) dropped.push('I can export competitors, countries, contacts, weekly KPIs or everything.');
        else done({ what, format: r.format === 'csv' ? 'csv' : 'xlsx' }, `Download ${what === 'kpis' ? 'the weekly KPIs' : what === 'everything' ? 'everything' : `the ${what} list`} as ${r.format === 'csv' ? 'CSV' : 'an Excel file'}`);
      } else if (type === 'research') {
        done({ what: 'everything' }, 'Research everything that is still missing');
      } else dropped.push(`I cannot do "${type}".`);
    } catch (e) {
      dropped.push(`I could not check a proposal (${e instanceof Error ? e.message.slice(0, 80) : 'error'}).`);
    }
  }
  return { ok, dropped };
}

// ---------- the turn ----------
const SYSTEM = (screen: string, web: boolean) => `You are the analyst inside a market-entry planning tool. You answer questions about the user's plan and you can PROPOSE changes to it. You never change anything yourself: a change only happens when the user presses the button on your proposal.

RULES
1. Answer only from PLAN DATA (it includes the user's own notes)${web ? ' and WEB NOTES' : ''}. If something is not there, say "The plan does not contain that" and, if a step would produce it, propose that step. Never invent figures, names, websites, laws or sources.
2. Be short and concrete. Name the tab (Company, Countries, Competitors, Outreach, Strategy). The user is on the "${screen || 'Overview'}" tab now; "this" and "here" refer to it.
3. Copy numbers exactly as they appear in the data.
4. "evidence": 1 to 4 snippets copied EXACTLY, character for character, from PLAN DATA${web ? ' or WEB NOTES' : ''}, that support your answer. Do not paraphrase them.
5. Propose a change only when the user asks for one, or states a fact that implies one (for example "X is also a competitor" means add_competitor; "we already have two pilots in Singapore" means add_note). Never say you have done it: say what you propose and that they can press the button.
6. For a company, give its real official website (it will be checked). For a country, give its common English name.
${web ? '7. Say when something comes from the web and not from the plan.\n' : '7. Web search is off. If the user needs outside facts, tell them to tick "Search the web".\n'}
PROPOSAL TYPES (at most 4, each with a one-sentence "why"):
{"type":"add_countries","countries":["India"]}
{"type":"add_region","region":"${PRESETS.map((x) => x.name).join(' | ')}"}
{"type":"add_competitor","name":"","domain":"example.com","analyse":true}
{"type":"remove_competitors","domains":["example.com"]}
{"type":"add_account","name":"","website":"example.com"}
{"type":"remove_accounts","names":[""]}
{"type":"set_readiness","countries":[""],"readiness":"${READINESS.join(' | ')}"}
{"type":"mark_out","country":"","reason":"the user's own reason"}
{"type":"set_assumptions","leads":1000,"conversation":0.08,"meeting":0.4,"pilot":0.33,"proposal":0.7,"win":0.5}   (only the fields to change; rates are fractions)
{"type":"add_note","text":""}
{"type":"export","what":"competitors | countries | contacts | kpis | everything","format":"xlsx | csv"}
{"type":"research","what":"everything"}   (runs every step that is still missing, including for newly added countries)

Return ONLY this JSON: {"answer": "markdown, short", "evidence": ["exact snippet", ...], "proposals": [ ... ]}`;

export type Turn = { answer: string; evidence: string[]; proposals: Proposal[]; dropped: string[]; warnings: string[]; sources: { title: string; url: string }[] };

export async function chatTurn(p: Project, message: string, history: { role: string; text: string }[], web: boolean, screen: string, deps: Deps = realDeps, ask: (prompt: string) => Promise<unknown> = geminiJson): Promise<Turn> {
  const context = chatContext(p);
  let notes = '';
  let sources: Turn['sources'] = [];
  if (web) {
    const r = await geminiSearchText(`Use Google Search to research this question for the company ${p.company} (${p.context || p.website}). Write plain research notes; for every fact give the source name and date.\n\nQUESTION: ${message}`);
    notes = r.text;
    sources = r.sources.slice(0, 6);
  }
  const convo = history.map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.text}`).join('\n');
  const prompt = `${SYSTEM(screen, web)}\n\n--- PLAN DATA ---\n${context}\n${notes ? `\n--- WEB NOTES ---\n${notes}\n` : ''}\n--- CONVERSATION SO FAR ---\n${convo || '(none)'}\n\nUSER: ${message}`;
  const support = `${context}\n${notes}\n${message}\n${convo}`;

  let out = (await ask(prompt)) as Json;
  let bad = unsupportedNumbers(String(out.answer ?? ''), support);
  if (bad.length) {
    out = (await ask(`${prompt}\n\nYour previous answer used numbers that are not in the data: ${bad.join(', ')}. Rewrite the whole JSON using only numbers that appear in PLAN DATA${web ? ' or WEB NOTES' : ''}, or say the figure is not in the plan.`)) as Json;
    bad = unsupportedNumbers(String(out.answer ?? ''), support);
  }
  const answer = String(out.answer ?? '').trim() || 'I could not produce an answer. Please try again.';
  const evidence = list(out.evidence, 6).filter((e) => inSupport(e, support)).slice(0, 4);
  const { ok, dropped } = await validateProposals(out.proposals, p, deps);
  const admitsGap = /does not contain|not in the plan|isn't in the plan|no data/i.test(answer);
  const warnings = [
    bad.length ? `These figures could not be matched to the plan or the web notes: ${bad.join(', ')}. Check them before relying on them.` : '',
    !evidence.length && !web && !ok.length && !admitsGap ? 'No supporting excerpt from the plan could be verified for this answer. Treat it with caution.' : '',
  ].filter(Boolean);
  return { answer, evidence, proposals: ok, dropped, warnings, sources };
}
