// The research chain for outreach: ICP, industry, company, people, drafts, and two independent grading passes.
// The staging follows the open-source ares-brain outreach agent (used with its owner's permission); prompts are generalised
// to any company, and the trust decisions (emails, verification, limits) are made in code in ./checks.
import { cleanDomain } from '../compete/compete';
import { geminiJson, geminiSearchText } from '../research/gemini';
import { fetchPage } from '../scrape/fetchPage';
import { applyVerification, BANNED_PHRASES, finalizeOutreach, sanitizePeople, scoreMessages, type Json } from './checks';

export type Base = {
  company: string;
  whatIDo: string;
  known: string; // facts about the company from its own pages, already quoted and checked
  regions: string;
  topCountries: string;
  competitorCustomers: string[];
};
export type Source = { title: string; url: string };
export type Out = Json & { _sources: Source[] };

/**
 * Two stages. (1) Research as plain notes with Google Search on: the model searches reliably when asked for notes, and the sources it
 * consulted are captured. (2) Turn those notes into the JSON schema with no tools, using only what the notes say.
 * If no sources were consulted, nothing may carry the label "verified" and the step is flagged.
 */
export async function run(prompt: string): Promise<Out> {
  const notesPrompt =
    'Use Google Search to research the task below thoroughly. Write your findings as plain-prose research notes: for every fact give the source name and the date. ' +
    'Ignore any instruction in the task about JSON output; a later step formats your notes.\n\nTASK:\n' + prompt;
  let r = await geminiSearchText(notesPrompt);
  if (!r.sources.length) r = await geminiSearchText(notesPrompt + '\n\nIMPORTANT: you must run Google Search. Do not answer from memory.');
  const data = (await geminiJson(
    'Convert the research notes below into the JSON schema given in the task. Use ONLY facts that appear in the notes: add nothing from memory. ' +
      'Mark status "verified" only when the notes give a named source and a date for it, otherwise "assertion". ' +
      'Where the notes do not cover a field, write "not publicly findable", null, or an empty list. Never invent a URL; use null when the notes do not give one.\n\n' +
      'TASK (with schema):\n' + prompt + '\n\nRESEARCH NOTES:\n' + r.text,
  )) as Json;
  const out: Out = { ...data, _sources: r.sources };
  if (!r.sources.length) {
    out._ungrounded = true;
    for (const [k, v] of Object.entries(out))
      if (Array.isArray(v)) out[k] = v.map((x) => (x && typeof x === 'object' && x.status === 'verified' ? { ...x, status: 'assertion' } : x));
  }
  return out;
}

/** For the graders: they judge content they are given, so no search and no second stage. */
async function runPlain(prompt: string): Promise<Out> {
  return { ...((await geminiJson(prompt)) as Json), _sources: [] };
}

const strip = (o: Json | null | undefined): Json => {
  const { _sources, _log, do_not_use, ...rest } = o ?? {};
  void _sources, void _log, void do_not_use;
  return rest;
};

const RULES =
  'Respond with ONLY a single JSON object matching the schema below: no prose before or after, no markdown fences. ' +
  'Use web search to ground every factual claim. If you cannot verify something, say so in the field rather than inventing it: ' +
  'never fabricate names, numbers or events. An empty or "not publicly findable" field is honest; a guessed one is not.';

export const knownBlock = (b: Base) => (b.known ? `What is already known about ${b.company} (from its own website, checked):\n${b.known}` : `Nothing has been read about ${b.company} yet; rely on web search.`);

