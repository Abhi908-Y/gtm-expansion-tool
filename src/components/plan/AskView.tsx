'use client';
import { useEffect, useRef, useState } from 'react';
import { Dictate } from '../Mic';
import type { TabProps } from '../shared';

const SUGGEST = [
  'Which countries should we enter first, and why?',
  'Why are some countries marked "Fix coverage first"?',
  'Which accounts should I contact first?',
  'Summarise the strategy in five lines.',
  'What are the biggest risks in this plan?',
];

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

export default function AskView({ st, post, run, busy }: TabProps) {
  const [q, setQ] = useState('');
  const [web, setWeb] = useState(false);
  const [note, setNote] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [st.chat.length]);

  const ask = (text = q) => {
    if (!text.trim() || busy) return;
    setQ('');
    run('Thinking', () => post('chat', { message: text, web }));
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Ask AI</h1>
          <p className="muted">Ask about anything in this plan: scores, competitors, accounts, drafts, the strategy. It answers from your plan and your notes.</p>
        </div>
      </div>
      {!st.gemini && <div className="note warn">The AI steps are switched off on this site right now.</div>}

      <section className="card chat">
        <div className="msgs" aria-live="polite">
          {st.chat.length === 0 && (
            <div className="stack">
              <p className="muted">Try one of these, or ask your own question.</p>
              <div className="chips">{SUGGEST.map((s) => <button key={s} className="chip" disabled={!st.gemini || !!busy} onClick={() => ask(s)}>{s}</button>)}</div>
            </div>
          )}
          {st.chat.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="who small faint">{m.role === 'user' ? 'You' : 'Assistant'}</div>
              <div className="bubble">{m.role === 'user' ? m.text : <Md text={m.text} />}</div>
              {m.sources && m.sources.length > 0 && <div className="small faint">From the web: {m.sources.map((s, k) => <span key={s.url}>{k > 0 && ', '}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || 'source'}</a></span>)}</div>}
            </div>
          ))}
          {busy === 'Thinking' && <div className="msg model"><div className="busy">Thinking</div></div>}
          <div ref={end} />
        </div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <Dictate multiline rows={2} value={q} onChange={setQ} placeholder="Ask a question about this plan…" aria-label="Your question"
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label className="row small muted" style={{ gap: 6 }}><input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} /> Search the web for this answer</label>
            <button className="btn primary" disabled={!st.gemini || !!busy || !q.trim()}>Ask</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Add information</h2>
        <p className="muted small" style={{ marginBottom: 10 }}>Anything you know that the research cannot find: customers you already have, pricing, constraints, people you know. The assistant treats your notes as facts.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) run('Saving the note', async () => { await post('note', { op: 'add', text: note }); setNote(''); }); }}>
          <Dictate multiline rows={3} value={note} onChange={setNote} placeholder="For example: We already have two pilot customers in Singapore, and our UAE number licence is pending." aria-label="A note to add" style={{ width: '100%' }} />
          <button className="btn" style={{ marginTop: 8 }} disabled={!!busy || !note.trim()}>Save note</button>
        </form>
        {st.notes.length > 0 && (
          <ul className="out" style={{ marginTop: 12 }}>
            {st.notes.map((n) => <li key={n.id}>{n.text} <button className="link quiet" onClick={() => run('Removing', () => post('note', { op: 'remove', id: n.id }))}>remove</button></li>)}
          </ul>
        )}
      </section>
    </>
  );
}
