#!/usr/bin/env python3
"""Parse Google Timeline / Location History exports into travel.json."""

from __future__ import annotations

import json
import math
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

try:
    import reverse_geocoder as rg
except ImportError:
    rg = None  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "travel.json"

HOME_SWITCH = datetime(2022, 8, 2, tzinfo=timezone.utc)
TAIPEI = {"lat": 25.0330, "lng": 121.5654, "radius_km": 45}
NYC = {"lat": 40.7128, "lng": -74.0060, "radius_km": 55}
MIN_VISIT_HOURS = 3
SKIP_SEMANTIC = {"inferred home", "home", "inferred work", "work"}

CC_NAMES = {
    "AD": "Andorra", "AE": "United Arab Emirates", "AT": "Austria", "AU": "Australia",
    "BE": "Belgium", "BG": "Bulgaria", "CA": "Canada", "CH": "Switzerland", "CN": "China",
    "CZ": "Czech Republic", "DE": "Germany", "DK": "Denmark", "EE": "Estonia", "ES": "Spain",
    "FI": "Finland", "FR": "France", "GB": "United Kingdom", "GR": "Greece", "HK": "Hong Kong",
    "HR": "Croatia", "HU": "Hungary", "IE": "Ireland", "IS": "Iceland", "IT": "Italy",
    "JP": "Japan", "KR": "South Korea", "LT": "Lithuania", "LU": "Luxembourg", "LV": "Latvia",
    "MA": "Morocco", "MO": "Macau", "MX": "Mexico", "MY": "Malaysia", "NL": "Netherlands", "NO": "Norway",
    "PL": "Poland", "PT": "Portugal", "RO": "Romania", "RU": "Russia", "SE": "Sweden",
    "SG": "Singapore", "SI": "Slovenia", "SK": "Slovakia", "TH": "Thailand", "TR": "Turkey",
    "TW": "Taiwan", "US": "United States", "VN": "Vietnam",
}


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(value).astimezone(timezone.utc)
    except ValueError:
        return None


def coord_from_e7(e7: int | float | None) -> float | None:
    if e7 is None:
        return None
    return float(e7) / 1e7


def parse_geo_string(value: str | None) -> tuple[float, float] | None:
    if not value:
        return None
    if value.startswith("geo:"):
        value = value[4:]
    try:
        lat_s, lng_s = value.split(",", 1)
        return float(lat_s), float(lng_s)
    except (ValueError, AttributeError):
        return None


def is_at_base(lat: float, lng: float, when: datetime) -> bool:
    """True when visit is within the active home base for that date."""
    if when < HOME_SWITCH:
        return haversine_km(lat, lng, TAIPEI["lat"], TAIPEI["lng"]) <= TAIPEI["radius_km"]
    return haversine_km(lat, lng, NYC["lat"], NYC["lng"]) <= NYC["radius_km"]


def country_name(cc: str) -> str:
    return CC_NAMES.get(cc.upper(), cc.upper())


def normalize_city(name: str) -> str:
    name = re.sub(r"\s+", " ", name.strip())
    return name or "Unknown"


