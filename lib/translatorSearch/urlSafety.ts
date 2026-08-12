/**
 * URL / IP SSRF apsauga — Node `net.isIP` + CIDR/range tikrinimas (be string prefix heuristikų).
 */

import net from "node:net";

export type UrlSafetyOk = { ok: true; canonicalHref: string; hostname: string };
export type UrlSafetyErr = { ok: false; code: string; error: string };
export type UrlSafetyResult = UrlSafetyOk | UrlSafetyErr;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal"];

/** IPv4 CIDR blocks that must not be fetched. */
const BLOCKED_IPV4_CIDRS: Array<{ base: number; maskBits: number }> = [
  { base: ipv4ToInt("0.0.0.0"), maskBits: 8 },
  { base: ipv4ToInt("10.0.0.0"), maskBits: 8 },
  { base: ipv4ToInt("100.64.0.0"), maskBits: 10 },
  { base: ipv4ToInt("127.0.0.0"), maskBits: 8 },
  { base: ipv4ToInt("169.254.0.0"), maskBits: 16 },
  { base: ipv4ToInt("172.16.0.0"), maskBits: 12 },
  { base: ipv4ToInt("192.0.0.0"), maskBits: 24 },
  { base: ipv4ToInt("192.0.2.0"), maskBits: 24 }, // TEST-NET-1
  { base: ipv4ToInt("192.168.0.0"), maskBits: 16 },
  { base: ipv4ToInt("198.18.0.0"), maskBits: 15 }, // benchmarking
  { base: ipv4ToInt("198.51.100.0"), maskBits: 24 }, // TEST-NET-2
  { base: ipv4ToInt("203.0.113.0"), maskBits: 24 }, // TEST-NET-3
  { base: ipv4ToInt("224.0.0.0"), maskBits: 4 }, // multicast
  { base: ipv4ToInt("240.0.0.0"), maskBits: 4 }, // reserved
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid IPv4: ${ip}`);
  }
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function ipv4InCidr(ipInt: number, base: number, maskBits: number): boolean {
  if (maskBits === 0) return true;
  const mask = maskBits === 32 ? 0xffffffff : (~0 << (32 - maskBits)) >>> 0;
  return (ipInt & mask) === (base & mask);
}

/**
 * WHATWG / Node may keep IPv6 hostnames in bracket form (`[::1]`).
 * Strip brackets (and zone id) before `net.isIP` / CIDR checks.
 */
export function normalizeIpHostname(hostnameRaw: string): string {
  let s = String(hostnameRaw ?? "").trim().toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  return s;
}

/** Expand IPv6 to 8 hextets as BigInt (128-bit). */
export function ipv6ToBigInt(ip: string): bigint | null {
  let s = normalizeIpHostname(ip);
  if (!s) return null;

  // IPv4-mapped / dotted quad tail: ::ffff:192.0.2.1
  const v4Tail = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4Tail) {
    const head = v4Tail[1]!;
    const v4 = v4Tail[2]!;
    const nums = v4.split(".").map(Number);
    if (nums.length !== 4 || nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((nums[0]! << 8) | nums[1]!).toString(16);
    const lo = ((nums[2]! << 8) | nums[3]!).toString(16);
    s = `${head}${hi}:${lo}`;
  }

  if (s.includes(".")) return null;

  const halves = s.split("::");
  if (halves.length > 2) return null;

  const parseHalf = (half: string): number[] => {
    if (!half) return [];
    return half.split(":").map((h) => {
      if (!/^[0-9a-f]{1,4}$/.test(h)) return NaN;
      return parseInt(h, 16);
    });
  };

  let head: number[];
  let tail: number[];
  if (halves.length === 1) {
    head = parseHalf(halves[0]!);
    tail = [];
    if (head.length !== 8 || head.some((n) => Number.isNaN(n))) return null;
  } else {
    head = parseHalf(halves[0]!);
    tail = parseHalf(halves[1]!);
    if (head.some((n) => Number.isNaN(n)) || tail.some((n) => Number.isNaN(n))) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    head = [...head, ...Array(missing).fill(0), ...tail];
  }

  let out = BigInt(0);
  for (const h of head) out = (out << BigInt(16)) + BigInt(h);
  return out;
}

function ipv6InCidr(ip: bigint, base: bigint, maskBits: number): boolean {
  if (maskBits <= 0) return true;
  if (maskBits >= 128) return ip === base;
  const shift = BigInt(128 - maskBits);
  return ip >> shift === base >> shift;
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const MASK32 = BigInt("0xffffffff");

const BLOCKED_IPV6: Array<{ base: bigint; maskBits: number }> = [
  { base: ZERO, maskBits: 128 }, // ::
  { base: ONE, maskBits: 128 }, // ::1
  { base: ipv6ToBigInt("::ffff:0:0")!, maskBits: 96 },
  { base: ipv6ToBigInt("fc00::")!, maskBits: 7 },
  { base: ipv6ToBigInt("fe80::")!, maskBits: 10 },
  { base: ipv6ToBigInt("ff00::")!, maskBits: 8 },
  { base: ipv6ToBigInt("2001:db8::")!, maskBits: 32 },
  { base: ipv6ToBigInt("2001:2::")!, maskBits: 48 },
];

export function isBlockedIpAddress(ipRaw: string): boolean {
  const ip = normalizeIpHostname(ipRaw);
  if (!ip) return true;

  const kind = net.isIP(ip);
  if (kind === 4) {
    let ipInt: number;
    try {
      ipInt = ipv4ToInt(ip);
    } catch {
      return true;
    }
    return BLOCKED_IPV4_CIDRS.some(({ base, maskBits }) => ipv4InCidr(ipInt, base, maskBits));
  }

  if (kind === 6) {
    const v6 = ipv6ToBigInt(ip);
    if (v6 == null) return true;

    // IPv4-mapped ::ffff:x.x.x.x — validate embedded IPv4 against v4 rules
    const mappedBase = ipv6ToBigInt("::ffff:0:0")!;
    if (ipv6InCidr(v6, mappedBase, 96)) {
      const embedded = Number(v6 & MASK32);
      const a = (embedded >>> 24) & 0xff;
      const b = (embedded >>> 16) & 0xff;
      const c = (embedded >>> 8) & 0xff;
      const d = embedded & 0xff;
      return isBlockedIpAddress(`${a}.${b}.${c}.${d}`);
    }

    return BLOCKED_IPV6.some(({ base, maskBits }) => ipv6InCidr(v6, base, maskBits));
  }

  return true;
}

export function isBlockedHostname(hostnameRaw: string): boolean {
  const hostname = normalizeIpHostname(hostnameRaw).replace(/\.$/, "");
  if (!hostname) return true;
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((s) => hostname.endsWith(s))) return true;
  if (net.isIP(hostname)) return isBlockedIpAddress(hostname);
  // Bracketed / unnormalized forms already handled by normalizeIpHostname.
  // If original had brackets stripped and still looks like IP but isIP failed → block.
  if (hostname.includes(":") && !hostname.includes(".")) return true;
  return false;
}

/**
 * Sync URL checks (scheme, credentials, hostname). DNS/IP checked separately after resolve / redirect.
 */
export function assertSafeHttpsUrlSync(
  raw: string,
  opts?: { allowHttp?: boolean }
): UrlSafetyResult {
  const allowHttp = Boolean(opts?.allowHttp);
  let parsed: URL;
  try {
    parsed = new URL(String(raw ?? "").trim());
  } catch {
    return { ok: false, code: "url_invalid", error: "Neteisingas URL." };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === "https:") {
    // ok
  } else if (protocol === "http:" && allowHttp) {
    // only when explicitly allowed (not for seed)
  } else {
    return { ok: false, code: "url_scheme", error: "Leidžiami tik HTTPS URL." };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, code: "url_credentials", error: "URL su prisijungimo duomenimis atmestas." };
  }

  const hostname = normalizeIpHostname(parsed.hostname);
  if (!hostname) {
    return { ok: false, code: "url_host", error: "Trūksta hostname." };
  }
  if (isBlockedHostname(hostname)) {
    return { ok: false, code: "url_blocked_host", error: "Hostname neleidžiamas (localhost / private / metadata)." };
  }

  parsed.hash = "";
  return { ok: true, canonicalHref: parsed.href, hostname };
}

export function canonicalizeUrl(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    return u.href;
  } catch {
    return href.trim();
  }
}

/** Only http(s) website URLs; otherwise null. */
export function sanitizeWebsiteUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(String(value ?? "").trim());
}