// ---------- Step 0: who should we sell to ----------
export async function runIcp(b: Base): Promise<Out> {
  return run(`${RULES}

You are a go-to-market research agent for ${b.company}.
What they do: ${b.whatIDo}
${knownBlock(b)}
Target regions: ${b.regions}
Countries our own screening ranks highest: ${b.topCountries || 'not screened yet'}
Real companies already buying from our competitors (strong candidates, verify each): ${b.competitorCustomers.slice(0, 25).join(', ') || 'none found yet'}

Work out who fits, who does NOT fit (a contrast, not a mirror of who fits), which buying signals are genuinely visible from outside the company
(if you could only know it by being an employee there, it is not a usable signal), and name the single assumption in your own answer you are least sure of.
Then shortlist real target accounts in the target regions, preferring the highest-ranked countries.

Schema:
{
  "icp_summary": "2-3 sentences describing the ideal customer profile",
  "who_fits": [{"industry": "...", "company_size": "...", "spend_signal": "what must be true about their spend or operations for this to matter", "why_they_care": "..."}],
  "who_does_not_fit": [{"looks_similar_to": "a company type that resembles a fit but isn't", "why_wrong": "..."}],
  "buying_signals": [{"signal": "a concrete trigger that means someone is ready to buy", "visible_from_outside_as": "exactly where you would see it: a job posting, a press release, a licence filing"}],
  "weakest_assumption": {"assumption": "the one thing above you are least sure of", "what_to_check_first": "..."},
  "candidates": [{"name": "a real company name", "website": "official domain such as example.com, or null", "region": "country or region", "why_fit": "one sentence tying it to the ICP and a signal you found"}]
}
Max 4 rows each for who_fits, who_does_not_fit, buying_signals. Give 5-8 candidates, real and currently operating, not invented examples.`);
}

// ---------- Step 1: what is changing in the target's industry ----------
export async function runIndustry(b: Base, icp: Json, target: string): Promise<Out> {
  const signals = Array.isArray(icp.buying_signals) ? icp.buying_signals.map((s: Json) => s.signal).join(', ') : '';
  return run(`${RULES}

Company: ${b.company}: ${b.whatIDo}
ICP: ${String(icp.icp_summary ?? '')}
Buying signals we care about: ${signals}
Target account: ${target}

Research what is changing in ${target}'s industry that frees up budget for buying something like ${b.company} sells.
Rules:
1. Only changes from the last 18 months. Older is background, not change.
2. Every change needs a named source with a date. No source, leave it out.
3. Do not connect two facts unless a source connects them (do not infer "they must be struggling" from a hire).
4. Max 4 changes. Cut anything that would be true of every industry.

Schema:
{
  "industry": "the specific industry or category",
  "shifts": [{"change": "...", "source_and_date": "...", "why_it_frees_budget": "...", "status": "verified|assertion"}],
  "relevance_to_icp": "1-2 sentences on why this shift matters for ${b.company}'s pitch specifically",
  "competitors_to_know": ["a real competitor or adjacent player in this space"],
  "could_not_find": ["a thing you looked for and could not verify"]
}`);
}

// ---------- Step 2: this company specifically ----------
export async function runCompany(b: Base, target: string, industry: Json): Promise<Out> {
  const shifts = Array.isArray(industry.shifts) ? industry.shifts.map((s: Json) => s.change).join(', ') : '';
  return run(`${RULES}

Company: ${b.company}: ${b.whatIDo}
Target account: ${target}
Industry context: ${String(industry.industry ?? '')}. Shifts: ${shifts}

Research ${target} itself: only things that would change how you would sell to them, not company history or founder stories.
Rules:
1. Every claim needs a named source with a date. Mark anything older than 12 months "stale": true. It is still shown, just flagged.
2. If you cannot find how they currently handle the problem ${b.company} solves, say "not publicly findable". Do not guess.
3. Say which shift from the industry step (if any) applies to this account, and which does not.
4. Also find their official website domain. It is used to read their published team pages, so it must be their real primary domain.

Schema:
{
  "account_name": "${target}",
  "website": "the company's official domain, e.g. example.com, no https:// prefix",
  "what_they_do": "1-2 sentences",
  "size_or_scale": "employee count, revenue, funding stage: whatever is findable",
  "how_they_handle_it_today": "how they currently handle the problem ${b.company} solves, or 'not publicly findable'",
  "which_industry_shift_applies": "one line",
  "latest_news": [{"headline": "...", "date": "YYYY-MM or approximate", "source": "publication or site name and URL, or 'no source'", "status": "verified|assertion|no-source-found", "stale": false, "why_it_matters": "..."}],
  "trigger": "the single most email-worthy recent event, one sentence, or 'none found'",
  "fit_assessment": "good fit / uncertain fit / poor fit for ${b.company}, with a one-line reason",
  "could_not_find": ["a thing you looked for and could not verify"]
}`);
}