def city_key(city: str, country: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", f"{city}-{country}".lower()).strip("-")
    return slug or "unknown"


def load_records(source: Path) -> tuple[list[dict], str]:
    """Load timeline records from json / zip / directory."""

    def flatten(data) -> list[dict]:
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        if isinstance(data, dict):
            if "timelineObjects" in data:
                return data["timelineObjects"]
            return [data]
        return []

    records: list[dict] = []

    if source.is_file() and source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source) as zf:
            for name in zf.namelist():
                if not name.lower().endswith(".json"):
                    continue
                try:
                    data = json.loads(zf.read(name))
                except (json.JSONDecodeError, KeyError):
                    continue
                records.extend(flatten(data))
        return records, source.name

    if source.is_dir():
        for path in source.rglob("*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            records.extend(flatten(data))
        return records, source.name

    if source.is_file():
        data = json.loads(source.read_text(encoding="utf-8"))
        return flatten(data), source.name

    return [], source.name


def build_geocode_cache(coords: set[tuple[float, float]]) -> dict[tuple[float, float], dict]:
    cache: dict[tuple[float, float], dict] = {}
    if not coords:
        return cache
    if rg is None:
        for c in coords:
            cache[c] = {"city": "Unknown", "country": "Unknown", "cc": ""}
        return cache

    ordered = sorted(coords)
    results = rg.search(ordered, mode=1)
    for coord, res in zip(ordered, results):
        cache[coord] = {
            "city": normalize_city(res["name"]),
            "country": country_name(res["cc"]),
            "cc": res["cc"],
        }
    return cache


def extract_visits(records: list[dict]) -> list[dict]:
    raw: list[dict] = []
    coord_buckets: set[tuple[float, float]] = set()

    for record in records:
        # Google Maps location-history.json export
        if "visit" in record and "startTime" in record:
            v = record["visit"]
            if str(v.get("hierarchyLevel", "0")) != "0":
                continue
            tc = v.get("topCandidate") or {}
            semantic = (tc.get("semanticType") or "").lower()
            if semantic in SKIP_SEMANTIC:
                continue
            coords = parse_geo_string(tc.get("placeLocation"))
            if not coords:
                continue
            lat, lng = coords
            start = parse_ts(record.get("startTime"))
            end = parse_ts(record.get("endTime"))
            if not start:
                continue
            hours = (end - start).total_seconds() / 3600 if end else MIN_VISIT_HOURS
            bucket = (round(lat, 2), round(lng, 2))
            coord_buckets.add(bucket)
            raw.append(
                {
                    "lat": lat,
                    "lng": lng,
                    "bucket": bucket,
                    "start": start,
                    "end": end,
                    "hours": hours,
                    "semantic": semantic,
                    "source": "location-history",
                }
            )
            continue

        # Semantic Location History (monthly Takeout files)
        if "placeVisit" in record:
            pv = record["placeVisit"]
        elif "timelineObjects" not in record and record.get("placeVisit"):
            pv = record["placeVisit"]
        else:
            pv = None

        if pv:
            loc = pv.get("location", {})
            lat = coord_from_e7(loc.get("latitudeE7"))
            lng = coord_from_e7(loc.get("longitudeE7"))
            if lat is None or lng is None:
                continue
            start = parse_ts((pv.get("duration") or {}).get("startTimestamp"))
            end = parse_ts((pv.get("duration") or {}).get("endTimestamp"))
            if not start:
                continue
            hours = (end - start).total_seconds() / 3600 if end else MIN_VISIT_HOURS
            name = loc.get("name") or loc.get("address") or "Unknown"
            bucket = (round(lat, 2), round(lng, 2))
            coord_buckets.add(bucket)
            raw.append(
                {
                    "lat": lat,
                    "lng": lng,
                    "bucket": bucket,
                    "start": start,
                    "end": end,
                    "hours": hours,
                    "city": normalize_city(name.split(",")[0]),
                    "country": "Unknown",
                    "source": "semantic",
                }
            )

    geocode = build_geocode_cache(coord_buckets)
    visits: list[dict] = []

    for item in raw:
        if item.get("source") == "location-history":
            geo = geocode.get(item["bucket"], {"city": "Unknown", "country": "Unknown"})
            item["city"] = geo["city"]
            item["country"] = geo["country"]
        visits.append(item)

    visits.sort(key=lambda v: v["start"])
    return visits


def cluster_trips(visits: list[dict]) -> list[list[dict]]:
    """
    Trip = period away from home base.
    Starts when location leaves base; ends when location returns to base.
    """
    qualifying = [v for v in visits if v["hours"] >= MIN_VISIT_HOURS]
    qualifying.sort(key=lambda v: v["start"])

    trips: list[list[dict]] = []
    away = False
    current: list[dict] = []

    for v in qualifying:
        at_base = is_at_base(v["lat"], v["lng"], v["start"])

        if not away and not at_base:
            # Left home base → new trip begins
            away = True
            current = [v]
        elif away and at_base:
            # Returned home base → trip ends
            if current:
                trips.append(current)
            current = []
            away = False
        elif away and not at_base:
            # Still traveling
            current.append(v)
        # at base while not away: at home, not part of any trip

    if away and current:
        trips.append(current)

    return trips


def trip_title(start: datetime, end: datetime, countries: list[str]) -> str:
    year = start.year
    if start.year == end.year:
        dates = f"{start.strftime('%b %d')} - {end.strftime('%b %d')}"
    else:
        dates = f"{start.strftime('%b %d, %Y')} - {end.strftime('%b %d, %Y')}"
    region = "·".join(countries) if countries else "Unknown"
    return f"{year} ({dates}): {region}"


def build_output(visits: list[dict], source_note: str) -> dict:
    trips_raw = cluster_trips(visits)
    city_stats: dict[str, dict] = {}
    trips_out = []

    for idx, group in enumerate(trips_raw, start=1):
        trip_id = f"trip-{idx:03d}"
        cities_in_trip: dict[str, dict] = {}

        for v in group:
            ck = city_key(v["city"], v["country"])
            if ck not in cities_in_trip:
                cities_in_trip[ck] = v
            if ck not in city_stats:
                city_stats[ck] = {
                    "id": ck,
                    "city": v["city"],
                    "country": v["country"],
                    "lat": v["lat"],
                    "lng": v["lng"],
                    "visits": 0,
                    "firstVisit": v["start"].date().isoformat(),
                    "lastVisit": v["start"].date().isoformat(),
                    "tripIds": [],
                    "_coordSamples": 0,
                }
            d = v["start"].date().isoformat()
            if d < city_stats[ck]["firstVisit"]:
                city_stats[ck]["firstVisit"] = d
            if d > city_stats[ck]["lastVisit"]:
                city_stats[ck]["lastVisit"] = d
            n = city_stats[ck]["_coordSamples"] + 1
            city_stats[ck]["_coordSamples"] = n
            city_stats[ck]["lat"] = ((n - 1) * city_stats[ck]["lat"] + v["lat"]) / n
            city_stats[ck]["lng"] = ((n - 1) * city_stats[ck]["lng"] + v["lng"]) / n

        start = min(v["start"] for v in group)
        end = max((v.get("end") or v["start"]) for v in group)
        countries = sorted({v["country"] for v in group if v["country"] != "Unknown"})

        # Chronological route (dedupe consecutive same city) for map lines & card display
        route: list[dict] = []
        last_ck: str | None = None
        for v in sorted(group, key=lambda x: x["start"]):
            ck = city_key(v["city"], v["country"])
            if ck == last_ck:
                continue
            route.append(
                {
                    "cityId": ck,
                    "city": v["city"],
                    "country": v["country"],
                    "lat": round(v["lat"], 5),
                    "lng": round(v["lng"], 5),
                }
            )
            last_ck = ck

        # Each city counts once per trip, even if revisited within the journey.
        for ck in cities_in_trip:
            if trip_id not in city_stats[ck]["tripIds"]:
                city_stats[ck]["tripIds"].append(trip_id)
            city_stats[ck]["visits"] = len(city_stats[ck]["tripIds"])

        city_names = [r["city"] for r in route]
        city_ids = sorted(cities_in_trip.keys())

        trips_out.append(
            {
                "id": trip_id,
                "title": trip_title(start, end, countries),
                "startDate": start.date().isoformat(),
                "endDate": end.date().isoformat(),
                "cities": city_names,
                "countries": countries,
                "cityIds": city_ids,
                "route": route,
                "photos": [],
            }
        )

    total_trip_days = 0
    for c in city_stats.values():
        c["tripIds"] = sorted(set(c["tripIds"]))
        c["visits"] = len(c["tripIds"])
        c.pop("_coordSamples", None)
        c["lat"] = round(c["lat"], 5)
        c["lng"] = round(c["lng"], 5)

    for trip in trips_out:
        start_d = datetime.fromisoformat(trip["startDate"]).date()
        end_d = datetime.fromisoformat(trip["endDate"]).date()
        total_trip_days += (end_d - start_d).days + 1

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceNote": source_note,
        "homeBases": [
            {
                "id": "home-taipei",
                "city": "Taipei",
                "country": "Taiwan",
                "lat": TAIPEI["lat"],
                "lng": TAIPEI["lng"],
                "from": None,
                "to": "2022-08-01",
                "label": "Home base (until Aug 1, 2022)",
            },
            {
                "id": "home-nyc",
                "city": "New York City",
                "country": "United States",
                "lat": NYC["lat"],
                "lng": NYC["lng"],
                "from": HOME_SWITCH.date().isoformat(),
                "to": None,
                "label": "Home base (since Aug 2, 2022)",
            },
        ],
        "cities": sorted(city_stats.values(), key=lambda c: c["firstVisit"]),
        "trips": sorted(trips_out, key=lambda t: t["startDate"], reverse=True),
        "stats": {
            "totalTrips": len(trips_out),
            "totalTripDays": total_trip_days,
            "totalCities": len(city_stats),
            "totalCountries": len({c["country"] for c in city_stats.values() if c["country"] != "Unknown"}),
        },
    }


def main() -> int:
    default = Path("/Users/morris/Downloads/location-history.json")
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else default
    if not source.exists():
        print(f"Source not found: {source}", file=sys.stderr)
        return 1

    records, name = load_records(source)
    visits = extract_visits(records)

    if not visits:
        note = "No place visits found in export."
    else:
        note = f"Parsed {len(visits)} visits from {name}"

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    data = build_output(visits, note)
    OUTPUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(f"  Trips: {data['stats']['totalTrips']}, Cities: {data['stats']['totalCities']}, Countries: {data['stats']['totalCountries']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())