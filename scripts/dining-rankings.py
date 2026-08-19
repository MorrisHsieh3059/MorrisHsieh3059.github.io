#!/usr/bin/env python3
"""Lookup / maintain the local dining award-list cache.

Michelin is live-checked (guide.michelin.com), not stored here.
Official lists live in components/dining/rankings/lists/ (rebuild via ingest).

  python3 scripts/dining-rankings-ingest.py
  python3 scripts/dining-rankings.py build
  python3 scripts/dining-rankings.py coverage
  python3 scripts/dining-rankings.py lookup "Coqodaq"
  python3 scripts/dining-rankings.py add --name X --list 50-best-restaurants \\
      --region "North America" --year 2026 --rank 24 --city "Washington, DC" --source URL
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "components" / "dining" / "rankings.json"
AWARD = ROOT / "components" / "dining" / "data" / "award.json"
LISTS_DIR = ROOT / "components" / "dining" / "rankings" / "lists"

# Closed set — must match ACCOLADE_LISTS in components/dining/dining.js
LIST_SLUGS = {
    "50-best-restaurants",
    "50-best-bars",
    "101-best-steakhouse",
    "101-best-burgers",
    "50-best-pizza",
    "nyt-100-best-restaurants",
    "oad-top-restaurants",
    "oad-casual",
    "oad-cheap-eats",
}

OFFICIAL_REGIONS = {
    "50-best-restaurants": {"world", "north america"},
    "50-best-bars": {"world", "north america", "europe", "new america"},
    "50-best-pizza": {"world", "north america", "europe", "usa"},
    "nyt-100-best-restaurants": {"new york"},
    "101-best-burgers": {"world"},
    "101-best-steakhouse": {"world"},
}

PUNCT_RE = re.compile(r"[^a-z0-9&']+")
AND_RE = re.compile(r"\s+&\s+")
SPACE_RE = re.compile(r"\s+")

ALIASES = {
    "sips guzzle": "sip guzzle",
    "bleecker": "bleecker burger",
    "bleeker burger": "bleecker burger",
    "casa mono": "casa mono bar jamon",
    "jungsik new york": "jungsik",
}


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.strip().lower()
    s = AND_RE.sub(" and ", s)
    s = PUNCT_RE.sub(" ", s)
    s = SPACE_RE.sub(" ", s).strip()
    s = s.replace(" and ", " ")
    return ALIASES.get(s, s)


def region_key(list_slug: str, region: str | None) -> str:
    r = (region or "").strip().lower()
    if list_slug == "50-best-bars" and r in {"new america", "north america"}:
        return "north america"
    if r in {"usa", "united states", "north america"} and list_slug == "50-best-pizza":
        return "north america"
    return r


def load_cache() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text())
    return {"updated": None, "entries": []}


def save_cache(data: dict) -> None:
    data["entries"].sort(
        key=lambda e: (
            e.get("list") or "",
            e.get("year") or 0,
            e.get("region") or "",
            e.get("rank") if isinstance(e.get("rank"), int) else 9999,
            e.get("name") or "",
        )
    )
    CACHE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def seed_entries() -> list[dict]:
    out = []
    if not LISTS_DIR.exists():
        return out
    for path in sorted(LISTS_DIR.glob("*.json")):
        if path.name == "manual.json":
            continue
        doc = json.loads(path.read_text())
        slug = doc.get("list") or ""
        region = doc.get("region")
        year = doc.get("year")
        source = doc.get("source") or path.name
        for row in doc.get("entries") or []:
            if not row.get("name"):
                continue
            out.append({
                "name": row["name"],
                "list": slug,
                "region": region,
                "year": year,
                "rank": row.get("rank"),
                "city": row.get("city"),
                "source": source,
            })
    manual = LISTS_DIR / "manual.json"
    if manual.exists():
        for row in json.loads(manual.read_text()).get("entries") or []:
            out.append(row)
    return out


def award_entries() -> list[dict]:
    if not AWARD.exists():
        return []
    visits = json.loads(AWARD.read_text())
    out = []
    for v in visits:
        name = v.get("name") or ""
        for a in v.get("accolades") or []:
            if not a or not a.get("list"):
                continue
            allowed = OFFICIAL_REGIONS.get(a["list"])
            if allowed and (a.get("region") or "").strip().lower() not in allowed:
                continue
            out.append({
                "name": name,
                "list": a["list"],
                "region": a.get("region"),
                "year": a.get("year"),
                "rank": a.get("rank"),
                "city": v.get("city"),
                "source": "award.json",
            })
    return out


def merge_entries(primary: list[dict], extra: list[dict]) -> list[dict]:
    """Keep the first row for each name+list+region+year (ignore rank in the key)."""
    seen = set()
    out = []
    for e in primary + extra:
        k = (
            norm(e.get("name") or ""),
            e.get("list") or "",
            region_key(e.get("list") or "", e.get("region")),
            int(e["year"]) if e.get("year") is not None else None,
        )
        if not k[0] or not k[1] or k in seen:
            continue
        seen.add(k)
        out.append(e)
    return out


def build() -> dict:
    from datetime import date
    entries = merge_entries(seed_entries(), award_entries())
    data = {"updated": date.today().isoformat(), "entries": entries}
    save_cache(data)
    print(f"wrote {CACHE.relative_to(ROOT)} ({len(entries)} entries)")
    return data


def lookup(query: str, data: dict | None = None) -> list[dict]:
    if data is None:
        data = load_cache() if CACHE.exists() else build()
    q = norm(query)
    hits = []
    for e in data.get("entries") or []:
        n = norm(e.get("name") or "")
        if n == q or (len(q) >= 4 and (q in n or n in q)):
            hits.append(e)
    hits.sort(key=lambda e: (e.get("list") or "", e.get("year") or 0, e.get("rank") or 0), reverse=True)
    return hits


def cmd_lookup(query: str) -> int:
    hits = lookup(query)
    if not hits:
        print(f"no cache hits for {query!r} — web-search official lists, then `add`")
        return 1
    print(json.dumps(hits, indent=2, ensure_ascii=False))
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    if args.list not in LIST_SLUGS:
        print(f"unknown list slug {args.list!r}; use one of: {sorted(LIST_SLUGS)}", file=sys.stderr)
        return 2
    LISTS_DIR.mkdir(parents=True, exist_ok=True)
    manual_path = LISTS_DIR / "manual.json"
    doc = json.loads(manual_path.read_text()) if manual_path.exists() else {"entries": []}
    row = {
        "name": args.name,
        "list": args.list,
        "region": args.region,
        "year": args.year,
        "rank": args.rank,
        "city": args.city,
        "source": args.source or "manual",
    }
    doc["entries"] = merge_entries([row], doc.get("entries") or [])
    manual_path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    build()
    print(json.dumps(row, indent=2, ensure_ascii=False))
    return 0


def cmd_coverage() -> int:
    data = load_cache() if CACHE.exists() else build()
    groups: dict[tuple, list] = defaultdict(list)
    for e in data.get("entries") or []:
        groups[(e.get("list"), e.get("region"), e.get("year"))].append(e)
    print(f"{'list':<28} {'region':<16} {'year':<6} {'n':>4}  ranks")
    for key, rows in sorted(groups.items(), key=lambda x: (x[0][0] or "", x[0][2] or 0, x[0][1] or "")):
        slug, region, year = key
        numbered = [e["rank"] for e in rows if isinstance(e.get("rank"), int)]
        unranked = sum(1 for e in rows if not isinstance(e.get("rank"), int))
        span = f"{min(numbered)}–{max(numbered)}" if numbered else "—"
        extra = f" +{unranked} unranked" if unranked else ""
        noc = sum(1 for e in rows if not e.get("city"))
        loc = f"  {noc} missing city" if noc else ""
        print(f"{slug or '':<28} {region or '':<16} {year or '':<6} {len(rows):>4}  {span}{extra}{loc}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("build", help="rebuild cache from rankings/lists + award.json")
    sub.add_parser("coverage", help="print cache completeness by list/region/year")

    lp = sub.add_parser("lookup", help="find a restaurant in the cache")
    lp.add_argument("name")

    ap = sub.add_parser("add", help="append an official ranking after a web check")
    ap.add_argument("--name", required=True)
    ap.add_argument("--list", required=True)
    ap.add_argument("--region", default=None)
    ap.add_argument("--year", type=int, default=None)
    ap.add_argument("--rank", type=int, default=None)
    ap.add_argument("--city", default=None)
    ap.add_argument("--source", default=None)

    args = p.parse_args()
    if args.cmd == "build":
        build()
        return 0
    if args.cmd == "coverage":
        return cmd_coverage()
    if args.cmd == "lookup":
        return cmd_lookup(args.name)
    if args.cmd == "add":
        return cmd_add(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
