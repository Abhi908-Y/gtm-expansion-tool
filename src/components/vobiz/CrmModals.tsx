'use client';
import { useMemo, useState } from 'react';
import { COPY_WARNING, type Crm, type Lead, RUNNING, render, skipReason } from '@/crm/model';
import { type Gmail, crmApi } from './api';

const Box = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="crm-modal" role="dialog" aria-modal="true" aria-label={title}>
    <div className="crm-box">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ fontSize: 17 }}>{title}</h2><button className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button></div>
      {children}
    </div>
  </div>
);
const pick = (crm: Crm, ids: string[]) => {
  const set = new Set(ids);
  return crm.leads.filter((l) => set.has(l.id));
};
/** Distinct steps of one channel across the people chosen (two lists may word the same step differently; the first wins). */
const stepsFor = (crm: Crm, leads: Lead[], channel: 'email' | 'linkedin') => {
  const m = new Map<string, { id: string; title: string; day: number }>();
  for (const l of leads) for (const s of crm.sequences[l.kind]) if (s.channel === channel && !m.has(s.id)) m.set(s.id, { id: s.id, title: s.title, day: s.day });
  return [...m.values()].sort((a, b) => a.day - b.day);
};

type Result = { id: string; name: string; status: string; note: string };
const CAUTION_PLACES = ['Europe'];

