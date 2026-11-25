'use client';
import { useState } from 'react';
import type { Account } from '@/outreach/pipeline';
import type { TabProps } from '../shared';
import { Dictate } from '../Mic';
import OutreachDesk from './OutreachDesk';
import { Empty, Pill } from './ui';

type J = Record<string, any>;
const STEP_LABEL: Record<string, string> = { industry: 'Industry shift', company: 'Company and trigger', people: 'People', verify: 'Grade the research', draft: 'Write drafts', check: 'Grade the drafts' };
const STEP_HINT: Record<string, string> = {
  industry: 'What is changing in their industry that frees up budget',
  company: 'News, how they handle it today, and the best reason to write now',
  people: 'The buying committee and real people with public evidence',
  verify: 'An independent pass that removes claims with no real source',
  draft: 'Three emails and a LinkedIn sequence per person',
  check: 'Every sentence labelled from-research, generic, made-up or banned',
};
const STEPS = ['industry', 'company', 'people', 'verify', 'draft', 'check'] as const;
const done = (a: Account, s: string) => !!({ industry: a.industry, company: a.company, people: a.people, verify: a.verify, draft: a.outreach, check: a.messages } as J)[s];
const verdictTone = (v: string) => ({ blocked: 'bad', weak: 'warn', adequate: 'info', strong: 'good' } as J)[v] ?? '';
const LABEL_TONE: J = { FROM_PACK: 'good', GENERIC: 'warn', MADE_UP: 'bad', BANNED: 'bad' };

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => window.prompt('Copy this text:', text));
}

function Src({ url, label = 'source' }: { url?: string; label?: string }) {
  return url && /^https?:\/\//.test(url) ? <a href={url} target="_blank" rel="noopener noreferrer" className="small">{label}</a> : null;
}

/** What the search tool actually consulted for a step, so a reader can check the claims. */
function Consulted({ o }: { o?: J }) {
  if (!o) return null;
  if (o._ungrounded) return <p className="note warn small" style={{ marginTop: 8 }}>No web sources were consulted for this step, so nothing here counts as verified. Treat it as a lead to check.</p>;
  const src: { title: string; url: string }[] = o._sources ?? [];
  return <p className="faint small" style={{ marginTop: 8 }}>Sources consulted: {src.slice(0, 8).map((x, i) => <span key={x.url}>{i > 0 && ', '}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.title || 'source'}</a></span>)}{src.length > 8 && ' …'}</p>;
}

function StatusPill({ s }: { s?: string }) {
  return s ? <Pill tone={s === 'verified' ? 'good' : s === 'assertion' ? 'warn' : ''}>{s}</Pill> : null;
}

