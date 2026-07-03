#!/usr/bin/env python3
"""Parse Google Timeline / Location History exports into travel.json."""

from __future__ import annotations

import json
import math
import re
import sys
import zipfile
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "travel.json"

HOME_SWITCH = datetime(2022, 8, 1, tzinfo=timezone.utc)
TAIPEI = {"lat": 25.0330, "lng": 121.5654, "radius_km": 45}
NYC = {"lat": 40.7128, "lng": -74.0060, "radius_km": 55}
MIN_VISIT_HOURS = 4
MIN_TRIP_GAP_DAYS = 5


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


def is_home_visit(lat: float, lng: float, when: datetime) -> bool:
    if when < HOME_SWITCH:
        return haversine_km(lat, lng, TAIPEI["lat"], TAIPEI["lng"]) <= TAIPEI["radius_km"]
    return haversine_km(lat, lng, NYC["lat"], NYC["lng"]) <= NYC["radius_km"]


def normalize_city(name: str) -> str:
    name = re.sub(r"\s+", " ", name.strip())
    for suffix in (", Taiwan", ", TW", ", United States", ", USA", ", US", ", NY"):
        if name.endswith(suffix):
            name = name[: -len(suffix)].strip()
    return name


def city_key(city: str, country: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", f"{city}-{country}".lower()).strip("-")
    return slug or "unknown"


def load_json_files(source: Path) -> list[dict]:
    payloads: list[dict] = []

    def ingest(path: Path) -> None:
        if path.suffix.lower() != ".json":
            return
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return
        if isinstance(data, dict):
            payloads.append(data)
        elif isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    payloads.append(item)

    if source.is_file() and source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source) as zf:
            for name in zf.namelist():
                if not name.lower().endswith(".json"):
                    continue
                try:
                    data = json.loads(zf.read(name))
                except (json.JSONDecodeError, KeyError):
                    continue
                if isinstance(data, dict):
                    payloads.append(data)
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            payloads.append(item)
    elif source.is_dir():
        for path in source.rglob("*.json"):
            ingest(path)
    elif source.is_file():
        ingest(source)

    return payloads


def extract_visits(payloads: list[dict]) -> list[dict]:
    visits: list[dict] = []

    for payload in payloads:
        # Semantic Location History monthly files
        if "timelineObjects" in payload:
            for obj in payload.get("timelineObjects", []):
                pv = obj.get("placeVisit")
                if not pv:
                    continue
                loc = pv.get("location", {})
                lat = coord_from_e7(loc.get("latitudeE7"))
                lng = coord_from_e7(loc.get("longitudeE7"))
                if lat is None or lng is None:
                    continue
                start = parse_ts((pv.get("duration") or {}).get("startTimestamp"))
                end = parse_ts((pv.get("duration") or {}).get("endTimestamp"))
                if not start:
                    continue
                hours = 0.0
                if end:
                    hours = (end - start).total_seconds() / 3600
                name = loc.get("name") or loc.get("address") or "Unknown place"
                address = loc.get("address") or ""
                country = ""
                for part in address.split(","):
                    part = part.strip()
                    if len(part) == 2 and part.isalpha():
                        country = part
                visits.append(
                    {
                        "city": normalize_city(name.split(",")[0]),
                        "country": country or "Unknown",
                        "lat": lat,
                        "lng": lng,
                        "start": start,
                        "end": end,
                        "hours": hours,
                        "source": "semantic",
                    }
                )

        # Raw Records.json timeline edits / visits
        for key in ("visit", "placeVisit", "activity"):
            if key not in payload and "timelinePath" not in payload:
                continue
        if "visit" in payload:
            v = payload["visit"]
            hier = v.get("hierarchyLevel", 0)
            if hier != 0:
                continue
            tp = v.get("topCandidate") or {}
            lat = coord_from_e7((tp.get("placeLocation") or {}).get("latE7"))
            lng = coord_from_e7((tp.get("placeLocation") or {}).get("lngE7"))
            if lat is None or lng is None:
                continue
            start = parse_ts((v.get("time") or {}).get("range", {}).get("start"))
            end = parse_ts((v.get("time") or {}).get("range", {}).get("end"))
            if not start:
                continue
            hours = (end - start).total_seconds() / 3600 if end else MIN_VISIT_HOURS
            label = tp.get("label") or "Unknown place"
            visits.append(
                {
                    "city": normalize_city(label.split(",")[0]),
                    "country": "Unknown",
                    "lat": lat,
                    "lng": lng,
                    "start": start,
                    "end": end,
                    "hours": hours,
                    "source": "records",
                }
            )

    visits.sort(key=lambda v: v["start"])
    return visits


