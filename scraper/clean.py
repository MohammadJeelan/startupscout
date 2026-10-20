#!/usr/bin/env python3
"""Clean + dedupe raw.json -> startups.json (+ report + CSV).

Usage:
  python clean.py [raw.json] [--out-dir ../public]
"""
import argparse, json, re, html, sys
from pathlib import Path
import pandas as pd

TAGS = {
 "AI / ML": r"\bai\b|artificial intelligence|machine learning|\bllm|genai|generative|agent",
 "Security": r"secur|threat|compliance|soc ?2|iso 27001|fraud|privacy",
 "Fintech": r"payment|fintech|bank|lending|upi|credit|invoice|expense|kyc",
 "Logistics": r"logistic|shipping|shipment|supply chain|courier",
 "HR Tech": r"hiring|recruit|talent|interview|performance review|okr",
 "Data / Infra": r"data pipeline|etl|observability|monitor|cloud|devops|\bapi\b|database|lakehouse|testing",
 "SaaS / B2B": r"saas|b2b|enterprise|workflow|sales|marketing|crm|customer support|email",
 "Healthcare": r"health|medical|diagnos|patholog|brain|clinic",
 "Consumer": r"consumer|teen|creator|live streaming|social|shopping|e-?commerce",
 "EdTech": r"learn|education|course|students|tutor",
}

def clean_text(s):
    s = html.unescape(s or "")
    s = re.sub(r"\s+", " ", s).strip()
    return s

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("raw", nargs="?", default="raw.json", help="raw.json from scrape.py")
    ap.add_argument("--out-dir", default="../public", help="Directory for startups.json + dedupe_report.json")
    args = ap.parse_args(argv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = json.load(open(args.raw, encoding="utf-8"))
    rows = []
    for r in raw:
        f = r.get("fields") or {}
        g = lambda k: clean_text(f.get(k, {}).get("value", ""))
        rows.append({
            "name": r["name"], "seed_url": r["seed_url"], "status": r["status"], "error": r.get("error", ""),
            "scraped_at": r.get("scraped_at", ""),
            **{k: g(k) for k in [
                "domain", "final_url", "title", "description", "og_site_name", "careers_url",
                "linkedin", "twitter", "github", "youtube", "instagram", "public_emails", "site_generator",
            ]},
            "sources": {k: v["source"] for k, v in f.items() if isinstance(v, dict) and "source" in v},
        })
    df = pd.DataFrame(rows)
    df["domain_key"] = df["domain"].where(
        df["domain"] != "",
        df["seed_url"].str.replace(r"https?://(www\.)?", "", regex=True).str.strip("/"),
    )
    df["name_key"] = df["name"].str.lower().str.replace(r"[^a-z0-9]", "", regex=True)
    before = len(df)
    dupes = df[df.duplicated("domain_key", keep="first") | df.duplicated("name_key", keep="first")]
    df = df.drop_duplicates("domain_key").drop_duplicates("name_key")
    text = (df["title"] + " " + df["description"]).str.lower()
    df["tags_derived"] = text.apply(lambda t: [k for k, p in TAGS.items() if re.search(p, t)] if t.strip() else [])
    filled_cols = ["title", "description", "careers_url", "linkedin", "twitter", "github", "public_emails"]
    df["completeness"] = (df[filled_cols] != "").sum(axis=1) / len(filled_cols)
    report = {
        "input_rows": before,
        "after_dedupe": len(df),
        "duplicates_removed": dupes[["name", "domain_key"]].to_dict("records"),
        "failed": df[df.status != "ok"][["name", "seed_url", "error"]].to_dict("records"),
        "field_fill_rate": {c: round(float((df[c] != "").mean()), 3) for c in filled_cols},
        "generated_at": pd.Timestamp.now("UTC").isoformat(),
    }
    df.drop(columns=["domain_key", "name_key"]).to_json(out_dir / "startups.json", orient="records", indent=1)
    json.dump(report, open(out_dir / "dedupe_report.json", "w"), indent=1)
    df.drop(columns=["sources"]).to_csv("startups_clean.csv", index=False)
    print(json.dumps({k: report[k] for k in ["input_rows", "after_dedupe", "field_fill_rate"]}, indent=1), len(report["failed"]), "failed")

if __name__ == "__main__":
    main()
