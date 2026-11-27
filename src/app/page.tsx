import Link from 'next/link';
import NewPlan from '@/components/NewPlan';
import { listPlans } from '@/db';
import { peekWorkspace } from '@/web';

export const dynamic = 'force-dynamic';

const STEPS: [string, string, boolean][] = [
  ['Company profile', 'Reads the company’s own pages and the news. Every fact carries a quote you can check.', true],
  ['Country screening', 'Removes sanctioned and blocked countries, then scores the rest on five criteria from public data.', true],
  ['Competitor map', 'Sorts rivals into platforms, telcos, AI platforms and wholesalers, with proof of where each operates.', true],
  ['Target accounts and outreach', 'An ideal-customer profile, researched accounts, named people, and drafts you review. Nothing is sent.', true],
  ['Strategy and a 90-day plan', 'Region order, target markets, a playbook per region and a week-by-week plan to first customers.', true],
  ['Verified contacts and Gmail drafts', 'Apollo contact data and drafts saved straight to Gmail.', false],
];

export default async function Home() {
  const ws = await peekWorkspace();
  const plans = ws ? await listPlans(ws) : [];
  return (
    <main className="landing">
      <div className="hero">
        <div>
          <span className="eyebrow">International go-to-market planning</span>
          <h1>Decide which countries to enter first.</h1>
          <p className="lede">Give it a company and the regions you are weighing. It screens every country, scores each one from public data, maps the competitors, and shows the source behind every number so you can challenge it.</p>
          <ol className="steps">
            {STEPS.map(([t, d, live], i) => (
              <li key={t}>
                <span className={`n ${live ? '' : 'soon'}`}>{i + 1}</span>
                <div><b>{t}{!live && <span className="pill" style={{ marginLeft: 8 }}>Coming next</span>}</b><span className="muted">{d}</span></div>
              </li>
            ))}
          </ol>
        </div>
        <div className="stack">
          <section className="card" style={{ borderColor: 'var(--accent)' }}>
            <div className="card-head" style={{ marginBottom: 8 }}><span className="pill accent">Pinned</span></div>
            <h2>Vobiz AI International Expansion Strategy</h2>
            <p className="muted small" style={{ margin: '6px 0 14px' }}>The live Vobiz workspace: manual research and the tool’s own, side by side, for Southeast Asia, the Middle East and Europe. Target accounts are split into voice AI partners and industries, with a trackable email, LinkedIn and WhatsApp outreach plan.</p>
            <Link href="/vobiz" className="btn primary">Open the Vobiz workspace</Link>
          </section>
          <section className="card" id="start">
            <h2>Start a plan</h2>
            <p className="muted small" style={{ marginBottom: 14 }}>Takes a minute to set up. Nothing is shared: plans are saved to this browser.</p>
            <NewPlan />
          </section>
          {plans.length > 0 && (
            <section className="card">
              <h2 style={{ marginBottom: 6 }}>Your plans</h2>
              <ul className="plans">
                {plans.map((p) => (
                  <li key={p.id}><Link href={`/p/${p.id}`}><span>{p.company}</span><span className="faint small">Open →</span></Link></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
