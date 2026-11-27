// Server side of the outreach CRM. One document per workspace; every action loads it, changes it and saves it.
// Nothing is sent without the visitor's explicit confirmation, and a lead is never emailed twice for the same step.
import { getDoc, putDoc } from '../db';
import { Bad } from '../errors';
import { accessFor, buildRaw, createDraft, disconnect, gmailStatus, sendRaw, validEmail } from '../google';
import { type Crm, type Kind, type Lead, type LogEntry, type Settings, type Step, RUNNING, STAGES, DEFAULT_SETTINGS, defaultCrm, emptyLead, leadId, render, skipReason, unknownTokens } from './model';

const KEY = 'vobiz-crm';
export const DAILY_CAP = 400; // Gmail allows about 500 a day on a free account; stay clear of it
const MAX_LEADS = 5000;
const today = () => new Date().toISOString().slice(0, 10);
const str = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const opt = (v: unknown, n: number) => str(v, n) || undefined;
const isKind = (k: unknown): k is Kind => k === 'partner' || k === 'enterprise';
const ids = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x)))].slice(0, 1000);

async function load(ws: string): Promise<Crm> {
  const base = defaultCrm();
  const d = await getDoc<Crm>(ws, KEY);
  return d ? { ...base, ...d, settings: { ...base.settings, ...d.settings }, sequences: { ...base.sequences, ...d.sequences } } : base;
}
const save = (ws: string, c: Crm) => putDoc(ws, KEY, c);
const note = (l: Lead, channel: LogEntry['channel'], text: string) => (l.log.push({ at: new Date().toISOString(), channel, text }), l.log.length > 200 && l.log.splice(0, l.log.length - 200));

/** Everything that comes from the browser is checked again: a lead is rebuilt from known fields only. */
function cleanLead(r: any, now: string): Lead | null {
  const company = str(r?.company, 120);
  const name = str(r?.name, 120);
  if (!company || !name) return null;
  const email = str(r?.email, 200).toLowerCase();
  const linkedin = str(r?.linkedin, 300);
  return emptyLead(
    {
      kind: isKind(r.kind) ? r.kind : 'partner', company, name, firstName: str(r.firstName, 60) || name.split(/\s+/)[0],
      country: str(r.country, 60), region: opt(r.region, 40), sector: str(r.sector, 80),
      website: opt(r.website, 200), title: opt(r.title, 150),
      email: validEmail(email) ? email : undefined, emailStatus: opt(r.emailStatus, 30),
      linkedin: /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\//i.test(linkedin) ? linkedin : undefined,
      phone: opt(r.phone, 40), tier: opt(r.tier, 10),
    } as Partial<Lead> & { company: string; name: string },
    now,
  );
}

const pick = (c: Crm, wanted: string[]) => {
  const set = new Set(wanted);
  return c.leads.filter((l) => set.has(l.id));
};

