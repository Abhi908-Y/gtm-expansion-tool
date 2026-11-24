'use client';
import type { TabProps } from '../shared';
import { Empty, Pill } from './ui';

const LABELS: Record<string, string> = {
  what_they_sell: 'What they sell',
  who_they_sell_to: 'Who they sell to',
  pricing_model: 'Pricing model',
  differentiators: 'What sets them apart',
  current_customers: 'Customers, partners and integrations',
  countries_served: 'Countries served',
  team_and_stage: 'Team and stage',
};

export default function CompanyView({ st, post, run, busy, ro }: TabProps) {
  const p = st.project;
  const doc = p.profile;
  const build = (
    <button className="btn primary" disabled={!!busy || !st.gemini} onClick={() => run('Reading the company’s pages', () => post('profile'))}>
      {doc ? 'Rebuild profile' : 'Build profile'}
    </button>
  );
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Company</h1>
          <p className="muted">What {p.company} sells, to whom and where, read from {p.website} and the news.</p>
        </div>
        {!ro && doc && build}
      </div>
      {!st.gemini && <div className="note warn">The AI steps are switched off on this site right now.</div>}

      {!doc && (
        <Empty title="No profile yet" action={!ro && build}>
          The tool reads up to six pages of {p.website} and recent Google News, then fills seven fields. A fact is kept only if its quote appears word for word on a page it read. Takes about half a minute.
        </Empty>
      )}

      {doc && (
        <>
          <div className="row small muted">
            <Pill tone="good">{Object.values(doc.profile.fields).reduce((t, l) => t + l.length, 0)} facts kept</Pill>
            <Pill tone={doc.profile.dropped ? 'warn' : ''}>{doc.profile.dropped} dropped for lacking a quote</Pill>
            <span>{doc.pages.length} pages read · built {new Date(doc.builtAt).toLocaleDateString()}</span>
          </div>
          <div className="grid2">
            {Object.entries(doc.profile.fields).map(([k, claims]) => (
              <section className="card" key={k}>
                <h3 style={{ marginBottom: 4 }}>{LABELS[k] ?? k}</h3>
                {claims.length === 0 ? (
                  <p className="faint">Not stated on their pages or in the news.</p>
                ) : (
                  claims.map((c, i) => (
                    <div className="claim" key={i}>
                      {c.text}
                      <q>{c.quote}</q>
                      <span className="small">{c.url.startsWith('http') ? <a href={c.url} target="_blank" rel="noopener noreferrer">{new URL(c.url).pathname === '/' ? new URL(c.url).hostname : new URL(c.url).pathname}</a> : <span className="faint">Google News</span>}</span>
                    </div>
                  ))
                )}
              </section>
            ))}
            <section className="card">
              <h3 style={{ marginBottom: 8 }}>In the news</h3>
              {doc.news.length === 0 ? <p className="faint">No recent coverage found.</p> : (
                <ul className="out" style={{ paddingLeft: 16 }}>
                  {doc.news.slice(0, 8).map((n) => (
                    <li key={n.link}><a href={n.link} target="_blank" rel="noopener noreferrer">{n.title}</a> <span className="faint small">{n.published.slice(5, 16)}</span></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
