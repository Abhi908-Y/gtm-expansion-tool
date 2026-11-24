# Checks 1–3: results (24 Nov 2026)

**Verdict: none of the three pass yet.** Check 1 passes on the data we can look up, but not overall. Check 2 can't be run without information the brief doesn't contain. Check 3 fails as the gates are written. All three are fixable. Details below.

| Check | Result | One-line reason |
|---|---|---|
| 1. Scoring data coverage | **Partial** | 96% of the lookup-able cells are filled with a source. Only 62% of all scoring inputs have a public source |
| 2. Reproduce the Vobiz scores | **Blocked** | The 1–5 bands and the desk scores are not in the brief. A data-only proxy matches the section 8 ranking well in two regions and badly in one |
| 3. Gate reliability | **Fail as written** | The public lists catch 2 of the 5 known outs (Iran, Myanmar). Yemen, Russia and Belarus slip through |

---

## Check 1. Scoring data coverage

21 scored countries × 7 indicators = 147 cells.

| Indicator | Source | Filled | Notes |
|---|---|---|---|
| Market size (GDP 2026) | IMF WEO | 21/21 | Real IMF projections for every country. The "estimated GDP" gap in the brief is gone |
| AI adoption | Eurostat (Europe), Microsoft AI Diffusion (others) | 21/21 | UK is absent from Eurostat, so UK can only use the Microsoft measure (different unit). Eurostat measures % of firms; Microsoft measures % of working-age people, so the two can't be compared across regions |
| English level | EF EPI | 19/21 | Singapore excluded from EF since 2025 (now classed native English). UK not listed |
| Time overlap | Time zones | 21/21 | Computed, no lookup needed |
| Partner base (Europe only) | Eurostat ICT specialists | 9/10 | UK absent (Eurostat has no UK data) |
| Partner base (others) | none | 0/11 | Desk assessment, no public source |
| B2B calling and consent rules | national law | 0/21 | Judgement call, no data series |
| Competition | competitor research | 0/21 | Desk assessment, comes from M4 |

- **Lookup-able cells** (GDP, AI, English, Europe ICT): 70 of 73 filled = **96%** (pass).
- **All scoring inputs**: 91 of 147 = **62%** (below the 90% line). The gap is the three desk-judgement indicators.
- **Unverified items to fix before relying on them:**
  - Microsoft values for 19 countries are Q1 2026 figures from an Our World in Data mirror, not confirmed as Microsoft's own table. Only Singapore (64.3%) and UAE (73.3%) are confirmed for Q2 2026, from Microsoft's blog. The Q2 PDF could not be read as text.
  - EF values are the 2025 edition from Wikipedia. The 2026 edition exists on EF's site but I only reached 12 countries. Saudi Arabia (404) and Thailand (402) came from a truncated page and need a second look.

### Data table (as pulled)

| Country | Region | GDP 2026 $bn | AI adoption | EF EPI 2025 | ICT % jobs 2024 | Section 8 total |
|---|---|---|---|---|---|---|
| Singapore | SEA | 667.9 | 63.4% (Q2: 64.3%) | none | n/a | 81.0 |
| Philippines | SEA | 501.7 | 20.1% | 569 | n/a | 73.3 |
| Indonesia | SEA | 1,480.0 | 14.1% | 471 | n/a | 71.0 |
| Malaysia | SEA | 547.1 | 21.8% | 581 | n/a | 67.3 |
| Vietnam | SEA | 542.1 | 26.5% | 500 | n/a | 63.0 |
| Thailand | SEA | 599.1 | 12.4% | 402* | n/a | 60.7 |
| UAE | ME | 661.0 | 70.1% (Q2: 73.3%) | 487 | n/a | 77.0 |
| Saudi Arabia | ME | 1,343.3 | 29.4% | 404* | n/a | 70.0 |
| Turkey | ME | 1,818.0 | 17.4% | 488 | n/a | 68.0 |
| Israel | ME | 747.0 | 38.1% | 524 | n/a | 65.0 |
| Qatar | ME | 203.0 | 41.8% | 469 | n/a | 67.3 |
| Germany | EU | 5,471.3 | 25.97% of firms | 615 | 5.1 | 76.0 |
| UK | EU | 4,268.4 | 42.2% (people) | none | none | 72.0 |
| Netherlands | EU | 1,423.9 | 33.21% of firms | 624 | 7.0 | 72.0 |
| France | EU | 3,554.2 | 18.16% of firms | 539 | 4.8 | 66.3 |
| Italy | EU | 2,701.7 | 16.4% of firms | 513 | 4.0 | 56.3 |
| Sweden | EU | 745.1 | 35.04% of firms | 609 | 8.6 | 66.0 |
| Spain | EU | 2,085.3 | 20.27% of firms | 540 | 4.7 | 61.7 |
| Belgium | EU | 772.7 | 34.54% of firms | 608 | 5.7 | 61.7 |
| Austria | EU | 616.9 | 29.95% of firms | 616 | 5.3 | 59.0 |
| Finland | EU | 338.6 | 37.82% of firms | 603 | 7.8 | 55.7 |

