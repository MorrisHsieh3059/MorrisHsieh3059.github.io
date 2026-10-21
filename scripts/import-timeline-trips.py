#!/usr/bin/env python3
"""Merge an on-device Google Timeline export into travel.json.

The Maps app export (Timeline.json) is a JSON array of segments with
visit / activity / timelinePath, ``geo:lat,lng`` strings, and timestamps
that include the phone's local offset. It only covers a recent window, so
this script adds trips that are not already in
``components/travel/data/travel.json``. It does not replace that file.

``parse-timeline.py`` is the full-history rebuild. It keeps stays of at
least 3 hours and stores UTC dates. A weekend away is mostly shorter
stops, and UTC would move a late-evening stay onto the next day. This
importer keeps every place visit outside the home radius (at least 10
minutes) and uses the local calendar date on the timestamp.

Cities come from those place visits via the same offline geocoder. Activity
segments and timelinePath points are transit, not stops, so a flight
through an airport is not listed unless a place visit was recorded there.

Do not commit the export. It is private location data.

Usage:
    python3 scripts/import-timeline-trips.py /path/to/Timeline.json
    python3 scripts/import-timeline-trips.py /path/to/Timeline.json --write
"""

from __future__ import annotations

import argparse
import contextlib
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRAVEL_JSON = ROOT / "components" / "travel" / "data" / "travel.json"
PARSER_PATH = ROOT / "components" / "travel" / "scripts" / "parse-timeline.py"

# Drop doorway-length pings. Shorter than the full-history parser's 3-hour
# cut so a day of city stops still counts.
MIN_VISIT_HOURS = 1 / 6
# Printed for context, not turned into trips. Inside the home radius.
NEAR_MISS_KM = 30


