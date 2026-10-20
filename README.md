# StartupScout

A small startup-data pipeline: **Python scraper → pandas cleaning/dedupe → searchable web directory.**

**Problem.** Startup databases are only as good as their collection pipeline: fresh fields, a source for every value, no duplicates, and honest blanks. StartupScout does that end-to-end for ~55 Bengaluru tech companies using only their public homepages — and lets you point the same pipeline at your own seed list.

## Real use cases

- **Job-search shortlist** — star companies, leave notes (“ask Ravi for referral”), export a shortlist CSV with notes for your tracker.
- **Custom research set** — add seed URLs in the Collect page, download `my-seeds.csv`, run the scraper on your laptop, import `startups.json` or `raw.json` back into the directory. Browsers cannot scrape cross-origin; local Python is the supported path.
- **Pipeline audit** — insights page shows seed → dedupe → collected funnel, field fill rates, and pages blocked by robots.txt.

## Features

- `scraper/`: polite crawler (`python scrape.py [seeds.csv] [-o raw.json]`) + cleaner (`python clean.py [raw.json] [--out-dir ../public]`)
- Web directory: search, sector filters, careers filter, profiles with per-field sources
- **Collect page**: add seed URLs (localStorage), download seeds CSV, import scraper JSON
- Shortlist + notes in localStorage, **shortlist CSV export includes notes**
- Pipeline insights, loading/error/empty states, mobile layout
- Keys: `/` search · `c` collect · `g` insights · `s` shortlist · `Esc` back

## Tech

Python 3, requests, BeautifulSoup4, pandas · React 19 + TypeScript + Vite (static) · Playwright (`scripts/verify.mjs`)

## Run

```bash
cd scraper && pip install -r requirements.txt
python scrape.py seeds.csv -o raw.json
python clean.py raw.json --out-dir ../public
cd .. && npm install && npm run dev
```

Independent portfolio project, not affiliated with Tracxn or any listed company.

Built by Mohammed Jeelan · github.com/MohammadJeelan