export async function crmAct(ws: string, action: string, b: any) {
  const c = await load(ws);
  const now = new Date().toISOString();
  const status = () => gmailStatus(ws);

  switch (action) {
    case 'load':
      return { ok: true, crm: c, gmail: await status() };

    case 'import': {
      const rows = (Array.isArray(b.leads) ? b.leads : []).slice(0, 2000);
      const byId = new Map(c.leads.map((l) => [l.id, l]));
      let added = 0;
      let updated = 0;
      for (const r of rows) {
        const n = cleanLead(r, now);
        if (!n) continue;
        const have = byId.get(n.id);
        if (have) {
          // keep everything that has happened; refresh the contact facts
          Object.assign(have, { title: n.title ?? have.title, email: n.email ?? have.email, emailStatus: n.emailStatus ?? have.emailStatus, linkedin: n.linkedin ?? have.linkedin, phone: n.phone ?? have.phone, website: n.website ?? have.website, sector: have.sector || n.sector, tier: n.tier ?? have.tier });
          updated++;
        } else if (c.leads.length < MAX_LEADS) {
          c.leads.push(n);
          byId.set(n.id, n);
          added++;
        }
      }
      await save(ws, c);
      return { ok: true, added, updated, total: c.leads.length };
    }

    case 'add': {
      const n = cleanLead(b.lead, now);
      if (!n) throw new Bad('A person needs a name and a company.');
      if (c.leads.some((l) => l.id === n.id)) throw new Bad('That person is already in the list.');
      c.leads.push(n);
      await save(ws, c);
      return { ok: true, id: n.id };
    }

    case 'update': {
      const patch = b.patch ?? {};
      const hit = pick(c, ids(b.ids));
      for (const l of hit) {
        if (STAGES.some((s) => s.id === patch.stage) && patch.stage !== l.stage) {
          note(l, 'status', `Stage: ${STAGES.find((s) => s.id === l.stage)?.label} → ${STAGES.find((s) => s.id === patch.stage)?.label}`);
          l.stage = patch.stage;
        }
        if (typeof patch.sector === 'string') l.sector = str(patch.sector, 80);
        if (isKind(patch.kind)) l.kind = patch.kind;
        if (typeof patch.notes === 'string') l.notes = str(patch.notes, 2000);
        if (typeof patch.followUp === 'string') l.followUp = /^\d{4}-\d\d-\d\d$/.test(patch.followUp) ? patch.followUp : undefined;
        if (typeof patch.phone === 'string') l.phone = opt(patch.phone, 40);
      }
      await save(ws, c);
      return { ok: true, changed: hit.length };
    }

    case 'start': {
      const date = /^\d{4}-\d\d-\d\d$/.test(b.date) ? b.date : today();
      let n = 0;
      for (const l of pick(c, ids(b.ids))) if (RUNNING.includes(l.stage) && (!l.startedAt || b.restart === true)) ((l.startedAt = date), note(l, 'status', `Sequence started (day 1 = ${date})`), n++);
      await save(ws, c);
      return { ok: true, started: n };
    }

    case 'done': {
      // a step done by hand (a LinkedIn message, or an email sent outside the app)
      const hit = pick(c, ids(b.ids));
      let n = 0;
      for (const l of hit) {
        const step = c.sequences[l.kind].find((s) => s.id === b.step);
        if (!step || l.done[step.id]) continue;
        l.done[step.id] = { at: now, how: 'manual' };
        l.startedAt ??= today();
        if (l.stage === 'new') l.stage = 'contacted';
        note(l, step.channel, `${step.title}: marked as done`);
        n++;
      }
      await save(ws, c);
      return { ok: true, changed: n };
    }

    case 'undo': {
      for (const l of pick(c, ids(b.ids))) if (l.done[String(b.step)]) (delete l.done[String(b.step)], note(l, 'status', `Step ${String(b.step)} reopened`));
      await save(ws, c);
      return { ok: true };
    }

    case 'log': {
      const channel = b.channel === 'whatsapp' ? 'whatsapp' : 'note';
      const text = str(b.text, 500);
      if (!text) throw new Bad('Write what happened first.');
      const hit = pick(c, ids(b.ids));
      for (const l of hit) {
        note(l, channel, text);
        if (channel === 'whatsapp' && l.stage === 'new') l.stage = 'contacted';
      }
      await save(ws, c);
      return { ok: true, changed: hit.length };
    }

    case 'remove': {
      const gone = new Set(ids(b.ids));
      c.leads = c.leads.filter((l) => !gone.has(l.id));
      await save(ws, c);
      return { ok: true, total: c.leads.length };
    }

    case 'sequence': {
      if (!isKind(b.kind)) throw new Bad('Unknown list');
      const steps: Step[] = (Array.isArray(b.steps) ? b.steps : []).slice(0, 10).map((s: any, i: number) => ({
        id: /^[a-z0-9-]{2,20}$/.test(String(s.id)) ? String(s.id) : `step-${i + 1}`,
        day: Math.min(60, Math.max(1, Math.round(Number(s.day) || 1))),
        channel: s.channel === 'linkedin' ? 'linkedin' : 'email',
        title: str(s.title, 60) || `Step ${i + 1}`,
        subject: s.channel === 'linkedin' ? undefined : str(s.subject, 150),
        body: str(s.body, 3000),
      }));
      if (!steps.length || steps.some((s) => !s.body)) throw new Bad('Every step needs a message.');
      if (new Set(steps.map((s) => s.id)).size !== steps.length) throw new Bad('Two steps share an id.');
      const bad = steps.flatMap((s) => unknownTokens(`${s.subject ?? ''} ${s.body}`));
      if (bad.length) throw new Bad(`Unknown field: {${bad[0]}}. Use {First Name}, {Company}, {Sector}, {Country}, {Region}, {Title} or {Sender Name}.`);
      c.sequences[b.kind as Kind] = steps.sort((x, y) => x.day - y.day);
      await save(ws, c);
      return { ok: true };
    }

    case 'settings': {
      const s: Settings = { senderName: str(b.senderName, 80).replace(/[\r\n]/g, ' '), cc: str(b.cc, 200), signature: str(b.signature, 800) || DEFAULT_SETTINGS.signature, whatsapp: str(b.whatsapp, 800) || DEFAULT_SETTINGS.whatsapp };
      if (s.cc && !validEmail(s.cc)) throw new Bad('The CC address is not a valid email.');
      c.settings = s;
      await save(ws, c);
      return { ok: true };
    }

    case 'disconnect':
      await disconnect(ws);
      return { ok: true };

    case 'send':
      return send(ws, c, b);

    default:
      throw new Bad('Unknown action', 404);
  }
}

