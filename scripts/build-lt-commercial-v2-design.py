#!/usr/bin/env python3
"""Build LT_COMMERCIAL_V2_design.pdf = V1 visuals minus PDF text objects.

Never writes to LT_COMMERCIAL_V1.pdf. Text is removed at the content-stream
operator level (BT…ET). Images, paths, form XObjects, and patterns stay.

The intro manager portrait shares one image XObject with the teal crescent
and KOT badge. After text stripping, the portrait disk and its anti-aliased
fringe are removed from both RGB and SMask. Crescent and badge stay.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import sys
from collections import deque
from pathlib import Path

import pymupdf

REPO = Path(__file__).resolve().parents[1]
V1_PATH = REPO / "assets/commercial-proposals/LT_COMMERCIAL_V1.pdf"
V2_PATH = REPO / "assets/commercial-proposals/LT_COMMERCIAL_V2_design.pdf"
TMP_DIR = REPO / "tmp/cp-ref"

WHITESPACE = b"\x00\t\n\x0c\r "
DELIMS = set(WHITESPACE) | set(b"()<>[]{}/%")

INTRO_PAGE_INDEX = 1
INTRO_PORTRAIT_SIZE = (600, 585)
INTRO_PHOTO_CM = (95.2515, 92.8702, 37.4993, 437.815)
SMASK_OPAQUE = 128
# Extra pixels beyond the fitted face disk so JPEG/AA halo is removed.
PORTRAIT_AA_MARGIN_PX = 10


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def skip_literal_string(data: bytes, i: int) -> int:
    """Return index after a PDF literal string starting at data[i] == '('."""
    n = len(data)
    depth = 0
    j = i
    while j < n:
        c = data[j]
        if c == 0x5C:  # backslash
            j += 2
            continue
        if c == 0x28:  # (
            depth += 1
            j += 1
            continue
        if c == 0x29:  # )
            depth -= 1
            j += 1
            if depth == 0:
                return j
            continue
        j += 1
    return n


def skip_hex_or_dict(data: bytes, i: int) -> int:
    """Skip <<dict>> or <hex> starting at data[i] == '<'."""
    n = len(data)
    if i + 1 < n and data[i + 1] == 0x3C:
        depth = 0
        j = i
        while j < n - 1:
            if data[j] == 0x3C and data[j + 1] == 0x3C:
                depth += 1
                j += 2
                continue
            if data[j] == 0x3E and data[j + 1] == 0x3E:
                depth -= 1
                j += 2
                if depth == 0:
                    return j
                continue
            j += 1
        return n
    j = i + 1
    while j < n and data[j] != 0x3E:
        j += 1
    return min(n, j + 1)


def strip_text_objects(data: bytes) -> tuple[bytes, int]:
    """Remove BT…ET text objects. Returns (new_stream, removed_block_count)."""
    out = bytearray()
    i = 0
    n = len(data)
    depth = 0
    removed = 0

    while i < n:
        c = data[i]
        if c in WHITESPACE or c in b"[]{}":
            if depth == 0:
                out.append(c)
            i += 1
            continue
        if c == 0x25:  # %
            j = i + 1
            while j < n and data[j] not in (0x0A, 0x0D):
                j += 1
            if depth == 0:
                out.extend(data[i:j])
            i = j
            continue
        if c == 0x28:  # (
            j = skip_literal_string(data, i)
            if depth == 0:
                out.extend(data[i:j])
            i = j
            continue
        if c == 0x3C:  # <
            j = skip_hex_or_dict(data, i)
            if depth == 0:
                out.extend(data[i:j])
            i = j
            continue
        if c == 0x3E:  # lone >
            if depth == 0:
                out.append(c)
            i += 1
            continue
        if c == 0x2F:  # /Name
            j = i + 1
            while j < n and data[j] not in DELIMS:
                j += 1
            if depth == 0:
                out.extend(data[i:j])
            i = j
            continue

        j = i
        while j < n and data[j] not in DELIMS:
            j += 1
        tok = data[i:j]
        if tok == b"BT":
            if depth == 0:
                removed += 1
            depth += 1
            i = j
            continue
        if tok == b"ET":
            depth = max(0, depth - 1)
            i = j
            continue
        if depth == 0:
            out.extend(tok)
        i = j

    if depth != 0:
        raise RuntimeError("Unbalanced BT/ET while stripping text objects")
    return bytes(out), removed


def count_text_ops(data: bytes) -> dict[str, int]:
    return {
        "BT": len(re.findall(rb"(?<![A-Za-z0-9_/])BT(?![A-Za-z0-9_])", data)),
        "ET": len(re.findall(rb"(?<![A-Za-z0-9_/])ET(?![A-Za-z0-9_])", data)),
        "Tj": data.count(b"Tj"),
        "TJ": data.count(b"TJ"),
    }


def collect_text_xobjects(doc: pymupdf.Document) -> list[int]:
    seen: set[int] = set()
    text_xrefs: list[int] = []
    stack: list[int] = []
    for page in doc:
        for xo in page.get_xobjects():
            stack.append(int(xo[0]))
    while stack:
        xref = stack.pop()
        if xref in seen or xref <= 0:
            continue
        seen.add(xref)
        try:
            raw = doc.xref_stream(xref) or b""
        except Exception:
            continue
        ops = count_text_ops(raw)
        if ops["BT"] or ops["Tj"] or ops["TJ"]:
            text_xrefs.append(xref)
        try:
            obj = doc.xref_object(xref) or ""
        except Exception:
            obj = ""
        for child in re.findall(r"/Fm\d+\s+(\d+)\s+0\s+R", obj):
            stack.append(int(child))
    return sorted(set(text_xrefs))


def glyph_rects(page: pymupdf.Page) -> list[pymupdf.Rect]:
    rects: list[pymupdf.Rect] = []
    d = page.get_text("dict")
    for block in d.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                r = pymupdf.Rect(span["bbox"])
                if r.width > 0.2 and r.height > 0.2:
                    rects.append(r)
    for tr in page.get_texttrace():
        bbox = tr.get("bbox")
        if bbox:
            r = pymupdf.Rect(bbox)
            if r.width > 0.2 and r.height > 0.2:
                rects.append(r)
        for ch in tr.get("chars") or []:
            box = None
            if isinstance(ch, dict) and "bbox" in ch:
                box = ch["bbox"]
            elif isinstance(ch, (list, tuple)) and len(ch) >= 4 and isinstance(ch[3], (list, tuple)):
                box = ch[3]
            if not box:
                continue
            r = pymupdf.Rect(box)
            if r.width > 0.15 and r.height > 0.15:
                rects.append(r)
    return rects


def union_mask(rects: list[pymupdf.Rect], pad: float = 1.25) -> list[pymupdf.Rect]:
    return [pymupdf.Rect(r.x0 - pad, r.y0 - pad, r.x1 + pad, r.y1 + pad) for r in rects]


def pixmap_diff_outside_text(
    v1_page: pymupdf.Page,
    other_page: pymupdf.Page,
    zoom: float = 2.0,
    extra_ignore: list[pymupdf.Rect] | None = None,
) -> dict[str, float]:
    from PIL import Image, ImageChops, ImageDraw

    mat = pymupdf.Matrix(zoom, zoom)
    a = v1_page.get_pixmap(matrix=mat, alpha=False)
    b = other_page.get_pixmap(matrix=mat, alpha=False)
    if a.width != b.width or a.height != b.height:
        raise RuntimeError(f"pixmap size mismatch {a.width}x{a.height} vs {b.width}x{b.height}")
    img_a = Image.frombytes("RGB", (a.width, a.height), a.samples)
    img_b = Image.frombytes("RGB", (b.width, b.height), b.samples)
    diff = ImageChops.difference(img_a, img_b)
    draw = ImageDraw.Draw(diff)
    ignore = union_mask(glyph_rects(v1_page), pad=1.4)
    ignore.extend(extra_ignore or [])
    for r in ignore:
        draw.rectangle(
            [r.x0 * zoom, r.y0 * zoom, r.x1 * zoom, r.y1 * zoom],
            fill=(0, 0, 0),
        )
    mask = Image.new("L", (a.width, a.height), 255)
    md = ImageDraw.Draw(mask)
    for r in ignore:
        md.rectangle([r.x0 * zoom, r.y0 * zoom, r.x1 * zoom, r.y1 * zoom], fill=0)
    compared = mask.histogram()[255]
    gray = ImageChops.multiply(diff.convert("L"), mask)
    hist = gray.histogram()
    changed = sum(hist[1:])
    # Weighted RMS of the L-channel delta over compared pixels (masked = 0).
    sse = sum(i * i * count for i, count in enumerate(hist))
    rms = (sse / max(compared, 1)) ** 0.5
    max_delta = max((i for i, count in enumerate(hist) if count), default=0)
    return {
        "compared_pixels": compared,
        "changed_pixels": changed,
        "changed_pct": 100.0 * changed / max(compared, 1),
        "rms": rms,
        "max_channel_delta": max_delta,
        "width": a.width,
        "height": a.height,
    }


def _flood_opaque(samples: bytes, width: int, height: int, x0: int, y0: int, seen: bytearray) -> list[tuple[int, int]]:
    if samples[y0 * width + x0] < SMASK_OPAQUE or seen[y0 * width + x0]:
        return []
    q = deque([(x0, y0)])
    seen[y0 * width + x0] = 1
    pts: list[tuple[int, int]] = []
    while q:
        x, y = q.popleft()
        pts.append((x, y))
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            xx, yy = x + dx, y + dy
            if 0 <= xx < width and 0 <= yy < height:
                i = yy * width + xx
                if not seen[i] and samples[i] >= SMASK_OPAQUE:
                    seen[i] = 1
                    q.append((xx, yy))
    return pts


def _opaque_components(samples: bytes, width: int, height: int) -> list[list[tuple[int, int]]]:
    seen = bytearray(width * height)
    comps: list[list[tuple[int, int]]] = []
    for y in range(height):
        row = y * width
        for x in range(width):
            if seen[row + x] or samples[row + x] < SMASK_OPAQUE:
                continue
            comps.append(_flood_opaque(samples, width, height, x, y, seen))
    comps.sort(key=len, reverse=True)
    return comps


def _fit_circle_rays(
    pts: list[tuple[int, int]],
    width: int,
    height: int,
    samples: bytes,
) -> tuple[int, int, int]:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    # Badge pulls the bbox right; start left of the geometric center.
    seed_x = minx + int((maxx - minx) * 0.42)
    seed_y = (miny + maxy) // 2

    def ray_stats(cx: int, cy: int) -> tuple[float, float, list[int]]:
        rays: list[int] = []
        for k in range(72):
            ang = 2 * math.pi * k / 72
            r = 0
            while True:
                x = int(round(cx + (r + 1) * math.cos(ang)))
                y = int(round(cy + (r + 1) * math.sin(ang)))
                if not (0 <= x < width and 0 <= y < height) or samples[y * width + x] < SMASK_OPAQUE:
                    break
                r += 1
            rays.append(r)
        ordered = sorted(rays)
        return ordered[7], ordered[36], rays

    best: tuple[float, int, int, int] | None = None
    for dy in range(-24, 25, 2):
        for dx in range(-24, 25, 2):
            cx, cy = seed_x + dx, seed_y + dy
            if not (0 <= cx < width and 0 <= cy < height):
                continue
            if samples[cy * width + cx] < SMASK_OPAQUE:
                continue
            p10, p50, _rays = ray_stats(cx, cy)
            # Tight circular disk: low spread on the inner 90% of rays.
            score = p50 - abs(p50 - p10)
            if best is None or score > best[0]:
                best = (score, cx, cy, int(round(p50)))
    if best is None:
        raise RuntimeError("Could not fit intro portrait circle")
    return best[1], best[2], best[3]


def _fit_badge_circle(
    face_pts: list[tuple[int, int]],
    face_cx: int,
    face_cy: int,
    face_r: int,
    width: int,
    height: int,
    samples: bytes,
) -> tuple[int, int, int]:
    band = (face_r + 2) ** 2
    protrusion = [(x, y) for x, y in face_pts if (x - face_cx) ** 2 + (y - face_cy) ** 2 > band]
    if len(protrusion) < 200:
        raise RuntimeError("Intro portrait badge protrusion is missing")
    seed_x = int(sum(p[0] for p in protrusion) / len(protrusion))
    seed_y = int(sum(p[1] for p in protrusion) / len(protrusion))

    def radius_at(cx: int, cy: int) -> int:
        r = 0
        while r < 120:
            good = 0
            for k in range(24):
                ang = 2 * math.pi * k / 24
                x = int(round(cx + (r + 1) * math.cos(ang)))
                y = int(round(cy + (r + 1) * math.sin(ang)))
                if 0 <= x < width and 0 <= y < height and samples[y * width + x] >= SMASK_OPAQUE:
                    good += 1
            if good < 20:
                return r
            r += 1
        return r

    best = (radius_at(seed_x, seed_y), seed_x, seed_y)
    for dy in range(-10, 11, 1):
        for dx in range(-10, 11, 1):
            cx, cy = seed_x + dx, seed_y + dy
            r = radius_at(cx, cy)
            if r > best[0]:
                best = (r, cx, cy)
    if best[0] < 20:
        raise RuntimeError(f"Intro portrait badge circle is too small: {best}")
    return best[1], best[2], best[0]


def _dilate_mask(src: bytes, width: int, height: int, radius: int) -> bytearray:
    out = bytearray(src)
    if radius <= 0:
        return out
    r2 = radius * radius
    ons = [i for i, v in enumerate(src) if v]
    for i in ons:
        x, y = i % width, i // width
        for dy in range(-radius, radius + 1):
            yy = y + dy
            if yy < 0 or yy >= height:
                continue
            for dx in range(-radius, radius + 1):
                if dx * dx + dy * dy > r2:
                    continue
                xx = x + dx
                if 0 <= xx < width:
                    out[yy * width + xx] = 255
    return out


def _is_teal_design(r: int, g: int, b: int) -> bool:
    """Teal crescent bands and the KOT badge icon."""
    return g >= 70 and b >= 70 and g >= r + 10 and b >= r + 10


def _is_badge_disk(r: int, g: int, b: int) -> bool:
    """Near-white badge plate (distinct from the ~203 gray photo background)."""
    return r >= 230 and g >= 230 and b >= 230


def _is_original_person_or_photo(r: int, g: int, b: int) -> bool:
    """Skin / hair / jacket / circular photo background — not arc or badge."""
    if _is_teal_design(r, g, b) or _is_badge_disk(r, g, b):
        return False
    if abs(r - g) <= 12 and abs(g - b) <= 12 and 140 <= r <= 235:
        return True
    if r < 90 and g < 90 and b < 90:
        return True
    if r > 90 and r > g + 10 and r > b + 15 and g > 50:
        return True
    if r > 170 and g > 140 and b > 110 and r >= g >= b and (r - b) > 18:
        return True
    return False


def find_intro_portrait_xrefs(doc: pymupdf.Document) -> tuple[int, int]:
    page = doc[INTRO_PAGE_INDEX]
    matches: list[tuple[int, int]] = []
    for im in page.get_images(full=True):
        xref, smask, width, height = int(im[0]), int(im[1]), int(im[2]), int(im[3])
        if smask > 0 and (width, height) == INTRO_PORTRAIT_SIZE:
            matches.append((xref, smask))
    if len(matches) != 1:
        raise RuntimeError(f"Expected one intro portrait image on page 2, found {matches}")
    return matches[0]


def clear_intro_portrait_slot(doc: pymupdf.Document) -> dict:
    """Make the intro portrait circle an empty slot.

    The 600×585 image is the portrait plus the teal crescent and badge.
    Clearing the whole XObject would delete those graphics. The previous
    punch only zeroed opaque (>=128) face-component pixels and kept a
    whole circle around the badge, so the circular AA fringe and
    shirt/hair next to the badge stayed visible under the runtime avatar.

    This pass:
    - keeps the crescent component (plus a small dilation for its own AA)
    - keeps only badge-plate white and teal-icon pixels near the badge
    - zeros RGB + SMask for the face disk, its AA halo, and any leftover
      original person/photo-background pixels in that neighborhood
    """
    image_xref, smask_xref = find_intro_portrait_xrefs(doc)
    sm = pymupdf.Pixmap(doc, smask_xref)
    if sm.n != 1 or (sm.width, sm.height) != INTRO_PORTRAIT_SIZE:
        raise RuntimeError(f"Unexpected intro portrait mask {sm.width}x{sm.height} n={sm.n}")
    width, height = sm.width, sm.height
    orig_mask = bytes(sm.samples)
    comps = _opaque_components(orig_mask, width, height)
    if len(comps) < 2 or len(comps[0]) < 100_000 or len(comps[1]) < 40_000:
        sizes = [len(c) for c in comps[:5]]
        raise RuntimeError(f"Unexpected intro portrait mask components: {sizes}")

    face_pts = comps[0]
    face_cx, face_cy, face_r = _fit_circle_rays(face_pts, width, height, orig_mask)
    if not (210 <= face_r <= 240):
        raise RuntimeError(f"Intro portrait radius out of range: {face_r}")
    badge_cx, badge_cy, badge_r = _fit_badge_circle(
        face_pts, face_cx, face_cy, face_r, width, height, orig_mask
    )

    rgb = pymupdf.Pixmap(doc, image_xref)
    if rgb.n < 3 or (rgb.width, rgb.height) != INTRO_PORTRAIT_SIZE:
        raise RuntimeError(f"Unexpected intro portrait image {rgb.width}x{rgb.height} n={rgb.n}")
    pixels = bytearray(rgb.samples)
    n = rgb.n
    mask = bytearray(orig_mask)

    crescent = bytearray(width * height)
    for x, y in comps[1]:
        crescent[y * width + x] = 255
    crescent_keep = _dilate_mask(bytes(crescent), width, height, 3)
    for y in range(height):
        for x in range(width):
            idx = y * width + x
            if not crescent_keep[idx] or crescent[idx]:
                continue
            i = idx * n
            r, g, b = pixels[i], pixels[i + 1], pixels[i + 2]
            if _is_original_person_or_photo(r, g, b):
                crescent_keep[idx] = 0

    badge_seed = bytearray(width * height)
    badge_r2 = (badge_r + 4) ** 2
    for y in range(height):
        for x in range(width):
            if (x - badge_cx) ** 2 + (y - badge_cy) ** 2 > badge_r2:
                continue
            if orig_mask[y * width + x] == 0:
                continue
            i = (y * width + x) * n
            r, g, b = pixels[i], pixels[i + 1], pixels[i + 2]
            if _is_badge_disk(r, g, b) or _is_teal_design(r, g, b):
                badge_seed[y * width + x] = 255
    badge_keep = _dilate_mask(bytes(badge_seed), width, height, 2)
    for y in range(height):
        for x in range(width):
            idx = y * width + x
            if not badge_keep[idx] or badge_seed[idx]:
                continue
            i = idx * n
            r, g, b = pixels[i], pixels[i + 1], pixels[i + 2]
            # Dilation is only for badge AA; do not keep shirt/hair/gray photo.
            if _is_original_person_or_photo(r, g, b):
                badge_keep[idx] = 0
    keep_count = sum(1 for a, b in zip(crescent_keep, badge_keep) if a or b)
    if keep_count < 50_000:
        raise RuntimeError(f"Intro keep mask too small: {keep_count}")

    punch_r2 = (face_r + PORTRAIT_AA_MARGIN_PX) ** 2
    punched = 0
    kept = 0
    for y in range(height):
        for x in range(width):
            idx = y * width + x
            if crescent_keep[idx] or badge_keep[idx]:
                kept += 1
                continue
            i = idx * n
            r, g, b = pixels[i], pixels[i + 1], pixels[i + 2]
            a = orig_mask[idx]
            d2 = (x - face_cx) ** 2 + (y - face_cy) ** 2
            in_slot_neighborhood = d2 <= punch_r2
            leftover_person = a > 0 and _is_original_person_or_photo(r, g, b) and d2 <= (face_r + 14) ** 2
            if not in_slot_neighborhood and not leftover_person:
                continue
            if a == 0 and not leftover_person:
                continue
            mask[idx] = 0
            pixels[i] = 255
            pixels[i + 1] = 255
            pixels[i + 2] = 255
            punched += 1

    leftover_person = 0
    leftover_alpha_in_disk = 0
    face_r2 = face_r ** 2
    for y in range(height):
        for x in range(width):
            idx = y * width + x
            a = mask[idx]
            if a == 0:
                continue
            i = idx * n
            r, g, b = pixels[i], pixels[i + 1], pixels[i + 2]
            d2 = (x - face_cx) ** 2 + (y - face_cy) ** 2
            if d2 <= face_r2 and not (crescent_keep[idx] or badge_keep[idx]):
                leftover_alpha_in_disk += 1
            if d2 <= (face_r + PORTRAIT_AA_MARGIN_PX) ** 2 and _is_original_person_or_photo(r, g, b):
                leftover_person += 1
    if punched < 100_000:
        raise RuntimeError(f"Intro portrait punch looks wrong: punched={punched} kept={kept}")
    if leftover_person:
        raise RuntimeError(f"Original person/photo pixels still visible after punch: {leftover_person}")
    if leftover_alpha_in_disk:
        raise RuntimeError(f"Non-keep SMask still non-zero inside face disk: {leftover_alpha_in_disk}")

    doc.update_stream(smask_xref, bytes(mask), compress=1)
    doc.update_stream(image_xref, bytes(pixels), compress=1)
    obj = doc.xref_object(image_xref) or ""
    if "/SMask" not in obj:
        raise RuntimeError("Intro portrait image lost its soft mask")

    sx, sy, ox, oy = INTRO_PHOTO_CM
    page_cx = ox + face_cx * sx / width
    page_cy_top = (792.0 - oy - sy) + face_cy * sy / height
    page_r = face_r * sx / width
    return {
        "image_xref": image_xref,
        "smask_xref": smask_xref,
        "face_px": {"cx": face_cx, "cy": face_cy, "r": face_r},
        "badge_px": {"cx": badge_cx, "cy": badge_cy, "r": badge_r},
        "punched_pixels": punched,
        "kept_arc_and_badge_pixels": kept,
        "slot_page": {
            "cx": round(page_cx, 3),
            "cy_top": round(page_cy_top, 3),
            "r": round(page_r, 3),
        },
    }


def classify_page(page: pymupdf.Page) -> dict:
    text = page.get_text("text").strip()
    spans = 0
    d = page.get_text("dict")
    for block in d.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans += len(line.get("spans", []))
    raw = page.read_contents() or b""
    ops = count_text_ops(raw)
    return {
        "extractable_text": bool(text),
        "spans": spans,
        "page_stream": ops,
        "preview": " | ".join(text.splitlines()[:4]),
    }


def build_design(dst: Path) -> dict:
    if not V1_PATH.is_file():
        raise FileNotFoundError(V1_PATH)
    v1_hash_before = sha256(V1_PATH)
    work = TMP_DIR / "LT_COMMERCIAL_V2_design.work.pdf"
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(V1_PATH, work)

    doc = pymupdf.open(work)
    report = {
        "source": str(V1_PATH.relative_to(REPO)),
        "v1_sha256": v1_hash_before,
        "pages": [],
        "form_xobjects_stripped": [],
    }

    form_xrefs = collect_text_xobjects(doc)
    for xref in form_xrefs:
        raw = doc.xref_stream(xref) or b""
        new, removed = strip_text_objects(raw)
        leftover = count_text_ops(new)
        if leftover["BT"] or leftover["Tj"] or leftover["TJ"]:
            raise RuntimeError(f"Form xref {xref} still has text ops: {leftover}")
        doc.update_stream(xref, new)
        report["form_xobjects_stripped"].append({"xref": xref, "removed_BT": removed, "bytes": len(raw)})

    for i, page in enumerate(doc):
        raw = page.read_contents() or b""
        before = count_text_ops(raw)
        new, removed = strip_text_objects(raw)
        leftover = count_text_ops(new)
        if leftover["BT"] or leftover["Tj"] or leftover["TJ"]:
            raise RuntimeError(f"Page {i + 1} still has text ops: {leftover}")
        xrefs = page.get_contents() or []
        if not xrefs:
            page.set_contents(new)
        else:
            doc.update_stream(xrefs[0], new)
            for extra in xrefs[1:]:
                doc.update_stream(extra, b"")
        after_text = page.get_text("text").strip()
        report["pages"].append(
            {
                "page": i + 1,
                "removed_BT": removed,
                "ops_before": before,
                "remaining_extractable_text": after_text[:120],
            }
        )

    report["intro_portrait_slot"] = clear_intro_portrait_slot(doc)

    dst.parent.mkdir(parents=True, exist_ok=True)
    doc.save(dst, garbage=4, deflate=True, clean=True)
    doc.close()
    work.unlink(missing_ok=True)

    v1_hash_after = sha256(V1_PATH)
    if v1_hash_after != v1_hash_before:
        raise RuntimeError("LT_COMMERCIAL_V1.pdf changed — aborting")
    report["v1_unchanged"] = True
    report["output"] = str(dst.resolve().relative_to(REPO) if dst.resolve().is_relative_to(REPO) else dst)
    report["output_sha256"] = sha256(dst)
    return report


def write_poc_crops(v1: pymupdf.Document, clean: pymupdf.Document, old_v2: pymupdf.Document | None) -> None:
    crops = {
        "poc-tech-heading": (3, pymupdf.Rect(30, 42, 220, 88)),
        "poc-tech-paragraph": (3, pymupdf.Rect(300, 128, 560, 230)),
        "poc-price-cell": (4, pymupdf.Rect(400, 300, 530, 340)),
        "poc-advantages-block": (9, pymupdf.Rect(88, 120, 280, 210)),
        "poc-intro-portrait": (1, pymupdf.Rect(20, 240, 220, 380)),
    }
    out = TMP_DIR / "gen"
    out.mkdir(parents=True, exist_ok=True)
    mat = pymupdf.Matrix(2.5, 2.5)
    for name, (idx, clip) in crops.items():
        v1[idx].get_pixmap(matrix=mat, clip=clip, alpha=False).save(out / f"{name}-v1.png")
        clean[idx].get_pixmap(matrix=mat, clip=clip, alpha=False).save(out / f"{name}-clean.png")
        if old_v2 is not None and idx < old_v2.page_count:
            old_v2[idx].get_pixmap(matrix=mat, clip=clip, alpha=False).save(out / f"{name}-old-v2.png")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(V2_PATH))
    parser.add_argument("--skip-diff", action="store_true")
    args = parser.parse_args()
    out_path = Path(args.out)

    print("V1", V1_PATH, sha256(V1_PATH))
    v1 = pymupdf.open(V1_PATH)
    print("\n## Classification (V1)")
    for i, page in enumerate(v1):
        info = classify_page(page)
        kind = "A. removable PDF text" if info["extractable_text"] or info["page_stream"]["BT"] else "B. no extractable text"
        print(f"  p{i + 1}: {kind}; spans={info['spans']} BT={info['page_stream']['BT']} preview={info['preview'][:90]!r}")

    old_v2 = pymupdf.open(V2_PATH) if V2_PATH.is_file() else None
    report = build_design(out_path)
    print("\n## Build")
    print(json.dumps(report, indent=2))

    clean = pymupdf.open(out_path)
    write_poc_crops(v1, clean, old_v2)

    if not args.skip_diff:
        print("\n## Visual diff V1 vs clean design (glyph areas ignored)")
        slot = report.get("intro_portrait_slot", {}).get("slot_page", {})
        extra_by_page: dict[int, list[pymupdf.Rect]] = {}
        if slot:
            cx, cy, r = slot["cx"], slot["cy_top"], slot["r"]
            extra_by_page[2] = [pymupdf.Rect(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2)]
        diffs = []
        for i in range(v1.page_count):
            d = pixmap_diff_outside_text(
                v1[i],
                clean[i],
                zoom=2.0,
                extra_ignore=extra_by_page.get(i + 1),
            )
            diffs.append({"page": i + 1, **d})
            print(
                f"  p{i + 1}: changed={d['changed_pixels']}/{d['compared_pixels']} "
                f"({d['changed_pct']:.4f}%) rms={d['rms']:.4f} maxΔ={d['max_channel_delta']}"
            )
        (TMP_DIR / "v2-design-visual-diff.json").write_text(json.dumps(diffs, indent=2))

    leftover = []
    for i, page in enumerate(clean):
        t = page.get_text("text").strip()
        if t:
            leftover.append({"page": i + 1, "text": t[:160]})
    print("\n## Remaining extractable text", leftover or "none")

    if old_v2 is not None:
        old_v2.close()
    clean.close()
    v1.close()
    print("\nV1 unchanged", sha256(V1_PATH) == report["v1_sha256"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
