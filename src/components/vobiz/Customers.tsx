'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Crm, type Kind, type Lead, KIND_LABEL, REGIONS, normName } from '@/crm/model';
import { type Gmail, type Known, type Prefill, crmApi } from './api';
import CrmDesk from './CrmDesk';
import CrmSetup from './CrmSetup';

export type Account = { region: string; kind: Kind; sector: string; industry?: string; company: string; country: string; profile?: string; website?: string; signal: string; strength: 'high' | 'medium' | 'low' | 'gap'; strengthLabel: string; source: string; competitor?: string; tier?: string; sourceUrl?: string; quote?: string };
export type Gap = { region: string; industry: string; note: string };

const TONE = { high: 'good', medium: 'warn', low: '', gap: 'bad' } as const;
const RANK = { high: 0, medium: 1, low: 2, gap: 3 } as const;
const SOURCE_LABEL: Record<string, string> = { 'competitor-client': 'Competitor’s client', prospect: 'Prospect', 'partner-target': 'Partner target', 'apollo-list': 'Apollo list', 'project-notes': 'Project notes', tool: 'Found by the tool' };

/** People at a company: names match exactly or one starts with the other ("Kata.ai" and "Kata.ai Pte"). */
const sameCompany = (a: string, b: string) => {
  const x = normName(a);
  const y = normName(b);
  return !!x && !!y && (x === y || x.startsWith(y + ' ') || y.startsWith(x + ' '));
};

export default function Customers({ accounts, gaps, known }: { accounts: Account[]; gaps: Gap[]; known: Known }) {
  const [sub, setSub] = useState<'accounts' | 'crm' | 'setup'>('accounts');
  const [crm, setCrm] = useState<Crm | null>(null);
  const [gmail, setGmail] = useState<Gmail | null>(null);
  const [err, setErr] = useState('');
  const [company, setCompany] = useState('');
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [flag, setFlag] = useState('');

  const refresh = useCallback(async () => {
    const r = await crmApi('load');
    setCrm(r.crm);
    setGmail(r.gmail);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setErr(e.message));
    const g = new URLSearchParams(window.location.search).get('gmail');
    if (g) {
      setFlag(g);
      setSub('setup');
      history.replaceState(null, '', `${window.location.pathname}#customers`);
    }
  }, [refresh]);

  const openCrm = (c: string, p?: Prefill) => {
    setCompany(c);
    setPrefill(p ?? null);
    setSub('crm');
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="crm">
      <p className="hb-kicker" style={{ color: 'var(--muted)' }}>Step 4</p>
      <h1>Customer prospecting</h1>
      <p className="muted" style={{ maxWidth: 760 }}>Every region is split into two kinds of customer: voice AI companies and channel partners who resell or build on Vobiz, and industries and enterprises who call at scale. Then the people at those accounts, a day-by-day outreach sequence, and a tracker for everything you send.</p>
      <div className="crm-tabs" role="tablist">
        {([['accounts', 'Accounts by region'], ['crm', `Outreach CRM${crm ? ` (${crm.leads.length})` : ''}`], ['setup', 'Templates and Gmail']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={sub === id} className={`chip ${sub === id ? 'on' : ''}`} onClick={() => setSub(id)}>{label}</button>
        ))}
      </div>
      {err && <div className="note bad" role="alert">{err}</div>}
      {sub === 'accounts' && <Accounts accounts={accounts} gaps={gaps} leads={crm?.leads ?? []} onPeople={(c) => openCrm(c)} onAdd={(a) => openCrm('', { kind: a.kind, region: a.region, sector: a.sector, company: a.company, country: a.country, website: a.website })} />}
      {sub === 'crm' && (crm ? <CrmDesk crm={crm} gmail={gmail} known={known} reload={refresh} company={company} setCompany={setCompany} prefill={prefill} clearPrefill={() => setPrefill(null)} goSetup={() => setSub('setup')} /> : !err && <p className="busy">Loading your outreach list</p>)}
      {sub === 'setup' && (crm ? <CrmSetup crm={crm} gmail={gmail} reload={refresh} flag={flag} /> : !err && <p className="busy">Loading</p>)}
    </div>
  );
}