\* low confidence, see above. AI for non-European countries is Q1 2026 working-age share. European firm figures are Eurostat 2025.

---

## Check 2. Reproducing the section 8 scores

**Can't be run properly.** Two things are missing from the brief:
1. **The bands.** "Convert each figure to 1–5 using fixed bands" is stated, but no cut-offs are given.
2. **The desk scores.** Competition (all countries), partner base outside Europe, and the B2B-rules part of Ease of selling were judged by hand. They are 15% + part of 15% + part of 20% of the total, and cannot be recomputed from any source.

**What I could test instead:** I built a data-only proxy (GDP, AI adoption, English, plus ICT in Europe, using the brief's weights) and compared its ranking inside each region with the section 8 totals.

| Region | Countries | Rank match (Spearman) | What differs |
|---|---|---|---|
| Southeast Asia | 6 | **0.83** | Proxy puts Indonesia and Malaysia above the Philippines |
| Middle East | 5 | **0.30** | Proxy puts Israel second; section 8 puts Saudi Arabia second. Desk scores matter most here |
| Europe | 10 | **0.71** | UK has no AI, English or ICT data, so the proxy rests on GDP alone |

This does not prove the method wrong. It shows the data alone explains the ranking well in SEA, moderately in Europe and poorly in the Middle East, where the hand-made scores carry most of the weight.

---

## Check 3. Gate reliability

Test: do the public lists catch the five countries that were gated out?

| Country | Gate used in the brief | OFAC says | FATF says | Caught automatically? |
|---|---|---|---|---|
| Iran | Sanctions | Comprehensive embargo | Call for action (countermeasures) | **Yes** |
| Myanmar | FATF blacklist | List-based ("Burma-related") | Call for action list, Oct 2026 (enhanced due diligence only) | **Yes**, on the FATF list |
| Yemen | Payments | List-based, last action Nov 2021 | Increased monitoring (grey), not blacklist; kept an earlier statement in Oct 2026 | **No** |
| Russia | Sanctions | Targeted and sectoral, comprehensive only for Crimea, DNR and LNR | not listed in the snippets I could read | **No** |
| Belarus | Sanctions | List-based | not listed in the snippets I could read | **No** |

**Why it fails:**
- The sanctions gate says "comprehensive sanctions bind the company". By OFAC's own definition only Iran (plus Cuba, North Korea and some Ukrainian regions) qualifies. Russia and Belarus are not comprehensive, so they would pass this gate.
- The payments gate says "FATF blacklist". Yemen is on the grey list, not the blacklist. Vietnam is on the same grey list yet scored 63.0 in section 8, so "grey list" can't be the rule either.
- The gate depends on where the company is incorporated. The brief's example is a US entity. Vobiz is based in Bengaluru, so OFAC does not bind it directly. The original reasoning for Russia and Belarus (secondary-sanctions risk, banking access, or EU and UK rules) isn't written down.

**Fix:** write the gate rules as explicit, testable lines. For example: (a) fails if the country is under comprehensive OFAC sanctions or UN sanctions; (b) fails if on the FATF call-for-action list; (c) fails if the human reviewer marks "no payment route", with a stored reason. Then re-test on these five.

**Limits of this test:** the FATF pages returned an access block, so I used search-result snippets for the October 2026 statement. The North Korea status and the full grey list were not read. I also did not check EU or UK sanctions lists.

---

## What unblocks checks 1–3

1. **The original Vobiz scoring sheet:** bands, plus the desk scores for competition, partner and B2B rules. This one item unblocks check 2 and most of check 1.
2. **A decision on the gate rules** (see check 3 fix), including why Russia and Belarus were out.
3. **A fallback for Singapore and UK** where an indicator doesn't exist (the brief's median rule works, but flag it).
4. **A text copy of the Microsoft Q2 table**, if you want Q2 figures instead of Q1.

## Sources

- IMF DataMapper API, NGDPD: https://www.imf.org/external/datamapper/api/v1/NGDPD
- Eurostat isoc_eb_ai (firms using AI) and isoc_sks_itspt (ICT specialists), via the Eurostat dissemination API
- [Microsoft: continued state of global AI diffusion, 2026](https://blogs.microsoft.com/on-the-issues/2026/09/21/the-continued-state-of-global-ai-diffusion-in-2026/)
- [Our World in Data: estimated share using generative AI](https://ourworldindata.org/grapher/estimated-share-people-generative-ai)
- [EF English Proficiency Index](https://www.ef.com/wwen/epi/) and [Wikipedia EF EPI table](https://en.wikipedia.org/wiki/EF_English_Proficiency_Index)
- [OFAC FAQ 10 (comprehensive sanctions)](https://ofac.treasury.gov/faqs/10) and OFAC program pages for Iran, Yemen, Russia, Belarus and Burma
- [FATF call for action, Oct 2026](https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/call-for-action-october-2026.html) and [FATF increased monitoring, Oct 2026](https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/increased-monitoring-october-2026.html) (read through search snippets only)
