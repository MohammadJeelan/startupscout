# StartupScout scraper

Polite Python pipeline that turns a list of company homepages into a clean, deduplicated dataset.

```bash
pip install -r requirements.txt
python scrape.py seeds.csv -o raw.json          # seeds file is required-or-default
python scrape.py my-seeds.csv --out raw.json    # your own seeds from the web UI
python clean.py raw.json --out-dir ../public    # -> startups.json + dedupe_report.json
```

Then open the web app and either keep the bundled dataset, or **Import JSON** (startups.json or raw.json) from the Collect page.

**Why run it locally?** Browsers cannot scrape other companies' sites (CORS + no `robots.txt` check). The Python scraper is the supported path.

**What it collects** (only from each company's own public homepage): final URL / domain after redirects, `<title>`, meta/OG description, og:site_name, careers link, LinkedIn / X / GitHub / YouTube / Instagram links, public emails on the page, declared site generator.

**Rules**
- Checks `robots.txt` before every request
- ≥ 1.5 s between requests, 15 s timeout, honest User-Agent
- Every field stores the URL it was read from; missing fields stay blank

Seeds CSV columns: `name,url`.
