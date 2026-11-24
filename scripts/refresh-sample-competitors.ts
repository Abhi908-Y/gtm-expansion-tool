// Re-analyses every competitor in the Vobiz example with the current logic and saves the result.
// Usage: npx tsx scripts/refresh-sample-competitors.ts   (needs GEMINI_API_KEY and GEMINI_MODEL in .env; takes several minutes)
import { readFileSync, writeFileSync } from 'node:fs';
import { analyse, type Competitor } from '../src/compete/compete';
import { geminiJson } from '../src/research/gemini';
import { scrapeSite } from '../src/scrape/site';

process.loadEnvFile('.env');
const FILE = 'data/sample/vobiz.json';
const p = JSON.parse(readFileSync(FILE, 'utf8')) as { indicators: Record<string, { name: string }>; competitors: Competitor[] };
const countries = Object.entries(p.indicators).map(([iso3, d]) => ({ iso3, name: d.name }));
const emptyOnly = process.argv.includes('--empty'); // only competitors with no country evidence yet
const failedOnly = process.argv.includes('--failed'); // only competitors whose last run had page problems
const queue = p.competitors.map((_, i) => i).filter((i) => (!emptyOnly || !Object.keys(p.competitors[i].presence ?? {}).length) && (!failedOnly || (p.competitors[i].failures?.length ?? 0) > 0 || !p.competitors[i].analysedAt));
console.log('re-analysing', queue.length, 'competitors');
let done = 0;

async function worker() {
  for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
    const c = p.competitors[i];
    try {
      p.competitors[i] = await analyse(c, {
        company: 'Vobiz.ai',
        countries,
        ask: geminiJson,
        scrape: async (d) => {
          const s = await scrapeSite(d, { maxSubpages: 6, deep: true });
          return { pages: s.pages.map((x) => ({ url: x.url, text: x.text, full: x.full })), failures: s.failures.map((f) => `${f.code}: ${f.url} (${f.detail})`) };
        },
      });
    } catch (e) {
      console.log(c.name, 'ERROR', (e as Error).message);
    }
    const r = p.competitors[i];
    console.log(`${++done}/${p.competitors.length}`, c.name.padEnd(20), (r.type ?? '-').padEnd(12), 'countries', Object.keys(r.presence ?? {}).length, r.analysedAt ? '' : 'NOT ANALYSED');
    writeFileSync(FILE, JSON.stringify(p));
  }
}
await Promise.all([worker(), worker()]); // two at a time keeps DNS and the sites calm; each host is throttled separately
console.log('DONE');
