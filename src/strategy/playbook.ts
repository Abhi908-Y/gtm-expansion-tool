// One regional playbook. The country list, verdicts, time differences and competitors come from the plan (code);
// the model researches the qualitative cells with Google Search on, and legal rules must carry a named, dated source.
import { knownBlock, run, type Base, type Out } from '../outreach/steps';
import type { Json } from '../outreach/checks';
import type { Funnel } from './strategy';

type Fact = { name: string; byVerdict: { verdict: string; countries: { name: string; total: number; readiness: string }[] }[]; timeDiff: [number, number] | null; globals: string[]; locals: string[]; out: string[] };

export async function runPlaybook(b: Base, f: Fact, icp: Json | undefined, funnel: Funnel): Promise<Out> {
  const markets = f.byVerdict.map((g) => `- ${g.verdict}: ${g.countries.map((c) => `${c.name} (score ${c.total.toFixed(0)}, ${c.readiness})`).join(', ')}`).join('\n') || '(no scored countries yet)';
  const signals = Array.isArray(icp?.buying_signals) ? icp!.buying_signals.map((s: Json) => s.signal).join('; ') : '';
  const candidates = Array.isArray(icp?.candidates) ? icp!.candidates.map((c: Json) => `${c.name} (${c.region})`).join(', ') : '';
  return run(`Respond with ONLY a single JSON object matching the schema below: no prose before or after, no markdown fences. Use web search to ground every factual claim. Never fabricate names, laws, numbers or dates. An empty or "not publicly findable" field is honest; a guessed one is not.

You are writing one regional go-to-market playbook for ${b.company}: ${b.whatIDo}
${knownBlock(b)}

Region: ${f.name}
Markets, in the order the plan will enter them:
${markets}
Ruled out by the gates: ${f.out.join(', ') || 'none'}
Time difference from the sales team: ${f.timeDiff ? `${f.timeDiff[0]} to ${f.timeDiff[1]} hours` : 'unknown'}
Competitors with evidence in this region: global: ${f.globals.join(', ') || 'none recorded'}; local: ${f.locals.join(', ') || 'none recorded'}
ICP: ${String(icp?.icp_summary ?? 'not built yet')}
Buying signals visible from outside: ${signals || 'not built yet'}
Candidate accounts from the ICP (any region): ${candidates || 'none'}
Day-90 funnel if the planning rates hold (per region): about ${Math.round(funnel.leads)} leads, ${Math.round(funnel.conversations)} conversations, ${Math.round(funnel.meetings)} qualified meetings, ${Math.round(funnel.pilots)} pilots, ${Math.round(funnel.customers)} customers.

Write the playbook for THIS region only. Rules:
1. Legal and regulatory items (consent for B2B calls, Do Not Call registers, disclosure that a caller is an AI voice, data residency, rules on number ownership) each need a named source and a date. Say which countries of this region they apply to.
2. Example accounts, partners and channels must be real and currently operating, and relevant to the countries above, preferring the earliest markets in the entry order.
3. Lead segments come in two kinds: "repackager" (buys the stack and resells or embeds it, for example voice AI builders and SaaS tools: faster to buy, target first) and "end_user" (uses it directly, longer cycles).
4. Keep every list short and specific: no item that would be equally true of any region.

Schema:
{
  "research_focus": [{"question": "what to learn from local users in weeks 1-2", "why": "...", "who_to_ask": "kind of person or company"}],
  "lead_segments": [{"segment": "...", "buyer_type": "repackager|end_user", "why_fit": "...", "example_accounts": ["real company"]}],
  "positioning_hook": {"hook": "the region-specific reason to buy, one sentence", "evidence": "what in the plan data or sources supports it"},
  "rules": [{"rule": "...", "applies_to": "countries", "source_and_date": "...", "status": "verified|assertion"}],
  "channels": [{"channel": "which outreach channel works here", "why": "..."}],
  "partners": [{"type": "kind of partner", "examples": ["real company"], "why": "..."}],
  "rhythm": {"weekend": "which days are the weekend in the first-entry countries", "call_window": "good hours to reach them, in the sales team's local time", "note": "one practical point"},
  "risks": ["one specific risk to this region's plan"]
}
Max 4 items in research_focus, lead_segments, rules, channels and partners; max 3 risks.`);
}
