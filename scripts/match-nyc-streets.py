#!/usr/bin/env python3
"""Snap NYC walk GPS points to OSM street edges and export walked street geometry."""

from __future__ import annotations

import importlib.util
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WALKS_JSON = ROOT / "data" / "nyc-walks.json"
OUTPUT = ROOT / "data" / "nyc-streets.json"

NYC_BBOX = (40.4774, 40.9176, -74.2591, -73.7004)  # south, north, west, east
POINT_SPACING_M = 25
MAX_EDGES = 25000


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


def points_from_segments(
    segments: list[tuple[tuple[float, float], tuple[float, float]]],
    spacing_m: float = POINT_SPACING_M,
) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    seen: set[tuple[int, int]] = set()

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


def round_coord(value: float) -> float:
    return round(value, 5)


def edge_geometry(graph, u, v, key) -> list[list[float]]:
    data = graph[u][v][key]
    geom = data.get("geometry")
    if geom is not None:
        return [[round_coord(p.x), round_coord(p.y)] for p in geom.coords]
    x1 = graph.nodes[u]["x"]
    y1 = graph.nodes[u]["y"]
    x2 = graph.nodes[v]["x"]
    y2 = graph.nodes[v]["y"]
    return [[round_coord(x1), round_coord(y1)], [round_coord(x2), round_coord(y2)]]


def match_edges(graph, points: list[tuple[float, float]]) -> dict[tuple, int]:
    import osmnx as ox

    counts: dict[tuple, int] = defaultdict(int)
    batch = 5000
    lats = [p[0] for p in points]
    lngs = [p[1] for p in points]

    for start in range(0, len(points), batch):
        batch_lats = lats[start : start + batch]
        batch_lngs = lngs[start : start + batch]
        edges = ox.nearest_edges(graph, batch_lngs, batch_lats)
        for edge in edges:
            u, v, key = edge
            norm = (u, v, key) if u <= v else (v, u, key)
            counts[norm] += 1

    return counts


def snap_segment_cardinal(c1: tuple[float, float], c2: tuple[float, float]) -> list[list[float]]:
    """Snap a walk segment to N/S or E/W (NYC grid heuristic) when OSM is unavailable."""
    lat1, lng1 = c1
    lat2, lng2 = c2
    if abs(lat2 - lat1) >= abs(lng2 - lng1):
        coords = [[round_coord(lng1), round_coord(lat1)], [round_coord(lng1), round_coord(lat2)]]
    else:
        coords = [[round_coord(lng1), round_coord(lat1)], [round_coord(lng2), round_coord(lat1)]]
    return coords


def build_offline_streets(
    segments: list[tuple[tuple[float, float], tuple[float, float]]],
    meta: dict,
) -> dict:
    """Grid-snapped fallback when Overpass/OSMnx is unreachable."""
    edge_counts: dict[str, dict] = {}

    for c1, c2 in segments:
        coords = snap_segment_cardinal(c1, c2)
        key = json.dumps(coords, separators=(",", ":"))
        if key not in edge_counts:
            edge_counts[key] = {"coords": coords, "count": 0}
        edge_counts[key]["count"] += 1

    streets = sorted(edge_counts.values(), key=lambda s: s["count"], reverse=True)
    if len(streets) > MAX_EDGES:
        streets = streets[:MAX_EDGES]

    return {
        "meta": {
            **meta,
            "streetCount": len(streets),
            "matchedPoints": meta.get("sampledPoints", 0),
            "source": "grid_snap_fallback",
        },
        "streets": streets,
    }


def build_output(graph, edge_counts: dict, meta: dict) -> dict:
    items = sorted(edge_counts.items(), key=lambda kv: kv[1], reverse=True)
    if len(items) > MAX_EDGES:
        items = items[:MAX_EDGES]

    streets = []
    for (u, v, key), count in items:
        geom = edge_geometry(graph, u, v, key)
        if len(geom) < 2:
            continue
        streets.append({"coords": geom, "count": count})

    return {
        "meta": {
            **meta,
            "streetCount": len(streets),
            "matchedPoints": meta.get("sampledPoints", 0),
            "source": "osmnx",
        },
        "streets": streets,
    }


def main() -> int:
    try:
        import osmnx as ox  # noqa: F401
    except ImportError:
        print("Install build deps: pip install -r requirements-build.txt", file=sys.stderr)
        return 1

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
    walk_meta = {
        "since": parse_nyc.HOME_SWITCH.date().isoformat(),
        "totalKm": round(parse_nyc.total_walk_km(segments), 0),
        "rawSegments": len(segments),
    }

    import osmnx as ox

    lats = [c[0] for seg in segments for c in seg]
    lngs = [c[1] for seg in segments for c in seg]
    pad = 0.02
    south = max(NYC_BBOX[0], min(lats) - pad)
    north = min(NYC_BBOX[1], max(lats) + pad)
    west = max(NYC_BBOX[2], min(lngs) - pad)
    east = min(NYC_BBOX[3], max(lngs) + pad)

    points = points_from_segments(segments)
    walk_meta["sampledPoints"] = len(points)

    use_offline = "--offline" in sys.argv
    output = None

    if use_offline:
        print("Using grid-snap fallback (--offline).")
        output = build_offline_streets(segments, walk_meta)
    else:
        try:
            print(f"Loading walk network from OSM ({south:.3f},{west:.3f} → {north:.3f},{east:.3f})…")
            graph = ox.graph_from_bbox(bbox=(north, south, east, west), network_type="walk", simplify=True)
            print(f"Snapping {len(points)} walk points to OSM streets…")
            edge_counts = match_edges(graph, points)
            output = build_output(graph, edge_counts, walk_meta)
        except Exception as exc:
            print(f"OSM matching unavailable ({exc}). Using grid-snap fallback…", file=sys.stderr)
            output = build_offline_streets(segments, walk_meta)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"Wrote {OUTPUT} ({size_kb:.1f} KB, {len(output['streets'])} streets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())