'use client';
import { useState } from 'react';
import { TYPE_LABEL, TYPE_TONE, type TabProps } from '../shared';
import { Dictate } from '../Mic';
import { Empty, Kpi, Pill } from './ui';

const reachTone = (r: string) => (r === 'Global' ? 'accent' : r.startsWith('Local') ? 'info' : '');

export default function CompetitorsView({ st, post, run, busy, ro }: TabProps) {
  const v = st.compete;
  const pending = v.rows.filter((r) => !r.analysed);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [prog, setProg] = useState('');
  const can = st.gemini && !ro && !busy;
  const op = (o: string, d: string, extra: object = {}) => post('competitor', { op: o, domain: d, ...extra });
  const types = v.rows.reduce<Record<string, number>>((m, r) => (r.type ? ((m[r.type] = (m[r.type] ?? 0) + 1), m) : m), {});
  const analyseAll = () =>
    run('Analysing competitors', async () => {
      for (let i = 0; i < pending.length; i++) {
        setProg(`${i + 1} of ${pending.length}: ${pending[i].name}`);
        await op('analyse', pending[i].domain);
      }
      setProg('');
    });

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Competitors</h1>
          <p className="muted">Who else sells here, what kind of company each is, and where its own pages prove it operates.</p>
        </div>
        {!ro && (
          <div className="row">
            <button className="btn" disabled={!can} onClick={() => run('Searching for more competitors', async () => { const r = await post('discover'); if (!r.added) window.alert('Search found nothing new.'); })}>Find more with search</button>
            <button className="btn primary" disabled={!can || !pending.length} onClick={analyseAll}>Analyse {pending.length || ''} pending</button>
          </div>
        )}
      </div>
      {!st.gemini && <div className="note warn">The AI steps are switched off on this site right now. You can still add and remove competitors.</div>}
      {prog && <div className="busy">{prog}</div>}

      {v.rows.length > 0 && (
        <div className="kpis">
          <Kpi label="Competitors" value={v.rows.length} sub={`${v.rows.length - pending.length} analysed`} />
          <Kpi label="Global" value={v.rows.filter((r) => r.reach === 'Global').length} sub="evidence in 2+ regions" />
          <Kpi label="Local" value={v.rows.filter((r) => r.reach.startsWith('Local')).length} sub="evidence in one region" />
          <Kpi label="By type" value={<span style={{ fontSize: 15 }}>{Object.entries(types).map(([t, n]) => `${n} ${TYPE_LABEL[t]?.split(' ')[0].toLowerCase()}`).join(' · ') || '–'}</span>} />
        </div>
      )}

      {st.suggested.length > 0 && (
        <section className="card">
          <h2>Suggested by search</h2>
          <p className="muted small" style={{ marginBottom: 8 }}>Nothing counts until you accept it.</p>
          <ul className="out">
            {st.suggested.map((c) => (
              <li key={c.domain}>
                <b>{c.name}</b> <span className="faint">{c.domain}</span> <span className="muted small">{c.note}</span>{' '}
                {!ro && <><button className="link" onClick={() => run('Saving', () => op('accept', c.domain))}>accept</button> · <button className="link quiet" onClick={() => run('Saving', () => op('remove', c.domain))}>reject</button></>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {v.rows.length === 0 ? (
        <Empty title="No competitors yet">Add the companies you already know below, or use “Find more with search”. Each one is then read from its own website.</Empty>
      ) : (
        <section className="card">
          <div className="scroll">
            <table style={{ minWidth: 1020 }}>
              <thead>
                <tr><th>Competitor</th><th>Type</th><th>Role</th>{v.regions.map((r) => <th key={r} className="num">{r}</th>)}<th>Reach</th><th>Named customers</th>{!ro && <th />}</tr>
              </thead>
              <tbody>
                {v.rows.map((r) => (
                  <tr key={r.domain}>
                    <td>
                      <div className="cname">{r.name}</div>
                      <div className="faint small">{r.domain}{r.failures.length > 0 && <span style={{ color: 'var(--warn)' }} title={r.failures.join('\n')}> · site could not be read</span>}</div>
                    </td>
                    <td>{r.type ? <Pill tone={TYPE_TONE[r.type]} title={r.typeEvidence?.quote}>{TYPE_LABEL[r.type]}</Pill> : <span className="faint">–</span>}{r.typeEvidence && <> <a className="small" href={r.typeEvidence.url} target="_blank" rel="noopener noreferrer" title={r.typeEvidence.quote}>proof</a></>}</td>
                    <td className="muted">{r.role ?? '–'}</td>
                    {v.regions.map((n) => {
                      const k = r.counts[n] ?? 0;
                      return <td key={n} className="num">{r.analysed ? <span className={`heat ${k === 0 ? 'h0' : k < 3 ? 'h1' : 'h2'}`}>{k || '·'}</span> : ''}</td>;
                    })}
                    <td><Pill tone={reachTone(r.reach)}>{r.reach}</Pill></td>
                    <td style={{ maxWidth: 220 }} className="small">
                      {r.customers.slice(0, 4).map((x, i) => <span key={x.name}>{i > 0 && ', '}<a href={x.url} target="_blank" rel="noopener noreferrer" title={x.quote}>{x.name}</a></span>)}
                      {r.customers.length > 4 && <span className="faint"> +{r.customers.length - 4}</span>}
                    </td>
                    {!ro && (
                      <td className="num">
                        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button className="btn sm" disabled={!can} onClick={() => run(`Analysing ${r.name}`, () => op('analyse', r.domain))}>{r.analysed ? 'Re-run' : 'Analyse'}</button>
                          <button className="btn sm ghost" onClick={() => run('Removing', () => op('remove', r.domain))} aria-label={`Remove ${r.name}`}>✕</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="faint small" style={{ marginTop: 10 }}>Numbers count target countries where the competitor’s own pages say it operates; hover “proof” for the quote. Global means evidence in two or more regions. “No evidence” means the pages read did not name a target country, not that the company is absent.</p>
        </section>
      )}

      {!ro && (
        <section className="card">
          <h2 style={{ marginBottom: 10 }}>Add a competitor</h2>
          <form className="row" onSubmit={(e) => { e.preventDefault(); run('Adding', async () => { await op('add', domain, { name }); setName(''); setDomain(''); }); }}>
            <Dictate placeholder="Name" aria-label="Competitor name" value={name} onChange={setName} required style={{ width: 200 }} />
            <input placeholder="website.com" aria-label="Competitor website" value={domain} onChange={(e) => setDomain(e.target.value)} required style={{ width: 200 }} />
            <button className="btn" disabled={!!busy}>Add</button>
          </form>
        </section>
      )}

      {v.rows.some((r) => r.analysed) && (
        <section className="card">
          <h2 style={{ marginBottom: 10 }}>Who is in each country</h2>
          <div className="scroll">
            <table style={{ minWidth: 620 }}>
              <thead><tr><th>Country</th><th>Global players</th><th>Local players</th></tr></thead>
              <tbody>
                {v.perCountry.filter((c) => c.global.length || c.local.length).map((c) => (
                  <tr key={c.iso3}>
                    <td><span className="cname">{c.name}</span> <span className="faint small">{c.region}</span></td>
                    <td className="small">{c.global.join(', ') || <span className="faint">–</span>}</td>
                    <td className="small">{c.local.join(', ') || <span className="faint">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="faint small" style={{ marginTop: 10 }}>Only countries with at least one evidenced competitor are listed.</p>
        </section>
      )}
    </>
  );
}
