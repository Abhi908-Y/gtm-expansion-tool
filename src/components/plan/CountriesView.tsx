'use client';
import { useState } from 'react';
import { READINESS, type Cell } from '@/screen/screen';
import { verdictTone, type TabProps } from '../shared';
import { Bar, Empty, Fig, Pill } from './ui';

function Desk({ c, editable, onSave }: { c?: Cell; editable: boolean; onSave: (v: number | null) => void }) {
  const was = c && !c.estimated ? String(c.score) : '';
  const [v, setV] = useState(was);
  if (!editable) return <Fig c={c} />;
  return (
    <td className="num">
      <input type="number" min={1} max={5} step={1} value={v} placeholder={c?.estimated ? String(c.score) : '–'} title={c?.note} aria-label="Analyst score, 1 to 5"
        onChange={(e) => setV(e.target.value)} onBlur={() => v !== was && onSave(v === '' ? null : Number(v))} />
    </td>
  );
}

export default function CountriesView({ st, post, run, busy, ro }: TabProps) {
  const p = st.project;
  const regions = st.computed.regions;
  const [only, setOnly] = useState<string>('all');
  const have = regions.some((r) => r.countries.some((x) => x.total != null));
  const edit = (iso3: string, body: object) => run('Saving', () => post('country', { iso3, ...body }));
  const desk = (iso3: string, key: string, label: string) => (v: number | null) => {
    if (v === null) return edit(iso3, { desk: { [key]: null } });
    const reason = window.prompt(`Why ${v} out of 5 for ${label}? One line; it is stored with the score.`);
    if (reason?.trim()) edit(iso3, { desk: { [key]: v }, reason });
  };
  const screen = (force = false) => run(force ? 'Refreshing public data' : 'Pulling public data', () => post('screen', force ? { force: true } : {}));
  const shown = only === 'all' ? regions : regions.filter((r) => r.name === only);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Countries</h1>
          <p className="muted">{p.ranAt ? `Public data pulled ${new Date(p.ranAt).toLocaleString()}.` : 'Gates first, then a score out of 100 for each country that passes.'}</p>
        </div>
        {have && (
          <div className="row">
            <button className="btn" disabled={!!busy} onClick={() => screen(true)}>Refresh data</button>
          </div>
        )}
      </div>
      {(p.warnings ?? []).map((w) => <div className="note warn" key={w}>{w}</div>)}

      {!have && (
        <Empty title="Not screened yet" action={<button className="btn primary" disabled={!!busy} onClick={() => screen()}>Run screening</button>}>
          Pulls GDP (IMF), AI use (Microsoft, Eurostat), English level (EF) and ICT workforce (Eurostat) for every country in this plan, removes sanctioned and blacklisted ones, and scores the rest. Takes about ten seconds.
        </Empty>
      )}

      {have && (
        <>
          <div className="filters" role="group" aria-label="Filter by region">
            {['all', ...regions.map((r) => r.name)].map((n) => (
              <button key={n} className={`chip ${only === n ? 'on' : ''}`} onClick={() => setOnly(n)}>{n === 'all' ? 'All regions' : n}</button>
            ))}
          </div>

          {shown.map((r) => {
            const cfg = p.regions.find((x) => x.name === r.name)!;
            const deskPartner = cfg.partner === 'desk';
            const rows = r.countries.filter((c) => !c.out);
            const outs = r.countries.filter((c) => c.out);
            return (
              <section className="card" key={r.name}>
                <div className="card-head">
                  <div>
                    <h2>{r.name}</h2>
                    <p className="muted small">Average Priority 1–2 score {r.avgTop ?? 'n/a'} · {r.beachheads} beachhead{r.beachheads === 1 ? '' : 's'} · {rows.length} scored, {outs.length} out</p>
                  </div>
                </div>
                <div className="scroll">
                  <table style={{ minWidth: 1080 }}>
                    <thead>
                      <tr>
                        <th>Country</th><th>Score</th><th>Verdict</th><th>Readiness</th>
                        <th className="num">Demand</th><th className="num">AI use</th><th className="num">English</th><th className="num">Time</th>
                        <th className="num" title="Analyst judgement">Rules*</th><th className="num" title="Analyst judgement">Competition*</th><th className="num" title={deskPartner ? 'Analyst judgement' : 'Eurostat ICT workforce'}>Partners{deskPartner ? '*' : ''}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => (
                        <tr key={c.iso3}>
                          <td>
                            <div className="cname">{c.name}</div>
                            <div className="faint small">{c.priority}{!ro && <> · <button className="link quiet" onClick={() => { const reason = window.prompt(`Why is ${c.name} out? For example: no legal route, payments blocked, nothing usable to sell.`); if (reason?.trim()) edit(c.iso3, { humanGate: { fail: true, reason } }); }}>mark out</button></>}</div>
                          </td>
                          <td><Bar value={c.total!} /></td>
                          <td><Pill tone={verdictTone(c.verdict)}>{c.verdict}</Pill></td>
                          <td><select disabled={ro} value={c.readiness} onChange={(e) => edit(c.iso3, { readiness: e.target.value })} aria-label={`Readiness for ${c.name}`}>{READINESS.map((x) => <option key={x}>{x}</option>)}</select></td>
                          <Fig c={c.cells!.demand} /><Fig c={c.cells!.ai} /><Fig c={c.cells!.english} /><Fig c={c.cells!.time} />
                          <Desk key={`r${c.iso3}${c.cells!.rules.score}${c.cells!.rules.estimated}`} c={c.cells!.rules} editable={!ro} onSave={desk(c.iso3, 'rules', 'B2B calling rules')} />
                          <Desk key={`c${c.iso3}${c.cells!.competition.score}${c.cells!.competition.estimated}`} c={c.cells!.competition} editable={!ro} onSave={desk(c.iso3, 'competition', 'competition')} />
                          <Desk key={`p${c.iso3}${c.cells!.partner.score}${c.cells!.partner.estimated}`} c={c.cells!.partner} editable={!ro && deskPartner} onSave={desk(c.iso3, 'partner', 'partner base')} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {outs.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <h3 style={{ marginBottom: 6 }}>Ruled out</h3>
                    <ul className="out small">
                      {outs.map((c) => (
                        <li key={c.iso3}>
                          <b>{c.name}</b> <span className="muted">{c.gates.filter((g) => g.status === 'fail').map((g) => `${g.id}: ${g.reason}`).join('; ')}</span>{' '}
                          {!ro && p.countries[c.iso3]?.humanGate && <button className="link" onClick={() => edit(c.iso3, { humanGate: null })}>reinstate</button>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}

          <p className="faint small">
            * Analyst judgement: there is no public dataset, so a person scores it 1–5 with a reason. Blank cells use the regional median and show in amber. Scoring bands are the tool’s defaults.
          </p>

          {st.computed.golden && (
            <details className="card">
              <summary style={{ cursor: 'pointer' }}><b>Check against the original Vobiz analysis</b> <span className="muted small">how far the tool’s default scoring sits from the hand-made scores</span></summary>
              <div className="regions" style={{ marginTop: 14 }}>
                {st.computed.golden.map((x) => (
                  <div key={x.region}>
                    <h3>{x.region}</h3>
                    <p className="muted small" style={{ margin: '2px 0 8px' }}>Rank match {x.rho == null ? 'n/a' : x.rho.toFixed(2)} · average gap {x.meanAbsDiff ?? 'n/a'} points</p>
                    <table>
                      <thead><tr><th>Country</th><th className="num">Tool</th><th className="num">Brief</th><th className="num">Gap</th></tr></thead>
                      <tbody>
                        {x.rows.map((r) => (
                          <tr key={r.iso3}><td>{r.name}</td><td className="num">{r.ours.toFixed(1)}</td><td className="num">{r.reference.toFixed(1)}</td><td className="num" style={{ color: Math.abs(r.diff) >= 8 ? 'var(--bad)' : 'var(--muted)' }}>{r.diff > 0 ? '+' : ''}{r.diff}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}