def cluster_trips(visits: list[dict]) -> list[list[dict]]:
    travel_visits = []
    for v in visits:
        if v["hours"] < MIN_VISIT_HOURS:
            continue
        if is_home_visit(v["lat"], v["lng"], v["start"]):
            continue
        travel_visits.append(v)

    if not travel_visits:
        return []

    trips: list[list[dict]] = []
    current = [travel_visits[0]]
    for v in travel_visits[1:]:
        prev = current[-1]
        gap_days = (v["start"] - (prev.get("end") or prev["start"])).days
        same_country = v["country"] == prev["country"] and v["country"] != "Unknown"
        if gap_days > MIN_TRIP_GAP_DAYS and not same_country:
            trips.append(current)
            current = [v]
        else:
            current.append(v)
    trips.append(current)
    return trips


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
                }
            city_stats[ck]["visits"] += 1
            city_stats[ck]["tripIds"].append(trip_id)
            if v["start"].date().isoformat() < city_stats[ck]["firstVisit"]:
                city_stats[ck]["firstVisit"] = v["start"].date().isoformat()
            if v["start"].date().isoformat() > city_stats[ck]["lastVisit"]:
                city_stats[ck]["lastVisit"] = v["start"].date().isoformat()
            # Average lat/lng across visits
            n = city_stats[ck]["visits"]
            city_stats[ck]["lat"] = ((n - 1) * city_stats[ck]["lat"] + v["lat"]) / n
            city_stats[ck]["lng"] = ((n - 1) * city_stats[ck]["lng"] + v["lng"]) / n

        start = min(v["start"] for v in group)
        end = max((v.get("end") or v["start"]) for v in group)
        countries = sorted({v["country"] for v in group if v["country"] != "Unknown"})
        city_names = sorted({v["city"] for v in group})
        title_bits = []
        if countries:
            title_bits.append(" · ".join(countries[:3]))
        title = f"Trip {start.strftime('%b %Y')}"
        if title_bits:
            title = f"{title_bits[0]} — {start.strftime('%b %d')}–{end.strftime('%b %d, %Y')}"

        trips_out.append(
            {
                "id": trip_id,
                "title": title,
                "startDate": start.date().isoformat(),
                "endDate": end.date().isoformat(),
                "cities": city_names,
                "countries": countries,
                "cityIds": sorted(cities_in_trip.keys()),
                "description": f"Visited {len(city_names)} cities across {len(countries) or 1} countr{'ies' if len(countries) != 1 else 'y'}.",
                "photos": [],
            }
        )

    # Deduplicate tripIds per city
    for c in city_stats.values():
        c["tripIds"] = sorted(set(c["tripIds"]))

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
                "to": HOME_SWITCH.date().isoformat(),
                "label": "Home base (until Aug 2022)",
            },
            {
                "id": "home-nyc",
                "city": "New York City",
                "country": "United States",
                "lat": NYC["lat"],
                "lng": NYC["lng"],
                "from": HOME_SWITCH.date().isoformat(),
                "to": None,
                "label": "Home base (since Aug 2022)",
            },
        ],
        "cities": sorted(city_stats.values(), key=lambda c: c["firstVisit"]),
        "trips": sorted(trips_out, key=lambda t: t["startDate"], reverse=True),
        "stats": {
            "totalTrips": len(trips_out),
            "totalCities": len(city_stats),
            "totalCountries": len({c["country"] for c in city_stats.values() if c["country"] != "Unknown"}),
        },
    }


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/Users/morris/Downloads/takeout-20260703T202550Z-3-001.zip")
    if not source.exists():
        print(f"Source not found: {source}", file=sys.stderr)
        return 1

    payloads = load_json_files(source)
    visits = extract_visits(payloads)

    if not visits:
        note = (
            "No place visits found in export. Google Takeout may only include Timeline settings "
            "when history is stored on-device. Export from Google Maps → Your Timeline → Settings → Export."
        )
    else:
        note = f"Parsed {len(visits)} visits from {source.name}"

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    data = build_output(visits, note)
    OUTPUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(f"  Trips: {data['stats']['totalTrips']}, Cities: {data['stats']['totalCities']}")
    if not visits:
        print(f"  Note: {note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())