// The contact sheet: one row per person, grouped by company, in the order of the buying decision.
// Pure functions of the saved accounts, so what is downloaded is exactly what the screen shows.
import type { Account } from './pipeline';
import type { Json } from './checks';

export const ROLE_ORDER = ['holds_budget', 'champion', 'technical_checker', 'daily_user', 'blocker'];
export const key = (a: Account, name: unknown) => `${a.id}|${String(name ?? '')}`;

export type Contact = { account: Account; person: Json; role?: string; draft?: Json; check?: Json; key: string };

/** People at one account, budget holder first, with their drafts and the grade of those drafts attached. */
export function contactsOf(a: Account): Contact[] {
  const personas: Json[] = a.people?.personas ?? [];
  const drafts: Json[] = a.outreach?.per_person ?? [];
  const checks: Json[] = a.messages?.per_person ?? [];
  const by = (list: Json[], name: unknown) => list.find((x) => String(x.person).trim().toLowerCase() === String(name).trim().toLowerCase());
  const people: Json[] = a.people?.people ?? [];
  return people
    .map((p, i) => ({ p, i, role: personas.find((x) => String(x.title).toLowerCase() === String(p.matches_persona ?? '').toLowerCase())?.role_in_decision as string | undefined }))
    .sort((x, y) => (ROLE_ORDER.indexOf(x.role ?? '') + 99) % 99 - (ROLE_ORDER.indexOf(y.role ?? '') + 99) % 99 || x.i - y.i)
    .map(({ p, role }) => ({ account: a, person: p, role, draft: by(drafts, p.name), check: by(checks, p.name), key: key(a, p.name) }));
}

export const allContacts = (accounts: Account[]) => accounts.flatMap(contactsOf);

export const CONTACT_HEADER = [
  'Account', 'Region / country', 'Website', 'Company phone (published on its site)', 'Fit', 'Reason to write now',
  '#', 'Person', 'Title', 'Role in the decision', 'Email', 'Email published at', 'LinkedIn profile', 'LinkedIn search', 'Phone / mobile', 'What they said or did', 'Evidence link',
  'Draft style', 'Email 1 subject', 'Email 1', 'Email 2 subject', 'Email 2', 'Email 3 subject', 'Email 3',
  'LinkedIn connect note', 'LinkedIn message 1', 'LinkedIn message 2', 'LinkedIn message 3', 'Draft check', 'Rule breaks',
];

/** Header plus one row per person. `only` limits the rows to the ticked contacts. */
export function contactRows(accounts: Account[], only?: Set<string>): unknown[][] {
  const rows: unknown[][] = [CONTACT_HEADER];
  for (const a of accounts) {
    const head = [a.name, a.region ?? '', a.website ?? '', (a.phones ?? []).map((p) => p.phone).join('; '), a.company?.fit_assessment ?? '', a.company?.trigger ?? ''];
    const people = contactsOf(a).filter((c) => !only || only.has(c.key));
    if (!people.length && !only) rows.push([...head, ...Array(CONTACT_HEADER.length - head.length).fill('')]);
    people.forEach((c, i) => {
      const e: Json[] = c.draft?.emails ?? [];
      const li: Json = c.draft?.linkedin ?? {};
      rows.push([
        ...head, i + 1, c.person.name, c.person.title, String(c.role ?? '').replace(/_/g, ' '), c.person.email ?? '', c.person.email_source ?? '', c.person.linkedin_url ?? '', c.person.linkedin_search_hint ?? '', c.person.phone ?? '', c.person.what_they_said_or_did ?? '', c.person.evidence_link ?? '',
        c.draft?.style_used ?? '', e[0]?.subject ?? '', e[0]?.body ?? '', e[1]?.subject ?? '', e[1]?.body ?? '', e[2]?.subject ?? '', e[2]?.body ?? '',
        li.connect_request ?? '', li.message_1 ?? '', li.message_2 ?? '', li.message_3 ?? '', c.check ? `${c.check.verdict} (${c.check.from_pack_pct}% from research)` : '', (c.draft?.issues ?? []).join('; '),
      ]);
    });
  }
  return rows;
}
