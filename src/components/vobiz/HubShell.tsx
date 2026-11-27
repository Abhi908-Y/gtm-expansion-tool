'use client';
import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

type Item = [step: string, text: string, status: 'done' | 'doing' | 'todo', note?: string];
type Checklist = { STEP_NAMES: Record<string, string>; ITEMS: Item[] };
const LABEL = { done: 'Done', doing: 'In progress', todo: 'Pending' } as const;

// Same order and numbering as the project page.
const STEPS: { id: string; n?: number; label: string; sub?: boolean }[] = [
  { id: 'product', n: 1, label: 'Product understanding' },
  { id: 'competitors', n: 2, label: 'Competitor intelligence' },
  { id: 'market', n: 3, label: 'Market research' },
  { id: 'middle-east', label: 'Middle East', sub: true },
  { id: 'europe', label: 'Europe', sub: true },
  { id: 'southeast-asia', label: 'Southeast Asia', sub: true },
  { id: 'target-markets', label: 'Final target markets', sub: true },
  { id: 'customers', n: 4, label: 'Customer prospecting' },
  { id: 'partners', n: 5, label: 'Channel partnerships' },
  { id: 'channels', n: 6, label: 'GTM channel discovery' },
  { id: 'outreach', n: 7, label: 'Outreach and research calls' },
  { id: 'playbook', n: 8, label: '90-day playbook' },
];
const REFERENCE = [
  { id: 'inputs', ico: '✎', label: 'Mentor and expert inputs' },
  { id: 'assumptions', ico: '∴', label: 'Assumptions' },
  { id: 'questions', ico: '?', label: 'Clarification questions' },
  { id: 'checklist', ico: '✓', label: 'Checklist and progress' },
];
const WIDE = new Set(['customers']);

export default function HubShell({ nodes, checklist }: { nodes: Record<string, ReactNode>; checklist: Checklist }) {
  const [tab, setTab] = useState('problem');
  const [open, setOpen] = useState(false);
  const ids = useMemo(() => new Set(['problem', ...STEPS.map((s) => s.id), ...REFERENCE.map((r) => r.id)]), []);

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      setTab(ids.has(h) ? h : 'problem');
      window.scrollTo({ top: 0 });
    };
    read();
    window.addEventListener('hashchange', read);
    return () => {
      window.removeEventListener('hashchange', read);
    };
  }, [ids]);

  const go = (id: string) => {
    setOpen(false);
    if (window.location.hash === `#${id}`) setTab(id);
    else window.location.hash = id;
  };

  const { ITEMS, STEP_NAMES } = checklist;
  const stepStatus = (key: string) => {
    const list = ITEMS.filter((i) => i[0] === key);
    if (!list.length) return 'todo';
    if (list.every((i) => i[2] === 'done')) return 'done';
    return list.some((i) => i[2] !== 'todo') ? 'doing' : 'todo';
  };
  const statusOf = (id: string) => {
    if (id === 'market') {
      const s = ['middle-east', 'europe', 'southeast-asia'].map(stepStatus);
      return s.every((x) => x === 'done') ? 'done' : s.some((x) => x !== 'todo') ? 'doing' : 'todo';
    }
    return stepStatus(id);
  };
  const done = ITEMS.filter((i) => i[2] === 'done').length;
  const doing = ITEMS.filter((i) => i[2] === 'doing').length;
  const pct = Math.round(((done + doing * 0.5) / ITEMS.length) * 100);
  const summary = `${done} done, ${doing} in progress, ${ITEMS.length - done - doing} pending`;

  return (
    <div className={`hbs ${open ? 'open' : ''}`}>
      <aside className="hbs-side" id="hub-nav" aria-label="Project navigation">
        <p className="hbs-eyebrow">Vobiz.ai</p>
        <h1 className="hbs-title">Vobiz AI International Expansion Strategy</h1>
        <p className="hbs-sub">Mesa Business Strategy Lab. Abhishek Yadav and Swapnil Bhatt</p>
        <div className="hbs-meter" aria-live="polite">
          <div className="hbs-meter-top"><span>Overall progress</span><strong>{pct}%</strong></div>
          <div className="hbs-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i className="d" style={{ width: `${(done / ITEMS.length) * 100}%` }} /><i className="p" style={{ width: `${(doing / ITEMS.length) * 50}%` }} /></div>
          <div className="small muted" style={{ marginTop: 5 }}>{summary}</div>
        </div>
        <ul className="hbs-nav">
          <li><button className="hbs-link" aria-current={tab === 'problem' ? 'page' : undefined} onClick={() => go('problem')}><span className="hbs-ico" aria-hidden="true">§</span>Problem statement</button></li>
        </ul>
        <div className="hbs-grp">Steps</div>
        <ul className="hbs-nav route">
          {STEPS.map((s) => (
            <li key={s.id} className={s.sub ? 'hbs-sublink' : ''}>
              <button className="hbs-link" aria-current={tab === s.id ? 'page' : undefined} onClick={() => go(s.id)}>
                {s.sub ? <span className={`hbs-dot ${statusOf(s.id) === 'todo' ? '' : statusOf(s.id)}`} title={LABEL[statusOf(s.id) as keyof typeof LABEL]} /> : <span className={`hbs-node ${statusOf(s.id) === 'todo' ? '' : statusOf(s.id)}`} title={LABEL[statusOf(s.id) as keyof typeof LABEL]}>{s.n}</span>}
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="hbs-grp">Reference</div>
        <ul className="hbs-nav">
          {REFERENCE.map((r) => (
            <li key={r.id}><button className="hbs-link" aria-current={tab === r.id ? 'page' : undefined} onClick={() => go(r.id)}><span className="hbs-ico" aria-hidden="true">{r.ico}</span>{r.label}</button></li>
          ))}
        </ul>
        <div className="hbs-foot">
          <Link href="/">← Plan for another company</Link>
        </div>
      </aside>
      <div className="hbs-scrim" onClick={() => setOpen(false)} />
      <main className="hbs-main">
        <button className="btn sm hbs-menu" aria-expanded={open} aria-controls="hub-nav" onClick={() => setOpen(!open)}>☰ All steps · {pct}%</button>
        {[...ids].map((id) => (
          <section key={id} className={`hbs-view ${WIDE.has(id) ? 'wide' : ''}`} hidden={tab !== id} aria-label={id}>
            {tab === id && (
              <>
                {nodes[id]}
                {id === 'checklist' && (
                  <div className="hb-content">
                    <div className="hb-meter-line" style={{ margin: '10px 0 22px' }}>
                      <p><strong>{pct}%</strong> · {summary}</p>
                    </div>
                    {Object.keys(STEP_NAMES).map((key) => {
                      const list = ITEMS.filter((i) => i[0] === key);
                      if (!list.length) return null;
                      return (
                        <div className="hb-check-group" key={key}>
                          <h3><span>{STEP_NAMES[key]}</span><span className="hb-count">{list.filter((i) => i[2] === 'done').length} of {list.length} done</span></h3>
                          <ul className="hb-check-list">
                            {list.map(([, text, s, note], k) => (
                              <li key={k}>
                                <span className={`hb-tick ${s === 'todo' ? '' : `hb-${s}`}`} aria-hidden="true">{s === 'done' ? '✓' : ''}</span>
                                <span>{text}{note && <span className="hb-item-note">{note}</span>}</span>
                                <span className={`hb-status hb-${s}`}>{LABEL[s]}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
