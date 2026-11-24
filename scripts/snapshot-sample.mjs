// Rebuilds data/sample/vobiz.json (the read-only example visitors can open) from the local Vobiz run.
// Usage: node scripts/snapshot-sample.mjs   (after running screening, competitors and `npm run research -- vobiz.ai --name Vobiz`)
import { readFileSync, writeFileSync } from 'node:fs';

const project = JSON.parse(readFileSync('data/projects/vobiz.json', 'utf8'));
const read = (f) => JSON.parse(readFileSync(`out/vobiz.ai/${f}`, 'utf8'));
const pages = read('pages.json');
project.profile = {
  builtAt: new Date().toISOString(),
  pages: pages.pages.map((p) => ({ url: p.url, words: p.words, via: p.via })),
  failures: pages.failures.map((f) => `${f.code}: ${f.url}`),
  news: read('news.json'),
  profile: read('profile.json'),
};
delete project.warnings;
writeFileSync('data/sample/vobiz.json', JSON.stringify(project));
console.log('sample written:', project.competitors.filter((c) => c.analysedAt).length, 'competitors analysed');
