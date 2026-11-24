'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { call, type Run, type State, type Tab } from '../shared';
import CompanyView from './CompanyView';
import CompetitorsView from './CompetitorsView';
import CountriesView from './CountriesView';
import Overview from './Overview';

const TABS: Tab[] = ['overview', 'company', 'countries', 'competitors'];
const LABEL: Record<Tab, string> = { overview: 'Overview', company: 'Company', countries: 'Countries', competitors: 'Competitors' };
const SOON = ['Target accounts', 'Contacts', 'Outreach drafts', 'Strategy and 90 days'];

export default function Shell({ id }: { id: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

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
  };
  const props = { st, post, run, busy, ro, go };

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
        {busy && <span className="busy">{busy}…</span>}
      </aside>
      <main className="work">
        {ro && <div className="note warn">You are looking at the finished Vobiz example. <Link href="/#start">Start your own plan</Link> to run the steps yourself.</div>}
        {err && <div className="note bad" role="alert">{err}</div>}
        {tab === 'overview' && <Overview {...props} />}
        {tab === 'company' && <CompanyView {...props} />}
        {tab === 'countries' && <CountriesView {...props} />}
        {tab === 'competitors' && <CompetitorsView {...props} />}
      </main>
    </div>
  );
}
