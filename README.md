# GTM Expansion Tool

Plan which countries a company should enter first. Give it a company, its website and the regions you are considering. It screens every country, scores each one from public data, maps the competitors, and shows the source behind every figure so you can challenge it.

## What works today

| Step | What it does |
|---|---|
| Company profile | Reads the company's own pages and Google News. Gemini fills seven fields; a claim is kept only if its quote appears word for word on a page the tool read. |
| Country screening and scoring | Hard gates (comprehensive sanctions, FATF call-for-action list, your own legal and payment calls), then five weighted criteria: market size (IMF), AI use (Microsoft AI Diffusion, Eurostat), competition, ease of selling (EF English index, time difference, B2B rules) and partner base. Missing figures use the regional median and are flagged. |
| Competitor map | Classifies competitors as platform, telco, AI platform or wholesaler, with a quoted source for the type and for each country where they operate. Global or local is decided by code from that evidence. |

Not built yet: target accounts, contacts (Apollo), outreach drafts, region playbooks and the 90-day plan.

The finished Vobiz.ai example opens from the home page and costs nothing to view.

## Run it locally

```bash
npm install
cp .env.example .env     # then fill in GEMINI_API_KEY and GEMINI_MODEL
npm run dev              # http://localhost:3000
npm test
```

Plans are saved as JSON files under `data/plans/` while `DATABASE_URL` is empty.

Command-line helpers: `npm run scrape -- vobiz.ai` reads a site, `npm run research -- vobiz.ai --name Vobiz` builds a profile.

## Deploy

1. Create a Neon project and copy its connection string into `DATABASE_URL`.
2. Import the repository into Vercel and add `GEMINI_API_KEY`, `GEMINI_MODEL` and `DATABASE_URL`.
3. The `plans` table is created on first use.

## How it is built

Next.js (App Router) with TypeScript, Neon Postgres, Google Gemini. The scoring, gates and verdicts are plain functions in `src/screen`, so the same input always gives the same answer; the model only reads pages and writes text. Data loaders for each public source are in `src/data/sources.ts`.

## Things to know before sharing the link

- **There are no usage limits.** Every visitor's runs use the site owner's Gemini key. Add limits before the link spreads.
- **Plans belong to a browser.** There are no accounts. A secret cookie identifies the workspace, so clearing cookies loses access to saved plans.
- **The server fetches URLs that visitors type.** Requests to private or internal addresses are refused, including through redirects. The check does not pin the address to the connection, so a determined DNS-rebinding attack is not ruled out.
- **LinkedIn, Facebook, Instagram, X and TikTok are never scraped**, because their terms forbid it.
- **Default scoring bands are the tool's own.** The original Vobiz sheet's cut-offs were not available, so scores differ from it. The comparison table in the Vobiz example shows by how much.
- **Some inputs are judgement, not data**: B2B calling rules, competition, partner base outside Europe, and country readiness. They are entered by a person with a stated reason.
- Competitor "reach" shows what the pages the tool read prove. It is a floor, not the competitor's full coverage.