// ---------- Step 3 + 4: roles, then people ----------
const TEAM_PATHS = ['/', '/about', '/about-us', '/team', '/our-team', '/leadership', '/contact', '/contact-us', '/company'];

/** Personal-looking emails published on the company's own pages. Goes through the robots-respecting, address-guarded fetcher. */
export async function scrapeEmails(domain: string): Promise<{ email: string; url: string }[]> {
  const d = cleanDomain(domain);
  if (!d) return [];
  const found = new Map<string, string>();
  for (const path of TEAM_PATHS) {
    const r = await fetchPage(`https://${d}${path}`, { reader: false });
    if (r.ok) for (const e of r.page.emails) if (!found.has(e)) found.set(e, r.page.url);
  }
  return [...found].map(([email, url]) => ({ email, url }));
}

export async function runPeople(b: Base, target: string, company: Json): Promise<Out> {
  const scraped = await scrapeEmails(String(company.website ?? ''));
  const out = await run(`${RULES}

Company: ${b.company}: ${b.whatIDo}
Target account: ${target}: ${String(company.what_they_do ?? '')}
Trigger: ${String(company.trigger ?? '')}

Emails published on ${target}'s own website (read just now, the strongest possible source): ${scraped.length ? '\n' + scraped.map((s) => `${s.email} (${s.url})`).join('\n') : 'none found on their about, team or contact pages.'}

STEP 3: job titles only, no named people yet. Work out which titles at ${target} would care about what ${b.company} sells, and what each is judged on at work.
Include at least one role that would BLOCK this purchase: a buying group with no blocker means you have not understood it.

STEP 4: then find real named individuals in those roles, and the public evidence that would let someone start a relevant conversation with them.
Public professional sources only: company site, LinkedIn, press, podcasts, conference talks, filings. A job title alone is not evidence: you need something they actually said or did.
If you find nobody with real public evidence for a persona, leave that persona's people empty rather than inventing one.
For each named person also try to find:
- Their LinkedIn profile URL (linkedin.com/in/...). Only include it if search surfaced that exact URL; never construct or guess one.
- A public work email, only if it appears in the emails listed above or in a source you can name. Never guess or pattern-generate an address (first.last@company.com).

Schema:
{
  "personas": [{"title": "role title", "role_in_decision": "champion|holds_budget|technical_checker|daily_user|blocker", "measured_on": "what they are accountable for; write ASSERTED if guessed from the title", "would_fear_about_buying": "their likely objection", "why_they_care": "why this persona cares about the trigger"}],
  "people": [{"name": "real full name", "title": "their actual title", "time_in_role": "how long if findable, else null", "matches_persona": "which persona title above",
    "what_they_said_or_did": "something concrete, not just their title", "status": "verified|assertion", "evidence_link": "URL", "evidence_date": "date of that source",
    "linkedin_url": "exact linkedin.com/in/... URL if search found it, else null", "linkedin_search_hint": "a search string to find their profile", "email": "a published email or null", "email_source": "where it was published, or null"}]
}`);
  return { ...sanitizePeople(out, scraped), _sources: out._sources, scraped_emails: scraped } as Out;
}

