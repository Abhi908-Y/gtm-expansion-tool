'use client';
import { verdictTone, type TabProps } from '../shared';
import { Bar, Kpi, Pill } from './ui';

export default function Overview({ st, go }: TabProps) {
  const p = st.project;
  const regions = st.computed.regions;
  const all = regions.flatMap((r) => r.countries.map((c) => ({ ...c, region: r.name })));
  const scored = all.filter((c) => c.total != null).sort((a, b) => b.total! - a.total!);
  const out = all.filter((c) => c.out).length;
  const p1 = scored.filter((c) => c.priority === 'Priority 1').length;
  const beach = scored.filter((c) => c.verdict === 'Beachhead');
  const comps = st.compete.rows;
  const analysed = comps.filter((r) => r.analysed).length;
  const facts = p.profile ? Object.values(p.profile.profile.fields).reduce((t, l) => t + l.length, 0) : 0;
  const steps = [
    { done: !!p.profile, label: 'Build the company profile', hint: 'Reads their site and the news', tab: 'company' as const },
    { done: !!p.ranAt, label: 'Screen and score the countries', hint: `${all.length} countries in ${regions.length} region${regions.length === 1 ? '' : 's'}`, tab: 'countries' as const },
    { done: comps.length > 0 && analysed === comps.length, label: 'Map the competitors', hint: comps.length ? `${analysed} of ${comps.length} analysed` : 'Add a few, or find them with search', tab: 'competitors' as const },
    { done: st.outreach.accounts.some((a) => a.outreach), label: 'Research accounts and draft outreach', hint: st.outreach.accounts.length ? `${st.outreach.accounts.filter((a) => a.outreach).length} of ${st.outreach.accounts.length} accounts have drafts` : 'Build the ICP, then add accounts', tab: 'outreach' as const },
  ];

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Overview</h1>
          <p className="muted">{p.context || `Expansion plan for ${p.company}.`}</p>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Countries in play" value={scored.length || '–'} sub={p.ranAt ? `${out} ruled out by the gates` : 'Not screened yet'} />
        <Kpi label="Priority 1" value={p.ranAt ? p1 : '–'} sub="Score 70 or more" />
        <Kpi label="Beachheads" value={p.ranAt ? beach.length : '–'} sub={beach.length ? beach.slice(0, 3).map((c) => c.name).join(', ') : 'Strong score and ready to sell'} />
        <Kpi label="Lead region" value={<span style={{ fontSize: 20 }}>{p.ranAt && regions[0]?.avgTop != null ? regions[0].name : '–'}</span>} sub={p.ranAt && regions[0]?.avgTop != null ? `average ${regions[0].avgTop}` : undefined} />
        <Kpi label="Competitors mapped" value={comps.length ? `${analysed}/${comps.length}` : '–'} sub={`${comps.filter((r) => r.reach === 'Global').length} global`} />
        <Kpi label="Profile facts" value={p.profile ? facts : '–'} sub={p.profile ? 'each with a quote' : 'Not built yet'} />
      </div>

      <div className="grid2">
        <section className="card">
          <h2>Next steps</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>Each step works on its own; together they make the plan.</p>
          <ul className="checklist">
            {steps.map((s) => (
              <li key={s.label}>
                <span className={`tick ${s.done ? 'done' : ''}`} aria-label={s.done ? 'done' : 'to do'}>✓</span>
                <div><b>{s.label}</b><div className="faint small">{s.hint}</div></div>
                <button className="btn sm" onClick={() => go(s.tab)}>{s.done ? 'View' : 'Open'}</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Region order</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>By the average score of Priority 1 and 2 countries.</p>
          {p.ranAt ? (
            <div className="regions">
              {regions.map((r, i) => (
                <div className="region" key={r.name}>
                  <div className="pos">#{i + 1}</div>
                  <div className="nm">{r.name}</div>
                  <div className="muted small">avg {r.avgTop ?? 'n/a'} · {r.beachheads} beachhead{r.beachheads === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
          ) : <p className="faint">Appears after screening.</p>}
        </section>
      </div>

      {scored.length > 0 && (
        <section className="card">
          <div className="card-head">
            <div><h2>Top countries</h2><p className="muted small">Score out of 100, from five weighted criteria.</p></div>
            <button className="btn sm" onClick={() => go('countries')}>All countries →</button>
          </div>
          <ol className="rank">
            {scored.slice(0, 8).map((c, i) => (
              <li key={c.iso3}>
                <span className="i">{i + 1}</span>
                <div><span className="cname">{c.name}</span> <span className="faint small">{c.region}</span></div>
                <Bar value={c.total!} />
                <Pill tone={verdictTone(c.verdict)}>{c.verdict}</Pill>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
