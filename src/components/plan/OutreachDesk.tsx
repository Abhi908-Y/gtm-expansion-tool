'use client';
import { Fragment, useEffect, useState } from 'react';
import { allContacts, contactRows, type Contact } from '@/outreach/export';
import { downloadCsv, slugOf } from '../download';
import type { TabProps } from '../shared';
import { Pill } from './ui';

type Result = { account: string; person: string; status: 'ok' | 'skipped' | 'failed'; note: string };
const verdictTone = (v?: string) => ({ blocked: 'bad', weak: 'warn', adequate: 'info', strong: 'good' } as Record<string, string>)[v ?? ''] ?? '';
const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => window.prompt('Copy this text:', text));
}

/** Why this person's email cannot be sent right now, or null if it can. Mirrors the server's checks. */
function cannotSend(c: Contact, n: number): string | null {
  if (!EMAIL.test(String(c.person.email ?? ''))) return 'no email address published';
  if (!c.draft?.emails?.[n - 1]?.body) return 'no draft written yet';
  if (c.draft.issues?.length) return 'draft breaks the length or phrase rules';
  if (!c.check) return 'drafts not graded yet';
  if (c.check.verdict === 'blocked') return 'blocked by the draft grader';
  if (c.account.log?.some((l) => l.person === c.person.name && l.n === n && l.mode === 'send' && l.status === 'ok')) return 'already sent';
  return null;
}

function lastAction(c: Contact) {
  const l = [...(c.account.log ?? [])].reverse().find((x) => x.person === c.person.name);
  return l ? `${l.mode === 'send' ? 'Sent' : 'Drafted'}${l.status === 'ok' ? '' : ` (${l.status})`}` : '';
}

