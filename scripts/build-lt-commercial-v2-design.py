#!/usr/bin/env python3
"""Build LT_COMMERCIAL_V2_design.pdf = V1 visuals minus PDF text objects.

Never writes to LT_COMMERCIAL_V1.pdf. Text is removed at the content-stream
operator level (BT…ET). Images, paths, form XObjects, and patterns stay.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

import pymupdf

REPO = Path(__file__).resolve().parents[1]
V1_PATH = REPO / "assets/commercial-proposals/LT_COMMERCIAL_V1.pdf"
V2_PATH = REPO / "assets/commercial-proposals/LT_COMMERCIAL_V2_design.pdf"
TMP_DIR = REPO / "tmp/cp-ref"

WHITESPACE = b"\x00\t\n\x0c\r "
DELIMS = set(WHITESPACE) | set(b"()<>[]{}/%")


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
    for r in union_mask(glyph_rects(v1_page), pad=1.4):
        draw.rectangle(
            [r.x0 * zoom, r.y0 * zoom, r.x1 * zoom, r.y1 * zoom],
            fill=(0, 0, 0),
        )
    mask = Image.new("L", (a.width, a.height), 255)
    md = ImageDraw.Draw(mask)
    for r in union_mask(glyph_rects(v1_page), pad=1.4):
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
        diffs = []
        for i in range(v1.page_count):
            d = pixmap_diff_outside_text(v1[i], clean[i], zoom=2.0)
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