export default function OutreachView(props: TabProps) {
  const { st, post, run, busy, ro } = props;
  const o = st.outreach as { icp?: J; accounts: Account[] };
  const icp = o.icp;
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prog, setProg] = useState('');
  const acc = o.accounts.find((a) => a.id === sel) ?? o.accounts[0];
  const can = st.gemini && !ro && !busy;
  const addAcc = (b: object) => run('Adding account', () => post('account', { op: 'add', ...b }));
  const step = (a: Account, s: string) => run(`${STEP_LABEL[s]} for ${a.name}`, () => post('research', { id: a.id, step: s }));
  const runAll = (a: Account) =>
    run(`Researching ${a.name}`, async () => {
      for (const s of STEPS) {
        setProg(`${STEP_LABEL[s]}…`);
        await post('research', { id: a.id, step: s });
      }
      setProg('');
    });

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Outreach</h1>
          <p className="muted">Who to contact at each target account, what to say, and the evidence behind every line. Nothing is sent from here.</p>
        </div>
      </div>
      {!st.gemini && <div className="note warn">The AI steps are switched off on this site right now.</div>}
      <OutreachDesk {...props} />
      {prog && <div className="busy">{prog}</div>}

      {/* 1. ICP */}
      <section className="card">
        <div className="card-head">
          <div><h2>1. Ideal customer profile</h2><p className="muted small">Who fits, who does not, which buying signals you can see from outside, and a shortlist of real companies in your best countries.</p></div>
          {!ro && <button className="btn primary" disabled={!can} onClick={() => run('Building the ICP', () => post('icp'))}>{icp ? 'Rebuild' : 'Build ICP'}</button>}
        </div>
        {!icp ? <p className="faint">Not built yet. Uses the company profile, your top-scoring countries and the customers named on competitors’ pages.</p> : (
          <div className="stack">
            <p>{icp.icp_summary}</p>
            <div className="grid2">
              <div><h3>Who fits</h3><ul className="out small">{(icp.who_fits ?? []).map((f: J, i: number) => <li key={i}><b>{f.industry}</b>, {f.company_size}. {f.why_they_care}</li>)}</ul></div>
              <div><h3>Who looks similar but does not fit</h3><ul className="out small">{(icp.who_does_not_fit ?? []).map((f: J, i: number) => <li key={i}><b>{f.looks_similar_to}</b>: {f.why_wrong}</li>)}</ul></div>
              <div><h3>Buying signals visible from outside</h3><ul className="out small">{(icp.buying_signals ?? []).map((f: J, i: number) => <li key={i}><b>{f.signal}</b> <span className="muted">Look for it in: {f.visible_from_outside_as}</span></li>)}</ul></div>
              <div><h3>Weakest assumption</h3><p className="small">{icp.weakest_assumption?.assumption}</p><p className="small muted">Check first: {icp.weakest_assumption?.what_to_check_first}</p></div>
            </div>
            <div>
              <h3 style={{ marginBottom: 6 }}>Shortlist</h3>
              <ul className="out small">
                {(icp.candidates ?? []).map((c: J, i: number) => {
                  const has = o.accounts.some((a) => a.name.toLowerCase() === String(c.name).toLowerCase());
                  return (
                    <li key={i}><b>{c.name}</b> <span className="faint">{c.region}</span> <span className="muted">{c.why_fit}</span>{' '}
                      {!ro && !has && <button className="link" onClick={() => addAcc({ name: c.name, website: c.website, region: c.region, source: 'icp', note: c.why_fit })}>add as account</button>}
                      {has && <span className="faint">added</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* 2. Accounts */}
      <section className="card">
        <h2>2. Accounts</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>Companies to research. Add from the shortlist above, from competitors’ customers below, or by hand.</p>
        {!ro && (
          <form className="row" style={{ marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); addAcc({ name }); setName(''); }}>
            <Dictate placeholder="Company name" aria-label="Account name" value={name} onChange={setName} required style={{ width: 260 }} />
            <button className="btn" disabled={!!busy}>Add account</button>
          </form>
        )}
        {o.accounts.length === 0 ? <p className="faint">No accounts yet.</p> : (
          <div className="filters" role="tablist" aria-label="Accounts">
            {o.accounts.map((a) => (
              <button key={a.id} role="tab" aria-selected={acc?.id === a.id} className={`chip ${acc?.id === a.id ? 'on' : ''}`} onClick={() => setSel(a.id)}>
                {a.name} <span className="faint small">{STEPS.filter((s) => done(a, s)).length}/6</span>
              </button>
            ))}
          </div>
        )}
        {st.suggestedAccounts.length > 0 && !ro && (
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer' }}><b>{st.suggestedAccounts.length} customers named on competitors’ pages</b> <span className="muted small">companies already buying from a rival</span></summary>
            <ul className="out small" style={{ marginTop: 8 }}>
              {st.suggestedAccounts.slice(0, 30).map((s) => (
                <li key={s.name}><b>{s.name}</b> <span className="muted">via {s.via.join(', ')}</span> <Src url={s.url} label="proof" />{' '}
                  <button className="link" onClick={() => addAcc({ name: s.name, source: 'competitor_customer', note: `Named on ${s.via.join(', ')}'s pages` })}>add</button></li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Account detail */}
      {acc && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{acc.name}</h2>
              <p className="muted small">{[acc.region, acc.website, acc.note].filter(Boolean).join(' · ') || 'Research this account step by step, or run all steps.'}</p>
            </div>
            {!ro && (
              <div className="row">
                <button className="btn primary" disabled={!can || !icp} title={icp ? '' : 'Build the ICP first'} onClick={() => runAll(acc)}>Run all steps</button>
                <button className="btn ghost sm" disabled={!!busy} onClick={() => run('Removing', () => post('account', { op: 'remove', id: acc.id }))}>Remove</button>
              </div>
            )}
          </div>
          {!icp && <div className="note warn" style={{ marginBottom: 12 }}>Build the ICP first. It is what the account research is judged against.</div>}

          <ol className="checklist" style={{ marginBottom: 18 }}>
            {STEPS.map((s) => (
              <li key={s}>
                <span className={`tick ${done(acc, s) ? 'done' : ''}`}>✓</span>
                <div><b>{STEP_LABEL[s]}</b><div className="faint small">{STEP_HINT[s]}</div></div>
                {!ro && <button className="btn sm" disabled={!can || !icp} onClick={() => step(acc, s)}>{done(acc, s) ? 'Re-run' : 'Run'}</button>}
              </li>
            ))}
          </ol>

          {acc.industry && (
            <div className="claim">
              <h3>Industry shift: {acc.industry.industry}</h3>
              {(acc.industry.shifts ?? []).map((s: J, i: number) => (
                <p className="small" key={i}><StatusPill s={s.status} /> <b>{s.change}</b> <span className="muted">{s.source_and_date}</span><br /><span className="muted">{s.why_it_frees_budget}</span></p>
              ))}
              {(acc.industry.could_not_find ?? []).length > 0 && <p className="faint small">Could not verify: {acc.industry.could_not_find.join('; ')}</p>}
              <Consulted o={acc.industry} />
            </div>
          )}

          {acc.company && (
            <div className="claim">
              <h3>{acc.company.account_name ?? acc.name}</h3>
              <p className="small">{acc.company.what_they_do} <span className="muted">{acc.company.size_or_scale}</span></p>
              <p className="small"><b>Today:</b> {acc.company.how_they_handle_it_today}</p>
              <p className="small"><b>Reason to write now:</b> {acc.company.trigger}</p>
              <p className="small"><b>Fit:</b> {acc.company.fit_assessment}</p>
              <ul className="out small">
                {(acc.company.latest_news ?? []).map((n: J, i: number) => (
                  <li key={i}><StatusPill s={n.status} /> {n.headline} <span className="faint">{n.date}</span>{n.stale && <> <Pill tone="warn">stale</Pill></>} <span className="muted">{n.source}</span></li>
                ))}
              </ul>
              <Consulted o={acc.company} />
            </div>
          )}

          {acc.people && (
            <div className="claim">
              <h3>People</h3>
              <ul className="out small">
                {(acc.people.personas ?? []).map((p: J, i: number) => <li key={i}><b>{p.title}</b> <Pill>{String(p.role_in_decision).replace(/_/g, ' ')}</Pill> <span className="muted">{p.why_they_care}</span></li>)}
              </ul>
              <div className="scroll" style={{ marginTop: 8 }}>
                <table style={{ minWidth: 700 }}>
                  <thead><tr><th>Name</th><th>Evidence</th><th>Email</th><th>LinkedIn</th></tr></thead>
                  <tbody>
                    {(acc.people.people ?? []).length === 0 && <tr><td colSpan={4} className="faint">No named people with public evidence were found.</td></tr>}
                    {(acc.people.people ?? []).map((p: J, i: number) => (
                      <tr key={i}>
                        <td><div className="cname">{p.name}</div><div className="faint small">{p.title}</div></td>
                        <td className="small" style={{ whiteSpace: 'normal', maxWidth: 320 }}><StatusPill s={p.status} /> {p.what_they_said_or_did} <Src url={p.evidence_link} /></td>
                        <td className="small">{p.email ? <>{p.email} <Src url={p.email_source} label="where published" /></> : <span className="faint">{p.email_dropped ? 'not on their site, dropped' : 'none published'}</span>}</td>
                        <td className="small">{p.linkedin_url ? <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer">profile</a> : <span className="faint" title={p.linkedin_search_hint}>search: {p.linkedin_search_hint ?? 'n/a'}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="faint small" style={{ marginTop: 6 }}>Emails are kept only if the company published them on its own pages. LinkedIn links are shown only when they are real profile URLs; contacts from Apollo will replace these once it is connected.</p>
              <Consulted o={acc.people} />
            </div>
          )}

          {acc.verify && (
            <div className="note info" style={{ marginBottom: 12 }}>
              Graded {acc.verify.rows} claims. {acc.verify.removed.length ? <>Removed for having no real source: {acc.verify.removed.join('; ')}.</> : 'None had to be removed.'} {acc.verify.stale > 0 && `${acc.verify.stale} rely on sources older than 24 months.`}
            </div>
          )}

          {acc.outreach && (
            <div className="stack">
              <h3>Drafts <span className="faint small">for you to review and send yourself</span></h3>
              {(acc.outreach.per_person ?? []).map((p: J, i: number) => {
                const m = (acc.messages?.per_person ?? []).find((x: J) => String(x.person).toLowerCase() === String(p.person).toLowerCase());
                return (
                  <div className="card" key={i} style={{ background: 'var(--panel-2)' }}>
                    <div className="card-head" style={{ marginBottom: 8 }}>
                      <div><b>{p.person}</b> <span className="faint small">style: {p.style_used}. {p.style_reason}</span></div>
                      <div className="row">{m && <Pill tone={verdictTone(m.verdict)} title={m.verdict_reason}>{m.verdict} · {m.from_pack_pct}% from research</Pill>}{p.send_to_email && <Pill tone="good">{p.send_to_email}</Pill>}</div>
                    </div>
                    {(p.issues ?? []).length > 0 && <div className="note bad small" style={{ marginBottom: 8 }}>{p.issues.map((x: string, k: number) => <div key={k}>{x}</div>)}</div>}
                    {(p.emails ?? []).map((e: J, k: number) => (
                      <div className="claim" key={k}>
                        <div className="row" style={{ justifyContent: 'space-between' }}><b className="small">Email {k + 1}: {e.subject}</b><button className="btn sm" onClick={() => copy(`Subject: ${e.subject}\n\n${e.body}`)}>Copy</button></div>
                        <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', margin: '6px 0 0', fontSize: 13 }}>{e.body}</pre>
                      </div>
                    ))}
                    <div className="claim">
                      <div className="row" style={{ justifyContent: 'space-between' }}><b className="small">LinkedIn note <span className="faint">{p.linkedin?.connect_request_chars} of 300 characters</span></b><button className="btn sm" onClick={() => copy(p.linkedin?.connect_request ?? '')}>Copy</button></div>
                      <p className="small">{p.linkedin?.connect_request}</p>
                      {['message_1', 'message_2', 'message_3'].map((k, n) => p.linkedin?.[k] && <p className="small muted" key={k}><b>After accepting, message {n + 1}:</b> {p.linkedin[k]}</p>)}
                    </div>
                    <p className="small muted"><b>Swap test:</b> {p.swap_test}</p>
                    {m && (
                      <details><summary className="small" style={{ cursor: 'pointer' }}>Sentence by sentence</summary>
                        <p style={{ marginTop: 6 }} className="small">{(m.sentences ?? []).map((s: J, k: number) => <span key={k} style={{ marginRight: 4 }}><Pill tone={LABEL_TONE[s.label]}>{String(s.label).replace('_', ' ').toLowerCase()}</Pill> {s.text} </span>)}</p>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
      {o.accounts.length === 0 && !icp && <Empty title="Start with the ICP">Build the ideal customer profile, then add accounts from its shortlist or from your competitors’ customers.</Empty>}
    </>
  );
}