export default function OutreachDesk({ st, post, run, busy, ro }: TabProps) {
  const contacts = allContacts(st.outreach.accounts);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [n, setN] = useState(1);
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [ok, setOk] = useState(false);
  const [flag, setFlag] = useState('');
  const g = st.gmail;
  const id = st.project.id;

  useEffect(() => {
    try {
      setName(localStorage.getItem('gtm_sender') ?? '');
    } catch {
      /* private mode */
    }
    const f = new URLSearchParams(window.location.search).get('gmail');
    if (f) {
      setFlag(f);
      history.replaceState(null, '', `${window.location.pathname}#outreach`);
    }
  }, []);
  const saveName = (v: string) => {
    setName(v);
    try {
      localStorage.setItem('gtm_sender', v);
    } catch {
      /* private mode */
    }
  };

  if (!contacts.length) return null;
  const chosen = contacts.filter((c) => sel.has(c.key));
  const allOn = sel.size === contacts.length;
  const toggle = (k: string) => setSel((s) => { const x = new Set(s); x.has(k) ? x.delete(k) : x.add(k); return x; });
  const items = chosen.map((c) => ({ id: c.account.id, person: String(c.person.name) }));
  const sendable = chosen.filter((c) => !cannotSend(c, n));

  const go = (op: 'draft' | 'send') =>
    run(op === 'send' ? 'Sending through Gmail' : 'Creating Gmail drafts', async () => {
      const r = await post('gmail', { op, items, n, senderName: name, confirm: op === 'send' ? true : undefined });
      setResults(r.results ?? []);
      setConfirm(false);
      setOk(false);
    });
  const mailto = (c: Contact) => {
    const e = c.draft?.emails?.[n - 1];
    return e ? `mailto:${c.person.email ?? ''}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(String(e.body).replace('[Your name]', name || '[Your name]'))}` : '#';
  };
  const linkedinText = (list: Contact[]) =>
    list.map((c) => `${c.person.name}, ${c.person.title} at ${c.account.name}\n${c.person.linkedin_url ?? `Search: ${c.person.linkedin_search_hint ?? c.person.name}`}\nConnect note: ${c.draft?.linkedin?.connect_request ?? '(no draft yet)'}\nAfter they accept:\n1. ${c.draft?.linkedin?.message_1 ?? ''}\n2. ${c.draft?.linkedin?.message_2 ?? ''}\n3. ${c.draft?.linkedin?.message_3 ?? ''}`).join('\n\n---\n\n');
  const csv = (only?: Set<string>) => downloadCsv(`${slugOf(st.project.company)}-outreach${only ? '-selected' : ''}.csv`, contactRows(st.outreach.accounts, only));

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Outreach desk</h2>
          <p className="muted small">Everyone you can reach, across all accounts. Tick people to act on several at once, or use a row for one person. {contacts.length} people at {st.outreach.accounts.filter((a) => a.people?.people?.length).length} accounts.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => csv()}>Download everything (CSV)</button>
        </div>
      </div>

      {flag === 'connected' && <div className="note info" style={{ marginBottom: 10 }}>Gmail is connected.</div>}
      {flag === 'error' && <div className="note bad" style={{ marginBottom: 10 }}>Gmail could not be connected. Try again.</div>}
      {!g.configured ? (
        <div className="note warn small" style={{ marginBottom: 10 }}>Gmail is not set up on this site yet (the site owner has to add Google credentials). Until then: use “Mail app” on a row, copy the LinkedIn notes, or download the sheet.</div>
      ) : g.connected ? (
        <div className="row small muted" style={{ marginBottom: 10 }}>Gmail connected as <b>{g.email || 'your account'}</b> <button className="link quiet" disabled={!!busy} onClick={() => run('Disconnecting', () => post('gmail', { op: 'disconnect' }))}>disconnect</button></div>
      ) : (
        <div className="row" style={{ marginBottom: 10 }}><a className="btn primary" href={`/api/google/start?plan=${id}`}>Connect Gmail</a><span className="muted small">Lets the site create drafts in your Gmail, and send only when you confirm. It cannot read your mail.</span></div>
      )}

      <div className="row" style={{ marginBottom: 10, padding: '10px 12px', background: 'var(--panel-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(contacts.map((c) => c.key)))} /> <b>Select all</b></label>
        <button className="link" onClick={() => setSel(new Set(contacts.filter((c) => EMAIL.test(String(c.person.email ?? ''))).map((c) => c.key)))}>with an email</button>
        <button className="link quiet" onClick={() => setSel(new Set())}>clear</button>
        <span className="muted small">{sel.size} selected</span>
        <span style={{ flex: 1 }} />
        <label className="row small muted" style={{ gap: 6 }}>Use email <select value={n} onChange={(e) => setN(Number(e.target.value))}><option value={1}>1 (first)</option><option value={2}>2 (follow-up)</option><option value={3}>3 (last)</option></select></label>
        <input value={name} onChange={(e) => saveName(e.target.value)} placeholder="Your name (sign-off)" aria-label="Your name for the sign-off" style={{ width: 170 }} />
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" disabled={!sel.size || !!busy || !g.connected || ro} onClick={() => go('draft')} title={g.connected ? '' : 'Connect Gmail first'}>Create Gmail drafts ({sel.size})</button>
        <button className="btn" disabled={!sel.size || !!busy || !g.connected || ro} onClick={() => setConfirm(true)} title={g.connected ? '' : 'Connect Gmail first'}>Send selected…</button>
        <button className="btn" disabled={!sel.size} onClick={() => copy(linkedinText(chosen))}>Copy LinkedIn notes ({sel.size})</button>
        <button className="btn" disabled={!sel.size} onClick={() => csv(sel)}>Download selected (CSV)</button>
      </div>

      {confirm && (
        <div className="note bad" style={{ marginBottom: 12 }}>
          <b>Send {sendable.length} email{sendable.length === 1 ? '' : 's'} from {g.email || 'your Gmail'}?</b> These go to real people and cannot be unsent.
          {sendable.length > 0 && <div className="small" style={{ margin: '6px 0' }}>To: {sendable.map((c) => `${c.person.name} <${c.person.email}>`).join(', ')}</div>}
          {chosen.length > sendable.length && <div className="small" style={{ margin: '6px 0' }}>Skipped: {chosen.filter((c) => cannotSend(c, n)).map((c) => `${c.person.name} (${cannotSend(c, n)})`).join('; ')}</div>}
          <label className="row small" style={{ gap: 6, margin: '8px 0' }}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I have read these drafts and I am responsible for sending them.</label>
          <div className="row"><button className="btn primary" disabled={!ok || !sendable.length || !name.trim() || !!busy} onClick={() => go('send')}>Send {sendable.length}</button><button className="btn" onClick={() => setConfirm(false)}>Cancel</button>{!name.trim() && <span className="small">Enter your name above first.</span>}</div>
        </div>
      )}

      {results && (
        <div className="note info" style={{ marginBottom: 12 }}>
          <b>Done.</b> {results.filter((r) => r.status === 'ok').length} of {results.length} completed.
          <ul className="out small" style={{ margin: '6px 0 0' }}>{results.map((r, i) => <li key={i}>{r.person} ({r.account}): {r.status === 'ok' ? r.note : `${r.status}, ${r.note}`}</li>)}</ul>
        </div>
      )}

      <div className="scroll">
        <table style={{ minWidth: 960 }}>
          <thead><tr><th style={{ width: 30 }} /><th>Person</th><th>Role in the decision</th><th>Email</th><th>LinkedIn</th><th>Phone</th><th>Drafts</th><th>Gmail</th><th /></tr></thead>
          <tbody>
            {contacts.map((c) => {
              const e = c.draft?.emails?.[n - 1];
              return (
                <Fragment key={c.key}>
                  <tr>
                    <td><input type="checkbox" checked={sel.has(c.key)} onChange={() => toggle(c.key)} aria-label={`Select ${c.person.name}`} /></td>
                    <td><div className="cname">{c.person.name}</div><div className="faint small">{c.person.title} · {c.account.name}</div></td>
                    <td className="small">{c.role ? <Pill>{c.role.replace(/_/g, ' ')}</Pill> : <span className="faint">–</span>}</td>
                    <td className="small">{c.person.email ? <span title={c.person.email_source}>{c.person.email}</span> : <span className="faint">not published</span>}</td>
                    <td className="small">{c.person.linkedin_url ? <a href={c.person.linkedin_url} target="_blank" rel="noopener noreferrer">profile</a> : <span className="faint" title={c.person.linkedin_search_hint}>search</span>}</td>
                    <td className="small">{c.person.phone || ((c.account.phones ?? [])[0] ? <span title="The company's own published number">{c.account.phones![0].phone} <span className="faint">(company)</span></span> : <span className="faint">–</span>)}</td>
                    <td>{c.check ? <Pill tone={verdictTone(c.check.verdict)} title={c.check.verdict_reason}>{c.check.verdict} {c.check.from_pack_pct}%</Pill> : c.draft ? <Pill>not graded</Pill> : <span className="faint small">no draft</span>}{c.draft?.issues?.length ? <Pill tone="bad"> {c.draft.issues.length} rule break</Pill> : null}</td>
                    <td className="small">{lastAction(c) || <span className="faint">–</span>}</td>
                    <td className="num"><button className="btn sm" onClick={() => setOpen(open === c.key ? null : c.key)}>{open === c.key ? 'Hide' : 'Preview'}</button></td>
                  </tr>
                  {open === c.key && (
                    <tr>
                      <td />
                      <td colSpan={8} style={{ background: 'var(--panel-2)' }}>
                        {e ? (
                          <div className="stack" style={{ padding: '6px 0' }}>
                            <div><b className="small">Email {n}: {e.subject}</b><pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', fontSize: 13, margin: '4px 0' }}>{String(e.body).replace('[Your name]', name || '[Your name]')}</pre></div>
                            <div className="row">
                              <a className="btn sm" href={mailto(c)}>Open in mail app</a>
                              <button className="btn sm" onClick={() => copy(`Subject: ${e.subject}\n\n${String(e.body).replace('[Your name]', name || '[Your name]')}`)}>Copy email</button>
                              <button className="btn sm" onClick={() => copy(linkedinText([c]))}>Copy LinkedIn notes</button>
                              {c.person.linkedin_url && <a className="btn sm" href={c.person.linkedin_url} target="_blank" rel="noopener noreferrer">Open LinkedIn profile</a>}
                            </div>
                            <p className="small muted"><b>LinkedIn note:</b> {c.draft?.linkedin?.connect_request}</p>
                          </div>
                        ) : <p className="faint small">No draft yet for this person. Run “Write drafts” on the account below.</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="faint small" style={{ marginTop: 8 }}>LinkedIn cannot be automated: copy the note and paste it yourself. Phone numbers shown are the company’s own published line; personal numbers need a contact-data provider (Apollo, once connected). Emails are only those the company published on its own site.</p>
    </section>
  );
}
