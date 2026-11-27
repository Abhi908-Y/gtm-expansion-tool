// Finds real, source-verified target accounts that fill gaps in data/vobiz/accounts.json and writes data/vobiz/tool-accounts.json.
// Usage: npx tsx scripts/research-vobiz-accounts.ts [--resume] [--only=<substring of a query label>]   (needs GEMINI_API_KEY and GEMINI_MODEL in .env; takes 20+ minutes)
// Pipeline: Gemini+Google Search notes -> Gemini JSON candidates -> code verifies each one by fetching its website and source page
// (via the robots-respecting fetchPage) and checking the quote appears verbatim. The model's say-so alone keeps nothing.
// --resume reuses candidate lists cached in .cache/tool-accounts-candidates.json (skips the Gemini stage for finished queries).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cleanDomain } from '../src/compete/compete';
import { geminiJson, geminiSearchText } from '../src/research/gemini';
import { fetchPage } from '../src/scrape/fetchPage';

process.loadEnvFile('.env');

type Region = 'Middle East' | 'Europe' | 'Southeast Asia';
type Kind = 'partner' | 'enterprise';
type Cand = { company: string; country: string; website: string; sector: string; what: string; signal: string; sourceUrl: string; quote: string };
type Rec = Cand & { region: Region; kind: Kind; checkedAt: string };

const PARTNER_SECTORS = ['Voice AI agent builder', 'Call-centre / CCaaS software', 'Call centre / BPO', 'AI agency / CX integrator', 'Conversational AI adding voice', 'Dialer / telemarketing software', 'CRM / engagement with calling'];
const ENT_SECTORS = ['BFSI', 'Real estate', 'Automotive', 'Logistics', 'Healthcare', 'E-commerce, retail and food', 'Telecom', 'Government and public sector', 'Travel and leisure', 'Utilities, industrial and other'];

// ---------- query plan ----------
type Query = { label: string; region: Region; kind: Kind; prompt: string; allowed: string[] };
const queries: Query[] = [];
const GROUPS: [string, string][] = [
  ['voice-ai', 'voice AI agent builders / AI voice-bot platforms / AI agencies and CX integrators that build AI voice agents for clients / conversational AI companies adding voice'],
  ['ccaas', 'contact-centre software (CCaaS) vendors, outbound dialer or telemarketing software, CRM or engagement platforms with calling, and call centres / BPOs that deploy AI voice agents'],
];
const PARTNER_COUNTRIES: Record<string, string[]> = {
  'Middle East': ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Turkey', 'Israel'],
  Europe: ['United Kingdom', 'Netherlands', 'Germany', 'Spain', 'Sweden', 'France'],
};
for (const [region, countries] of Object.entries(PARTNER_COUNTRIES))
  for (const c of countries)
    for (const [g, desc] of GROUPS)
      queries.push({
        label: `partner/${c}/${g}`, region: region as Region, kind: 'partner', allowed: PARTNER_SECTORS,
        prompt: `Find at least 10 REAL companies based or operating in ${c} that are ${desc}. Include small and mid-size companies, not only global names. Exclude telephony/CPaaS/SIP carriers and SMS vendors (Twilio, Vonage, Infobip, Unifonic, Sinch, Bandwidth, 8x8, CM.com, Telnyx, Plivo). Allowed sector values: ${PARTNER_SECTORS.join(' | ')}.`,
      });

const SEA: [string, string[]][] = [['Singapore', []], ['Indonesia', []], ['Philippines', []], ['Vietnam', []], ['Thailand', []]];
const SEA_GROUPS: [string, string, string[]][] = [
  ['airlines-travel', 'airlines, travel and tourism companies', ['Travel and leisure']],
  ['healthcare', 'hospitals and healthcare groups', ['Healthcare']],
  ['utilities', 'electricity, water, gas and other utilities', ['Utilities, industrial and other']],
  ['retail', 'retailers, e-commerce and food-delivery companies', ['E-commerce, retail and food']],
  ['insurance', 'insurers (and banks that run large telesales or collections)', ['BFSI']],
  ['telecom', 'mobile and broadband telecom operators', ['Telecom']],
  ['real-estate', 'property developers and real-estate agencies', ['Real estate']],
];
for (const [c] of SEA)
  for (const [g, desc, allowed] of SEA_GROUPS)
    queries.push({
      label: `enterprise/${c}/${g}`, region: 'Southeast Asia', kind: 'enterprise', allowed,
      prompt: `Find up to 8 named ${desc} in ${c} (not telephony vendors) with PUBLIC evidence of a calling, contact-centre or WhatsApp-heavy customer operation: for example a careers page hiring contact-centre / telesales / customer-service agents, a published contact-centre or AI-voice deployment, or a customer story from a contact-centre vendor. Allowed sector values: ${allowed.join(' | ')}.`,
    });