def load_parser():
    spec = importlib.util.spec_from_file_location("parse_timeline", PARSER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {PARSER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_local(value: str | None) -> datetime | None:
    """Keep the offset in the export so the calendar date stays local."""
    if not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def extract_visits(pt, records: list[dict]) -> list[dict]:
    raw: list[dict] = []
    buckets: set[tuple[float, float]] = set()

    for record in records:
        visit = record.get("visit")
        if not isinstance(visit, dict):
            continue
        if str(visit.get("hierarchyLevel", "0")) != "0":
            continue
        top = visit.get("topCandidate") or {}
        semantic = (top.get("semanticType") or "").lower()
        if semantic in pt.SKIP_SEMANTIC:
            continue
        coords = pt.parse_geo_string(top.get("placeLocation"))
        if not coords:
            continue
        start = parse_local(record.get("startTime"))
        end = parse_local(record.get("endTime"))
        if not start:
            continue
        hours = (end - start).total_seconds() / 3600 if end else MIN_VISIT_HOURS
        if hours < MIN_VISIT_HOURS:
            continue
        lat, lng = coords
        bucket = (round(lat, 2), round(lng, 2))
        buckets.add(bucket)
        raw.append(
            {
                "lat": lat,
                "lng": lng,
                "bucket": bucket,
                "start": start,
                "end": end or start,
                "hours": hours,
            }
        )

    geocode = pt.build_geocode_cache(buckets)
    for item in raw:
        geo = geocode.get(item["bucket"], {"city": "Unknown", "country": "Unknown"})
        item["city"] = geo["city"]
        item["country"] = geo["country"]
    raw.sort(key=lambda v: v["start"])
    return raw


def cluster_away(pt, visits: list[dict]) -> list[list[dict]]:
    """One trip per stretch outside the home radius, in visit order."""
    trips: list[list[dict]] = []
    current: list[dict] = []
    away = False

    for visit in visits:
        at_base = pt.is_at_base(visit["lat"], visit["lng"], visit["start"])
        if at_base:
            if away and current:
                trips.append(current)
            current = []
            away = False
            continue
        away = True
        current.append(visit)

    if away and current:
        trips.append(current)
    return trips


def active_base(pt, when: datetime) -> dict:
    if when < pt.HOME_SWITCH:
        return pt.TAIPEI
    return pt.NYC


def near_misses(pt, visits: list[dict]) -> list[str]:
    """Stops inside the home radius but well outside the city center."""
    lines: list[str] = []
    seen: set[tuple[str, str]] = set()
    for visit in visits:
        base = active_base(pt, visit["start"])
        distance = pt.haversine_km(visit["lat"], visit["lng"], base["lat"], base["lng"])
        if distance < NEAR_MISS_KM or distance > base["radius_km"]:
            continue
        day = visit["start"].date().isoformat()
        key = (day, visit["city"])
        if key in seen:
            continue
        seen.add(key)
        lines.append(
            f"  {day} {visit['city']}, {visit['country']} — {distance:.0f} km from home, {visit['hours']:.1f} h"
        )
    return lines


def ranges_overlap(start: str, end: str, other_start: str, other_end: str) -> bool:
    return start <= other_end and other_start <= end


def next_trip_number(trips: list[dict]) -> int:
    highest = 0
    for trip in trips:
        trip_id = str(trip.get("id") or "")
        if trip_id.startswith("trip-"):
            try:
                highest = max(highest, int(trip_id.split("-", 1)[1]))
            except ValueError:
                continue
    return highest + 1


def build_trips(pt, groups: list[list[dict]], start_number: int) -> tuple[list[dict], list[dict]]:
    trips_out: list[dict] = []
    cities_out: list[dict] = []

    for offset, group in enumerate(groups):
        trip_id = f"trip-{start_number + offset:03d}"
        city_stats: dict[str, dict] = {}
        route: list[dict] = []
        last_key: str | None = None

        for visit in sorted(group, key=lambda item: item["start"]):
            key = pt.city_key(visit["city"], visit["country"])
            day = visit["start"].date().isoformat()
            if key not in city_stats:
                city_stats[key] = {
                    "id": key,
                    "city": visit["city"],
                    "country": visit["country"],
                    "lat": visit["lat"],
                    "lng": visit["lng"],
                    "visits": 1,
                    "firstVisit": day,
                    "lastVisit": day,
                    "tripIds": [trip_id],
                    "_samples": 1,
                }
            else:
                stats = city_stats[key]
                if day < stats["firstVisit"]:
                    stats["firstVisit"] = day
                if day > stats["lastVisit"]:
                    stats["lastVisit"] = day
                samples = stats["_samples"] + 1
                stats["_samples"] = samples
                stats["lat"] = ((samples - 1) * stats["lat"] + visit["lat"]) / samples
                stats["lng"] = ((samples - 1) * stats["lng"] + visit["lng"]) / samples

            if key == last_key:
                continue
            route.append(
                {
                    "cityId": key,
                    "city": visit["city"],
                    "country": visit["country"],
                    "lat": round(visit["lat"], 5),
                    "lng": round(visit["lng"], 5),
                }
            )
            last_key = key

        start = min(visit["start"] for visit in group)
        end = max(visit["end"] for visit in group)
        countries = pt.unique_in_order([stop["country"] for stop in route], skip={"Unknown"})
        for stats in city_stats.values():
            stats["lat"] = round(stats["lat"], 5)
            stats["lng"] = round(stats["lng"], 5)
            stats.pop("_samples", None)

        trips_out.append(
            {
                "id": trip_id,
                "title": pt.trip_title(start, end, countries),
                "startDate": start.date().isoformat(),
                "endDate": end.date().isoformat(),
                "cities": [stop["city"] for stop in route],
                "countries": countries,
                "cityIds": sorted(city_stats),
                "route": route,
                "photos": [],
            }
        )
        cities_out.extend(city_stats.values())

    return trips_out, cities_out


def insert_trip(trips: list[dict], trip: dict) -> None:
    """travel.json lists trips newest first."""
    index = len(trips)
    for i, existing in enumerate(trips):
        if trip["startDate"] > existing.get("startDate", ""):
            index = i
            break
    trips.insert(index, trip)


def insert_city(cities: list[dict], city: dict) -> None:
    index = len(cities)
    for i, existing in enumerate(cities):
        if city["firstVisit"] < existing.get("firstVisit", ""):
            index = i
            break
    cities.insert(index, city)


def recompute_stats(data: dict) -> None:
    days = 0
    for trip in data.get("trips") or []:
        start = datetime.fromisoformat(trip["startDate"]).date()
        end = datetime.fromisoformat(trip["endDate"]).date()
        days += (end - start).days + 1
    cities = data.get("cities") or []
    data["stats"] = {
        "totalTrips": len(data.get("trips") or []),
        "totalTripDays": days,
        "totalCities": len(cities),
        "totalCountries": len({c["country"] for c in cities if c.get("country") and c["country"] != "Unknown"}),
    }


def merge(data: dict, trips: list[dict], cities: list[dict]) -> list[dict]:
    existing_trips = data.setdefault("trips", [])
    added: list[dict] = []
    for trip in trips:
        if any(
            ranges_overlap(trip["startDate"], trip["endDate"], old.get("startDate", ""), old.get("endDate", ""))
            for old in existing_trips
        ):
            print(
                f"Skip {trip['title']} ({trip['startDate']} – {trip['endDate']}); overlaps a trip already on the site.",
                file=sys.stderr,
            )
            continue
        insert_trip(existing_trips, trip)
        added.append(trip)

    if not added:
        return added

    added_ids = {trip["id"] for trip in added}
    by_id = {city["id"]: city for city in data.setdefault("cities", [])}
    for city in cities:
        if not any(trip_id in added_ids for trip_id in city["tripIds"]):
            continue
        current = by_id.get(city["id"])
        if current is None:
            insert_city(data["cities"], city)
            by_id[city["id"]] = city
            continue
        for trip_id in city["tripIds"]:
            if trip_id not in current["tripIds"]:
                current["tripIds"].append(trip_id)
        current["tripIds"] = sorted(set(current["tripIds"]))
        current["visits"] = len(current["tripIds"])
        if city["firstVisit"] < current["firstVisit"]:
            current["firstVisit"] = city["firstVisit"]
        if city["lastVisit"] > current["lastVisit"]:
            current["lastVisit"] = city["lastVisit"]

    recompute_stats(data)
    note = data.get("sourceNote") or ""
    noun = "trip" if len(added) == 1 else "trips"
    extra = f"Merged {len(added)} {noun} from an on-device Timeline export"
    if extra not in note:
        data["sourceNote"] = f"{note}; {extra}" if note else extra
    data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    return added


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("timeline", type=Path, help="On-device Timeline.json export")
    parser.add_argument(
        "--write",
        action="store_true",
        help=f"Merge new trips into {TRAVEL_JSON.relative_to(ROOT)}",
    )
    args = parser.parse_args()

    if not args.timeline.is_file():
        print(f"Source not found: {args.timeline}", file=sys.stderr)
        return 1

    pt = load_parser()
    if pt.rg is None:
        print("reverse_geocoder is required: pip install reverse_geocoder", file=sys.stderr)
        return 1

    records, _source_name = pt.load_records(args.timeline)
    # reverse_geocoder prints a load message to stdout; keep stdout as JSON.
    with contextlib.redirect_stdout(sys.stderr):
        visits = extract_visits(pt, records)
    if not visits:
        print("No place visits found in export.", file=sys.stderr)
        return 1

    groups = cluster_away(pt, visits)
    if not TRAVEL_JSON.is_file():
        print(f"Travel data not found: {TRAVEL_JSON}", file=sys.stderr)
        return 1

    data = json.loads(TRAVEL_JSON.read_text(encoding="utf-8"))
    start_number = next_trip_number(data.get("trips") or [])
    trips, cities = build_trips(pt, groups, start_number)

    unknown = [trip["id"] for trip in trips if any(stop["country"] == "Unknown" for stop in trip["route"])]
    if unknown:
        print(f"Geocoder returned Unknown for {', '.join(unknown)}. Not writing.", file=sys.stderr)
        return 1

    print(
        f"{len(visits)} place visits, {len(groups)} trip(s) away from home.",
        file=sys.stderr,
    )
    misses = near_misses(pt, visits)
    if misses:
        print("Inside the home radius, so not added:", file=sys.stderr)
        print("\n".join(misses), file=sys.stderr)

    added = merge(data, trips, cities)
    added_ids = {trip["id"] for trip in added}
    payload = {
        "trips": added,
        "cities": [city for city in cities if added_ids.intersection(city["tripIds"])],
    }

    if args.write and added:
        TRAVEL_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {len(added)} trip(s) to {TRAVEL_JSON.relative_to(ROOT)}", file=sys.stderr)
    elif args.write:
        print("Nothing new to write.", file=sys.stderr)

    json.dump(payload, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
