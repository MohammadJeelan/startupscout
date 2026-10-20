#!/usr/bin/env python3
"""Polite homepage scraper. Usage:
  python scrape.py [seeds.csv] [-o raw.json]
  python scrape.py my-seeds.csv --out raw.json
"""
import argparse, csv, json, re, time, sys
from datetime import datetime, timezone
from urllib import robotparser
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

UA = "StartupScoutBot/1.0 (+https://github.com/MohammadJeelan; research; contact via GitHub)"
DELAY = 1.5
TIMEOUT = 15
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"})
_robots: dict[str, robotparser.RobotFileParser] = {}
_last = [0.0]


def allowed(url: str) -> bool:
    p = urlparse(url)
    base = f"{p.scheme}://{p.netloc}"
    if base not in _robots:
        rp = robotparser.RobotFileParser()
        try:
            r = S.get(base + "/robots.txt", timeout=TIMEOUT)
            rp.parse(r.text.splitlines() if r.status_code == 200 else [])
        except requests.RequestException:
            rp.parse([])
        _robots[base] = rp
    return _robots[base].can_fetch(UA, url)


def fetch(url: str):
    if not allowed(url):
        return None, "blocked by robots.txt"
    wait = DELAY - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    try:
        r = S.get(url, timeout=TIMEOUT, allow_redirects=True)
    except requests.RequestException as e:
        return None, type(e).__name__
    if r.status_code != 200 or "html" not in r.headers.get("content-type", ""):
        return None, f"HTTP {r.status_code}"
    return r, None


SOCIAL = {
    "linkedin": "linkedin.com/company",
    "twitter": ("twitter.com/", "x.com/"),
    "github": "github.com/",
    "youtube": "youtube.com/",
    "instagram": "instagram.com/",
}


def meta(soup, *names):
    for n in names:
        t = soup.find("meta", attrs={"name": n}) or soup.find("meta", attrs={"property": n})
        if t and t.get("content", "").strip():
            return t["content"].strip()
    return ""


def scrape(name: str, url: str):
    rec = {"name": name, "seed_url": url, "fields": {}, "status": "ok", "error": ""}

    def put(k, v, src):
        if v:
            rec["fields"][k] = {"value": v, "source": src}

    r, err = fetch(url)
    if not r:
        rec["status"], rec["error"] = "failed", err
        return rec
    final = r.url
    soup = BeautifulSoup(r.content, "html.parser")
    put("final_url", final, final)
    put("domain", urlparse(final).netloc.removeprefix("www."), final)
    put("title", soup.title.get_text(" ", strip=True) if soup.title else "", final)
    put("description", meta(soup, "description", "og:description", "twitter:description"), final)
    put("og_site_name", meta(soup, "og:site_name"), final)
    hrefs = [urljoin(final, a.get("href", "")) for a in soup.find_all("a", href=True)]
    for k, pat in SOCIAL.items():
        pats = pat if isinstance(pat, tuple) else (pat,)
        hit = next((h for h in hrefs if any(p in h for p in pats)), "")
        put(k, hit.split("?")[0], final)
    careers = next(
        (
            h
            for h, a in zip(hrefs, soup.find_all("a", href=True))
            if re.search(r"career|jobs|join[- ]?us|hiring", h + " " + a.get_text(" "), re.I)
            and urlparse(h).scheme.startswith("http")
        ),
        "",
    )
    put("careers_url", careers.split("?")[0], final)
    emails = sorted(
        {
            m.lower()
            for m in re.findall(
                r"[\w.+-]+@[\w-]+\.[\w.]+",
                soup.get_text(" ") + " " + " ".join(hrefs),
            )
            if not m.lower().endswith((".png", ".jpg", ".svg", ".webp"))
        }
    )
    put("public_emails", ", ".join(emails[:3]), final)
    gen = soup.find("meta", attrs={"name": "generator"})
    put("site_generator", gen.get("content", "") if gen else "", final)
    return rec


def main(argv=None):
    ap = argparse.ArgumentParser(description="Scrape public company homepages into raw.json")
    ap.add_argument(
        "seeds",
        nargs="?",
        default="seeds.csv",
        help="CSV with columns name,url (default: seeds.csv)",
    )
    ap.add_argument(
        "-o", "--out",
        default="raw.json",
        help="Output JSON path (default: raw.json)",
    )
    args = ap.parse_args(argv)

    try:
        with open(args.seeds, newline="", encoding="utf-8") as f:
            seeds = list(csv.DictReader(f))
    except FileNotFoundError:
        print(f"Seeds file not found: {args.seeds}", file=sys.stderr)
        sys.exit(1)

    if not seeds or "name" not in seeds[0] or "url" not in seeds[0]:
        print("Seeds CSV must have headers: name,url", file=sys.stderr)
        sys.exit(1)

    out = []
    for i, s in enumerate(seeds, 1):
        name, url = (s.get("name") or "").strip(), (s.get("url") or "").strip()
        if not name or not url:
            print(f"[{i}/{len(seeds)}] skip blank row", flush=True)
            continue
        rec = scrape(name, url)
        rec["scraped_at"] = datetime.now(timezone.utc).isoformat()
        print(
            f"[{i}/{len(seeds)}] {name}: {rec['status']} {rec['error']} ({len(rec['fields'])} fields)",
            flush=True,
        )
        out.append(rec)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(f"Wrote {len(out)} records → {args.out}", flush=True)


if __name__ == "__main__":
    main()
