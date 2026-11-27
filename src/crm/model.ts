// The outreach CRM: people at target accounts, a multi-step sequence, and what has been done to each person.
// Pure code (no Node or browser APIs) so the browser and the server share it.

export const REGIONS = ['Southeast Asia', 'Middle East', 'Europe'] as const;
export type Kind = 'partner' | 'enterprise';
export const KIND_LABEL: Record<Kind, string> = { partner: 'Voice AI companies and channel partners', enterprise: 'Industries and enterprises' };

export const STAGES = [
  { id: 'new', label: 'Not contacted' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'replied', label: 'Replied' },
  { id: 'meeting', label: 'Meeting set' },
  { id: 'pilot', label: 'Pilot' },
  { id: 'won', label: 'Customer' },
  { id: 'lost', label: 'Not interested' },
  { id: 'dnc', label: 'Do not contact' },
] as const;
export type Stage = (typeof STAGES)[number]['id'];
export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s;
/** A sequence only keeps running for people who have not answered or been closed. */
export const RUNNING: Stage[] = ['new', 'contacted'];

export type Done = { at: string; how: 'sent' | 'draft' | 'manual'; ref?: string; thread?: string };
export type LogEntry = { at: string; channel: 'email' | 'linkedin' | 'whatsapp' | 'note' | 'status'; text: string };
export type Lead = {
  id: string;
  kind: Kind;
  region: string;
  country: string;
  sector: string;
  company: string;
  website?: string;
  name: string;
  firstName: string;
  title?: string;
  email?: string;
  emailStatus?: string;
  linkedin?: string;
  phone?: string;
  tier?: string;
  stage: Stage;
  startedAt?: string; // YYYY-MM-DD, day 1 of the sequence
  done: Record<string, Done>;
  notes?: string;
  followUp?: string;
  log: LogEntry[];
  addedAt: string;
};

export type Step = { id: string; day: number; channel: 'linkedin' | 'email'; title: string; subject?: string; body: string };
export type Settings = { senderName: string; cc: string; signature: string; whatsapp: string };
export type Crm = { v: 1; leads: Lead[]; sequences: Record<Kind, Step[]>; settings: Settings };

