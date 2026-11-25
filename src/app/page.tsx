import Link from 'next/link';
import NewPlan, { SampleButton } from '@/components/NewPlan';
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
          <section className="card" id="start">
            <h2>Start a plan</h2>
            <p className="muted small" style={{ marginBottom: 14 }}>Takes a minute to set up. Nothing is shared: plans are saved to this browser.</p>
            <NewPlan />
          </section>
          <section className="card">
            <div className="card-head" style={{ marginBottom: 8 }}>
              <div>
                <h2>See a finished plan</h2>
                <p className="muted small">Vobiz.ai, an Indian telephony company for voice AI, across Southeast Asia, the Middle East and Europe.</p>
              </div>
              <SampleButton />
            </div>
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