for (const c of ['Israel', 'Qatar', 'Turkey'])
  for (const [g, desc, allowed] of [['real-estate', 'property developers and real-estate agencies', ['Real estate']], ['automotive', 'car makers, car importers/dealer groups and car-rental or leasing companies', ['Automotive']]] as [string, string, string[]][])
    queries.push({
      label: `enterprise/${c}/${g}`, region: 'Middle East', kind: 'enterprise', allowed,
      prompt: `Find up to 8 named ${desc} in ${c} (not telephony vendors) with PUBLIC evidence of a calling, contact-centre or WhatsApp-heavy customer operation: for example a careers page hiring contact-centre / telesales / customer-service agents, a published contact-centre or AI-voice deployment, or a customer story from a contact-centre vendor. Allowed sector values: ${allowed.join(' | ')}.`,
    });

// ---------- helpers ----------
const SUFFIX = /\b(ltd|limited|inc|llc|gmbh|ag|sa|bv|b v|ab|sas|sl|plc|co|corp|corporation|pte|pty|sdn|bhd|jsc|pt|tbk|fze|fzco|dmcc|as|a s|oy|nv)\b/g;
const normName = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim().replace(/ /g, '');
const normText = (s: string) => s.toLowerCase().replace(/[‘’‛`´]/g, "'").replace(/[“”]/g, '"').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const httpUrl = (s: string) => { try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.toString() : null; } catch { return null; } };

const existing = JSON.parse(readFileSync('data/vobiz/accounts.json', 'utf8')) as { accounts: { company: string; website?: string }[] };
const knownNames = existing.accounts.flatMap((a) => [normName(a.company), ...a.company.split(/[,/]/).map(normName)]).filter((n) => n.length >= 4);
const knownDomains = new Set(existing.accounts.flatMap((a) => (a.website ? [cleanDomain(a.website)] : [])).filter(Boolean) as string[]);
const isKnown = (company: string, domain: string | null) => {
  const n = normName(company);
  return (domain ? knownDomains.has(domain) : false) || knownNames.some((k) => k === n || (n.length >= 6 && k.length >= 6 && (k.includes(n) || n.includes(k))));
};
const knownList = existing.accounts.map((a) => a.company).join('; ');

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { for (let x = q.shift(); x !== undefined; x = q.shift()) await fn(x); }));
}

// ---------- stage 1+2: research and structure ----------
const CACHE = '.cache/tool-accounts-candidates.json';
const cache: Record<string, Cand[]> = process.argv.includes('--resume') && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

async function research(q: Query): Promise<Cand[]> {
  if (cache[q.label]) return cache[q.label];
  const notesPrompt =
    'Use Google Search to research the task below thoroughly. Write plain-prose research notes. For EVERY company give: its exact legal/brand name, country, the full home-page URL of its own website, one specific page URL (its own site, a careers page, a customer story or a news article) that evidences the claim, and one exact sentence copied word for word from that page. ' +
    'Only list companies you actually found in search results; never guess a URL. Do not repeat these companies already on our list: ' + knownList + '.\n\nTASK:\n' + q.prompt;
  let r = await geminiSearchText(notesPrompt);
  if (!r.sources.length) r = await geminiSearchText(notesPrompt + '\n\nIMPORTANT: you must run Google Search. Do not answer from memory.');
  if (!r.sources.length) return [];
  const data = (await geminiJson(
    'Convert the research notes below into JSON: {"candidates":[{"company":"","country":"","website":"","sector":"","what":"one line on what the company does","signal":"one line on why a telephony provider (SIP trunks, voice APIs, phone numbers for AI voice and contact centres) would fit","sourceUrl":"","quote":""}]}. ' +
      `Use ONLY facts in the notes. "sector" must be exactly one of: ${q.allowed.join(' | ')}. "website" is the company's home page URL and "sourceUrl" the page the quote came from; use "" when the notes do not give them (never invent a URL). "quote" must be the sentence copied exactly in the notes, or "". Skip any company without a website URL in the notes.\n\nRESEARCH NOTES:\n` + r.text,
  )) as { candidates?: Record<string, unknown>[] };
  return (data.candidates ?? []).slice(0, 14).map((c) => ({ company: str(c.company), country: str(c.country), website: str(c.website), sector: str(c.sector), what: str(c.what), signal: str(c.signal), sourceUrl: str(c.sourceUrl), quote: str(c.quote) }));
}

