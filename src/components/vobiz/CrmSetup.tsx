'use client';
import { useState } from 'react';
import { COPY_WARNING, type Crm, type Kind, KIND_LABEL, type Step, defaultCrm, emptyLead, render } from '@/crm/model';
import { Dictate } from '../Mic';
import { type Gmail, crmApi } from './api';

const FIELDS = '{First Name}  {Company}  {Region}  {Country}  {Sector}  {Title}  {Sender Name}';
const SAMPLE = emptyLead({ company: 'Example Co', name: 'Alex Rivera', country: 'Singapore', sector: 'Voice AI agent builder', title: 'CTO' }, '');

export default function CrmSetup({ crm, gmail, reload, flag }: { crm: Crm; gmail: Gmail | null; reload: () => Promise<void>; flag: string }) {
  const [s, setS] = useState(crm.settings);
  const [kind, setKind] = useState<Kind>('partner');
  const [steps, setSteps] = useState<Record<Kind, Step[]>>(crm.sequences);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const run = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label);
    setErr('');
    setMsg('');
    try {
      await fn();
      await reload();
      setMsg(done);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const list = steps[kind];
  const edit = (i: number, patch: Partial<Step>) => setSteps({ ...steps, [kind]: list.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const add = () => setSteps({ ...steps, [kind]: [...list, { id: `step-${Date.now().toString(36).slice(-6)}`, day: (list.at(-1)?.day ?? 0) + 2, channel: 'email', title: 'New step', subject: '', body: '' }] });

  return (
    <div className="stack" style={{ gap: 18 }}>
      {flag === 'connected' && <div className="note info">Gmail is connected.</div>}
      {flag === 'error' && <div className="note bad">Gmail could not be connected. Try again; if it keeps failing, remove the app at myaccount.google.com/permissions first.</div>}
      {flag === 'off' && <div className="note warn">Gmail is not set up on this site yet. See the steps below.</div>}
      {msg && <div className="note info" role="status">{msg}</div>}
      {err && <div className="note bad" role="alert">{err}</div>}

      <section className="card">
        <h2>Gmail</h2>
        {gmail?.connected ? (
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 6 }}><span>Connected as <b>{gmail.email}</b>. The tool can create drafts and send; it cannot read your mail.</span><button className="btn sm" disabled={!!busy} onClick={() => run('d', () => crmApi('disconnect'), 'Gmail disconnected.')}>Disconnect</button></div>
        ) : gmail?.configured ? (
          <div style={{ marginTop: 6 }}><p className="muted small" style={{ marginBottom: 8 }}>Connect the Gmail account you will send from. Google asks you to allow “manage drafts and send emails”.</p><a className="btn primary" href="/api/google/start?plan=vobiz-hub">Connect Gmail</a></div>
        ) : (
          <div className="stack" style={{ gap: 6, marginTop: 6 }}>
            <p className="muted small">One-time setup, about ten minutes. It is your own Google project, so nobody else gets access.</p>
            <ol className="small" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 4 }}>
              <li>Open <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>, create a project, and turn on the <b>Gmail API</b>.</li>
              <li>Under <b>OAuth consent screen</b>: choose External, add yourself as a test user, and add the scope <code>gmail.compose</code>.</li>
              <li>Under <b>Credentials</b>: create an <b>OAuth client ID</b> of type Web application. Add these redirect URIs: <code>https://gtm-expansion-tool.vercel.app/api/google/callback</code> and <code>http://localhost:3000/api/google/callback</code>.</li>
              <li>Put the client ID and secret in <code>.env</code> as <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> (and in Vercel’s environment variables), then redeploy. <code>APP_SECRET</code> must also be set.</li>
            </ol>
            <p className="faint small">While the app is in Google’s “testing” mode, only the test users you add can connect, and the connection expires after 7 days. Reconnect when asked.</p>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Sender and sign-off</h2>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: 8 }}>
          <div className="field"><label htmlFor="sn">Your name (replaces {'{Sender Name}'})</label><Dictate id="sn" value={s.senderName} onChange={(v) => setS({ ...s, senderName: v })} placeholder="Abhishek Yadav" /></div>
          <div className="field"><label htmlFor="cc">CC every email to <span className="faint">(optional)</span></label><input id="cc" value={s.cc} onChange={(e) => setS({ ...s, cc: e.target.value })} placeholder="The project notes say to CC Goutham" /></div>
        </div>
        <div className="field"><label htmlFor="sig">Sign-off, added to every email</label><Dictate multiline rows={4} id="sig" value={s.signature} onChange={(v) => setS({ ...s, signature: v })} /></div>
        <div className="field"><label htmlFor="wa">WhatsApp opening message</label><Dictate multiline rows={3} id="wa" value={s.whatsapp} onChange={(v) => setS({ ...s, whatsapp: v })} /></div>
        <button className="btn primary" disabled={!!busy} onClick={() => run('s', () => crmApi('settings', s), 'Settings saved.')}>Save settings</button>
      </section>

      <section className="card">
        <h2>Outreach sequence</h2>
        <p className="muted small" style={{ margin: '4px 0 10px' }}>The steps run by day: day 1 is when you start someone’s sequence. Email steps go out through Gmail from the campaign screen; LinkedIn steps are shown for you to send. Fields you can use: <code>{FIELDS}</code></p>
        <div className="note warn small" style={{ marginBottom: 10 }}>{COPY_WARNING}</div>
        <div className="chips crm-regions" style={{ marginBottom: 10 }}>
          {(['partner', 'enterprise'] as Kind[]).map((k) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
        </div>
        <div className="crm-steps">
          {list.map((st, i) => {
            const prev = render(st.body, SAMPLE, { ...s, senderName: s.senderName || 'You' }).text;
            return (
              <div className="crm-step" key={st.id}>
                <div className="row">
                  <label className="small muted">Day <input type="number" min={1} max={60} value={st.day} onChange={(e) => edit(i, { day: Number(e.target.value) })} /></label>
                  <label className="small muted">Channel <select value={st.channel} onChange={(e) => edit(i, { channel: e.target.value as Step['channel'] })}><option value="email">Email</option><option value="linkedin">LinkedIn</option></select></label>
                  <input style={{ flex: 1, minWidth: 160 }} value={st.title} onChange={(e) => edit(i, { title: e.target.value })} aria-label="Step name" />
                  <button className="btn sm ghost" onClick={() => setSteps({ ...steps, [kind]: list.filter((_, k) => k !== i) })}>Remove</button>
                </div>
                {st.channel === 'email' && <div className="field" style={{ marginTop: 8, marginBottom: 6 }}><label>Subject</label><Dictate value={st.subject ?? ''} onChange={(v) => edit(i, { subject: v })} /></div>}
                <div className="field" style={{ marginTop: 8, marginBottom: 4 }}><label>Message</label><Dictate multiline rows={st.channel === 'email' ? 7 : 4} value={st.body} onChange={(v) => edit(i, { body: v })} /></div>
                <div className="faint small">{st.channel === 'linkedin' ? `${prev.length} characters${/connection/i.test(st.title) ? ' (a connection note can hold 300)' : ''}. ` : ''}Preview: “{prev.slice(0, 120)}{prev.length > 120 ? '…' : ''}”</div>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={add}>Add a step</button>
          <button className="btn ghost" onClick={() => setSteps({ ...steps, [kind]: defaultCrm().sequences[kind] })}>Reset to the drafted sequence</button>
          <button className="btn primary" disabled={!!busy} onClick={() => run('q', () => crmApi('sequence', { kind, steps: list }), 'Sequence saved.')}>Save {kind === 'partner' ? 'partner' : 'enterprise'} sequence</button>
        </div>
      </section>
    </div>
  );
}
