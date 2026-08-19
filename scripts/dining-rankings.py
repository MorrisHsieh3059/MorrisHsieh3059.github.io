#!/usr/bin/env python3
"""Lookup / maintain the local dining award-list cache.

Michelin is live-checked (guide.michelin.com), not stored here.

  python3 scripts/dining-rankings.py build
  python3 scripts/dining-rankings.py lookup "Coqodaq"
  python3 scripts/dining-rankings.py add --name X --list 50-best-restaurants \\
      --region "North America" --year 2026 --rank 24 --source URL
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "components" / "dining" / "rankings.json"
AWARD = ROOT / "components" / "dining" / "data" / "award.json"

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

PUNCT_RE = re.compile(r"[^a-z0-9& ]+")
AND_RE = re.compile(r"\s+&\s+")
SPACE_RE = re.compile(r"\s+")

# Official published lists (not derived city subsets). Expand via `add`.
SEED = [
    # North America's 50 Best Restaurants 2026
    # https://www.prnewswire.com/news-releases/smyth-in-chicago-is-named-no1-in-the-list-of-north-americas-50-best-restaurants-2026-302785274.html
    ("50-best-restaurants", "North America", 2026, [
        (1, "Smyth"), (2, "Eight"), (3, "Restaurant Pearl Morissette"),
        (4, "Dakar NOLA"), (5, "Mon Lapin"), (6, "Albi"), (7, "Atomix"),
        (8, "Quetzal"), (9, "Tanière3"), (10, "César"), (11, "Kalaya"),
        (12, "Le Veau d'Or"), (13, "Le Bernardin"), (14, "Kabawa"),
        (15, "Le Violon"), (16, "SingleThread"), (17, "Published on Main"),
        (18, "Jungsik"), (19, "Penny"), (20, "Emeril's"), (21, "Chubby Fish"),
        (22, "Saison"), (23, "Aska"), (24, "Moon Rabbit"), (25, "Edulis"),
        (26, "Holbox"), (27, "Beba"), (28, "Mhel"), (29, "Avize"),
        (30, "Acamaya"), (31, "Addison by William Bradley"), (32, "Providence"),
        (33, "Benu"), (34, "Sabayon"), (35, "AnnaLena"), (36, "Corima"),
        (37, "Dōgon by Kwame Onwuachi"), (38, "Torrisi"),
        (39, "Tatiana by Kwame Onwuachi"), (40, "Friday Saturday Sunday"),
        (41, "Semma"), (42, "Pascual"), (43, "Gramercy Tavern"),
        (44, "Atelier Crenn"), (45, "Sons & Daughters"), (46, "Somni"),
        (47, "Wild Blue"), (48, "The Pine"), (49, "Kato"), (50, "Diane's Place"),
    ]),
    # World's 50 Best Restaurants 2025
    # https://www.finedininglovers.com/explore/articles/worlds-50-best-restaurants-2025-full-list
    ("50-best-restaurants", "World", 2025, [
        (1, "Maido"), (2, "Asador Etxebarri"), (3, "Quintonil"), (4, "DiverXO"),
        (5, "Alchemist"), (6, "Gaggan"), (7, "Sézanne"), (8, "Table by Bruno Verjus"),
        (9, "Kjolle"), (10, "Don Julio"), (11, "Wing"), (12, "Atomix"),
        (13, "Potong"), (14, "Plénitude"), (15, "Ikoyi"), (16, "Lido 84"),
        (17, "Sorn"), (18, "Reale"), (19, "The Chairman"),
        (20, "Atelier Moessmer Norbert Niederkofler"), (21, "Narisawa"),
        (22, "Sühring"), (23, "Boragó"), (24, "Elkano"), (25, "Odette"),
        (26, "Mérito"), (27, "Trèsind Studio"), (28, "Lasai"), (29, "Mingles"),
        (30, "Le Du"), (31, "Le Calandre"), (32, "Piazza Duomo"),
        (33, "Steirereck"), (34, "Enigma"), (35, "Nusara"), (36, "Florilège"),
        (37, "Orfali Bros Bistro"), (38, "Frantzén"), (39, "Mayta"),
        (40, "Septime"), (41, "Kadeau"), (42, "Belcanto"), (43, "Uliassi"),
        (44, "La Cime"), (45, "Arpège"), (46, "Rosetta"), (47, "Vyn"),
        (48, "Celele"), (49, "Kol"), (50, "Restaurant Jan"),
    ]),
    # North America's 50 Best Bars 2026 (site list 1–50)
    # https://www.theworlds50best.com/bars/best-in-north-america/lists/1-50
    ("50-best-bars", "North America", 2026, [
        (1, "Sip & Guzzle"), (2, "Bar Mauro"), (3, "Bar Snack"), (4, "Schmuck"),
        (5, "Tlecān"), (6, "Jewel of the South"), (7, "The Keefer Bar"),
        (8, "Bar Pompette"), (9, "Superbueno"), (10, "El Gallo Altanero"),
        (11, "Kumiko"), (12, "Handshake Speakeasy"), (13, "Form + Matter"),
        (14, "True Laurel"), (15, "Clemente Bar"), (16, "Best Intentions"),
        (17, "June on Cambie"), (18, "Mecenas"), (19, "Library Bar"),
        (20, "Licorería Limantour"), (21, "Cure"), (22, "Mother"),
        (23, "Martiny's"), (24, "Bekeb"), (25, "Kaito del Valle"),
        (26, "La Factoría"), (27, "Gus' Sip & Dip"), (28, "Mírate"),
        (29, "Civil Works"), (30, "Bisous"), (31, "Angel's Share"),
        (32, "Prophecy"), (33, "Overstory"), (34, "Press Club"),
        (35, "Double Chicken Please"), (36, "Bar Madonna"), (37, "Attaboy"),
        (38, "Botanist Bar"), (39, "Service Bar"), (40, "Maison Premiere"),
        (41, "Pacific Cocktail Haven"), (42, "Café La Trova"), (43, "Selva"),
        (44, "Daisy Margarita Bar"), (45, "Employees Only"), (46, "Viceversa"),
        (47, "Bandista"), (48, "Baltra Bar"), (49, "Library by the Sea"),
        (50, "Bon Vivants"),
    ]),
    # World's 101 Best Burgers 2026, top 30
    # https://www.timeout.com/news/the-best-burger-places-on-the-planet-have-been-ranked-heres-the-top-30-061826
    ("101-best-burgers", "World", 2026, [
        (1, "Bleecker Burger"), (2, "Black Bear Burger"), (3, "Café Margaret"),
        (4, "The Diplomat"), (5, "Gasoline Grill"), (6, "Sip & Guzzle"),
        (7, "Hawksmoor St Pancras"), (8, "Nowon"), (9, "Amboy Quality Meats"),
        (10, "The Grill at the International"), (11, "Burger & Beyond"),
        (12, "Wagyumafia"), (13, "Charrd"), (14, "Will's"), (15, "Camphor"),
        (16, "Hubert"), (17, "Bar Julius"), (18, "AG"), (19, "The Gidley"),
        (20, "Salt Shed"), (21, "Clam Bar"), (22, "The Loyalist"),
        (23, "Bunsen Burgers"), (24, "Bar Chimera"), (25, "The Alston"),
        (26, "Dumbo"), (27, "Reburger"), (28, "Meat Stop"),
        (29, "Dandelion Burger"), (30, "Gui's Burger"),
    ]),
    # 50 Top Pizza Europa 2026, top 20 (auto-qualify for World)
    # https://www.50toppizza.it/50-top-pizza-europa-2026-napoli-on-the-road-in-london-is-the-best-pizzeria-in-europe-for-2026/
    ("50-best-pizza", "Europe", 2026, [
        (1, "Napoli on the Road"), (2, "Baldoria"), (3, "IMperfetto"),
        (4, "50 Kalò"), (5, "Sartoria Panatieri"), (6, "Pizza Zulu"),
        (7, "nNea"), (8, "Sapori Italiani U Taliana"), (9, "Forno d'Oro"),
        (10, "Via Toledo"), (11, "Fratelli Figurato"), (12, "Surt"),
        (13, "Stile Napoletano"), (14, "Oura"), (15, "La Piola Pizza"),
        (16, "Demaio"), (17, "Balmesina"), (18, "Zielona Górka"),
        (19, "Matto Napoletano"), (20, "Franko's Pizza & Bar"),
    ]),
    # 50 Top Pizza USA 2026, top 15
    # https://www.50toppizza.it/50-top-pizza-usa-2026-una-pizza-napoletana-in-new-york-is-the-best-pizzeria-in-the-usa-for-2026/
    ("50-best-pizza", "North America", 2026, [
        (1, "Una Pizza Napoletana"), (2, "Pizzeria Sei"),
        (2, "Tony's Pizza Napoletana"), (3, "Razza"), (4, "Truly Pizza"),
        (5, "Francesco Martucci"), (6, "Don Antonio"), (7, "Jay's"),
        (8, "Ribalta"), (8, "Robert's"), (9, "Leña"),
        (10, "Ken's Artisan Pizza"), (11, "La Leggenda"), (11, "'O Munaciello"),
        (12, "Valentina"), (13, "Stretch Pizza"), (14, "Audace"),
        (15, "Pasquale's"), (15, "Pizza Secret"),
    ]),
]


ALIASES = {
    "sips guzzle": "sip guzzle",
    "bleecker": "bleecker burger",
    "bleeker burger": "bleecker burger",
}


def norm(name: str) -> str:
    s = name.strip().lower()
    s = AND_RE.sub(" and ", s)
    s = PUNCT_RE.sub(" ", s)
    s = SPACE_RE.sub(" ", s).strip()
    s = s.replace(" and ", " ")
    for suffix in (" restaurant", " bar", " pizzeria"):
        if s.endswith(suffix):
            s = s[: -len(suffix)].strip()
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
    for slug, region, year, rows in SEED:
        for rank, name in rows:
            out.append({
                "name": name,
                "list": slug,
                "region": region,
                "year": year,
                "rank": rank,
                "source": "seed",
            })
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
    data = load_cache() if CACHE.exists() else build()
    row = {
        "name": args.name,
        "list": args.list,
        "region": args.region,
        "year": args.year,
        "rank": args.rank,
        "source": args.source or "manual",
    }
    data["entries"] = merge_entries([row], data["entries"])
    save_cache(data)
    print(json.dumps(row, indent=2, ensure_ascii=False))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("build", help="rebuild cache from seed lists + award.json")

    lp = sub.add_parser("lookup", help="find a restaurant in the cache")
    lp.add_argument("name")

    ap = sub.add_parser("add", help="append an official ranking after a web check")
    ap.add_argument("--name", required=True)
    ap.add_argument("--list", required=True)
    ap.add_argument("--region", default=None)
    ap.add_argument("--year", type=int, default=None)
    ap.add_argument("--rank", type=int, default=None)
    ap.add_argument("--source", default=None)

    args = p.parse_args()
    if args.cmd == "build":
        build()
        return 0
    if args.cmd == "lookup":
        return cmd_lookup(args.name)
    if args.cmd == "add":
        return cmd_add(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
