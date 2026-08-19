#!/usr/bin/env python3
"""Resize dining visit photos for the website.

For each JPEG in components/dining/img/visits/<id>/:

  0.jpeg        lightbox / display (max 2000px, q85)
  0.thumb.jpeg  card cover (max 800px, q80)

Camera originals are replaced by the display file — keep print copies
outside git. Re-run after dropping new visit folders; already-processed
photos are skipped unless --force is passed.

Usage:
  python3 scripts/compress-dining-photos.py
  python3 scripts/compress-dining-photos.py coqodaq-081826
  python3 scripts/compress-dining-photos.py --force
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
VISITS = ROOT / "components" / "dining" / "img" / "visits"

DISPLAY_MAX = 2000
THUMB_MAX = 800
DISPLAY_QUALITY = 85
THUMB_QUALITY = 80
# Skip if a thumb exists, the display file is already web-sized, and small.
SKIP_MAX_BYTES = 500_000
IMAGE_SUFFIXES = {".jpeg", ".jpg"}


def is_thumb(path: Path) -> bool:
    return ".thumb." in path.name.lower()


def thumb_path(path: Path) -> Path:
    return path.with_name(path.stem + ".thumb" + path.suffix)


def load(path: Path) -> Image.Image:
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")
    return img


def fit(img: Image.Image, max_edge: int) -> Image.Image:
    w, h = img.size
    longest = max(w, h)
    if longest <= max_edge:
        return img
    scale = max_edge / longest
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    return img.resize(size, Image.Resampling.LANCZOS)


def save_jpeg(img: Image.Image, dest: Path, quality: int) -> int:
    buf = io.BytesIO()
    img.save(
        buf,
        format="JPEG",
        quality=quality,
        optimize=True,
        progressive=True,
        subsampling=2,
    )
    data = buf.getvalue()
    dest.write_bytes(data)
    return len(data)


def already_processed(path: Path) -> bool:
    thumb = thumb_path(path)
    if not thumb.exists():
        return False
    with Image.open(path) as img:
        longest = max(img.size)
    return longest <= DISPLAY_MAX and path.stat().st_size <= SKIP_MAX_BYTES


def process(path: Path, force: bool) -> str:
    if already_processed(path) and not force:
        return "skip"
    before = path.stat().st_size
    img = load(path)
    display = fit(img, DISPLAY_MAX)
    thumb = fit(img, THUMB_MAX)
    display_bytes = save_jpeg(display, path, DISPLAY_QUALITY)
    save_jpeg(thumb, thumb_path(path), THUMB_QUALITY)
    return f"{before / 1000:.0f}K -> {display_bytes / 1000:.0f}K  {display.size[0]}x{display.size[1]}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="re-encode even if already processed")
    parser.add_argument(
        "visits",
        nargs="*",
        help="optional visit folder ids under img/visits/ (default: all visits)",
    )
    args = parser.parse_args()

    if not VISITS.is_dir():
        print(f"missing {VISITS}", file=sys.stderr)
        return 1

    roots = [VISITS / vid for vid in args.visits] if args.visits else [VISITS]
    for root in roots:
        if not root.is_dir():
            print(f"missing {root}", file=sys.stderr)
            return 1

    files = sorted(
        p
        for root in roots
        for p in root.rglob("*")
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES and not is_thumb(p)
    )
    skipped = 0
    done = 0
    before_total = 0
    after_total = 0
    for path in files:
        before_total += path.stat().st_size
        result = process(path, args.force)
        if result == "skip":
            skipped += 1
            after_total += path.stat().st_size
            continue
        done += 1
        after_total += path.stat().st_size
        print(f"  {path.relative_to(VISITS)}  {result}")

    thumb_bytes = sum(p.stat().st_size for p in VISITS.rglob("*") if p.is_file() and is_thumb(p))
    print(
        f"\n{done} encoded, {skipped} skipped, "
        f"display {before_total / 1e6:.0f} MB -> {after_total / 1e6:.0f} MB, "
        f"thumbs {thumb_bytes / 1e6:.0f} MB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