function Accounts({ accounts, gaps, leads, onPeople, onAdd }: { accounts: Account[]; gaps: Gap[]; leads: Lead[]; onPeople: (company: string) => void; onAdd: (a: Account) => void }) {
  const [region, setRegion] = useState<string>(REGIONS[0]);
  const peopleOf = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const a of accounts) m.set(a.company + a.region, leads.filter((l) => sameCompany(l.company, a.company)));
    return m;
  }, [accounts, leads]);
  const here = accounts.filter((a) => a.region === region || a.region === 'All regions');

  const section = (kind: Kind) => {
    const list = here.filter((a) => a.kind === kind);
    const groups = new Map<string, Account[]>();
    for (const a of [...list].sort((x, y) => RANK[x.strength] - RANK[y.strength] || x.company.localeCompare(y.company))) groups.set(a.sector || 'Other', [...(groups.get(a.sector || 'Other') ?? []), a]);
    const people = list.reduce((n, a) => n + (peopleOf.get(a.company + a.region)?.length ?? 0), 0);
    const gapsHere = kind === 'enterprise' ? gaps.filter((g) => g.region === region) : [];
    return (
      <div className="crm-sec">
        <h2>{KIND_LABEL[kind]}</h2>
        <p className="muted small">{list.length} accounts in {groups.size} {kind === 'partner' ? 'partner types' : 'sectors'} · {people} people in your CRM</p>
        {!list.length && <div className="note warn" style={{ marginTop: 8 }}>{kind === 'partner' ? `No partner companies are listed for ${region} yet. Add them from Apollo (company search) or the tool’s research, then import their contacts.` : `No enterprise accounts are listed for ${region} yet.`}</div>}
        {[...groups.entries()].map(([sector, rows]) => (
          <details className="crm-grp" key={sector} open={groups.size <= 3}>
            <summary><span>{sector}</span><span className="muted small">{rows.length}</span></summary>
            <div className="crm-scroll">
              <table>
                <thead><tr><th>Company</th><th>Country</th><th>{kind === 'partner' ? 'What they do and why they fit' : 'Signal'}</th><th>Strength</th><th>Source</th><th>People</th></tr></thead>
                <tbody>
                  {rows.map((a, i) => {
                    const ppl = peopleOf.get(a.company + a.region) ?? [];
                    return (
                      <tr key={a.company + i}>
                        <td>{a.website ? <a href={/^https?:/.test(a.website) ? a.website : `https://${a.website}`} target="_blank" rel="noopener noreferrer">{a.company}</a> : a.company}{a.tier && <span className="pill" style={{ marginLeft: 6 }}>Tier {a.tier}</span>}</td>
                        <td className="nw">{a.country || '–'}</td>
                        <td>{a.profile ? <>{a.profile}<br /><span className="muted">{a.signal}</span></> : a.signal}{a.quote && <div className="faint small">“{a.quote.slice(0, 140)}”{a.sourceUrl && <> · <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">source</a></>}</div>}</td>
                        <td className="nw"><span className={`pill ${TONE[a.strength]}`}>{a.strengthLabel}</span></td>
                        <td className="nw">{SOURCE_LABEL[a.source] ?? a.source}{a.competitor && <div className="faint small">{a.competitor}</div>}</td>
                        <td className="nw">{ppl.length ? <button className="btn link-like" onClick={() => onPeople(a.company)}>{ppl.length} {ppl.length === 1 ? 'person' : 'people'}</button> : <button className="btn link-like" onClick={() => onAdd(a)}>Add a person</button>}{ppl.length > 0 && <div className="faint small">{ppl.filter((p) => p.email && p.emailStatus === 'Verified').length} email-ready · {ppl.filter((p) => p.stage !== 'new').length} contacted</div>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {gapsHere.map((g, i) => <div key={i} className="note warn small" style={{ marginTop: 8 }}><b>Gap in {g.industry}:</b> {g.note}.</div>)}
      </div>
    );
  };

  return (
    <>
      <div className="chips crm-regions" role="tablist" aria-label="Region">
        {REGIONS.map((r) => <button key={r} role="tab" aria-selected={region === r} className={`chip ${region === r ? 'on' : ''}`} onClick={() => setRegion(r)}>{r}<span className="faint small"> {accounts.filter((a) => a.region === r).length}</span></button>)}
      </div>
      {section('partner')}
      {section('enterprise')}
      <p className="faint small" style={{ marginTop: 18 }}>Accounts come from the project research (23–27 November 2026, public sources) plus anything the tool found and verified itself, labelled “Found by the tool”. Competitor clients come from vendor marketing, so treat them as directional. People are added from your own Apollo exports in the Outreach CRM tab and stay in your browser’s workspace.</p>
    </>
  );
}