// ---------- stage 3: verification by fetching ----------
type Dropped = { company: string; reason: string };
const dropped: Dropped[] = [];
const kept: Rec[] = [];

/** Asks the model for a sentence copied from a page we fetched; the code still checks it appears verbatim. */
async function repairQuote(c: Cand, pageText: string, kind: Kind): Promise<string> {
  const claim = kind === 'partner' ? `${c.company} builds or sells ${c.sector.toLowerCase()} (voice AI, contact-centre software or services)` : `${c.company} runs a calling, contact-centre or WhatsApp-heavy customer operation (for example hiring contact-centre or telesales agents, or a published contact-centre or AI-voice deployment)`;
  try {
    const out = (await geminiJson(`Below is the text of a web page. If it clearly supports this claim: "${claim}", copy ONE sentence from it exactly, word for word (max 300 characters), as {"quote":"..."}. If it does not support the claim, return {"quote":null}.\n\nPAGE TEXT:\n${pageText.slice(0, 14000)}`)) as { quote?: unknown };
    return str(out.quote);
  } catch {
    return '';
  }
}

async function verify(c: Cand, region: Region, kind: Kind, allowed: string[]) {
  const drop = (reason: string) => void dropped.push({ company: c.company || '(unnamed)', reason });
  const site = httpUrl(c.website);
  const domain = site ? cleanDomain(site) : null;
  if (!c.company || !site || !domain) return drop('no usable website URL');
  if (!allowed.includes(c.sector)) return drop(`sector "${c.sector}" not allowed for this query`);
  if (isKnown(c.company, domain)) return drop('already in accounts.json');
  if (kept.some((k) => cleanDomain(k.website) === domain)) return drop('duplicate of another new record');

  const home = await fetchPage(site);
  if (!home.ok) return drop(`website not fetchable (${home.code}: ${home.detail})`);
  const nameKey = normText(c.company.replace(/\(.*?\)/g, ' ').replace(SUFFIX, ' ')).replace(/ /g, '');
  const homeBlob = normText(`${home.page.title ?? ''} ${home.page.text}`).replace(/ /g, '') + domain.replace(/[^a-z0-9]/g, '');
  const firstWord = normText(c.company).split(' ')[0];
  if (!homeBlob.includes(nameKey) && !(firstWord.length >= 4 && homeBlob.includes(firstWord))) return drop('company name not found on its fetched home page');

  const srcUrl = httpUrl(c.sourceUrl) ?? site;
  const src = srcUrl === home.page.url || srcUrl === site ? home : await fetchPage(srcUrl);
  if (!src.ok) return drop(`source page not fetchable (${src.code}: ${src.detail})`);
  const hay = normText(src.page.text) + ' | ' + normText(src.page.full);
  const wanted = normText(c.quote);
  let quote = c.quote;
  if (wanted.split(' ').length < 6 || !hay.includes(wanted)) {
    quote = await repairQuote(c, src.page.full || src.page.text, kind);
    const w2 = normText(quote);
    if (w2.split(' ').length < 6 || !hay.includes(w2)) return drop('no verbatim supporting quote on the fetched source page');
  }
  // The quote exists on the page; now check it actually says what we claim (a sentence can be verbatim and irrelevant).
  const claim = kind === 'partner'
    ? 'provides voice AI agents, AI voice platforms, contact-centre software, dialers or call-centre/BPO services, or builds such voice/CX solutions for clients'
    : 'runs or is hiring for a calling, contact-centre, telesales or WhatsApp-heavy customer operation, or has a published contact-centre / AI-voice deployment';
  try {
    const j = (await geminiJson(
      `Judge strictly using ONLY the quote and URL below, not outside knowledge. Company: ${c.company}. Claimed country: ${c.country}. Quote: "${quote}". Page URL: ${src.page.url}. ` +
        `Return {"supports":true|false,"reason":"short"}. supports is true only if the quote shows the company ${claim}, AND nothing in the quote or URL says the company is based in a different country than claimed.`,
    )) as { supports?: unknown; reason?: unknown };
    if (j.supports !== true) return drop(`quote does not support the claim: ${str(j.reason).slice(0, 100)}`);
  } catch {
    return drop('claim check failed');
  }
  kept.push({ ...c, quote: quote.replace(/\s+/g, ' ').slice(0, 400), website: home.page.url, sourceUrl: src.page.url, region, kind, checkedAt: new Date().toISOString().slice(0, 10) });
}