export function EmailModal({ crm, gmail, ids, step: first, onClose, reload, goSetup }: { crm: Crm; gmail: Gmail | null; ids: string[]; step?: string; onClose: () => void; reload: () => Promise<void>; goSetup: () => void }) {
  const leads = useMemo(() => pick(crm, ids), [crm, ids]);
  const options = stepsFor(crm, leads, 'email');
  const [step, setStep] = useState(first && options.some((o) => o.id === first) ? first : (options[0]?.id ?? ''));
  const [mode, setMode] = useState<'send' | 'draft' | 'test'>('send');
  const [loose, setLoose] = useState(false);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Result[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');

  const stepOf = (l: Lead) => crm.sequences[l.kind].find((s) => s.id === step);
  const check = leads.map((l) => ({ l, why: skipReason(l, stepOf(l), crm.settings, { allowUnverified: loose }) }));
  const go = check.filter((c) => !c.why).map((c) => c.l);
  const skipped = check.filter((c) => c.why);
  const reasons = skipped.reduce<Record<string, number>>((m, c) => ((m[c.why.replace(/\{.*\}/, '{…}')] = (m[c.why.replace(/\{.*\}/, '{…}')] ?? 0) + 1), m), {});
  const sample = go[0] ?? leads[0];
  const sStep = sample && stepOf(sample);
  const prev = sample && sStep ? { subject: render(sStep.subject ?? '', sample, crm.settings).text, body: render(`${sStep.body}\n\n${crm.settings.signature}`, sample, crm.settings).text } : null;
  const unverifiedLeft = leads.filter((l) => l.email && l.emailStatus !== 'Verified').length;
  const caution = go.some((l) => CAUTION_PLACES.includes(l.region) || /emirates|uae/i.test(l.country));
  const connected = gmail?.configured && gmail.connected;
  const n = mode === 'test' ? 1 : go.length;

  const run = async () => {
    setBusy(true);
    setErr('');
    setDone([]);
    const all: Result[] = [];
    try {
      const list = mode === 'test' ? [(go[0] ?? leads[0]).id] : go.map((l) => l.id);
      for (let i = 0; i < list.length; i += 25) {
        const r = await crmApi('send', { ids: list.slice(i, i + 25), step, mode, confirm: mode === 'send', allowUnverified: loose });
        all.push(...r.results);
        setDone([...all]);
        setProgress(Math.min(list.length, i + 25));
      }
    } catch (e) {
      setErr((e as Error).message + (all.length ? ` (${all.filter((r) => r.status === 'sent').length} were sent before this stopped; they are recorded.)` : ''));
    } finally {
      setBusy(false);
      await reload();
    }
  };

  return (
    <Box title="Email campaign" onClose={onClose}>
      {!gmail?.configured ? (
        <div className="note warn small">Gmail is not set up on this site yet. Add the Google keys (see “Templates and Gmail”), then connect your account. Until then you can still use the LinkedIn and WhatsApp queues.<div style={{ marginTop: 8 }}><button className="btn sm" onClick={() => { onClose(); goSetup(); }}>Open Gmail setup</button></div></div>
      ) : !connected ? (
        <div className="note warn small">Connect your Gmail first. The tool can only create drafts and send; it cannot read your mail.<div style={{ marginTop: 8 }}><a className="btn sm primary" href="/api/google/start?plan=vobiz-hub">Connect Gmail</a></div></div>
      ) : (
        <p className="small muted">Sending from <b>{gmail?.email}</b>{crm.settings.cc ? <> · copying <b>{crm.settings.cc}</b></> : ''}. Each email is personalised and goes out one at a time. Nothing is sent until you press the button below.</p>
      )}
      <label className="small muted">Step<select value={step} onChange={(e) => setStep(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>Day {o.day}: {o.title}</option>)}</select></label>
      <div className="note info small">
        <b>{go.length} of {leads.length}</b> can be emailed at this step.
        {Object.entries(reasons).map(([k, v]) => <div key={k}>· {v} skipped: {k}</div>)}
        {unverifiedLeft > 0 && !loose && <div>Verified emails only. <button className="btn link-like" onClick={() => setLoose(true)}>Include the {unverifiedLeft} unverified ones</button> (more may bounce).</div>}
        {loose && <div>Including unverified emails. Bounces hurt your sender reputation. <button className="btn link-like" onClick={() => setLoose(false)}>Verified only</button></div>}
      </div>
      {prev && (
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Preview for {sample.name} ({sample.email ?? 'no email'})</div>
          <div className="crm-pre"><b>Subject: {prev.subject}</b>{'\n\n'}{prev.body}</div>
          {/\{[A-Za-z ]+\}/.test(prev.subject + prev.body) && <div className="note bad small" style={{ marginTop: 6 }}>Something in this message has no value yet (a field in curly brackets). Fill in your name in Settings.</div>}
        </div>
      )}
      <div className="note warn small">{COPY_WARNING}</div>
      {caution && <div className="note warn small">Some people are in the UAE or Europe, where rules on unsolicited business email differ (the project notes say a lawyer should confirm). Check before you send to them.</div>}
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        {([['send', 'Send now'], ['draft', 'Save as Gmail drafts'], ['test', 'Send a test to myself']] as const).map(([m, label]) => <label key={m} className="row small" style={{ gap: 6 }}><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />{label}</label>)}
      </div>
      {mode === 'send' && <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>Vobiz has approved this wording (naming Sarvam and Bolna, and the calls-a-day figure).</span></label>}
      {err && <div className="note bad small" role="alert">{err}</div>}
      {done && done.length > 0 && (
        <div className="crm-scroll" style={{ maxHeight: 220, border: '1px solid var(--line)', borderRadius: 8 }}>
          <table style={{ minWidth: 0 }}><tbody>{done.map((r) => <tr key={r.id}><td>{r.name}</td><td><span className={`pill ${r.status === 'sent' || r.status === 'draft' || r.status === 'test' ? 'good' : r.status === 'failed' ? 'bad' : ''}`}>{r.status}</span></td><td className="muted">{r.note}</td></tr>)}</tbody></table>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
        {!(done && !busy && done.length > 0) && <button className="btn primary" disabled={busy || !connected || !n || !prev || (mode === 'send' && !ok)} onClick={run}>{busy ? `Working… ${progress}/${n}` : mode === 'send' ? `Send ${n} email${n === 1 ? '' : 's'}` : mode === 'draft' ? `Save ${n} draft${n === 1 ? '' : 's'}` : 'Send me a test'}</button>}
      </div>
    </Box>
  );
}

export function LinkedInModal({ crm, ids, step: first, onClose, reload }: { crm: Crm; ids: string[]; step?: string; onClose: () => void; reload: () => Promise<void> }) {
  const leads = useMemo(() => pick(crm, ids), [crm, ids]);
  const options = stepsFor(crm, leads, 'linkedin');
  const [step, setStep] = useState(first && options.some((o) => o.id === first) ? first : (options[0]?.id ?? ''));
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const queue = leads.filter((l) => l.linkedin && RUNNING.includes(l.stage) && !l.done[step] && !skip.has(l.id));
  const noLink = leads.filter((l) => !l.linkedin).length;
  const cur = queue[0];
  const s = cur && crm.sequences[cur.kind].find((x) => x.id === step);
  const text = cur && s ? render(s.body, cur, crm.settings) : null;
  const limit = s && /connection/i.test(s.title) ? 300 : 0;
  const total = leads.filter((l) => l.linkedin).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text!.text);
      setCopied(true);
    } catch {
      setCopied(false);
      window.prompt('Copy this message', text!.text);
    }
  };
  const sent = async () => {
    setBusy(true);
    try {
      await crmApi('done', { ids: [cur.id], step });
      await reload();
      setCopied(false);
      setI(i + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box title="LinkedIn messages" onClose={onClose}>
      <p className="small muted">LinkedIn does not let tools send messages for you, and automating it can get your account restricted. So the tool writes each message, you paste it in the profile, and it records that you sent it.</p>
      <label className="small muted">Step<select value={step} onChange={(e) => { setStep(e.target.value); setI(0); setSkip(new Set()); }}>{options.map((o) => <option key={o.id} value={o.id}>Day {o.day}: {o.title}</option>)}</select></label>
      {noLink > 0 && <div className="note warn small">{noLink} of the people chosen have no LinkedIn link and are not in this queue.</div>}
      {cur && s && text ? (
        <>
          <div className="small muted">Person {Math.min(total, total - queue.length + 1)} of {total}</div>
          <div><b>{cur.name}</b> <span className="muted">· {cur.title} at {cur.company} ({cur.country})</span></div>
          <div className="crm-pre">{text.text}</div>
          <div className="small muted">{text.text.length} characters{limit ? ` (a connection note can hold ${limit})` : ''}{limit && text.text.length > limit && <span className="pill bad" style={{ marginLeft: 6 }}>Too long: shorten it in Templates</span>}</div>
          {text.missing.length > 0 && <div className="note bad small">Missing {text.missing.map((m) => `{${m}}`).join(', ')}. Fill in your name in Settings.</div>}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={copy}>{copied ? 'Copied ✓' : 'Copy message'}</button>
            <a className="btn" href={cur.linkedin!.startsWith('http') ? cur.linkedin! : `https://${cur.linkedin}`} target="_blank" rel="noopener noreferrer">Open profile ↗</a>
            <button className="btn primary" disabled={busy} onClick={sent}>I sent it</button>
            <button className="btn ghost" onClick={() => setSkip(new Set(skip).add(cur.id))}>Skip</button>
          </div>
        </>
      ) : (
        <div className="note info small">{total ? 'Everyone in this queue is done for this step.' : 'Nobody here has a LinkedIn link.'}</div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Close</button></div>
    </Box>
  );
}

export function WhatsAppModal({ crm, ids, onClose, reload }: { crm: Crm; ids: string[]; onClose: () => void; reload: () => Promise<void> }) {
  const leads = useMemo(() => pick(crm, ids), [crm, ids]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const withPhone = leads.filter((l) => (l.phone ?? '').replace(/\D/g, '').length >= 8);
  const mark = async (l: Lead) => {
    await crmApi('log', { ids: [l.id], channel: 'whatsapp', text: 'WhatsApp message sent' });
    setDone(new Set(done).add(l.id));
    await reload();
  };
  return (
    <Box title="WhatsApp" onClose={onClose}>
      <p className="small muted">This opens WhatsApp with the message already typed; you press send. Use it for people who gave you their mobile number or already know you. The phone numbers in Apollo are mostly office lines that are not on WhatsApp, and WhatsApp can block accounts that message strangers.</p>
      {leads.length - withPhone.length > 0 && <div className="note warn small">{leads.length - withPhone.length} of the people chosen have no usable phone number. Add one in their Details.</div>}
      <div className="crm-scroll" style={{ maxHeight: 320 }}>
        <table style={{ minWidth: 0 }}>
          <tbody>
            {withPhone.map((l) => {
              const t = render(crm.settings.whatsapp, l, crm.settings);
              return (
                <tr key={l.id}>
                  <td><b>{l.name}</b><div className="muted small">{l.company} · {l.phone}</div>{t.missing.length > 0 && <div className="small" style={{ color: 'var(--bad)' }}>Missing {t.missing.map((m) => `{${m}}`).join(', ')}</div>}</td>
                  <td className="nw"><a className="btn sm" href={`https://wa.me/${(l.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(t.text)}`} target="_blank" rel="noopener noreferrer" aria-disabled={t.missing.length > 0} onClick={(e) => t.missing.length && e.preventDefault()}>Open WhatsApp ↗</a></td>
                  <td className="nw">{done.has(l.id) ? <span className="pill good">Logged</span> : <button className="btn sm" onClick={() => mark(l)}>I sent it</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Close</button></div>
    </Box>
  );
}
