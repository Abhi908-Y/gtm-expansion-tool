import { mkdir, writeFile } from 'node:fs/promises';
import { scrapeSite } from './scrape/site';
import { googleNews } from './research/news';
import { geminiConfigured } from './research/gemini';
import { buildProfile } from './research/profile';

// usage: npm run research -- <website> [--name "Company"] [--news "search words"]
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env yet */
}
const args = process.argv.slice(2);
const site0 = args.find((a) => !a.startsWith('--'));
const opt = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
if (!site0) {
  console.error('usage: npm run research -- <website> [--name "Company"] [--news "search words"]');
  process.exit(1);
}
const host = new URL(/^https?:\/\//.test(site0) ? site0 : `https://${site0}`).hostname.replace(/^www\./, '');
const name = opt('--name') ?? host.split('.')[0];
const out = `out/${host}`;
await mkdir(out, { recursive: true });

console.log(`1/3 Reading ${host} ...`);
const site = await scrapeSite(site0, { maxSubpages: 5 });
await writeFile(`${out}/pages.json`, JSON.stringify(site, null, 2));
console.log(`    ${site.pages.length} pages read, ${site.failures.length} failed`);
for (const f of site.failures) console.log(`    ${f.code}: ${f.url}`);

console.log('2/3 Searching Google News ...');
const news = await googleNews(opt('--news') ?? `"${name}"`).catch((e) => {
  console.log(`    news failed: ${e.message}`);
  return [];
});
await writeFile(`${out}/news.json`, JSON.stringify(news, null, 2));
for (const n of news.slice(0, 8)) console.log(`    - ${n.title} (${n.published.slice(0, 16)})`);

const missing = geminiConfigured();
if (missing) {
  console.log(`3/3 Profile skipped: ${missing}. Pages and news are saved in ${out}/.`);
  process.exit(0);
}
console.log('3/3 Building profile with Gemini ...');
const sources = [
  ...site.pages.map((p) => ({ url: p.url, text: p.text })),
  { url: 'news:google', text: news.map((n) => `${n.title} (${n.published})`).join('\n') },
];
const profile = await buildProfile(name, sources);
await writeFile(`${out}/profile.json`, JSON.stringify(profile, null, 2));
for (const [k, claims] of Object.entries(profile.fields)) {
  console.log(`\n${k}${claims.length ? '' : '  -> not stated'}`);
  for (const c of claims) console.log(`  - ${c.text}\n    "${c.quote.slice(0, 110)}" (${c.url})`);
}
console.log(`\n${profile.dropped} claim(s) dropped for lacking a verbatim quote. Saved ${out}/profile.json`);
