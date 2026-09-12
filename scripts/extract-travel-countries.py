#!/usr/bin/env python3
"""Build a compact GeoJSON of countries Morris has actually visited.

Reads travel.json + hotel-visits.json, matches Natural Earth admin-0
polygons (10m, so the fill follows the coastline instead of a coarse
110m outline), and writes components/travel/data/countries.geojson.

Source (downloaded to cache/ if missing):
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRAVEL_DATA = ROOT / "components" / "travel" / "data"
OUT = TRAVEL_DATA / "countries.geojson"
CACHE = ROOT / "cache" / "ne_10m_admin_0_countries.geojson"
SOURCE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_10m_admin_0_countries.geojson"
)

# Site country string -> Natural Earth ADMIN / NAME / NAME_LONG values.
ALIASES = {
    "United States": ["United States of America", "United States"],
    "Czech Republic": ["Czechia", "Czech Republic"],
    "South Korea": ["South Korea", "Republic of Korea"],
    "Russia": ["Russia", "Russian Federation"],
}

NAME_FIELDS = ("ADMIN", "NAME", "NAME_LONG", "NAME_EN", "GEOUNIT")


def site_countries() -> set[str]:
    travel = json.loads((TRAVEL_DATA / "travel.json").read_text())
    hotels = json.loads((TRAVEL_DATA / "hotels.json").read_text())
    visits = json.loads((TRAVEL_DATA / "hotel-visits.json").read_text())
    hotel_by_id = {h["id"]: h for h in hotels}

    names: set[str] = set()
    for city in travel.get("cities") or []:
        if city.get("country"):
            names.add(city["country"])
    for home in travel.get("homeBases") or []:
        if home.get("country"):
            names.add(home["country"])
    for visit in visits:
        hotel = hotel_by_id.get(visit.get("hotelId"))
        if hotel and hotel.get("country"):
            names.add(hotel["country"])
    return names


def match_keys(name: str) -> set[str]:
    keys = set(ALIASES.get(name, [name]))
    keys.add(name)
    return {k.lower() for k in keys}


def load_source() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text())
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {SOURCE_URL}", file=sys.stderr)
    urllib.request.urlretrieve(SOURCE_URL, CACHE)
    return json.loads(CACHE.read_text())


def extract(source: dict, names: set[str]) -> dict:
    wanted = {name: match_keys(name) for name in names}
    used: set[str] = set()
    features = []

    for feat in source.get("features") or []:
        props = feat.get("properties") or {}
        candidates = {str(props.get(field) or "").lower() for field in NAME_FIELDS}
        for site_name, keys in wanted.items():
            if not (keys & candidates):
                continue
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "name": site_name,
                        "iso": props.get("ADM0_A3") or props.get("ISO_A3"),
                    },
                    "geometry": feat.get("geometry"),
                }
            )
            used.add(site_name)
            break

    missing = sorted(names - used)
    if missing:
        raise SystemExit("No Natural Earth match for: " + ", ".join(missing))

    features.sort(key=lambda f: f["properties"]["name"])
    return {"type": "FeatureCollection", "features": features}


def main() -> None:
    names = site_countries()
    collection = extract(load_source(), names)
    OUT.write_text(json.dumps(collection, separators=(",", ":")))
    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"Wrote {OUT.relative_to(ROOT)} ({len(collection['features'])} countries, {size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