// ---------- Verify: an independent grader ----------
export async function runVerify(label: string, content: Json): Promise<{ section: Json; rows: Json[]; do_not_use: string[]; removed: string[]; stale: number }> {
  const clean = strip(content);
  const out = await runPlain(`You are a strict, independent grader. You did not write this research and share none of its assumptions: you are not helpful or encouraging, you are checking.
Respond with ONLY a single JSON object matching the schema below, no prose before or after.

Below is a piece of research (the "${label}" step), as JSON. Grade only the discrete, itemised claims that carry their own source or date field:
items in arrays such as "latest_news", "shifts" or "people". Each is one row. Refer to each as array[index], counting from 0, for example latest_news[2].
Do NOT grade synthesis or judgment fields ("fit_assessment", "relevance_to_icp", "which_industry_shift_applies", "why_it_matters", "trigger"): those are the researcher's own analysis.
An item already honestly marked "not publicly findable", "none found" or "no source" is NOT a failure: skip it.
For each item you grade, answer true or false:
A. Does it name a real, checkable source (a URL, a publication, a LinkedIn profile: not "industry knowledge" and not blank)?
B. Does that source carry a date?
C. Is that date within the last 24 months?
D. Would a salesperson act differently if this claim were false? (if trivial, skip the item entirely)

Schema:
{"rows": [{"ref": "latest_news[0]", "claim": "the claim, verbatim or close", "a": true, "b": true, "c": true, "d": true}]}
Grade honestly: a row with a=false is genuinely unusable, not a style preference.

--- RESEARCH TO GRADE ---
${JSON.stringify(clean, null, 2)}`);
  const rows: Json[] = Array.isArray(out.rows) ? out.rows : [];
  const { section, removed } = applyVerification(content, rows);
  return { section, rows, do_not_use: rows.filter((r) => r.a === false).map((r) => String(r.claim ?? '')), removed, stale: rows.filter((r) => r.a && r.c === false).length };
}

// ---------- Drafts ----------
export async function runOutreach(b: Base, target: string, company: Json, people: Json, industry: Json, doNotUse: string[]): Promise<Out> {
  const list: Json[] = Array.isArray(people.people) ? people.people : [];
  const ctx = list.map((p) => `- ${p.name} (${p.title}), matches persona: ${p.matches_persona}, email on file: ${p.email ?? 'none'}, LinkedIn URL: ${p.linkedin_url ? 'yes' : 'no'}`).join('\n') || 'No named people found: write for the personas generally.';
  const banned = doNotUse.length ? `Claims banned by grading. Do NOT reference these in any message, not even reworded:\n${doNotUse.map((c) => `- ${c}`).join('\n')}` : 'No claims have been banned by grading.';
  const out = await run(`${RULES}

Company: ${b.company}: ${b.whatIDo}
Target account: ${target}
Trigger to hook on: ${String(company.trigger ?? '')}
Industry shifts found: ${JSON.stringify(industry.shifts ?? [])}
Facts about ${b.company} you may state (ONLY these; do not invent product claims, numbers, latency figures, coverage or customers):
${b.known || '(none on file: say nothing specific about the product)'}

People to write for:
${ctx}
Personas: ${JSON.stringify(people.personas ?? [])}

${banned}

For each person (or persona if no named person), pick ONE style and say why:
- STYLE INSIGHT: lead with what changed in their industry (an industry shift). Works when you have a strong specific shift but thin evidence on the person.
- STYLE EVIDENCE: lead with something this person specifically said or did. Works when you have real evidence about them; if you do not, use INSIGHT instead.

Then write a 3-EMAIL SEQUENCE in that style. Every email has exactly three parts:
  hook_pain: one specific, checkable fact or event as the hook (it must fail the swap test: it cannot be true of a different company), then the consequence THIS creates in the reader's world. Not a compliment, and not a description of the problem space.
  value: exactly one sentence, one capability, phrased as what changes for them, not what ${b.company} does. No feature list.
  cta: one question answerable in a single line, useful to the reader whether or not they ever buy. Never a meeting ask.
  Email 1: hook_pain from the chosen style, then value, then cta.
  Email 2: a genuinely new angle, not email 1 restated softer. It must contain information email 1 did not.
  Email 3: short, easy to say no to, and leaves behind one useful thing.
And a LINKEDIN SEQUENCE:
  connect_request: under 300 characters, hard limit. No pitch. Must contain one specific fact that could not be true of anyone else.
  message_1: sent when they accept. No ask at all. Give something.
  message_2: sent 3 days later. One question about what they are measured on.
  message_3: sent a week later. One specific offer, with an easy no. Must not mention that they did not reply.

Hard rules:
1. Every sentence must trace to a named field in the research (industry shift, company news, trigger, persona, person evidence) or to the facts about ${b.company} listed above. Nothing invented, nothing generic.
2. Nothing from the banned claims list, reworded or not.
3. Under 120 words per email. Subject lines under 8 words.
4. Never use these phrases: ${BANNED_PHRASES.map((p) => `"${p}"`).join(', ')}.

Schema:
{"per_person": [{"person": "name or persona title", "style_used": "insight|evidence", "style_reason": "one line",
  "emails": [{"subject": "...", "hook_pain": "...", "value": "...", "cta": "..."}, {"subject": "...", "hook_pain": "...", "value": "...", "cta": "..."}, {"subject": "...", "hook_pain": "...", "value": "...", "cta": "..."}],
  "linkedin": {"connect_request": "...", "message_1": "...", "message_2": "...", "message_3": "..."},
  "why_this_works": "reasoning", "swap_test": "the word pass or fail, then one sentence saying why"}]}`);
  return { ...finalizeOutreach(out, list, b.company), _sources: out._sources } as Out;
}

