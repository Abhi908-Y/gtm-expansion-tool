// Builds the outreach part of the Vobiz example: ICP, then the full chain for one account from the ICP shortlist.
// Usage: npx tsx scripts/refresh-sample-outreach.ts   (needs GEMINI_API_KEY and GEMINI_MODEL in .env; takes about 6 minutes)
import { readFileSync, writeFileSync } from 'node:fs';
import { buildIcp, researchStep, STEPS } from '../src/outreach/pipeline';
import type { Project } from '../src/store';

process.loadEnvFile('.env');
const FILE = 'data/sample/vobiz.json';
const p = JSON.parse(readFileSync(FILE, 'utf8')) as Project;
p.outreach = { accounts: [] };

console.log('ICP…');
await buildIcp(p);
const pick = (p.outreach.icp?.candidates ?? [])[0];
if (!pick) throw new Error('The ICP returned no candidates');
p.outreach.accounts.push({ id: 'sample1', name: pick.name, source: 'icp', website: pick.website ?? undefined, region: pick.region, note: pick.why_fit, doNotUse: [] });
const acc = p.outreach.accounts[0];
for (const s of STEPS) {
  console.log(s, '…');
  await researchStep(p, acc, s);
  writeFileSync(FILE, JSON.stringify(p));
}
console.log('DONE:', acc.name, '| sources', acc.company?._sources?.length, '| drafts', acc.outreach?.per_person?.length);