// ---------- default copy: the Southeast Asia sequence drafted in the project artifact, with the region as a field ----------
const PARTNER: Step[] = [
  { id: 'li-connect', day: 1, channel: 'linkedin', title: 'LinkedIn connection note', body: 'Hi {First Name}, I’m working with Vobiz, the telephony layer behind voice AI teams like Sarvam and Bolna in India, on its {Region} expansion. Would love to connect and learn how {Company} handles calling for its voice agents.' },
  { id: 'li-message', day: 2, channel: 'linkedin', title: 'LinkedIn message', body: 'Thanks for connecting, {First Name}. As voice AI volumes grow, latency, failed connections and spam-flagged numbers often hold back results even when the agent performs well. Would you be open to a 20-minute chat this week or next on how {Company} handles this today?' },
  { id: 'email-1', day: 3, channel: 'email', title: 'Email', subject: '{First Name} and Vobiz: better voice AI outcomes', body: 'Hi {First Name},\n\nI’m working with Vobiz on its {Region} expansion. Vobiz is AI-native telephony (local numbers, SIP trunks and voice APIs) built for voice agents, and powers 12–15 million calls a day for teams like Sarvam and Bolna in India. Teams scaling voice AI tell us latency, failed connections and spam flags cap results even when the agent works well; Vobiz is built to fix exactly that.\n\nWould you have 20 minutes in the next two weeks to see whether it fits {Company}’s voice stack?' },
  { id: 'email-2', day: 5, channel: 'email', title: 'Email follow-up', subject: 'Re: {First Name} and Vobiz: better voice AI outcomes', body: 'Hi {First Name},\n\nJust bringing this back up. Happy to keep it short: 20 minutes on your current telephony setup and where Vobiz could help. Does Tuesday or Wednesday work?' },
  { id: 'email-3', day: 7, channel: 'email', title: 'Email: whitepaper offer', subject: 'A short whitepaper for {Company}', body: 'Hi {First Name},\n\nCan I share a short whitepaper on how Sarvam, Bolna, Ringg and Vaani Research improved voice AI results using Vobiz’s telephony, and how it could apply to {Company}? Let me know and I’ll send it over.' },
];
const ENTERPRISE: Step[] = [
  { id: 'li-connect', day: 1, channel: 'linkedin', title: 'LinkedIn connection note', body: 'Hi {First Name}, I’m working with Vobiz, the telephony layer behind voice AI teams like Sarvam and Bolna in India, on its {Region} expansion. Would love to connect and learn how {Company} handles customer calls today.' },
  { id: 'li-message', day: 2, channel: 'linkedin', title: 'LinkedIn message', body: 'Thanks for connecting, {First Name}. As call volumes grow, latency, failed connections and spam-flagged numbers often hold back results even when the team performs well. Would you be open to a 20-minute chat this week or next on how {Company} handles this today?' },
  { id: 'email-1', day: 3, channel: 'email', title: 'Email', subject: '{First Name} and Vobiz: better call outcomes', body: 'Hi {First Name},\n\nI’m working with Vobiz on its {Region} expansion. Vobiz is AI-native telephony (local numbers, SIP trunks and voice APIs) that powers 12–15 million calls a day for teams like Sarvam and Bolna in India. Teams that call at scale tell us latency, failed connections and spam flags cap results; Vobiz is built to fix exactly that.\n\nWould you have 20 minutes in the next two weeks to see whether it fits how {Company} handles customer calls?' },
  { id: 'email-2', day: 5, channel: 'email', title: 'Email follow-up', subject: 'Re: {First Name} and Vobiz: better call outcomes', body: 'Hi {First Name},\n\nJust bringing this back up. Happy to keep it short: 20 minutes on your current telephony setup and where Vobiz could help. Does Tuesday or Wednesday work?' },
  { id: 'email-3', day: 7, channel: 'email', title: 'Email: whitepaper offer', subject: 'A short whitepaper for {Company}', body: 'Hi {First Name},\n\nCan I share a short whitepaper on how Sarvam, Bolna, Ringg and Vaani Research improved results using Vobiz’s telephony, and how it could apply to {Company}? Let me know and I’ll send it over.' },
];
export const DEFAULT_SETTINGS: Settings = {
  senderName: '',
  cc: '',
  signature: 'Best,\n{Sender Name}\n\nIf this is not relevant, just tell me and I will not write again.',
  whatsapp: 'Hi {First Name}, this is {Sender Name}. I’m working with Vobiz, AI-native telephony for voice AI teams, on its {Region} expansion. Is it OK if I send you a short note on how it could fit {Company}?',
};
export const defaultCrm = (): Crm => ({ v: 1, leads: [], sequences: { partner: structuredClone(PARTNER), enterprise: structuredClone(ENTERPRISE) }, settings: { ...DEFAULT_SETTINGS } });
/** The copy names customers and quotes a call volume that Vobiz has not yet cleared for public use (open item in the project notes). */
export const COPY_WARNING = 'This copy names Sarvam and Bolna and quotes 12–15 million calls a day. The project notes say Vobiz has not yet confirmed it can be used publicly. Get that approved before you send.';

// ---------- places ----------
const SEA = ['singapore', 'malaysia', 'indonesia', 'philippines', 'vietnam', 'viet nam', 'thailand', 'cambodia', 'laos', 'myanmar', 'brunei', 'timor leste'];
const ME = ['united arab emirates', 'uae', 'saudi arabia', 'ksa', 'qatar', 'kuwait', 'bahrain', 'oman', 'turkey', 'turkiye', 'türkiye', 'israel', 'egypt', 'jordan', 'lebanon', 'iraq', 'syria', 'palestine', 'yemen'];
const EU = ['united kingdom', 'uk', 'england', 'scotland', 'ireland', 'netherlands', 'germany', 'france', 'spain', 'italy', 'sweden', 'norway', 'denmark', 'finland', 'poland', 'belgium', 'austria', 'switzerland', 'portugal', 'greece', 'czech republic', 'czechia', 'romania', 'hungary', 'estonia', 'lithuania', 'latvia', 'luxembourg', 'malta', 'cyprus', 'bulgaria', 'croatia', 'slovakia', 'slovenia'];
export function regionOf(country: string): string {
  const c = country.toLowerCase().trim();
  return SEA.includes(c) ? 'Southeast Asia' : ME.includes(c) ? 'Middle East' : EU.includes(c) ? 'Europe' : 'Other';
}

