// Everything the assistant is allowed to know, written as plain text from the saved plan. Pure: same plan in, same text out.
import { competeView, compute, type Project } from '../store';
import { regionFacts } from '../strategy/strategy';

const clip = (s: unknown, n = 220) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

export function chatContext(p: Project): string {
  const L: string[] = [];
  L.push(`# ${p.company} (${p.website})`, clip(p.context, 600));

  if (p.profile) {
    L.push('\n## Company profile (each fact was quoted from their own pages)');
    for (const [k, claims] of Object.entries(p.profile.profile.fields)) for (const c of claims.slice(0, 3)) L.push(`- ${k.replace(/_/g, ' ')}: ${clip(c.text)}`);
  }

  const computed = compute(p);
  if (p.ranAt) {
    L.push('\n## Countries (score out of 100; verdict; readiness)');
    for (const r of computed.regions) {
      L.push(`### ${r.name}: average Priority 1-2 score ${r.avgTop ?? 'n/a'}, ${r.beachheads} beachheads`);
      for (const c of r.countries) {
        if (c.out) L.push(`- ${c.name}: RULED OUT. ${c.gates.filter((g) => g.status === 'fail').map((g) => g.reason).join('; ')}`);
        else L.push(`- ${c.name}: ${c.total?.toFixed(1)}, ${c.priority}, ${c.verdict}, readiness ${c.readiness}. Demand ${c.cells?.demand.raw ?? 'n/a'}; AI use ${c.cells?.ai.raw ?? 'estimated'}; English ${c.cells?.english.raw ?? 'estimated'}`);
      }
    }
  }

  const comp = competeView(p);
  if (comp.rows.length) {
    L.push('\n## Competitors (type, role, reach from evidence on their own pages)');
    for (const r of comp.rows) L.push(`- ${r.name}: ${r.type ?? 'not analysed'}, ${r.role ?? ''}, ${r.reach}. Customers named: ${r.customers.slice(0, 5).map((c) => c.name).join(', ') || 'none'}`);
  }

  const icp = p.outreach?.icp;
  if (icp) {
    L.push('\n## Ideal customer profile', clip(icp.icp_summary, 500));
    L.push('Buying signals: ' + (icp.buying_signals ?? []).map((s: any) => s.signal).join('; '));
    L.push('Weakest assumption: ' + clip(icp.weakest_assumption?.assumption));
  }
  for (const a of p.outreach?.accounts ?? []) {
    L.push(`\n## Account: ${a.name} (${a.region ?? 'region unknown'}, ${a.website ?? 'no site'})`);
    if (a.company) L.push(`Does: ${clip(a.company.what_they_do)}. Fit: ${clip(a.company.fit_assessment)}. Reason to write now: ${clip(a.company.trigger)}`);
    for (const s of a.industry?.shifts ?? []) L.push(`- Industry shift (${s.status}): ${clip(s.change)} [${clip(s.source_and_date, 80)}]`);
    for (const n of (a.company?.latest_news ?? []).slice(0, 4)) L.push(`- News (${n.status}, ${n.date}): ${clip(n.headline)}`);
    for (const x of a.people?.people ?? []) L.push(`- Person: ${x.name}, ${x.title}. Evidence: ${clip(x.what_they_said_or_did, 160)}. Email: ${x.email ?? 'none published'}`);
    for (const d of a.outreach?.per_person ?? []) {
      const m = a.messages?.per_person?.find((y: any) => String(y.person).toLowerCase() === String(d.person).toLowerCase());
      L.push(`- Draft for ${d.person}: style ${d.style_used}; email 1 subject "${clip(d.emails?.[0]?.subject, 80)}"; ${m ? `graded ${m.verdict}, ${m.from_pack_pct}% from research` : 'not graded'}${d.issues?.length ? `; rule breaks: ${d.issues.join('; ')}` : ''}`);
    }
  }

  if (p.ranAt) {
    const facts = regionFacts(computed.regions, comp.perCountry, p.baseTz, (c) => p.countries[c]?.tz);
    L.push('\n## Strategy');
    for (const f of facts) {
      L.push(`### ${f.name} (#${f.rank})`, ...f.reasons.map((r) => `- ${r}`));
      const pb = p.strategy?.playbooks[f.name];
      if (pb) {
        L.push(`Hook: ${clip(pb.positioning_hook?.hook, 300)}`);
        L.push('Segments: ' + (pb.lead_segments ?? []).map((s: any) => `${s.segment} (${s.buyer_type})`).join('; '));
        for (const r of pb.rules ?? []) L.push(`- Rule (${r.status}): ${clip(r.rule, 160)} [${clip(r.source_and_date, 80)}]`);
        L.push('Risks: ' + (pb.risks ?? []).map((x: string) => clip(x, 140)).join(' | '));
      }
    }
    const a = p.strategy?.assumptions;
    if (a) L.push(`Planning rates: ${a.leads} leads per region; reply ${a.conversation * 100}%, meeting ${a.meeting * 100}%, pilot ${(a.pilot * 100).toFixed(1)}%, proposal ${a.proposal * 100}%, win ${a.win * 100}%`);
  }

  if (p.notes?.length) L.push('\n## Notes added by the user (treat as facts from the user)', ...p.notes.map((n) => `- ${clip(n.text, 600)}`));
  return L.join('\n').slice(0, 45000);
}

export const chatSystem = (context: string, web: boolean, screen = '') =>
  `You are the analyst built into a market-entry planning tool. The user is looking at a plan; its data is below. Answer from that data and the user's notes.${screen ? `\nThe user is currently on the "${screen}" tab. Words like "this", "here" or "these" refer to what that tab shows.` : ''}
- Be concrete and short. Name the country, competitor or account you mean, and say which tab it is on (Company, Countries, Competitors, Outreach, Strategy).
- If the plan does not contain something, say so plainly and say which step would produce it. Never invent figures, names, laws or sources.
- Scores are out of 100 and built from public data; analyst scores and readiness are the user's own inputs.
- Facts marked "assertion" are not verified. Legal rules are research, not legal advice.
${web ? '- You may search the web for facts the plan lacks. Say when an answer comes from the web and not from the plan.' : '- Web search is off for this answer. If the user needs outside facts, tell them to tick "Search the web".'}

--- PLAN DATA ---
${context}`;