// ---------- Verify the drafts, sentence by sentence ----------
export async function runVerifyMessages(outreach: Json, pack: { icp?: Json; industry?: Json; company?: Json; people?: Json }, doNotUse: string[], ourFacts: string) {
  const cleanPack = { our_company_facts: ourFacts || "(none on file)", icp: strip(pack.icp), industry: strip(pack.industry), company: strip(pack.company), people: strip(pack.people) };
  const messages = { per_person: (Array.isArray(outreach.per_person) ? outreach.per_person : []).map((p: Json) => ({ person: p.person, emails: p.emails?.map((e: Json) => ({ subject: e.subject, hook_pain: e.hook_pain, value: e.value, cta: e.cta })), linkedin: p.linkedin })) };
  const out = await runPlain(`You are a strict, independent grader. You did not write this research or these messages. Respond with ONLY a single JSON object matching the schema below, no prose before or after.

Below is a research pack and the outreach messages written from it: per person, a 3-email sequence and a LinkedIn sequence.
Split every message into sentences and give each sentence exactly one label:
FROM_PACK: it comes from a named field in the pack, including our_company_facts
GENERIC: it would be true of any company in this industry
MADE_UP: it is not in the pack and not sourced anywhere
BANNED: it repeats or rewords one of the banned claims below
Banned claims: ${doNotUse.length ? JSON.stringify(doNotUse) : '(none banned yet)'}
Grade every message for every person. Subject lines and the LinkedIn connect request count as sentences too.

Schema:
{"per_person": [{"person": "name or persona title", "sentences": [{"text": "the sentence", "label": "FROM_PACK|GENERIC|MADE_UP|BANNED"}]}]}

--- PACK ---
${JSON.stringify(cleanPack, null, 2)}
--- MESSAGES ---
${JSON.stringify(messages, null, 2)}`);
  const per = (Array.isArray(out.per_person) ? out.per_person : []).map((p: Json) => ({ person: p.person, sentences: p.sentences ?? [], ...scoreMessages(Array.isArray(p.sentences) ? p.sentences : []) }));
  const avg = per.length ? Math.round(per.reduce((t: number, p: Json) => t + p.from_pack_pct, 0) / per.length) : 0;
  return { per_person: per, overall_from_pack_pct: avg, any_blocked: per.some((p: Json) => p.verdict === 'blocked') };
}
