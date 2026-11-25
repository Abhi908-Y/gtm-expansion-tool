'use client';
import type { Auto } from '../shared';

const ICON: Record<string, string> = { wait: '○', run: '◐', ok: '✓', skip: '–', fail: '!' };

export default function AutopilotCard({ auto, ai, complete }: { auto: Auto; ai: boolean; complete: boolean }) {
  const active = auto.phases.length > 0;
  if (complete && !auto.running && !active) return null;
  return (
    <section className="card" style={{ borderColor: 'var(--accent)' }}>
      <div className="card-head" style={{ marginBottom: active ? 10 : 0 }}>
        <div>
          <h2>{auto.running ? 'Researching everything…' : active ? 'Research finished' : 'Let the tool do the research'}</h2>
          <p className="muted small">
            {auto.running
              ? 'Keep this tab open. It takes about 15 minutes; results appear in each tab as they arrive.'
              : 'Screens the countries, reads the company, finds and analyses competitors, researches three target accounts with drafts, and writes a playbook per region.'}
          </p>
        </div>
        <div className="row">
          {auto.running ? <button className="btn" onClick={auto.stop}>Stop after this step</button> : <button className="btn primary" disabled={!ai} onClick={auto.start}>{active ? 'Run again for anything missing' : 'Research everything for me'}</button>}
        </div>
      </div>
      {!ai && <p className="note warn small">The AI steps are switched off on this site right now, so only the country screening can run.</p>}
      {active && (
        <ul className="checklist">
          {auto.phases.map((p) => (
            <li key={p.key} style={{ gridTemplateColumns: '22px 1fr' }}>
              <span className={`tick ${p.state === 'ok' ? 'done' : ''}`} style={p.state === 'fail' ? { background: 'var(--bad)', color: '#fff', borderColor: 'var(--bad)' } : p.state === 'run' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : p.state === 'skip' ? { color: 'var(--faint)' } : undefined} aria-label={p.state}>{ICON[p.state]}</span>
              <div>
                <span style={{ fontWeight: p.state === 'run' ? 600 : 400, color: p.state === 'wait' || p.state === 'skip' ? 'var(--faint)' : undefined }}>{p.label}</span>{' '}
                {p.state === 'run' && <span className="busy" />}
                {p.note && <span className={`small ${p.state === 'fail' ? '' : 'faint'}`} style={p.state === 'fail' ? { color: 'var(--bad)' } : undefined}> {p.note}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
