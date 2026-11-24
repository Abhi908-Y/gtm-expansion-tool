import { scrapeSite } from './scrape/site';

// usage: npm run scrape -- <url> [--pages N] [--no-reader] [--no-cache] [--json]
const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
if (!url) {
  console.error('usage: npm run scrape -- <url> [--pages N] [--no-reader] [--no-cache] [--json]');
  process.exit(1);
}
const pagesIdx = args.indexOf('--pages');
const site = await scrapeSite(url, {
  maxSubpages: pagesIdx >= 0 ? Number(args[pagesIdx + 1]) : 4,
  reader: !args.includes('--no-reader'),
  cache: !args.includes('--no-cache'),
});

if (args.includes('--json')) {
  console.log(JSON.stringify(site, null, 2));
} else {
  for (const p of site.pages) {
    console.log(`\n=== ${p.url}  [${p.via}, ${p.words} words]\n${p.title ?? '(no title)'}\n`);
    console.log(p.text.slice(0, 600) + (p.text.length > 600 ? ' …' : ''));
  }
  for (const f of site.failures) console.log(`\n!! ${f.code}: ${f.url}\n   ${f.detail}`);
}
process.exit(site.pages.length ? 0 : 2);
