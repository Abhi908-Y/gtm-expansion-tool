// Builds the strategy part of the Vobiz example: one researched playbook per region, with the brief's default planning rates.
// Usage: npx tsx scripts/refresh-sample-strategy.ts   (needs GEMINI_API_KEY and GEMINI_MODEL in .env; takes about 5 minutes)
import { readFileSync, writeFileSync } from 'node:fs';
import { view } from '../src/actions';
import { baseFor } from '../src/outreach/pipeline';
import type { Project } from '../src/store';
import { runPlaybook } from '../src/strategy/playbook';
import { DEFAULTS, funnel } from '../src/strategy/strategy';

process.loadEnvFile('.env');
const FILE = 'data/sample/vobiz.json';
const p = JSON.parse(readFileSync(FILE, 'utf8')) as Project;
p.strategy = { assumptions: DEFAULTS, playbooks: {} };

for (const f of view(p).strategy.facts.filter((x) => x.byVerdict.length)) {
  console.log(f.name, '…');
  p.strategy.playbooks[f.name] = { ...(await runPlaybook(baseFor(p), f, p.outreach?.icp, funnel(DEFAULTS))), builtAt: new Date().toISOString() };
  writeFileSync(FILE, JSON.stringify(p));
}
console.log('DONE:', Object.keys(p.strategy.playbooks).join(', '));
