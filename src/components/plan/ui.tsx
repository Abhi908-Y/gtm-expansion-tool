import type { Cell } from '@/screen/screen';

export function Bar({ value, max = 100 }: { value: number; max?: number }) {
  return (
    <div className="bar" aria-label={`${value.toFixed(1)} out of ${max}`}>
      <div className="track"><div className="fill" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} /></div>
      <b>{value.toFixed(1)}</b>
    </div>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Pill({ tone = '', children, title }: { tone?: string; children: React.ReactNode; title?: string }) {
  return <span className={`pill ${tone}`} title={title}>{children}</span>;
}

/** One scored figure: the 1–5 score, and the raw value linked to its source. Amber when estimated. */
export function Fig({ c }: { c?: Cell }) {
  if (!c) return <td />;
  return (
    <td className="num">
      <div className={`fig ${c.estimated ? 'est' : ''}`} title={c.note}>
        <b>{c.score % 1 ? c.score.toFixed(1) : c.score}</b>
        <small>
          {c.estimated ? 'estimate' : c.raw ? c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer">{c.raw}</a> : c.raw : 'no data'}
        </small>
      </div>
    </td>
  );
}

export function Empty({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card empty">
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  );
}