// ---------- ids and text ----------
export const normName = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
export const domainOf = (u: string) => u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export const leadId = (l: { email?: string; linkedin?: string; company: string; name: string }) => 'l' + hash((l.email || l.linkedin || `${l.company}|${l.name}`).toLowerCase().replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, ''));

const TOKENS: Record<string, (l: Lead, s: Settings) => string> = {
  firstname: (l) => l.firstName,
  company: (l) => l.company,
  sector: (l) => l.sector,
  country: (l) => l.country,
  region: (l) => l.region,
  title: (l) => l.title ?? '',
  sendername: (_, s) => s.senderName,
};
/** Fill {First Name}, {Company}, {Region} and the like. Anything that has no value is reported, never sent as a blank. */
export function render(text: string, lead: Lead, settings: Settings): { text: string; missing: string[] } {
  const missing: string[] = [];
  const out = text.replace(/\{([A-Za-z _]+)\}/g, (all, raw: string) => {
    const f = TOKENS[raw.toLowerCase().replace(/[ _]/g, '')];
    if (!f) return all;
    const v = f(lead, settings).trim();
    if (!v) missing.push(raw);
    return v || all;
  });
  return { text: out, missing: [...new Set(missing)] };
}
export const unknownTokens = (text: string) => [...new Set([...text.matchAll(/\{([A-Za-z _]+)\}/g)].map((m) => m[1]).filter((t) => !TOKENS[t.toLowerCase().replace(/[ _]/g, '')]))];

// ---------- the plan for the day ----------
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dueDate = (lead: Lead, step: Step) => (lead.startedAt ? addDays(lead.startedAt, step.day - 1) : '');
export type Task = { lead: Lead; step: Step; due: string; overdue: boolean; blocked?: string };
/** Steps that are due on or before `today` for people whose sequence is running and who have not already had that step. */
export function tasksFor(leads: Lead[], seqs: Record<Kind, Step[]>, today: string): Task[] {
  const out: Task[] = [];
  for (const lead of leads) {
    if (!lead.startedAt || !RUNNING.includes(lead.stage)) continue;
    for (const step of seqs[lead.kind]) {
      if (lead.done[step.id]) continue;
      const due = dueDate(lead, step);
      if (due > today) continue;
      const blocked = step.channel === 'email' ? (!lead.email ? 'No email address' : undefined) : !lead.linkedin ? 'No LinkedIn link' : undefined;
      out.push({ lead, step, due, overdue: due < today, blocked });
    }
  }
  return out;
}

export function emptyLead(p: Partial<Lead> & { company: string; name: string }, now: string): Lead {
  const country = p.country ?? '';
  const l: Lead = {
    kind: 'partner', sector: '', firstName: p.name.trim().split(/\s+/)[0] ?? '', stage: 'new', done: {}, log: [], addedAt: now, ...p,
    region: p.region || regionOf(country), country, id: '',
  };
  l.id = leadId(l);
  return l;
}

// ---------- CSV ----------
/** A quote-aware CSV reader (commas, quotes and line breaks inside cells). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') (f += '"', i++);
        else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') (row.push(f), (f = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(f);
      f = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else f += c;
  }
  if (f || row.length) {
    row.push(f);
    if (row.some((x) => x.trim())) rows.push(row);
  }
  return rows;
}
const table = (text: string) => {
  const [head, ...rows] = parseCsv(text);
  const ix = new Map((head ?? []).map((h, i) => [h.trim().toLowerCase(), i]));
  const get = (r: string[], ...names: string[]) => {
    for (const n of names) {
      const i = ix.get(n.toLowerCase());
      if (i !== undefined && r[i]?.trim()) return r[i].trim();
    }
    return '';
  };
  return { has: (n: string) => ix.has(n.toLowerCase()), rows, get };
};

export type CompanyMeta = { sector?: string; country?: string; website?: string };
export type ImportResult = { leads: Lead[]; warnings: string[]; files: string[] };

/**
 * Apollo exports in, leads out. A contacts export (has "Person Linkedin Url") gives the people. A partner list (has "Category Label")
 * and any `known` company facts give each company's sector. Rows with no name or company are skipped and counted.
 */
