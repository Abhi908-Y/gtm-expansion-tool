'use client';
import { useEffect, useMemo, useState } from 'react';
import { type Crm, type Kind, type Lead, KIND_LABEL, REGIONS, STAGES, buildImport, dueDate, stageLabel, tasksFor, RUNNING } from '@/crm/model';
import { saveFile } from '../download';
import { type Gmail, type Known, type Prefill, crmApi, localToday } from './api';
import { EmailModal, LinkedInModal, WhatsAppModal } from './CrmModals';
import { trackerFile } from './tracker';

type Panel = null | { t: 'import' } | { t: 'add' } | { t: 'edit' } | { t: 'email'; ids: string[]; step?: string } | { t: 'linkedin'; ids: string[]; step?: string } | { t: 'whatsapp'; ids: string[] };
type Props = { crm: Crm; gmail: Gmail | null; known: Known; reload: () => Promise<void>; company: string; setCompany: (c: string) => void; prefill: Prefill | null; clearPrefill: () => void; goSetup: () => void };

export default function CrmDesk({ crm, gmail, known, reload, company, setCompany, prefill, clearPrefill, goSetup }: Props) {
  const today = localToday();
  const [f, setF] = useState({ region: '', kind: '', sector: '', stage: '', q: '', email: false });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel>(null);
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [sure, setSure] = useState(false);

  useEffect(() => {
    if (prefill) setPanel({ t: 'add' });
  }, [prefill]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const leads = crm.leads;
  const sectors = useMemo(() => [...new Set(leads.map((l) => l.sector).filter(Boolean))].sort(), [leads]);
  const shown = useMemo(() => {
    const q = (f.q || company).toLowerCase();
    return leads.filter((l) => (!f.region || l.region === f.region) && (!f.kind || l.kind === f.kind) && (!f.sector || l.sector === f.sector) && (!f.stage || l.stage === f.stage) && (!f.email || (l.email && l.emailStatus === 'Verified')) && (!q || `${l.name} ${l.company} ${l.title ?? ''}`.toLowerCase().includes(q)));
  }, [leads, f, company]);
  const tasks = useMemo(() => tasksFor(leads, crm.sequences, today), [leads, crm.sequences, today]);
  const groups = useMemo(() => {
    const m = new Map<string, { id: string; title: string; day: number; channel: 'email' | 'linkedin'; ids: string[]; late: number; blocked: number }>();
    for (const t of tasks) {
      const g = m.get(t.step.id) ?? { id: t.step.id, title: t.step.title, day: t.step.day, channel: t.step.channel, ids: [], late: 0, blocked: 0 };
      if (t.blocked) g.blocked++;
      else g.ids.push(t.lead.id);
      if (t.overdue) g.late++;
      m.set(t.step.id, g);
    }
    return [...m.values()].sort((a, b) => a.day - b.day);
  }, [tasks]);

  const count = (s: Lead['stage']) => leads.filter((l) => l.stage === s).length;
  const touched = leads.filter((l) => l.stage !== 'new' && l.stage !== 'dnc').length;
  const answered = leads.filter((l) => ['replied', 'meeting', 'pilot', 'won'].includes(l.stage)).length;
  const sentEmails = leads.reduce((n, l) => n + Object.values(l.done).filter((d) => d.how === 'sent').length, 0);
  const ids = [...sel];
  const allOn = shown.length > 0 && shown.every((l) => sel.has(l.id));
  const toggle = (id: string) => setSel((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)));
  const firstOpen = (kind: 'email' | 'linkedin') => {
    const l = leads.find((x) => sel.has(x.id));
    return l ? crm.sequences[l.kind].find((s) => s.channel === kind && !l.done[s.id])?.id : undefined;
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <p className="muted small" style={{ maxWidth: 640 }}>The people at your target accounts. Pick who to contact, start their sequence, and each step shows up in the day plan when it is due. Replying, a meeting or a “no” stops the sequence.</p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => setPanel({ t: 'import' })}>Import from Apollo (CSV)</button>
          <button className="btn sm" onClick={() => setPanel({ t: 'add' })}>Add a person</button>
          <button className="btn sm" disabled={!leads.length} onClick={() => saveFile(trackerFile(crm))}>Download tracker (Excel)</button>
        </div>
      </div>
      {msg && <div className="note bad" role="alert" style={{ margin: '8px 0' }}>{msg}</div>}

      <div className="crm-kpis">
        {[['People', leads.length], ['Not contacted', count('new')], ['Contacted', count('contacted')], ['Replied', count('replied')], ['Meetings', count('meeting')], ['Pilots', count('pilot')], ['Customers', count('won')], ['Emails sent', sentEmails], ['Reply rate', touched ? `${Math.round((answered / touched) * 100)}%` : '–']].map(([k, v]) => <div className="crm-kpi" key={String(k)}><b>{v}</b><span>{k}</span></div>)}
      </div>

      <h2 style={{ fontSize: 16 }}>Today</h2>
      {groups.length ? (
        <div className="crm-today">
          {groups.map((g) => (
            <div className="crm-task" key={g.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}><b>{g.title}</b><span className="pill">{g.channel === 'email' ? 'Email' : 'LinkedIn'} · day {g.day}</span></div>
              <span className="small">{g.ids.length} ready{g.late ? <span className="pill bad" style={{ marginLeft: 6 }}>{g.late} overdue</span> : null}{g.blocked ? <span className="muted"> · {g.blocked} can’t be done ({g.channel === 'email' ? 'no email' : 'no LinkedIn link'})</span> : null}</span>
              <button className="btn sm primary" disabled={!g.ids.length || busy} onClick={() => setPanel(g.channel === 'email' ? { t: 'email', ids: g.ids, step: g.id } : { t: 'linkedin', ids: g.ids, step: g.id })}>{g.channel === 'email' ? 'Review and send' : 'Open the queue'}</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: '6px 0 14px' }}>{leads.length ? 'Nothing is due. Tick people below and press “Start sequence” to begin; day 1 is today.' : 'No people yet. Import your Apollo export or add someone to begin.'}</p>
      )}

      <div className="crm-filters">
        <input type="search" placeholder="Search name, company, title" value={f.q || company} onChange={(e) => { setCompany(''); setF({ ...f, q: e.target.value }); }} aria-label="Search people" />
        <select value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} aria-label="Region"><option value="">All regions</option>{[...REGIONS, 'Other'].map((r) => <option key={r}>{r}</option>)}</select>
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Type"><option value="">Both types</option>{(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <select value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} aria-label="Sector"><option value="">All sectors</option>{sectors.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} aria-label="Stage"><option value="">All stages</option>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <label className="row small muted" style={{ gap: 5 }}><input type="checkbox" checked={f.email} onChange={(e) => setF({ ...f, email: e.target.checked })} /> Verified email only</label>
        <span className="muted small">{shown.length} shown</span>
        {(f.q || company || f.region || f.kind || f.sector || f.stage || f.email) && <button className="btn sm ghost" onClick={() => { setCompany(''); setF({ region: '', kind: '', sector: '', stage: '', q: '', email: false }); }}>Clear filters</button>}
      </div>

      {sel.size > 0 && (
        <div className="crm-bar" role="region" aria-label="Actions for the selected people">
          <b>{sel.size} selected</b>
          <button className="btn sm" disabled={busy} onClick={() => act(() => crmApi('start', { ids, date: today }))}>Start sequence (day 1 = today)</button>
          <button className="btn sm primary" disabled={busy} onClick={() => setPanel({ t: 'email', ids, step: firstOpen('email') })}>Send email…</button>
          <button className="btn sm" disabled={busy} onClick={() => setPanel({ t: 'linkedin', ids, step: firstOpen('linkedin') })}>LinkedIn messages…</button>
          <button className="btn sm" disabled={busy} onClick={() => setPanel({ t: 'whatsapp', ids })}>WhatsApp…</button>
          <select aria-label="Set stage" value="" disabled={busy} onChange={(e) => e.target.value && act(() => crmApi('update', { ids, patch: { stage: e.target.value } }))}><option value="">Set stage…</option>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          <button className="btn sm" disabled={busy} onClick={() => setPanel({ t: 'edit' })}>Set type or sector…</button>
          {sure ? <><button className="btn sm" style={{ color: 'var(--bad)' }} disabled={busy} onClick={() => act(async () => { await crmApi('remove', { ids }); setSel(new Set()); setSure(false); })}>Yes, remove {sel.size}</button><button className="btn sm ghost" onClick={() => setSure(false)}>Keep</button></> : <button className="btn sm ghost" onClick={() => setSure(true)}>Remove…</button>}
          <button className="btn sm ghost" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      {leads.length > 0 && (
        <div className="crm-scroll" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
          <table style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Select everyone shown" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((l) => l.id)))} /></th>
                <th>Person</th><th>Company</th><th>Sector</th><th>Email</th><th>LinkedIn</th><th>Stage</th><th>Sequence</th><th>Next</th><th />
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const steps = crm.sequences[l.kind];
                const next = l.startedAt && RUNNING.includes(l.stage) ? steps.filter((s) => !l.done[s.id]).map((s) => dueDate(l, s)).sort()[0] : '';
                return (
                  <FragmentRows key={l.id}>
                    <tr>
                      <td><input type="checkbox" aria-label={`Select ${l.name}`} checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></td>
                      <td><b>{l.name}</b><div className="muted small">{l.title}</div></td>
                      <td>{l.website ? <a href={`https://${l.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer">{l.company}</a> : l.company}<div className="muted small">{l.country} · {l.kind === 'partner' ? 'Partner' : 'Enterprise'}</div></td>
                      <td>{l.sector || <span className="faint">–</span>}</td>
                      <td className="nw">{l.email ? <>{l.email}<div><span className={`pill ${l.emailStatus === 'Verified' ? 'good' : 'warn'}`}>{l.emailStatus || 'Unverified'}</span></div></> : <span className="faint">None</span>}</td>
                      <td className="nw">{l.linkedin ? <a href={l.linkedin.startsWith('http') ? l.linkedin : `https://${l.linkedin}`} target="_blank" rel="noopener noreferrer">Profile</a> : <span className="faint">None</span>}</td>
                      <td>
                        <select aria-label={`Stage of ${l.name}`} value={l.stage} disabled={busy} onChange={(e) => act(() => crmApi('update', { ids: [l.id], patch: { stage: e.target.value } }))}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                      </td>
                      <td><span className="crm-dots">{steps.map((s) => { const d = dueDate(l, s); const cls = l.done[s.id] ? 'done' : !l.startedAt ? '' : d < today ? 'late' : d === today ? 'due' : ''; return <i key={s.id} className={cls} title={`${s.title} (day ${s.day}): ${l.done[s.id] ? 'done' : !l.startedAt ? 'not started' : d < today ? 'overdue' : d === today ? 'due today' : `due ${d}`}`} />; })}</span></td>
                      <td className="nw">{next ? (next < today ? <span className="pill bad">{next}</span> : next === today ? <span className="pill warn">Today</span> : next) : <span className="faint">–</span>}</td>
                      <td><button className="btn sm ghost" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? '' : l.id)}>{open === l.id ? 'Close' : 'Details'}</button></td>
                    </tr>
                    {open === l.id && <tr className="crm-det"><td colSpan={10}><Detail lead={l} crm={crm} busy={busy} act={act} /></td></tr>}
                  </FragmentRows>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {panel?.t === 'import' && <ImportPanel known={known} onClose={() => setPanel(null)} onDone={async (m) => { setPanel(null); await reload(); setMsg(m); }} />}
      {panel?.t === 'add' && <AddPanel prefill={prefill} onClose={() => { setPanel(null); clearPrefill(); }} onDone={async () => { setPanel(null); clearPrefill(); await reload(); }} />}
      {panel?.t === 'edit' && <EditPanel ids={ids} sectors={sectors} onClose={() => setPanel(null)} onDone={async () => { setPanel(null); await reload(); }} />}
      {panel?.t === 'email' && <EmailModal crm={crm} gmail={gmail} ids={panel.ids} step={panel.step} onClose={() => setPanel(null)} reload={reload} goSetup={goSetup} />}
      {panel?.t === 'linkedin' && <LinkedInModal crm={crm} ids={panel.ids} step={panel.step} onClose={() => setPanel(null)} reload={reload} />}
      {panel?.t === 'whatsapp' && <WhatsAppModal crm={crm} ids={panel.ids} onClose={() => setPanel(null)} reload={reload} />}
    </>
  );
}

const FragmentRows = ({ children }: { children: React.ReactNode }) => <>{children}</>;

function Detail({ lead: l, crm, busy, act }: { lead: Lead; crm: Crm; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [notes, setNotes] = useState(l.notes ?? '');
  const [phone, setPhone] = useState(l.phone ?? '');
  const [log, setLog] = useState('');
  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', padding: '6px 0' }}>
      <div className="stack" style={{ gap: 8 }}>
        <label className="small muted">Notes<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (l.notes ?? '') && act(() => crmApi('update', { ids: [l.id], patch: { notes } }))} /></label>
        <label className="small muted">Follow up on<input type="date" value={l.followUp ?? ''} onChange={(e) => act(() => crmApi('update', { ids: [l.id], patch: { followUp: e.target.value } }))} /></label>
        <label className="small muted">Phone<input value={phone} placeholder="+65 …" onChange={(e) => setPhone(e.target.value)} onBlur={() => phone !== (l.phone ?? '') && act(() => crmApi('update', { ids: [l.id], patch: { phone } }))} /></label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <b className="small">Steps</b>
        {crm.sequences[l.kind].map((s) => {
          const d = l.done[s.id];
          return (
            <div key={s.id} className="row small" style={{ justifyContent: 'space-between', gap: 8 }}>
              <span>{s.title} <span className="faint">· day {s.day}</span></span>
              {d ? <span>{d.how === 'sent' ? 'Sent' : d.how === 'draft' ? 'Draft' : 'Done'} {d.at.slice(0, 10)}{d.thread && <> · <a href={`https://mail.google.com/mail/u/0/#all/${d.thread}`} target="_blank" rel="noopener noreferrer">open</a></>} <button className="btn sm ghost" disabled={busy} onClick={() => act(() => crmApi('undo', { ids: [l.id], step: s.id }))}>Undo</button></span> : <button className="btn sm" disabled={busy} onClick={() => act(() => crmApi('done', { ids: [l.id], step: s.id }))}>Mark done</button>}
            </div>
          );
        })}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <b className="small">Activity</b>
        <div className="row" style={{ gap: 6 }}><input style={{ flex: 1 }} value={log} onChange={(e) => setLog(e.target.value)} placeholder="Log a call, reply or note" /><button className="btn sm" disabled={busy || !log.trim()} onClick={() => act(async () => { await crmApi('log', { ids: [l.id], channel: 'note', text: log }); setLog(''); })}>Add</button></div>
        {l.log.length === 0 && <span className="faint small">Nothing yet.</span>}
        {[...l.log].reverse().slice(0, 8).map((e, i) => <div key={i} className="small"><span className="faint">{e.at.slice(0, 10)} · {e.channel}</span> {e.text}</div>)}
        <span className="faint small">Stage: {stageLabel(l.stage)}</span>
      </div>
    </div>
  );
}

function ImportPanel({ known, onClose, onDone }: { known: Known; onClose: () => void; onDone: (m: string) => void | Promise<void> }) {
  const [kind, setKind] = useState<Kind>('partner');
  const [sector, setSector] = useState('');
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const built = useMemo(() => (files.length ? buildImport(files, { kind, sector: sector.trim() || undefined, known: Object.fromEntries(Object.entries(known).map(([k, v]) => [k, v])) }, new Date().toISOString()) : null), [files, kind, sector, known]);
  const by = (k: (l: Lead) => string) => built ? Object.entries(built.leads.reduce<Record<string, number>>((m, l) => ((m[k(l)] = (m[k(l)] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]) : [];
  const go = async () => {
    if (!built) return;
    setBusy(true);
    setErr('');
    try {
      let added = 0;
      let updated = 0;
      for (let i = 0; i < built.leads.length; i += 300) {
        const r = await crmApi('import', { leads: built.leads.slice(i, i + 300) });
        added += r.added;
        updated += r.updated;
      }
      await onDone(`Imported: ${added} new people, ${updated} already in the list (their progress was kept).`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Import people">
      <div className="crm-box">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ fontSize: 17 }}>Import people from Apollo</h2><button className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button></div>
        <p className="muted small">In Apollo, export your contacts as CSV. Add the partner list too if you have one: it gives each company its type. Files are read in your browser; only the people are saved to your workspace. People already in the list keep their progress.</p>
        <label className="small muted">Apollo files (.csv)<input type="file" accept=".csv,text/csv" multiple onChange={async (e) => setFiles(await Promise.all([...(e.target.files ?? [])].map(async (f) => ({ name: f.name, text: await f.text() }))))} /></label>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label className="small muted">These people are<select value={kind} onChange={(e) => setKind(e.target.value as Kind)}><option value="partner">{KIND_LABEL.partner}</option><option value="enterprise">{KIND_LABEL.enterprise}</option></select></label>
          <label className="small muted">Sector, if the files do not say<input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="e.g. BFSI" /></label>
        </div>
        {built && (
          <div className="note info small">
            <b>{built.leads.length} people found.</b> {built.files.join(' · ')}
            <div>By region: {by((l) => l.region).map(([k, n]) => `${k} ${n}`).join(', ') || '–'}</div>
            <div>With a verified email: {built.leads.filter((l) => l.emailStatus === 'Verified').length} · with LinkedIn: {built.leads.filter((l) => l.linkedin).length}</div>
            {built.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
          </div>
        )}
        {err && <div className="note bad small">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !built?.leads.length} onClick={go}>{busy ? 'Importing…' : `Import ${built?.leads.length ?? 0} people`}</button></div>
      </div>
    </div>
  );
}

function AddPanel({ prefill, onClose, onDone }: { prefill: Prefill | null; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [v, setV] = useState({ name: '', title: '', company: prefill?.company ?? '', country: prefill?.country ?? '', kind: (prefill?.kind ?? 'partner') as Kind, sector: prefill?.sector ?? '', email: '', linkedin: '', phone: '', website: prefill?.website ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await crmApi('add', { lead: { ...v, region: prefill?.region } });
      await onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Add a person">
      <div className="crm-box">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ fontSize: 17 }}>Add a person</h2><button className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button></div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {([['name', 'Full name'], ['title', 'Title'], ['company', 'Company'], ['country', 'Country'], ['sector', 'Sector'], ['email', 'Email'], ['linkedin', 'LinkedIn profile link'], ['phone', 'Phone (for WhatsApp)'], ['website', 'Company website']] as const).map(([k, label]) => <label className="small muted" key={k}>{label}<input style={{ width: '100%' }} value={v[k]} onChange={set(k)} /></label>)}
          <label className="small muted">Type<select style={{ width: '100%' }} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Kind })}><option value="partner">{KIND_LABEL.partner}</option><option value="enterprise">{KIND_LABEL.enterprise}</option></select></label>
        </div>
        {err && <div className="note bad small">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !v.name.trim() || !v.company.trim()} onClick={save}>Add</button></div>
      </div>
    </div>
  );
}

function EditPanel({ ids, sectors, onClose, onDone }: { ids: string[]; sectors: string[]; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [kind, setKind] = useState('');
  const [sector, setSector] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true);
    try {
      await crmApi('update', { ids, patch: { ...(kind ? { kind } : {}), ...(sector.trim() ? { sector: sector.trim() } : {}) } });
      await onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="crm-modal" role="dialog" aria-modal="true" aria-label="Set type or sector">
      <div className="crm-box">
        <h2 style={{ fontSize: 17 }}>Set type or sector for {ids.length} people</h2>
        <label className="small muted">Type<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Leave as is</option><option value="partner">{KIND_LABEL.partner}</option><option value="enterprise">{KIND_LABEL.enterprise}</option></select></label>
        <label className="small muted">Sector<input list="crm-sectors" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Leave empty to keep each person’s sector" /><datalist id="crm-sectors">{sectors.map((s) => <option key={s} value={s} />)}</datalist></label>
        {err && <div className="note bad small">{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || (!kind && !sector.trim())} onClick={save}>Apply</button></div>
      </div>
    </div>
  );
}
