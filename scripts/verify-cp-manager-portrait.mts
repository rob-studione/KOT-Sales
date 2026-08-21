import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { encodePngRgba, decodePngRgba, type RgbaImage } from "@/lib/commercialProposal/pngRgba";
import {
  avatarHasPortraitArtwork,
  prepareManagerPortrait,
} from "@/lib/commercialProposal/prepareManagerPortrait";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function fill(image: RgbaImage, r: number, g: number, b: number, a = 255) {
  for (let i = 0; i < image.rgba.length; i += 4) {
    image.rgba[i] = r;
    image.rgba[i + 1] = g;
    image.rgba[i + 2] = b;
    image.rgba[i + 3] = a;
  }
}

function disc(image: RgbaImage, cx: number, cy: number, radius: number, rgb: [number, number, number]) {
  const { width, height, rgba } = image;
  const r2 = radius * radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      const i = (y * width + x) * 4;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }
}

function decoratedPortrait(): Uint8Array {
  const image: RgbaImage = { width: 220, height: 200, rgba: new Uint8Array(220 * 200 * 4) };
  fill(image, 255, 255, 255);
  disc(image, 100, 100, 78, [237, 237, 237]);
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 220; x++) {
      const d = Math.hypot(x - 100, y - 100);
      const ang = Math.atan2(y - 100, x - 100);
      if (d >= 64 && d <= 78 && ang > 0.4 && ang < 3.3) {
        const i = (y * 220 + x) * 4;
        image.rgba[i] = 52;
        image.rgba[i + 1] = 109;
        image.rgba[i + 2] = 128;
      }
    }
  }
  disc(image, 100, 108, 28, [168, 118, 96]);
  disc(image, 168, 148, 16, [255, 255, 255]);
  disc(image, 168, 148, 7, [52, 109, 128]);
  return encodePngRgba(image);
}

function scenePhoto(): Uint8Array {
  const image: RgbaImage = { width: 160, height: 160, rgba: new Uint8Array(160 * 160 * 4) };
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 160; x++) {
      const i = (y * 160 + x) * 4;
      image.rgba[i] = 40 + ((x * 3) % 80);
      image.rgba[i + 1] = 90 + ((y * 2) % 70);
      image.rgba[i + 2] = 50 + ((x + y) % 40);
      image.rgba[i + 3] = 255;
    }
  }
  disc(image, 80, 78, 34, [196, 142, 118]);
  return encodePngRgba(image);
}

function tealPct(image: RgbaImage): number {
  let n = 0;
  let teal = 0;
  for (let i = 0; i < image.rgba.length; i += 4) {
    if (image.rgba[i + 3]! < 16) continue;
    n++;
    const r = image.rgba[i]!;
    const g = image.rgba[i + 1]!;
    const b = image.rgba[i + 2]!;
    if (g >= 70 && b >= 70 && g >= r + 10 && b >= r + 10) teal++;
  }
  return n ? (100 * teal) / n : 0;
}

function grayDiscPct(image: RgbaImage): number {
  let n = 0;
  let gray = 0;
  for (let i = 0; i < image.rgba.length; i += 4) {
    n++;
    if (image.rgba[i + 3]! < 16) continue;
    const r = image.rgba[i]!;
    const g = image.rgba[i + 1]!;
    const b = image.rgba[i + 2]!;
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 14 && (r + g + b) / 3 >= 200) gray++;
  }
  return (100 * gray) / n;
}

const decorated = decoratedPortrait();
const decoratedDecoded = decodePngRgba(decorated)!;
assert(avatarHasPortraitArtwork(decoratedDecoded), "decorated fixture should be detected");
const cleaned = decodePngRgba(prepareManagerPortrait(decorated))!;
assert(tealPct(cleaned) < 1, `decorated teal leftover ${tealPct(cleaned)}`);
assert(grayDiscPct(cleaned) < 8, `decorated gray leftover ${grayDiscPct(cleaned)}`);
assert(cleaned.width * cleaned.height < decoratedDecoded.width * decoratedDecoded.height, "cleaned photo should crop in");

const photo = scenePhoto();
const photoDecoded = decodePngRgba(photo)!;
assert(!avatarHasPortraitArtwork(photoDecoded), "scene photo must not look like badge artwork");
const photoOut = prepareManagerPortrait(photo);
assert(Buffer.from(photoOut).equals(Buffer.from(photo)), "plain photo bytes stay unchanged");

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
assert(prepareManagerPortrait(jpeg) === jpeg, "non-png is passed through");

const outDir = resolve("tmp/cp-ref/avatar-inspect");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "verify-decorated-in.png"), decorated);
writeFileSync(resolve(outDir, "verify-decorated-out.png"), prepareManagerPortrait(decorated));

const livePath = resolve("tmp/cp-ref/avatar-inspect/robertas-avatar-source.png");
if (existsSync(livePath)) {
  const live = new Uint8Array(readFileSync(livePath));
  const liveDecoded = decodePngRgba(live)!;
  assert(avatarHasPortraitArtwork(liveDecoded), "Robertas CRM avatar still contains portrait artwork");
  const liveOut = prepareManagerPortrait(live);
  const liveClean = decodePngRgba(liveOut)!;
  assert(tealPct(liveClean) < 2, `live teal leftover ${tealPct(liveClean)}`);
  assert(grayDiscPct(liveClean) < 12, `live gray leftover ${grayDiscPct(liveClean)}`);
  writeFileSync(resolve(outDir, "robertas-photo-only.png"), liveOut);
}

console.log("verify-cp-manager-portrait: ok");