// ---------- main ----------
const plan = queries.filter((q) => !only || q.label.includes(only));
console.log(`${plan.length} research queries`);
const perQuery = new Map<string, Cand[]>();
await pool(plan, 3, async (q) => {
  try {
    const cands = await research(q);
    cache[q.label] = cands;
    mkdirSync('.cache', { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cache));
    perQuery.set(q.label, cands);
    console.log(`  ${q.label}: ${cands.length} candidates`);
  } catch (e) {
    console.warn(`  ${q.label}: research failed: ${e instanceof Error ? e.message.slice(0, 160) : e}`);
    perQuery.set(q.label, []);
  }
});

const jobs: { c: Cand; q: Query }[] = [];
const seen = new Set<string>();
for (const q of plan)
  for (const c of perQuery.get(q.label) ?? []) {
    const key = cleanDomain(c.website) ?? normName(c.company);
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({ c, q });
  }
console.log(`verifying ${jobs.length} unique candidates`);
let n = 0;
await pool(jobs, 4, async ({ c, q }) => {
  try {
    await verify(c, q.region, q.kind, q.allowed);
  } catch (e) {
    dropped.push({ company: c.company, reason: `verification error: ${e instanceof Error ? e.message.slice(0, 120) : e}` });
  }
  if (++n % 25 === 0) console.log(`  ${n}/${jobs.length} checked, ${kept.length} kept`);
});

// ---------- write (only now) ----------
const counts = new Map<string, number>();
for (const r of kept) counts.set(`${r.region} / ${r.kind} / ${r.sector}`, (counts.get(`${r.region} / ${r.kind} / ${r.sector}`) ?? 0) + 1);
const notes: string[] = [];
for (const q of plan) if (!perQuery.get(q.label)?.length) notes.push(`${q.label}: research returned no candidates`);
for (const [region, kind, sectors] of [['Middle East', 'enterprise', ['Real estate', 'Automotive']], ['Southeast Asia', 'enterprise', ENT_SECTORS]] as [Region, Kind, string[]][])
  for (const s of sectors) if (!kept.some((r) => r.region === region && r.kind === kind && r.sector === s)) notes.push(`${region} / ${kind} / ${s}: nothing verifiable found`);
for (const region of ['Middle East', 'Europe'] as Region[]) if (!kept.some((r) => r.region === region && r.kind === 'partner')) notes.push(`${region} / partner: nothing verifiable found`);

kept.sort((a, b) => a.region.localeCompare(b.region) || a.kind.localeCompare(b.kind) || a.sector.localeCompare(b.sector) || a.company.localeCompare(b.company));
writeFileSync('data/vobiz/tool-accounts.json', JSON.stringify({ generatedAt: new Date().toISOString(), counts: Object.fromEntries(counts), notes, accounts: kept, dropped }, null, 1));
console.log(`DONE: ${kept.length} verified, ${dropped.length} dropped`);
