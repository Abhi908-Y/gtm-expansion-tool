# GTM Expansion Tool

**Live:** https://gtm-expansion-tool.vercel.app

Plan which countries a company should enter first. Give it a company, its website and the regions you are considering. It screens every country, scores each one from public data, maps the competitors, and shows the source behind every figure so you can challenge it.

## What works today

| Step | What it does |
|---|---|
| Company profile | Reads the company's own pages and Google News. Gemini fills seven fields; a claim is kept only if its quote appears word for word on a page the tool read. |
| Country screening and scoring | Hard gates (comprehensive sanctions, FATF call-for-action list, your own legal and payment calls), then five weighted criteria: market size (IMF), AI use (Microsoft AI Diffusion, Eurostat), competition, ease of selling (EF English index, time difference, B2B rules) and partner base. Missing figures use the regional median and are flagged. |
| Competitor map | Classifies competitors as platform, telco, AI platform or wholesaler, with a quoted source for the type and for each country where they operate. Global or local is decided by code from that evidence. |

| Outreach | Builds an ideal-customer profile from your plan, then for each target account researches the industry shift, the company and its trigger, and the buying committee with named people; grades its own research; and writes three emails and a LinkedIn sequence per person. Research is done with Google Search on and the sources it consulted are listed. Nothing is sent. |

| Strategy | Region order with reasons read from the data, target markets in entry order with competitors present, a researched playbook per region (research focus, lead segments, hook, rules with sources, channels, partners, working rhythm), and a 13-week plan: funnel worked backwards from the number of leads, weekly targets, CSV and print-to-PDF export. The funnel rates are the build brief's planning assumptions and are editable. |

| Research everything | One button (and automatic for a new plan) runs the whole pipeline: screening, company profile, competitor discovery and analysis, ICP, three target accounts with drafts, and a playbook per region, with live progress. Slow jobs run in parallel inside one request so saves never overwrite each other. The browser tab has to stay open; run it again to fill anything that is missing. |
| Ask AI | A chat that answers from the plan's own data and from notes you add (facts the research cannot find). Optionally searches the web for an answer and says so. |
| Voice | A mic button on the free-text fields uses the browser's speech recognition (Chrome, Edge, Safari). |

Not built yet: Apollo contacts and a Gmail drafts connection.

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

## How the outreach step decides what to trust

The model researches and writes; code decides what stands.

- A step that consulted no web sources cannot carry the label "verified".
- Emails are kept only if the company published them on its own pages (read through the robots-respecting scraper). LinkedIn links are kept only if they are real profile URLs.
- A separate grading pass removes research items that name no real source, and the drafting step never sees them.
- Email length, subject length, the 300-character LinkedIn limit and banned phrases are counted in code.
- Drafts may state only the product facts found, with quotes, on the company's own site.
- Draft quality is scored from the graded sentences, not from the grader's own totals.

The staging (ICP, industry, company, people, drafts, grading) follows the open-source [ares-brain](https://github.com/ashish1497/ares-brain) outreach agent, used with its owner's permission. Prompts and checks were rewritten for this tool.

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
