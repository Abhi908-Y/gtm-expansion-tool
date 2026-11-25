'use client';
import { useEffect, useState } from 'react';
import { contactRows } from '@/outreach/export';
import { funnel, KPIS, toCsv, weeklyPlan, type Assumptions } from '@/strategy/strategy';
import { downloadCsv } from '../download';
import { verdictTone, type TabProps } from '../shared';
import { Empty, Kpi, Pill } from './ui';

type J = Record<string, any>;
const pct = (x: number) => Math.round(x * 1000) / 10;
const RATES: { key: keyof Assumptions; label: string; hint: string }[] = [
  { key: 'conversation', label: 'Leads who reply and talk', hint: 'brief: 8%' },
  { key: 'meeting', label: 'Conversations that become qualified meetings', hint: 'brief: 40%' },
  { key: 'pilot', label: 'Meetings that become pilots', hint: 'brief: 1 in 3' },
  { key: 'proposal', label: 'Pilots that reach a proposal', hint: 'brief: 70%' },
  { key: 'win', label: 'Proposals that become customers', hint: 'brief: 50%' },
];
const PHASES = [
  { weeks: 'Weeks 1–2', name: 'Research', body: 'Interview 10–15 companies per region that already use similar products, plus existing customers: what they look for, why they chose their provider, who decides. Set the regional ICP, messaging and objections. Build and tier the lead list.' },
  { weeks: 'Weeks 3–6', name: 'Outreach', body: 'Tier 1 (10–20 accounts) personalised, with warm introductions where possible. Tiers 2 and 3 in sequences. Book qualified meetings and hand them to the sales team.' },
  { weeks: 'Weeks 7–10', name: 'Pilots and proposals', body: '2–4 week pilots with success criteria and go-live terms agreed up front. Proposals go to the pilots that hit their criteria.' },
  { weeks: 'Weeks 11–13', name: 'Close and expand', body: 'Convert the proposals. Reset the forecast using the conversion rates you actually saw. Open the second-wave markets.' },
];

function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Consulted({ o }: { o?: J }) {
  if (!o) return null;
  if (o._ungrounded) return <p className="note warn small" style={{ marginTop: 8 }}>No web sources were consulted for this playbook, so nothing in it counts as verified. Treat it as a lead to check.</p>;
  const src: { title: string; url: string }[] = o._sources ?? [];
  return <p className="faint small" style={{ marginTop: 8 }}>Sources consulted: {src.slice(0, 8).map((x, i) => <span key={x.url}>{i > 0 && ', '}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.title || 'source'}</a></span>)}{src.length > 8 && ' …'}</p>;
}

