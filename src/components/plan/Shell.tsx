'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { call, type Run, type State, type Tab } from '../shared';
import AskPanel from './AskPanel';
import { runAutopilot, type Phase } from './autopilot';
import CompanyView from './CompanyView';
import CompetitorsView from './CompetitorsView';
import CountriesView from './CountriesView';
import Overview from './Overview';
import OutreachView from './OutreachView';
import StrategyView from './StrategyView';

const TABS: Tab[] = ['overview', 'company', 'countries', 'competitors', 'outreach', 'strategy'];
const LABEL: Record<Tab, string> = { overview: 'Overview', company: 'Company', countries: 'Countries', competitors: 'Competitors', outreach: 'Outreach', strategy: 'Strategy' };
const SOON = ['Apollo contacts', 'Gmail drafts'];

export default function Shell({ id }: { id: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [phases, setPhases] = useState<Phase[]>([]);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const autoStarted = useRef(false);

  const load = useCallback(async () => setSt(await call(`/api/plans/${id}`)), [id]);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
    const fromHash = () => {
      const h = window.location.hash.slice(1) as Tab;
      if (TABS.includes(h)) setTab(h);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [load]);

  const start = useCallback(async () => {
    if (running || !st) return;
    stop.current = false;
    setRunning(true);
    setErr('');
    try {
      await runAutopilot(id, st.gemini, setPhases, load, () => stop.current);
    } finally {
      setRunning(false);
      await load().catch(() => {});
    }
  }, [id, running, st, load]);

  // A plan that was just created opens with ?auto=1: begin the research straight away.
  useEffect(() => {
    if (!st || autoStarted.current || st.project.isSample) return;
    if (new URLSearchParams(window.location.search).get('auto') === '1') {
      autoStarted.current = true;
      history.replaceState(null, '', `${window.location.pathname}#overview`);
      start();
    }
  }, [st, start]);

  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
    window.scrollTo({ top: 0 });
  };
  const run: Run = async (label, fn) => {
    setBusy(label);
    setErr('');
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const post = (action: string, body: object = {}) => call(`/api/plans/${id}/${action}`, body);

  if (!st)
    return (
      <main className="shell" style={{ display: 'block' }}>
        {err ? <div className="stack" style={{ maxWidth: 520 }}><p className="note bad">{err}</p><Link href="/" className="btn">Back to the start</Link></div> : <p className="busy">Loading plan</p>}
      </main>
    );

  const p = st.project;
  const ro = !!p.isSample;
  const comps = st.compete.rows;
  const status: Record<Tab, string> = {
    overview: '',
    company: p.profile ? 'done' : 'ready',
    countries: p.ranAt ? 'done' : 'ready',
    competitors: comps.length && comps.every((r) => r.analysed) ? 'done' : 'ready',
    outreach: st.outreach.accounts.some((a) => a.outreach) ? 'done' : 'ready',
    strategy: Object.keys(st.strategy.playbooks).length ? 'done' : 'ready',
  };
  const shownBusy = running ? 'Researching in the background' : busy;
  const auto = { phases, running, start, stop: () => (stop.current = true) };
  const props = { st, post, run, busy: shownBusy, ro, go, auto };

  return (
    <div className="shell">
      <aside className="side">
        <div className="who">
          <h1>{p.company}</h1>
          <a className="small" href={`https://${p.website}`} target="_blank" rel="noopener noreferrer">{p.website}</a>
          {ro && <div style={{ marginTop: 6 }}><span className="pill warn">Example · read only</span></div>}
        </div>
        <nav aria-label="Plan steps">
          <div className="grp">Plan</div>
          {TABS.map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => go(t)} aria-current={tab === t ? 'page' : undefined}>
              <span className={`st ${status[t]}`} />{LABEL[t]}
            </button>
          ))}
          <div className="grp">Coming next</div>
          {SOON.map((s) => (
            <button key={s} disabled><span className="st" />{s}<span className="tag">Soon</span></button>
          ))}
        </nav>
        {shownBusy && <span className="busy">{shownBusy}…</span>}
      </aside>
      <main className="work">
        {ro && <div className="note warn">You are looking at the finished Vobiz example. <Link href="/#start">Start your own plan</Link> to run the steps yourself. You can still ask the assistant about it.</div>}
        {err && <div className="note bad" role="alert">{err}</div>}
        {tab === 'overview' && <Overview {...props} />}
        {tab === 'company' && <CompanyView {...props} />}
        {tab === 'countries' && <CountriesView {...props} />}
        {tab === 'competitors' && <CompetitorsView {...props} />}
        {tab === 'outreach' && <OutreachView {...props} />}
        {tab === 'strategy' && <StrategyView {...props} />}
      </main>
      <AskPanel st={st} post={post} run={run} busy={shownBusy} screen={LABEL[tab]} planId={id} />
    </div>
  );
}
