'use client';
import { useEffect, useRef, useState } from 'react';
import { Dictate } from '../Mic';
import { saveFile } from '../download';
import { fileFor, type What } from '../exports';
import type { State } from '../shared';

type Prop = { id: string; type: string; label: string; why?: string; warn?: string; args: { what?: What; format?: 'xlsx' | 'csv' }; raw: unknown };
type Msg = { role: 'user' | 'model'; text: string; sources?: { title: string; url: string }[]; evidence?: string[]; warnings?: string[]; dropped?: string[]; proposals?: Prop[]; states?: Record<string, string> };
type Props = { st: State; post: (a: string, b?: object) => Promise<any>; run: (label: string, fn: () => Promise<unknown>) => Promise<void>; busy: string; screen: string; planId: string; startResearch: () => void };

const SUGGEST = ['Which countries should we enter first, and why?', 'Why are some countries marked "Fix coverage first"?', 'Which accounts should I contact first?', 'Explain what I am looking at on this screen.', 'What are the biggest risks in this plan?'];

/** Very small markdown: **bold** and "- " or "* " bullet lines. Built from React elements, never raw HTML. */
function Md({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((t, i) => (t.startsWith('**') && t.endsWith('**') ? <b key={i}>{t.slice(2, -2)}</b> : t));
  return (
    <>
      {text.split('\n').map((line, i) => {
        const m = /^\s*[-*]\s+(.*)/.exec(line);
        return m ? <div key={i} style={{ paddingLeft: 14, textIndent: -10 }}>• {inline(m[1])}</div> : line.trim() ? <p key={i} style={{ margin: '0 0 6px' }}>{inline(line)}</p> : null;
      })}
    </>
  );
}

/** A round button on every screen of a plan; it opens a chat that knows which tab you are on. The chat history stays in this browser. */
export default function AskPanel({ st, post, run, busy, screen, planId, startResearch }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'notes'>('chat');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [web, setWeb] = useState(false);
  const [note, setNote] = useState('');
  const [thinking, setThinking] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const storeKey = `gtm_chat_${planId}`;

  useEffect(() => {
    try {
      setMsgs(JSON.parse(localStorage.getItem(storeKey) ?? '[]'));
    } catch {
      /* private mode */
    }
  }, [storeKey]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [msgs.length, thinking, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const save = (m: Msg[]) => {
    setMsgs(m);
    try {
      localStorage.setItem(storeKey, JSON.stringify(m.slice(-40)));
    } catch {
      /* private mode */
    }
  };

  const ask = async (text = q) => {
    if (!text.trim() || thinking) return;
    const next = [...msgs, { role: 'user' as const, text }];
    save(next);
    setQ('');
    setThinking(true);
    setErr('');
    try {
      const r = await post('chat', { message: text, web, screen, history: msgs.slice(-12).map(({ role, text }) => ({ role, text })) });
      save([...next, { role: 'model', text: r.reply, sources: r.sources, evidence: r.evidence, warnings: r.warnings, dropped: r.dropped, proposals: r.proposals }]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setThinking(false);
    }
  };

  const mark = (mi: number, id: string, state: string) => setMsgs((cur) => {
    const m = cur.map((x, i) => (i === mi ? { ...x, states: { ...x.states, [id]: state } } : x));
    try {
      localStorage.setItem(storeKey, JSON.stringify(m.slice(-40)));
    } catch {
      /* private mode */
    }
    return m;
  });

  // Nothing changes until the user presses the button. The server checks the proposal again before it applies it.
  const doIt = async (mi: number, pr: Prop) => {
    mark(mi, pr.id, 'working');
    try {
      if (pr.type === 'export') saveFile(fileFor(st, pr.args.what ?? 'everything', pr.args.format ?? 'xlsx'));
      else if (pr.type === 'research') startResearch();
      else {
        let failed: string[] = [];
        await run('Applying your change', async () => {
          failed = (await post('apply', { raw: pr.raw })).failed ?? [];
        });
        // New countries or regions need their scoring, accounts and playbooks: start the research for them.
        if (pr.type === 'add_countries' || pr.type === 'add_region') startResearch();
        if (failed.length) {
          mark(mi, pr.id, 'partial: ' + failed.join('; '));
          return;
        }
      }
      mark(mi, pr.id, 'done');
    } catch (e) {
      mark(mi, pr.id, 'error: ' + (e as Error).message);
    }
  };

  return (
    <>
      <button className="ask-fab no-print" onClick={() => setOpen(true)} aria-label="Ask AI about this screen" title="Ask AI about this screen" hidden={open}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>
        <span>Ask AI</span>
      </button>
      {open && (
        <aside className="ask-drawer no-print" role="dialog" aria-label="Ask AI">
          <header>
            <div><b>Ask AI</b><div className="faint small">You are on the {screen} tab</div></div>
            <div className="row">
              <div className="filters">
                <button className={`chip ${tab === 'chat' ? 'on' : ''}`} onClick={() => setTab('chat')}>Chat</button>
                <button className={`chip ${tab === 'notes' ? 'on' : ''}`} onClick={() => setTab('notes')}>Add info{st.notes.length ? ` (${st.notes.length})` : ''}</button>
              </div>
              <button className="btn sm ghost" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
          </header>

          {tab === 'chat' ? (
            <>
              <div className="msgs" aria-live="polite">
                {!st.gemini && <div className="note warn small">The AI steps are switched off on this site right now.</div>}
                {msgs.length === 0 && (
                  <div className="stack">
                    <p className="muted small">Ask about anything in this plan. It answers from the plan’s data and your notes.</p>
                    <div className="chips">{SUGGEST.map((s) => <button key={s} className="chip" disabled={!st.gemini || thinking} onClick={() => ask(s)}>{s}</button>)}</div>
                  </div>
                )}
                {msgs.map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}>
                    <div className="bubble">{m.role === 'user' ? m.text : <Md text={m.text} />}</div>
                    {m.warnings?.map((w, k) => <div key={k} className="note warn small">{w}</div>)}
                    {m.evidence && m.evidence.length > 0 && <details className="small muted"><summary>Evidence from this plan ({m.evidence.length})</summary><ul className="out">{m.evidence.map((e, k) => <li key={k}>{e}</li>)}</ul></details>}
                    {m.dropped?.map((d, k) => <div key={k} className="small faint">Not offered: {d}</div>)}
                    {m.proposals?.map((pr) => {
                      const state = m.states?.[pr.id] ?? '';
                      return (
                        <div key={pr.id} className="note small" style={{ marginTop: 6 }}>
                          <b>{pr.label}</b>
                          {pr.why && <div className="muted">{pr.why}</div>}
                          {pr.warn && <div className="note warn small">{pr.warn}</div>}
                          {state === 'done' ? <span className="pill good">Done</span> : state === 'skipped' ? <span className="faint">Skipped</span> : state.startsWith('partial') || state.startsWith('error') ? <div className="note bad small">{state}</div> : (
                            <div className="row" style={{ marginTop: 6 }}>
                              <button className="btn sm primary" disabled={state === 'working' || (!!busy && pr.type !== 'export')} onClick={() => doIt(i, pr)}>{state === 'working' ? 'Working…' : 'Do it'}</button>
                              <button className="btn sm ghost" disabled={state === 'working'} onClick={() => mark(i, pr.id, 'skipped')}>Not now</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {m.sources && m.sources.length > 0 && <div className="small faint">From the web: {m.sources.map((s, k) => <span key={s.url}>{k > 0 && ', '}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || 'source'}</a></span>)}</div>}
                  </div>
                ))}
                {thinking && <div className="msg model"><div className="busy">Thinking</div></div>}
                {err && <div className="note bad small">{err}</div>}
                <div ref={end} />
              </div>
              <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(); }}>
                <Dictate multiline rows={2} value={q} onChange={setQ} placeholder="Ask about this screen or the whole plan…" aria-label="Your question"
                  onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <label className="row small muted" style={{ gap: 6 }}><input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} /> Search the web</label>
                  <span className="row">{msgs.length > 0 && <button type="button" className="link quiet small" onClick={() => save([])}>clear chat</button>}<button className="btn primary" disabled={!st.gemini || thinking || !q.trim()}>Ask</button></span>
                </div>
              </form>
            </>
          ) : (
            <div className="msgs">
              <p className="muted small">Anything you know that the research cannot find: customers you already have, pricing, constraints, people you know. The assistant treats your notes as facts.</p>
              <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) run('Saving the note', async () => { await post('note', { op: 'add', text: note }); setNote(''); }); }}>
                <Dictate multiline rows={3} value={note} onChange={setNote} placeholder="For example: We already have two pilot customers in Singapore." aria-label="A note to add" />
                <button className="btn" style={{ marginTop: 8 }} disabled={!!busy || !note.trim()}>{busy ? 'Wait for the current step…' : 'Save note'}</button>
              </form>
              {st.notes.length > 0 && <ul className="out">{st.notes.map((n) => <li key={n.id}>{n.text} <button className="link quiet" disabled={!!busy} onClick={() => run('Removing', () => post('note', { op: 'remove', id: n.id }))}>remove</button></li>)}</ul>}
            </div>
          )}
        </aside>
      )}
    </>
  );
}
