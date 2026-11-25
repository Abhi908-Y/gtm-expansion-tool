// What can be downloaded, built from the plan exactly as the screens show it.
import { contactRows } from '../outreach/export';
import { funnel, KPIS, toCsv, weeklyPlan } from '../strategy/strategy';
import { slugOf } from './download';
import type { State } from './shared';
import { makeXlsx, type Sheet } from './xlsx';

export type What = 'competitors' | 'countries' | 'contacts' | 'kpis' | 'everything';

export function sheetsFor(st: State, what: What): Sheet[] {
  const names = Object.fromEntries(st.computed.regions.flatMap((r) => r.countries.map((c) => [c.iso3, c.name])));
  const sheets: Record<Exclude<What, 'everything'>, () => Sheet> = {
    competitors: () => ({
      name: 'Competitors',
      rows: [
        ['Competitor', 'Website', 'Type', 'Role', 'Reach', 'Countries with evidence', 'Named customers', 'Type proof (quote)', 'Type proof (link)'],
        ...(st.project.competitors ?? []).filter((c) => c.status === 'accepted').map((c) => [c.name, c.domain, c.type ?? '', c.role ?? '', st.compete.rows.find((r) => r.domain === c.domain)?.reach ?? '', Object.keys(c.presence ?? {}).map((i) => names[i] ?? i).join('; '), (c.customers ?? []).map((x) => x.name).join('; '), c.typeEvidence?.quote ?? '', c.typeEvidence?.url ?? '']),
      ],
    }),
    countries: () => ({
      name: 'Countries',
      rows: [
        ['Region', 'Country', 'Status', 'Score', 'Priority', 'Verdict', 'Readiness', 'Demand', 'AI use', 'English', 'Time difference', 'Why ruled out'],
        ...st.computed.regions.flatMap((r) =>
          r.countries.map((c) => [r.name, c.name, c.out ? 'Ruled out' : 'Scored', c.total ?? '', c.priority ?? '', c.verdict ?? '', c.readiness, c.cells?.demand.raw ?? '', c.cells?.ai.raw ?? '', c.cells?.english.raw ?? '', c.cells?.time.raw ?? '', c.out ? c.gates.filter((g) => g.status === 'fail').map((g) => g.reason).join('; ') : '']),
        ),
      ],
    }),
    contacts: () => ({ name: 'Outreach contacts', rows: contactRows(st.outreach.accounts) }),
    kpis: () => ({ name: 'Weekly KPIs', rows: [['Week', 'Phase', ...KPIS.map((k) => k.label)], ...weeklyPlan(funnel(st.strategy.assumptions)).map((w) => [w.week, w.phase, ...KPIS.map((k) => w[k.key])])] }),
  };
  return what === 'everything' ? (Object.keys(sheets) as (keyof typeof sheets)[]).map((k) => sheets[k]()) : [sheets[what]()];
}

/** The file to save for a request: Excel by default, CSV for a single table. */
export function fileFor(st: State, what: What, format: 'xlsx' | 'csv') {
  const sheets = sheetsFor(st, what);
  const base = `${slugOf(st.project.company)}-${what}`;
  if (format === 'csv' && sheets.length === 1) return { name: `${base}.csv`, type: 'text/csv;charset=utf-8', data: '﻿' + toCsv(sheets[0].rows) as string | Uint8Array };
  return { name: `${base}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: makeXlsx(sheets) as string | Uint8Array };
}