/** Email one step to many people. `mode`: send (real), draft (Gmail drafts) or test (one email to your own address). */
async function send(ws: string, c: Crm, b: any) {
  const mode = b.mode === 'send' || b.mode === 'draft' || b.mode === 'test' ? (b.mode as 'send' | 'draft' | 'test') : null;
  if (!mode) throw new Bad('Unknown mode');
  const { senderName, cc } = c.settings;
  if (mode !== 'draft' && !senderName.trim()) throw new Bad('Enter your name in Settings first: it goes in the sign-off.');
  if (mode === 'send' && b.confirm !== true) throw new Bad('Confirm the send first.');
  const leads = pick(c, ids(b.ids).slice(0, 40));
  if (!leads.length) throw new Bad('Tick at least one person.');
  const stepId = String(b.step ?? '');
  const sentToday = c.leads.reduce((n, l) => n + Object.values(l.done).filter((d) => d.how === 'sent' && d.at.slice(0, 10) === today()).length, 0);
  if (mode === 'send' && sentToday + leads.length > DAILY_CAP) throw new Bad(`That would pass the daily limit of ${DAILY_CAP} emails (${sentToday} already sent today). Send fewer, or wait until tomorrow.`);

  const at = await accessFor(ws);
  const own = (await gmailStatus(ws)).email;
  if (mode === 'test' && !validEmail(own)) throw new Bad('Could not read your Gmail address. Connect Gmail again.');

  const results: { id: string; name: string; status: 'sent' | 'draft' | 'test' | 'skipped' | 'failed'; note: string }[] = [];
  for (const l of mode === 'test' ? leads.slice(0, 1) : leads) {
    const r = { id: l.id, name: l.name, status: 'skipped' as (typeof results)[number]['status'], note: '' };
    results.push(r);
    const step = c.sequences[l.kind].find((s) => s.id === stepId);
    const why = skipReason(l, step, c.settings, { allowUnverified: b.allowUnverified === true, test: mode === 'test' });
    if (why || !step) r.note = why || 'This list has no such step';
    else {
      const subject = render(step.subject ?? '', l, c.settings);
      const text = render(`${step.body}

${c.settings.signature}`, l, c.settings);
      try {
        const raw = buildRaw({ to: mode === 'test' ? own : l.email!, cc: mode === 'send' ? cc || null : null, subject: (mode === 'test' ? '[TEST] ' : '') + subject.text, body: text.text });
        if (mode === 'draft') await createDraft(at, raw);
        const sent = mode === 'draft' ? null : await sendRaw(at, raw);
        r.status = mode === 'test' ? 'test' : mode === 'draft' ? 'draft' : 'sent';
        r.note = mode === 'test' ? `Sent to ${own}` : mode === 'draft' ? 'Draft created in Gmail' : 'Sent';
        if (mode !== 'test') {
          l.done[step.id] = { at: new Date().toISOString(), how: mode === 'send' ? 'sent' : 'draft', ref: sent?.id, thread: sent?.thread };
          l.startedAt ??= today();
          if (mode === 'send' && l.stage === 'new') l.stage = 'contacted';
          note(l, 'email', `${step.title}: ${mode === 'send' ? 'sent' : 'saved as a Gmail draft'} to ${l.email} ("${subject.text}")`);
          await save(ws, c); // saved after every email, so a timeout can never cause a double send
        }
      } catch (e) {
        r.status = 'failed';
        r.note = e instanceof Error ? e.message.slice(0, 200) : 'Gmail failed';
      }
      if (mode === 'send') await new Promise((ok) => setTimeout(ok, 500)); // send slowly: bursts look like spam
    }
  }
  return { ok: true, results, sentToday: sentToday + results.filter((r) => r.status === 'sent').length };
}

export { leadId };
