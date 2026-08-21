import { decodePngRgba, encodePngRgba, isPng, type RgbaImage } from "@/lib/commercialProposal/pngRgba";

/** Same teal test as the V2 design punch: crescent bands and KOT badge icon. */
function isTealDecoration(r: number, g: number, b: number): boolean {
  return g >= 70 && b >= 70 && g >= r + 10 && b >= r + 10;
}

function luma(r: number, g: number, b: number): number {
  return (r + g + b) / 3;
}

function chroma(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function localLumaRange(rgba: Uint8Array, width: number, height: number, x: number, y: number): number {
  let min = 255;
  let max = 0;
  for (let dy = -1; dy <= 1; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= height) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= width) continue;
      const i = (yy * width + xx) * 4;
      const v = luma(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return max - min;
}

function regionStats(
  image: RgbaImage,
  pred: (x: number, y: number, r: number, g: number, b: number, a: number) => boolean
): { n: number; teal: number; white: number; transparent: number } {
  const { width, height, rgba } = image;
  let n = 0;
  let teal = 0;
  let white = 0;
  let transparent = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      const a = rgba[i + 3]!;
      if (!pred(x, y, r, g, b, a)) continue;
      n++;
      if (a <= 8) transparent++;
      if (a >= 250 && isTealDecoration(r, g, b)) teal++;
      if (a >= 250 && r >= 248 && g >= 248 && b >= 248) white++;
    }
  }
  return { n, teal, white, transparent };
}

/** CRM avatar is a circular badge graphic (arc / gray disc / KOT badge), not a photo. */
export function avatarHasPortraitArtwork(image: RgbaImage): boolean {
  const { width, height } = image;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const r = Math.min(width, height) / 2;
  const corners = regionStats(image, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return d >= r * 0.92;
  });
  const outer = regionStats(image, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return d >= r * 0.62 && d <= r * 0.98;
  });
  if (corners.n === 0) return false;
  const cornerCanvasPct = (100 * (corners.white + corners.transparent)) / corners.n;
  const tealPct = (100 * outer.teal) / Math.max(outer.n, 1);
  return cornerCanvasPct >= 55 && tealPct >= 1.2;
}

function isFlatBackdrop(r: number, g: number, b: number, variance: number): boolean {
  if (isTealDecoration(r, g, b)) return true;
  if (variance >= 18) return false;
  if (r >= 230 && g >= 230 && b >= 230) return true;
  return chroma(r, g, b) <= 14 && luma(r, g, b) >= 188 && luma(r, g, b) <= 252;
}

function isLikelyPerson(r: number, g: number, b: number, variance: number): boolean {
  if (isTealDecoration(r, g, b) || isFlatBackdrop(r, g, b, 0)) return false;
  if (r < 90 && g < 90 && b < 90) return true;
  if (r > 90 && r > g + 10 && r > b + 15 && g > 50) return true;
  if (r > 170 && g > 140 && b > 110 && r >= g && g >= b && r - b > 18) return true;
  return variance >= 18;
}

function hasTransparentNeighbor(rgba: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= height) continue;
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const xx = x + dx;
      if (xx < 0 || xx >= width) continue;
      if (rgba[(yy * width + xx) * 4 + 3]! < 16) return true;
    }
  }
  return false;
}

function stripPortraitArtwork(image: RgbaImage): RgbaImage {
  const { width, height, rgba } = image;
  const out = new Uint8Array(rgba);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = out[i]!;
      const g = out[i + 1]!;
      const b = out[i + 2]!;
      if (isFlatBackdrop(r, g, b, localLumaRange(rgba, width, height, x, y))) {
        out[i + 3] = 0;
      }
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const next = new Uint8Array(out);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (out[i + 3]! < 16) continue;
        if (!hasTransparentNeighbor(out, width, height, x, y)) continue;
        const variance = localLumaRange(out, width, height, x, y);
        if (!isLikelyPerson(out[i]!, out[i + 1]!, out[i + 2]!, variance)) {
          next[i + 3] = 0;
        }
      }
    }
    out.set(next);
  }
  return { width, height, rgba: out };
}

export function cropToOpaque(image: RgbaImage, padRatio = 0.03): RgbaImage | null {
  const { width, height, rgba } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3]! < 16) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return null;
  const pad = Math.max(2, Math.round(Math.max(maxX - minX, maxY - minY) * padRatio));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const next = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    next.set(rgba.subarray(((minY + y) * width + minX) * 4, ((minY + y) * width + minX + w) * 4), y * w * 4);
  }
  return { width: w, height: h, rgba: next };
}

function opaqueCount(image: RgbaImage): number {
  let n = 0;
  for (let i = 3; i < image.rgba.length; i += 4) if (image.rgba[i]! >= 16) n++;
  return n;
}

/**
 * CRM avatar → person photo only.
 * Template already paints the teal arc and KOT badge; those must not come from the file.
 */
export function prepareManagerPortrait(bytes: Uint8Array): Uint8Array {
  if (!bytes.byteLength || !isPng(bytes)) return bytes;
  const decoded = decodePngRgba(bytes);
  if (!decoded) return bytes;

  const source = avatarHasPortraitArtwork(decoded) ? stripPortraitArtwork(decoded) : decoded;
  if (opaqueCount(source) < decoded.width * decoded.height * 0.02) return bytes;

  const cropped = cropToOpaque(source);
  if (!cropped) return bytes;
  if (
    cropped.width === decoded.width &&
    cropped.height === decoded.height &&
    cropped.rgba.every((v, i) => v === decoded.rgba[i])
  ) {
    return bytes;
  }
  return encodePngRgba(cropped);
}
