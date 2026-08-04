#!/usr/bin/env python3
"""Snap NYC walk GPS points to OSM street geometry via Overpass (curl)."""

from __future__ import annotations

import importlib.util
import json
import math
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "nyc-streets.json"
CACHE_DIR = ROOT / "cache" / "osm-tiles"

NYC_BBOX = (40.4774, 40.9176, -74.2591, -73.7004)
POINT_SPACING_M = 60
TILE_DEG = 0.04
MAX_WAYS = 30000
SNAP_M = 40
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

HIGHWAY_FILTER = (
    "footway|path|pedestrian|residential|living_street|unclassified|"
    "tertiary|secondary|primary|service|steps|track|corridor"
)


def load_parse_nyc():
    spec = importlib.util.spec_from_file_location("parse_nyc", ROOT / "scripts" / "parse-nyc.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def point_to_segment_m(lat: float, lng: float, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dx = (lng2 - lng1) * 85000
    dy = (lat2 - lat1) * 111000
    if dx == 0 and dy == 0:
        return haversine_m(lat, lng, lat1, lng1)
    t = max(0.0, min(1.0, ((lng - lng1) * 85000 * dx + (lat - lat1) * 111000 * dy) / (dx * dx + dy * dy)))
    return haversine_m(lat, lng, lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t)


def points_from_segments(segments, spacing_m=POINT_SPACING_M):
    points = []
    seen = set()
    for c1, c2 in segments:
        dist = haversine_m(*c1, *c2)
        steps = max(1, int(dist / spacing_m))
        for i in range(steps + 1):
            t = i / steps
            lat = c1[0] + (c2[0] - c1[0]) * t
            lng = c1[1] + (c2[1] - c1[1]) * t
            key = (round(lat, 4), round(lng, 4))
            if key in seen:
                continue
            seen.add(key)
            points.append((lat, lng))
    return points


def round5(v: float) -> float:
    return round(v, 5)


def iter_tiles(south, north, west, east, step):
    lat = south
    while lat < north:
        lng = west
        n = min(lat + step, north)
        while lng < east:
            e = min(lng + step, east)
            yield n, lat, e, lng
            lng += step
        lat += step


def points_in_bbox(points, north, south, east, west):
    return [p for p in points if south <= p[0] <= north and west <= p[1] <= east]


def fetch_ways_curl(north, south, east, west) -> list[dict]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = f"{round(north,4)}_{round(south,4)}_{round(east,4)}_{round(west,4)}"
    cache_path = CACHE_DIR / f"{key}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    query = (
        f'[out:json][timeout:90];'
        f'way["highway"~"{HIGHWAY_FILTER}"]({south},{west},{north},{east});'
        f'out geom;'
    )
    last_err = "No Overpass response"
    for attempt, url in enumerate(OVERPASS_URLS):
        proc = subprocess.run(
            [
                "curl", "-s", "--max-time", "120", "-X", "POST",
                url, "--data", query,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        body = (proc.stdout or "").strip()
        if proc.returncode == 0 and body.startswith("{"):
            try:
                data = json.loads(body)
                elements = data.get("elements", [])
                cache_path.write_text(json.dumps(elements), encoding="utf-8")
                return elements
            except json.JSONDecodeError as exc:
                last_err = str(exc)
        else:
            last_err = (proc.stderr or body[:120] or "Empty Overpass response").strip()
        time.sleep(1.5 * (attempt + 1))

    raise RuntimeError(last_err)


def ways_to_geometries(elements: list[dict]) -> dict[int, list[list[float]]]:
    geoms: dict[int, list[list[float]]] = {}
    for el in elements:
        if el.get("type") != "way":
            continue
        nodes = el.get("geometry") or []
        if len(nodes) < 2:
            continue
        coords = [[round5(n["lon"]), round5(n["lat"])] for n in nodes]
        geoms[el["id"]] = coords
    return geoms


def build_segment_index(geoms: dict[int, list[list[float]]]) -> dict[tuple[int, int], list[tuple[int, int]]]:
    """Grid index: cell -> [(way_id, segment_index), ...]"""
    index: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    cell_deg = 0.0015  # ~150 m
    for wid, coords in geoms.items():
        for i in range(len(coords) - 1):
            lat1, lng1 = coords[i][1], coords[i][0]
            lat2, lng2 = coords[i + 1][1], coords[i + 1][0]
            mid_lat = (lat1 + lat2) / 2
            mid_lng = (lng1 + lng2) / 2
            cell = (int(mid_lat / cell_deg), int(mid_lng / cell_deg))
            index[cell].append((wid, i))
    return index


def snap_points_to_ways(
    points: list[tuple[float, float]],
    geoms: dict[int, list[list[float]]],
    index: dict[tuple[int, int], list[tuple[int, int]]],
) -> dict[int, int]:
    counts: dict[int, int] = defaultdict(int)
    cell_deg = 0.0015

    for lat, lng in points:
        cx, cy = int(lat / cell_deg), int(lng / cell_deg)
        best_id = None
        best_dist = SNAP_M
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for wid, seg_i in index.get((cx + dx, cy + dy), []):
                    coords = geoms[wid]
                    lng1, lat1 = coords[seg_i][0], coords[seg_i][1]
                    lng2, lat2 = coords[seg_i + 1][0], coords[seg_i + 1][1]
                    d = point_to_segment_m(lat, lng, lat1, lng1, lat2, lng2)
                    if d < best_dist:
                        best_dist = d
                        best_id = wid
        if best_id is not None:
            counts[best_id] += 1

    return counts


def match_overpass_tiled(points, south, north, west, east) -> list[dict]:
    all_counts: dict[int, int] = defaultdict(int)
    all_geoms: dict[int, list[list[float]]] = {}
    tile_num = 0

    for n, s, e, w in iter_tiles(south, north, west, east, TILE_DEG):
        tile_pts = points_in_bbox(points, n, s, e, w)
        if not tile_pts:
            continue
        tile_num += 1
        print(f"  Tile {tile_num}: {len(tile_pts)} pts, fetching OSM…")
        try:
            elements = fetch_ways_curl(n, s, e, w)
            geoms = ways_to_geometries(elements)
            seg_index = build_segment_index(geoms)
            print(f"    {len(geoms)} ways, snapping…")
            counts = snap_points_to_ways(tile_pts, geoms, seg_index)
            for wid, c in counts.items():
                all_counts[wid] += c
                if wid not in all_geoms:
                    all_geoms[wid] = geoms[wid]
        except Exception as exc:
            print(f"    Skipped: {exc}", file=sys.stderr)
        time.sleep(1.0)

    if not all_counts:
        raise RuntimeError("No OSM ways matched")

    items = sorted(all_counts.items(), key=lambda kv: kv[1], reverse=True)[:MAX_WAYS]
    return [{"coords": all_geoms[wid], "count": count} for wid, count in items if wid in all_geoms]


def snap_segment_cardinal(c1, c2):
    lat1, lng1 = c1
    lat2, lng2 = c2
    if abs(lat2 - lat1) >= abs(lng2 - lng1):
        return [[round5(lng1), round5(lat1)], [round5(lng1), round5(lat2)]]
    return [[round5(lng1), round5(lat1)], [round5(lng2), round5(lat1)]]


def build_offline_streets(segments, meta):
    edge_counts: dict[str, dict] = {}
    for c1, c2 in segments:
        coords = snap_segment_cardinal(c1, c2)
        key = json.dumps(coords, separators=(",", ":"))
        if key not in edge_counts:
            edge_counts[key] = {"coords": coords, "count": 0}
        edge_counts[key]["count"] += 1
    streets = sorted(edge_counts.values(), key=lambda s: s["count"], reverse=True)[:MAX_WAYS]
    return {
        "meta": {**meta, "streetCount": len(streets), "source": "grid_snap_fallback"},
        "streets": streets,
    }


def main() -> int:
    parse_nyc = load_parse_nyc()
    args = [a for a in sys.argv[1:] if a != "--offline"]
    if not args:
        print("Usage: match-nyc-streets.py [--offline] <location-history.json>", file=sys.stderr)
        return 1

    source = Path(args[0]).expanduser().resolve()
    if not source.exists():
        print(f"Source not found: {source}", file=sys.stderr)
        return 1

    records = parse_nyc.load_records(source)
    segments = parse_nyc.extract_segments(records)
    meta = {
        "since": parse_nyc.HOME_SWITCH.date().isoformat(),
        "totalKm": round(parse_nyc.total_walk_km(segments), 0),
        "rawSegments": len(segments),
    }

    lats = [c[0] for seg in segments for c in seg]
    lngs = [c[1] for seg in segments for c in seg]
    pad = 0.02
    south = max(NYC_BBOX[0], min(lats) - pad)
    north = min(NYC_BBOX[1], max(lats) + pad)
    west = max(NYC_BBOX[2], min(lngs) - pad)
    east = min(NYC_BBOX[3], max(lngs) + pad)

    points = points_from_segments(segments)
    meta["sampledPoints"] = len(points)

    if "--offline" in sys.argv:
        print("Using grid-snap fallback (--offline).")
        output = build_offline_streets(segments, meta)
    else:
        try:
            print(f"Matching {len(points)} points to OSM streets via Overpass…")
            streets = match_overpass_tiled(points, south, north, west, east)
            output = {"meta": {**meta, "streetCount": len(streets), "source": "overpass"}, "streets": streets}
        except Exception as exc:
            print(f"OSM matching failed ({exc}). Using grid-snap fallback…", file=sys.stderr)
            output = build_offline_streets(segments, meta)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"Wrote {OUTPUT} ({size_kb:.1f} KB, {len(output['streets'])} streets, source={output['meta']['source']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())