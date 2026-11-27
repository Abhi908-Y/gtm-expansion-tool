import { type Crm, dueDate, stageLabel } from '@/crm/model';
import { makeXlsx } from '../xlsx';

/** The whole outreach list as an Excel file: one sheet of people with where each stands, one of every logged action. */
export function trackerFile(crm: Crm) {
  const people = [['Region', 'Type', 'Sector', 'Company', 'Country', 'Name', 'Title', 'Email', 'Email status', 'LinkedIn', 'Phone', 'Stage', 'Sequence started', 'Steps done', 'Next step', 'Next step due', 'Follow up', 'Notes']];
  for (const l of crm.leads) {
    const steps = crm.sequences[l.kind];
    const next = l.startedAt ? steps.find((s) => !l.done[s.id]) : undefined;
    people.push([l.region, l.kind === 'partner' ? 'Voice AI / partner' : 'Enterprise', l.sector, l.company, l.country, l.name, l.title ?? '', l.email ?? '', l.emailStatus ?? '', l.linkedin ?? '', l.phone ?? '', stageLabel(l.stage), l.startedAt ?? '', steps.filter((s) => l.done[s.id]).map((s) => `${s.title} (${l.done[s.id].at.slice(0, 10)})`).join('; '), next?.title ?? '', next ? dueDate(l, next) : '', l.followUp ?? '', l.notes ?? '']);
  }
  const log = [['Date', 'Person', 'Company', 'Channel', 'What happened']];
  for (const l of crm.leads) for (const e of l.log) log.push([e.at.slice(0, 16).replace('T', ' '), l.name, l.company, e.channel, e.text]);
  log.sort((a, b) => (a[0] === 'Date' ? -1 : b[0] === 'Date' ? 1 : b[0].localeCompare(a[0])));
  return { name: `vobiz-outreach-tracker-${new Date().toLocaleDateString('en-CA')}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: makeXlsx([{ name: 'People', rows: people }, { name: 'Activity', rows: log }]) as string | Uint8Array };
}