export default function StrategyView({ st, post, run, busy, ro }: TabProps) {
  const p = st.project;
  const S = st.strategy;
  const facts = S.facts.filter((f) => f.byVerdict.length);
  const [reg, setReg] = useState<string>(facts[0]?.name ?? '');
  const [scope, setScope] = useState<'region' | 'all'>('region');
  const [a, setA] = useState<Record<string, number>>({ leads: S.assumptions.leads, ...Object.fromEntries(RATES.map((r) => [r.key, pct(S.assumptions[r.key])])) });
  useEffect(() => {
    setA({ leads: S.assumptions.leads, ...Object.fromEntries(RATES.map((r) => [r.key, pct(S.assumptions[r.key])])) });
  }, [S.assumptions]);

  if (!p.ranAt || facts.length === 0)
    return (
      <>
        <div className="pagehead"><div><h1>Strategy</h1><p className="muted">Region order, target markets, regional playbooks and a 13-week plan to first customers.</p></div></div>
        <Empty title="Screen the countries first">The strategy follows from the country scores and verdicts. Run the screening on the Countries tab, then come back.</Empty>
      </>
    );

  const regionCount = facts.length;
  const asm: Assumptions = { leads: Math.max(1, Math.round(a.leads) || 1) * (scope === 'all' ? regionCount : 1), ...Object.fromEntries(RATES.map((r) => [r.key, Math.min(1, Math.max(0.001, (a[r.key] || 0) / 100))])) } as Assumptions;
  const f = funnel(asm);
  const weeks = weeklyPlan(f);
  const dirty = Math.round(a.leads) !== S.assumptions.leads || RATES.some((r) => Math.abs(a[r.key] / 100 - S.assumptions[r.key]) > 0.0005);
  const fact = facts.find((x) => x.name === reg) ?? facts[0];
  const pb = S.playbooks[fact.name] as J | undefined;
  const markets = facts.flatMap((x) => x.byVerdict.flatMap((g) => g.countries.map((c) => ({ ...c, verdict: g.verdict, region: x.name }))));
  const near = (iso: string) => st.compete.perCountry.find((c) => c.iso3 === iso);

  const saveAssumptions = () => run('Saving the planning rates', () => post('strategy', { op: 'assumptions', assumptions: { leads: Math.round(a.leads), ...Object.fromEntries(RATES.map((r) => [r.key, a[r.key] / 100])) } }));
  const makePlaybook = (name: string) => run(`Researching the ${name} playbook`, () => post('strategy', { op: 'playbook', region: name }));
  const slug = p.company.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const exportCountries = () => download(`${slug}-countries.csv`, toCsv([['Region', 'Country', 'Score', 'Verdict', 'Readiness', 'Global competitors present', 'Local competitors present'], ...markets.map((m) => [m.region, m.name, m.total.toFixed(1), m.verdict, m.readiness, near(m.iso3)?.global.join('; '), near(m.iso3)?.local.join('; ')])]));
  const exportAccounts = () => downloadCsv(`${slug}-outreach.csv`, contactRows(st.outreach.accounts));
  const exportKpis = () => download(`${slug}-90-day-kpis-${scope}.csv`, toCsv([['Week', 'Phase', ...KPIS.map((k) => k.label)], ...weeks.map((w) => [w.week, w.phase, ...KPIS.map((k) => w[k.key])])]));

  return (
    <>
      <div className="pagehead no-print">
        <div><h1>Strategy</h1><p className="muted">Region order, target markets, a playbook per region, and a 13-week plan to first customers.</p></div>
        <div className="row">
          <button className="btn" onClick={exportCountries}>Countries CSV</button>
          <button className="btn" onClick={exportAccounts} disabled={!st.outreach.accounts.length}>Outreach contacts CSV</button>
          <button className="btn" onClick={exportKpis}>Weekly KPIs CSV</button>
          <button className="btn primary" onClick={() => window.print()}>Print or save as PDF</button>
        </div>
      </div>
      <div className="print-only"><h1>{p.company}: market-entry strategy</h1></div>

      {/* 1. Region order */}
      <section className="card">
        <h2>Region order</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>Ranked by the average score of Priority 1 and 2 countries. The reasons are read from the plan’s own data.</p>
        <div className="regions">
          {S.facts.map((x) => (
            <div className="region" key={x.name}>
              <div className="pos">#{x.rank}</div>
              <div className="nm">{x.name}</div>
              <ul className="out small" style={{ paddingLeft: 16 }}>{x.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Target markets */}
      <section className="card">
        <h2>Target markets</h2>
        <p className="muted small" style={{ marginBottom: 10 }}>In the order to enter them: beachheads first, then second wave, then markets that need a coverage check or fix.</p>
        <div className="scroll">
          <table style={{ minWidth: 760 }}>
            <thead><tr><th>Country</th><th>Region</th><th>Verdict</th><th>Score</th><th>Readiness</th><th>Competitors with evidence</th></tr></thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.iso3}>
                  <td className="cname">{m.name}</td><td className="muted">{m.region}</td>
                  <td><Pill tone={verdictTone(m.verdict)}>{m.verdict}</Pill></td>
                  <td className="num">{m.total.toFixed(1)}</td><td className="small">{m.readiness}</td>
                  <td className="small">{[...(near(m.iso3)?.global ?? []).map((n) => `${n} (global)`), ...(near(m.iso3)?.local ?? [])].join(', ') || <span className="faint">none recorded</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Playbooks */}
      <section className="card">
        <div className="card-head">
          <div><h2>Regional playbooks</h2><p className="muted small">One per region. Legal rules carry a source and a date; everything is researched with search on.</p></div>
          <div className="filters no-print" role="group" aria-label="Region">
            {facts.map((x) => <button key={x.name} className={`chip ${fact.name === x.name ? 'on' : ''}`} onClick={() => setReg(x.name)}>{x.name}{S.playbooks[x.name] ? ' ✓' : ''}</button>)}
          </div>
        </div>

        <div className="kpis" style={{ marginBottom: 14 }}>
          <div className="kpi" style={{ gridColumn: 'span 2' }}>
            <div className="label">Entry sequence</div>
            <div className="small" style={{ marginTop: 6 }}>{fact.byVerdict.map((g, i) => <div key={g.verdict}>{i + 1}. <Pill tone={verdictTone(g.verdict)}>{g.verdict}</Pill> {g.countries.map((c) => c.name).join(', ')}</div>)}</div>
          </div>
          <Kpi label="Time difference" value={<span style={{ fontSize: 20 }}>{fact.timeDiff ? `${fact.timeDiff[0]}–${fact.timeDiff[1]} h` : 'n/a'}</span>} sub="from your sales team" />
          <Kpi label="Day-90 goal (planning rates)" value={<span style={{ fontSize: 20 }}>~{Math.round(funnel(asm).customers / (scope === 'all' ? regionCount : 1))} customers</span>} sub={`${Math.round(funnel(asm).pilots / (scope === 'all' ? regionCount : 1))} pilots, ${Math.round(funnel(asm).meetings / (scope === 'all' ? regionCount : 1))} meetings`} />
        </div>

        {!pb ? (
          <div className="empty" style={{ padding: '18px 0' }}>
            <p>No playbook for {fact.name} yet. It covers research focus, lead segments, the positioning hook, rules that shape the offer, channels, partners and working rhythm.</p>
            {!ro && <button className="btn primary" disabled={!st.gemini || !!busy} onClick={() => makePlaybook(fact.name)}>Research the {fact.name} playbook</button>}
            {!st.gemini && <p className="faint small" style={{ marginTop: 8 }}>The AI steps are switched off on this site right now.</p>}
          </div>
        ) : (
          <div className="stack">
            {!ro && <div className="no-print"><button className="btn sm" disabled={!st.gemini || !!busy} onClick={() => makePlaybook(fact.name)}>Redo</button> <span className="faint small">built {new Date(pb.builtAt).toLocaleDateString()}</span></div>}
            <div className="grid2">
              <div><h3>Positioning hook</h3><p>{pb.positioning_hook?.hook}</p><p className="faint small">{pb.positioning_hook?.evidence}</p></div>
              <div><h3>Working rhythm</h3><p className="small"><b>Weekend:</b> {pb.rhythm?.weekend}</p><p className="small"><b>Call window:</b> {pb.rhythm?.call_window}</p><p className="small muted">{pb.rhythm?.note}</p></div>
            </div>
            <div>
              <h3>Research focus, weeks 1–2</h3>
              <ul className="out small">{(pb.research_focus ?? []).map((r: J, i: number) => <li key={i}><b>{r.question}</b> <span className="muted">{r.why} Ask: {r.who_to_ask}.</span></li>)}</ul>
            </div>
            <div>
              <h3>Lead segments</h3>
              <ul className="out small">{(pb.lead_segments ?? []).map((s: J, i: number) => <li key={i}><b>{s.segment}</b> <Pill tone={s.buyer_type === 'repackager' ? 'accent' : ''}>{String(s.buyer_type).replace('_', ' ')}</Pill> <span className="muted">{s.why_fit}</span>{(s.example_accounts ?? []).length > 0 && <> <span className="faint">e.g. {s.example_accounts.join(', ')}</span></>}</li>)}</ul>
            </div>
            <div>
              <h3>Rules that shape the offer</h3>
              <ul className="out small">{(pb.rules ?? []).map((r: J, i: number) => <li key={i}><Pill tone={r.status === 'verified' ? 'good' : 'warn'}>{r.status}</Pill> <b>{r.rule}</b> <span className="faint">{r.applies_to}</span> <span className="muted">{r.source_and_date}</span></li>)}</ul>
              <p className="faint small">This is research, not legal advice. Have each rule checked locally before you rely on it.</p>
            </div>
            <div className="grid2">
              <div><h3>Channels</h3><ul className="out small">{(pb.channels ?? []).map((c: J, i: number) => <li key={i}><b>{c.channel}</b> <span className="muted">{c.why}</span></li>)}</ul></div>
              <div><h3>Partners</h3><ul className="out small">{(pb.partners ?? []).map((c: J, i: number) => <li key={i}><b>{c.type}</b> <span className="muted">{c.why}</span>{(c.examples ?? []).length > 0 && <> <span className="faint">e.g. {c.examples.join(', ')}</span></>}</li>)}</ul></div>
            </div>
            {(pb.risks ?? []).length > 0 && <div><h3>Risks</h3><ul className="out small">{pb.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></div>}
            <Consulted o={pb} />
          </div>
        )}
      </section>

      {/* 4. 90-day plan */}
      <section className="card">
        <div className="card-head">
          <div><h2>90-day plan to revenue</h2><p className="muted small">Four phases, and a funnel worked backwards from the number of leads. The rates are planning assumptions; replace them with real ones after the research weeks.</p></div>
          <div className="filters no-print" role="group" aria-label="Scope">
            <button className={`chip ${scope === 'region' ? 'on' : ''}`} onClick={() => setScope('region')}>Per region</button>
            <button className={`chip ${scope === 'all' ? 'on' : ''}`} onClick={() => setScope('all')}>All {regionCount} regions</button>
          </div>
        </div>

        <div className="regions" style={{ marginBottom: 16 }}>
          {PHASES.map((ph) => <div className="region" key={ph.name}><div className="pos">{ph.weeks}</div><div className="nm" style={{ fontSize: 15 }}>{ph.name}</div><p className="small muted">{ph.body}</p></div>)}
        </div>

        <h3 style={{ marginBottom: 8 }}>Funnel</h3>
        <div className="kpis" style={{ marginBottom: 12 }}>
          {[['Leads', f.leads], ['Conversations', f.conversations], ['Qualified meetings', f.meetings], ['Pilots', f.pilots], ['Proposals', f.proposals], ['Customers', f.customers]].map(([l, v]) => <Kpi key={l as string} label={l as string} value={`~${Math.round(v as number).toLocaleString()}`} />)}
        </div>
        {!ro && (
          <div className="no-print" style={{ marginBottom: 16 }}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ marginBottom: 0 }}><label htmlFor="leads">Leads per region</label><input id="leads" type="number" min={1} max={50000} value={a.leads} onChange={(e) => setA({ ...a, leads: Number(e.target.value) })} style={{ width: 110 }} /></div>
              {RATES.map((r) => (
                <div className="field" style={{ marginBottom: 0 }} key={r.key}>
                  <label htmlFor={`r-${r.key}`} title={r.hint}>{r.label}</label>
                  <span className="row" style={{ gap: 4 }}><input id={`r-${r.key}`} type="number" min={0.1} max={100} step={0.1} value={a[r.key]} onChange={(e) => setA({ ...a, [r.key]: Number(e.target.value) })} style={{ width: 80 }} /> %</span>
                </div>
              ))}
              <button className="btn" disabled={!dirty || !!busy} onClick={saveAssumptions}>Save rates</button>
            </div>
          </div>
        )}

        <h3 style={{ marginBottom: 8 }}>Weekly targets <span className="faint small">{scope === 'all' ? `all ${regionCount} regions` : 'per region'}</span></h3>
        <div className="scroll">
          <table style={{ minWidth: 820 }}>
            <thead><tr><th>Week</th><th>Phase</th>{KPIS.map((k) => <th key={k.key} className="num">{k.label}</th>)}</tr></thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.week}>
                  <td className="num"><b>{w.week}</b></td><td className="small">{w.phase}</td>
                  {KPIS.map((k) => <td key={k.key} className="num">{w[k.key] || <span className="faint">·</span>}</td>)}
                </tr>
              ))}
              <tr><td /><td className="small"><b>Total</b></td>{KPIS.map((k) => <td key={k.key} className="num"><b>{weeks.reduce((t, w) => t + w[k.key], 0).toLocaleString()}</b></td>)}</tr>
            </tbody>
          </table>
        </div>
        <p className="faint small" style={{ marginTop: 8 }}>Also track every week: reply rate, win and loss reasons. A qualified opportunity has a clear use case, volume potential, technical fit, urgency, budget and access to stakeholders. A qualified conversation reaches the person who owns the relevant stack.</p>
      </section>
    </>
  );
}
