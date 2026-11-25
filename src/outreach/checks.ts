// Checks that run in code, not in a prompt. The model writes; these decide what is allowed to stand.
export type Json = Record<string, any>;

export const BANNED_PHRASES = ['I hope this finds you well', 'quick question', 'circling back', 'just following up'];
export const LIMITS = { emailWords: 120, subjectWords: 8, connectChars: 300 };
const words = (s: unknown) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

export function firstName(full: unknown): string {
  return String(full ?? '').trim().split(/\s+/)[0] || 'there';
}

const LINKEDIN_PROFILE = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^\s?#]+/i;

/**
 * People come from model search, so nothing about their contact details is trusted:
 * an email survives only if it was published on the company's own pages, and a LinkedIn link only if it is a real profile URL.
 */
export function sanitizePeople(people: Json, scraped: { email: string; url: string }[]): Json {
  const byEmail = new Map(scraped.map((s) => [s.email.toLowerCase(), s.url]));
  const list: Json[] = Array.isArray(people.people) ? people.people : [];
  const clean: Json[] = list.map((p) => {
    const claimed = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
    const keep = claimed && byEmail.has(claimed);
    return {
      ...p,
      email: keep ? claimed : null,
      email_source: keep ? byEmail.get(claimed) : null,
      email_dropped: claimed && !keep ? claimed : undefined,
      linkedin_url: typeof p.linkedin_url === 'string' && LINKEDIN_PROFILE.test(p.linkedin_url) ? p.linkedin_url : null,
    };
  });
  const verified = clean.filter((p) => p.status === 'verified').length;
  return { ...people, people: clean, verified_count: verified, assertion_count: clean.length - verified, total_count: clean.length };
}

/**
 * The grader points at items as "latest_news[2]". Items it marks as having no real source are removed here,
 * so the drafting step never sees them. (The model is also told not to use them; this is the part that is certain.)
 */
export function applyVerification(section: Json, rows: { ref?: string; a?: boolean }[]): { section: Json; removed: string[] } {
  const drop = new Map<string, Set<number>>();
  for (const r of rows) {
    const m = /^([a-z_]+)\[(\d+)\]$/.exec(String(r.ref ?? '').trim());
    if (m && r.a === false) drop.set(m[1], (drop.get(m[1]) ?? new Set()).add(Number(m[2])));
  }
  const out: Json = { ...section };
  const removed: string[] = [];
  for (const [key, idx] of drop) {
    if (!Array.isArray(section[key])) continue;
    out[key] = section[key].filter((item: Json, i: number) => {
      if (!idx.has(i)) return true;
      removed.push(String(item?.change ?? item?.headline ?? item?.what_they_said_or_did ?? item?.name ?? `${key}[${i}]`));
      return false;
    });
  }
  return { section: out, removed };
}

/** Rule breaks in one person's drafts. Lengths and banned phrases are counted in code, never taken from the model. */
export function draftIssues(entry: Json): string[] {
  const issues: string[] = [];
  const phrases = (text: string, where: string) => {
    for (const b of BANNED_PHRASES) if (text.toLowerCase().includes(b.toLowerCase())) issues.push(`${where} uses the banned phrase “${b}”`);
  };
  (Array.isArray(entry.emails) ? entry.emails : []).forEach((e: Json, i: number) => {
    const body = [e.hook_pain, e.value, e.cta].map((x) => String(x ?? '')).join(' ');
    if (words(body) > LIMITS.emailWords) issues.push(`Email ${i + 1} is ${words(body)} words (limit ${LIMITS.emailWords})`);
    if (words(e.subject) > LIMITS.subjectWords) issues.push(`Email ${i + 1} subject is ${words(e.subject)} words (limit ${LIMITS.subjectWords})`);
    phrases(`${e.subject ?? ''} ${body}`, `Email ${i + 1}`);
  });
  const li: Json = entry.linkedin ?? {};
  const connect = String(li.connect_request ?? '');
  if (connect.length > LIMITS.connectChars) issues.push(`LinkedIn connect note is ${connect.length} characters (limit ${LIMITS.connectChars})`);
  if (!connect) issues.push('LinkedIn connect note is missing');
  phrases(Object.values(li).join(' '), 'LinkedIn');
  return issues;
}

/**
 * Attach contact details from the sanitised people list (never from the model's drafting reply),
 * assemble each email from its three parts, and add the opt-out line.
 */
export function finalizeOutreach(result: Json, people: Json[], myCompany: string): Json {
  const byName = new Map(people.map((p) => [String(p.name ?? '').trim().toLowerCase(), p]));
  const per: Json[] = Array.isArray(result.per_person) ? result.per_person : [];
  for (const entry of per) {
    const match = byName.get(String(entry.person ?? '').trim().toLowerCase());
    entry.send_to_email = match?.email ?? null;
    entry.send_to_linkedin_url = match?.linkedin_url ?? null;
    entry.linkedin_search_hint = match?.linkedin_search_hint ?? null;
    const greeting = `Hi ${firstName(match?.name)},`;
    const signOff = `Best,\n[Your name]\n${myCompany}`;
    const optOut = 'P.S. If this is not relevant, tell me and I will not write again.';
    for (const e of Array.isArray(entry.emails) ? entry.emails : []) {
      e.body = [greeting, e.hook_pain, e.value, e.cta, signOff, optOut].map((x) => String(x ?? '')).filter(Boolean).join('\n\n');
    }
    const li: Json | undefined = entry.linkedin;
    if (li && typeof li.connect_request === 'string') li.connect_request_chars = li.connect_request.length;
    entry.issues = draftIssues(entry);
  }
  return result;
}

const LABELS = ['FROM_PACK', 'GENERIC', 'MADE_UP', 'BANNED'] as const;

/** Verdict from the graded sentence list itself, recounted here, not from the counts the grader reports. */
export function scoreMessages(sentences: { label?: string }[]) {
  const n = sentences.length;
  const c = { from_pack: 0, generic: 0, made_up: 0, banned: 0 };
  for (const s of sentences) {
    const l = LABELS.includes(s.label as any) ? s.label : 'GENERIC';
    if (l === 'FROM_PACK') c.from_pack++;
    else if (l === 'MADE_UP') c.made_up++;
    else if (l === 'BANNED') c.banned++;
    else c.generic++;
  }
  const fromPct = n ? Math.round((c.from_pack / n) * 100) : 0;
  const genPct = n ? Math.round((c.generic / n) * 100) : 0;
  const verdict = c.made_up || c.banned ? 'blocked' : genPct > 30 ? 'weak' : fromPct > 70 ? 'strong' : 'adequate';
  const reason = {
    blocked: `${c.made_up} made-up and ${c.banned} banned sentence(s): do not send.`,
    weak: 'More than 30% of sentences are generic: the research did not earn this message.',
    strong: 'More than 70% of sentences trace to the research. Read it aloud before sending.',
    adequate: 'Usable, but more sentences could trace back to the research.',
  }[verdict];
  return { counts: { sentences: n, ...c }, from_pack_pct: fromPct, generic_pct: genPct, verdict, verdict_reason: reason };
}
