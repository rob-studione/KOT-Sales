import { deflateSync, inflateSync } from "node:zlib";

export type RgbaImage = { width: number; height: number; rgba: Uint8Array };

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 8 && PNG_SIG.every((b, i) => bytes[i] === b);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(data: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = data[src++]!;
    const row = y * stride;
    const prev = y === 0 ? null : (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const raw = data[src++]!;
      const left = x >= bpp ? out[row + x - bpp]! : 0;
      const up = prev == null ? 0 : out[prev + x]!;
      const upLeft = prev == null || x < bpp ? 0 : out[prev + x - bpp]!;
      let recon = raw;
      if (filter === 1) recon = (raw + left) & 0xff;
      else if (filter === 2) recon = (raw + up) & 0xff;
      else if (filter === 3) recon = (raw + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) recon = (raw + paeth(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
      out[row + x] = recon;
    }
  }
  return out;
}

export function decodePngRgba(bytes: Uint8Array): RgbaImage | null {
  if (!isPng(bytes)) return null;
  try {
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = -1;
    const idats: Uint8Array[] = [];
    let palette: Uint8Array | null = null;
    let trans: Uint8Array | null = null;

    while (offset + 12 <= bytes.length) {
      const length = readU32(bytes, offset);
      const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
      const data = bytes.subarray(offset + 8, offset + 8 + length);
      offset += 12 + length;
      if (type === "IHDR") {
        width = readU32(data, 0);
        height = readU32(data, 4);
        bitDepth = data[8]!;
        colorType = data[9]!;
        if (data[10] !== 0 || data[12] !== 0) return null;
      } else if (type === "PLTE") {
        palette = data;
      } else if (type === "tRNS") {
        trans = data;
      } else if (type === "IDAT") {
        idats.push(data);
      } else if (type === "IEND") {
        break;
      }
    }
    if (width <= 0 || height <= 0 || bitDepth !== 8) return null;

    const merged = new Uint8Array(idats.reduce((n, p) => n + p.length, 0));
    let woff = 0;
    for (const part of idats) {
      merged.set(part, woff);
      woff += part.length;
    }
    const inflated = inflateSync(Buffer.from(merged));

    const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
    const raw = unfilter(new Uint8Array(inflated), width, height, bpp);
    const rgba = new Uint8Array(width * height * 4);

    if (colorType === 6) {
      rgba.set(raw);
    } else if (colorType === 2) {
      for (let i = 0, j = 0; i < raw.length; i += 3, j += 4) {
        rgba[j] = raw[i]!;
        rgba[j + 1] = raw[i + 1]!;
        rgba[j + 2] = raw[i + 2]!;
        rgba[j + 3] = 255;
      }
    } else if (colorType === 0) {
      for (let i = 0, j = 0; i < raw.length; i++, j += 4) {
        const v = raw[i]!;
        rgba[j] = v;
        rgba[j + 1] = v;
        rgba[j + 2] = v;
        rgba[j + 3] = 255;
      }
    } else if (colorType === 4) {
      for (let i = 0, j = 0; i < raw.length; i += 2, j += 4) {
        const v = raw[i]!;
        rgba[j] = v;
        rgba[j + 1] = v;
        rgba[j + 2] = v;
        rgba[j + 3] = raw[i + 1]!;
      }
    } else if (colorType === 3 && palette) {
      for (let i = 0, j = 0; i < raw.length; i++, j += 4) {
        const idx = raw[i]! * 3;
        rgba[j] = palette[idx] ?? 0;
        rgba[j + 1] = palette[idx + 1] ?? 0;
        rgba[j + 2] = palette[idx + 2] ?? 0;
        rgba[j + 3] = trans?.[raw[i]!] ?? 255;
      }
    } else {
      return null;
    }
    return { width, height, rgba };
  } catch {
    return null;
  }
}

export function encodePngRgba(image: RgbaImage): Uint8Array {
  const { width, height, rgba } = image;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const compressed = deflateSync(Buffer.from(raw), { level: 9 });

  function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    writeU32(out, 0, data.length);
    out[4] = type.charCodeAt(0);
    out[5] = type.charCodeAt(1);
    out[6] = type.charCodeAt(2);
    out[7] = type.charCodeAt(3);
    out.set(data, 8);
    const crcSrc = out.subarray(4, 8 + data.length);
    writeU32(out, 8 + data.length, crc32(crcSrc));
    return out;
  }

  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Uint8Array.from(PNG_SIG);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(compressed)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}