export function buildImport(files: { name: string; text: string }[], opts: { kind: Kind; sector?: string; known?: Record<string, CompanyMeta> }, now: string): ImportResult {
  const meta = new Map<string, CompanyMeta>();
  for (const [name, v] of Object.entries(opts.known ?? {})) meta.set(normName(name), v);
  const warnings: string[] = [];
  const kinds: string[] = [];
  const contacts: ReturnType<typeof table>[] = [];
  for (const f of files) {
    const t = table(f.text);
    if (t.has('Person Linkedin Url')) (contacts.push(t), kinds.push(`${f.name}: ${t.rows.length} people`));
    else if (t.has('Category Label')) {
      for (const r of t.rows) meta.set(normName(t.get(r, 'Company Name')), { sector: t.get(r, 'Category Label'), country: t.get(r, 'Country'), website: t.get(r, 'Website') });
      kinds.push(`${f.name}: ${t.rows.length} companies with a sector`);
    } else if (t.has('Company Name')) kinds.push(`${f.name}: company list (used only to fill missing websites)`);
    else warnings.push(`${f.name}: not an Apollo contacts export or partner list, skipped.`);
  }
  const leads = new Map<string, Lead>();
  let skipped = 0;
  for (const t of contacts)
    for (const r of t.rows) {
      const first = t.get(r, 'First Name');
      const last = t.get(r, 'Last Name');
      const company = t.get(r, 'Company Name');
      if (!first || !company) {
        skipped++;
        continue;
      }
      const m = meta.get(normName(company));
      const country = t.get(r, 'Company Country', 'Country') || m?.country || '';
      const lead = emptyLead(
        {
          kind: opts.kind, company, name: `${first} ${last}`.trim(), firstName: first, country,
          sector: m?.sector || opts.sector || t.get(r, 'Industry') || '',
          website: t.get(r, 'Website') || m?.website || undefined,
          title: t.get(r, 'Title') || undefined,
          email: t.get(r, 'Email') || undefined,
          emailStatus: t.get(r, 'Email Status') || undefined,
          linkedin: t.get(r, 'Person Linkedin Url') || undefined,
          phone: t.get(r, 'Mobile Phone', 'Work Direct Phone', 'Corporate Phone', 'Company Phone') || undefined,
        },
        now,
      );
      leads.set(lead.id, lead);
    }
  if (skipped) warnings.push(`${skipped} rows had no first name or company and were skipped.`);
  if (!contacts.length) warnings.push('No contacts export found. Add the Apollo contacts CSV (it has a "Person Linkedin Url" column).');
  const noRegion = [...leads.values()].filter((l) => l.region === 'Other').length;
  if (noRegion) warnings.push(`${noRegion} people are in a country outside the three regions; they are filed under "Other".`);
  return { leads: [...leads.values()], warnings, files: kinds };
}

/** Why an email step cannot go to this person right now ('' means it can). The browser previews with it and the server enforces it. */
export function skipReason(l: Lead, step: Step | undefined, s: Settings, o: { allowUnverified?: boolean; test?: boolean } = {}): string {
  if (!step) return 'This list has no such step';
  if (step.channel !== 'email') return 'Not an email step';
  if (!o.test) {
    if (!RUNNING.includes(l.stage)) return 'Already replied or closed';
    if (l.done[step.id]) return 'This step is already done';
    if (!l.email) return 'No email address';
    if (l.emailStatus !== 'Verified' && !o.allowUnverified) return `Email not verified (${l.emailStatus || 'unknown'})`;
  }
  const missing = [...render(step.subject ?? '', l, s).missing, ...render(`${step.body}\n\n${s.signature}`, l, s).missing];
  return missing.length ? `Missing ${[...new Set(missing)].map((m) => `{${m}}`).join(', ')}` : '';
}
