// What the tool's own research found, shown under the matching page of the project artifact (which stays the main source).
import type { view } from '@/actions';
import { SampleButton } from '../NewPlan';

type St = ReturnType<typeof view>;
const Panel = ({ title, note, children }: { title: string; note: string; children: React.ReactNode }) => (
  <details className="hbt">
    <summary><span>{title}</span><span className="pill accent">Tool research</span></summary>
    <div className="hbt-body">
      <p className="muted small" style={{ marginBottom: 10 }}>{note}</p>
      {children}
    </div>
  </details>
);

export function RegionPanel({ st, region }: { st: St; region: string }) {
  const r = st.computed.regions.find((x) => x.name === region);
  if (!r) return null;
  const rows = [...r.countries].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  return (
    <Panel title={`${region}: how the tool scored it`} note="The tool scores every country on public data (market size, AI use, English, time zone, competitors) and shows its working. Its rubric differs from the manual one above, so use it as a second opinion, not a replacement.">
      <table>
        <thead><tr><th>Country</th><th>Score</th><th>Band</th><th>Verdict</th><th>Vobiz readiness</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.iso3}>
              <td>{c.name}</td>
              <td>{c.out ? 'Ruled out' : (c.total ?? '–')}</td>
              <td>{c.out ? '' : (c.priority ?? '')}</td>
              <td>{c.out ? c.gates.filter((g) => g.status === 'fail').map((g) => g.reason).join('; ') : (c.verdict ?? '')}</td>
              <td>{c.readiness}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export function CompetitorPanel({ st }: { st: St }) {
  const names = Object.fromEntries(st.computed.regions.flatMap((r) => r.countries.map((c) => [c.iso3, c.name])));
  const rows = (st.project.competitors ?? []).filter((c) => c.status === 'accepted');
  return (
    <Panel title={`Competitors the tool checked (${rows.length})`} note="Each competitor's own website was read. The type carries a verbatim quote from its page, and countries are listed only where a page showed them.">
      <table>
        <thead><tr><th>Competitor</th><th>Type</th><th>Countries with evidence</th><th>Proof</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.domain}>
              <td><a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer">{c.name}</a></td>
              <td>{c.type ?? ''}</td>
              <td>{Object.keys(c.presence ?? {}).map((i) => names[i] ?? i).join(', ') || '–'}</td>
              <td>{c.typeEvidence?.url ? <a href={c.typeEvidence.url} target="_blank" rel="noopener noreferrer">{(c.typeEvidence.quote ?? '').slice(0, 90)}</a> : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export function PlaybookPanel({ st }: { st: St }) {
  const books = Object.entries(st.strategy.playbooks ?? {}) as [string, any][];
  if (!books.length) return null;
  return (
    <Panel title="Playbooks the tool drafted" note="Written from the tool's own research, with every product claim limited to facts it verified. The research questions below are good prompts for the 30–40 research calls.">
      {books.map(([region, p]) => (
        <div key={region} style={{ marginBottom: 14 }}>
          <b>{region}</b>
          {p.positioning_hook?.hook && <p style={{ margin: '4px 0' }}>{p.positioning_hook.hook}</p>}
          <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
            {(p.research_focus ?? []).slice(0, 3).map((q: any, i: number) => <li key={i}>{q.question} <span className="muted">Ask: {q.who_to_ask}</span></li>)}
          </ul>
        </div>
      ))}
      <div className="row" style={{ marginTop: 6 }}>
        <span className="muted small">For the full working, with sources:</span> <SampleButton />
      </div>
    </Panel>
  );
}
