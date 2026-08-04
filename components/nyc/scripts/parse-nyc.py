#!/usr/bin/env python3
"""Parse Google Timeline exports into NYC walk GeoJSON (since home-base switch)."""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "nyc-walks.json"

HOME_SWITCH = datetime(2022, 8, 2, tzinfo=timezone.utc)

# NYC bounding box (all five boroughs)
NYC_LAT = (40.4774, 40.9176)
NYC_LNG = (-74.2591, -73.7004)

MIN_SEGMENT_M = 35
GRID_M = 20
MAX_SEGMENTS = 15000


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(value).astimezone(timezone.utc)
    except ValueError:
        return None


def parse_geo(value: str | None) -> tuple[float, float] | None:
    if not value:
        return None
    if value.startswith("geo:"):
        value = value[4:]
    try:
        lat_s, lng_s = value.split(",", 1)
        return float(lat_s), float(lng_s)
    except (ValueError, AttributeError):
        return None


def in_nyc(lat: float, lng: float) -> bool:
    return NYC_LAT[0] <= lat <= NYC_LAT[1] and NYC_LNG[0] <= lng <= NYC_LNG[1]


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def quantize(lat: float, lng: float) -> tuple[int, int]:
    """Snap to ~15 m grid cells."""
    lat_step = GRID_M / 111000.0
    lng_step = GRID_M / (111000.0 * math.cos(math.radians(lat)))
    return (round(lat / lat_step), round(lng / lng_step))


def dequantize(cell: tuple[int, int], ref_lat: float) -> tuple[float, float]:
    lat_step = GRID_M / 111000.0
    lng_step = GRID_M / (111000.0 * math.cos(math.radians(ref_lat)))
    return cell[0] * lat_step, cell[1] * lng_step


def load_records(source: Path) -> list[dict]:
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "parse_timeline", ROOT / "scripts" / "parse-timeline.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    records, _ = mod.load_records(source)
    return records


def extract_segments(records: list[dict]) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    segments: list[tuple[tuple[float, float], tuple[float, float]]] = []

    for record in records:
        start_time = parse_ts(record.get("startTime"))
        if not start_time or start_time < HOME_SWITCH:
            continue

        if "activity" in record:
            act = record["activity"]
            if act.get("topCandidate", {}).get("type") != "walking":
                continue
            c1 = parse_geo(act.get("start"))
            c2 = parse_geo(act.get("end"))
            if not c1 or not c2:
                continue
            if not (in_nyc(*c1) and in_nyc(*c2)):
                continue
            if haversine_m(*c1, *c2) < MIN_SEGMENT_M:
                continue
            segments.append((c1, c2))

        elif "timelinePath" in record:
            path = record["timelinePath"]
            if not isinstance(path, list):
                continue
            coords = []
            for pt in path:
                c = parse_geo(pt.get("point"))
                if c and in_nyc(*c):
                    coords.append(c)
            for i in range(1, len(coords)):
                c1, c2 = coords[i - 1], coords[i]
                if haversine_m(*c1, *c2) < MIN_SEGMENT_M:
                    continue
                segments.append((c1, c2))

    return segments


def dedupe_segments(
    segments: list[tuple[tuple[float, float], tuple[float, float]]],
) -> dict[tuple[tuple[int, int], tuple[int, int]], int]:
    edges: dict[tuple[tuple[int, int], tuple[int, int]], int] = {}

    for c1, c2 in segments:
        cell1 = quantize(*c1)
        cell2 = quantize(*c2)
        if cell1 == cell2:
            continue
        key = (cell1, cell2) if cell1 < cell2 else (cell2, cell1)
        edges[key] = edges.get(key, 0) + 1

    return edges


def edges_to_segments(edges: dict) -> tuple[list[list[int]], float, set[tuple[int, int]]]:
    """Compact segments: [x1, y1, x2, y2, count] grid cells."""
    items = sorted(edges.items(), key=lambda kv: kv[1], reverse=True)
    if len(items) > MAX_SEGMENTS:
        items = items[:MAX_SEGMENTS]

    out: list[list[int]] = []
    unique_cells: set[tuple[int, int]] = set()
    total_km = 0.0

    ref_lat = 40.75
    for (cell1, cell2), count in items:
        p1 = dequantize(cell1, ref_lat)
        p2 = dequantize(cell2, ref_lat)
        unique_cells.add(cell1)
        unique_cells.add(cell2)
        out.append([cell1[0], cell1[1], cell2[0], cell2[1], count])

    return out, unique_cells


def total_walk_km(segments: list[tuple[tuple[float, float], tuple[float, float]]]) -> float:
    return sum(haversine_m(*a, *b) for a, b in segments) / 1000.0


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: parse-nyc.py <location-history.json>", file=sys.stderr)
        return 1

    source = Path(sys.argv[1]).expanduser().resolve()
    if not source.exists():
        print(f"Source not found: {source}", file=sys.stderr)
        return 1

    records = load_records(source)
    segments = extract_segments(records)
    edges = dedupe_segments(segments)
    compact, unique_cells = edges_to_segments(edges)
    total_km = total_walk_km(segments)

    output = {
        "meta": {
            "since": HOME_SWITCH.date().isoformat(),
            "segmentCount": len(compact),
            "rawSegments": len(segments),
            "totalKm": round(total_km, 0),
            "uniqueCells": len(unique_cells),
            "gridM": GRID_M,
        },
        "segments": compact,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"Wrote {OUTPUT} ({size_kb:.1f} KB, {len(compact)} segments)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())