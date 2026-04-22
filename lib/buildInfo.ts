export type PublicBuildInfo = {
  appVersion: string | null;
  buildDateIso: string | null; // YYYY-MM-DD
  deploymentCreatedAt: string | null; // raw env string, may be epoch or ISO
};

function normalizeNonEmpty(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function normalizeIsoDate(value: unknown): string | null {
  const v = normalizeNonEmpty(value);
  if (!v) return null;
  // Accept already-normalized YYYY-MM-DD. If it's something else, try parsing.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function getPublicBuildInfo(): PublicBuildInfo {
  // Must be safe in browser + server. Only NEXT_PUBLIC_* are exposed client-side.
  return {
    appVersion: normalizeNonEmpty(process.env.NEXT_PUBLIC_APP_VERSION),
    buildDateIso: normalizeIsoDate(process.env.NEXT_PUBLIC_BUILD_DATE),
    deploymentCreatedAt: null,
  };
}

export async function fetchPublicBuildInfo(signal?: AbortSignal): Promise<PublicBuildInfo> {
  const res = await fetch("/api/public-build-info", { method: "GET", cache: "no-store", signal });
  if (!res.ok) {
    throw new Error(`Failed to load build info (${res.status})`);
  }
  const json = (await res.json()) as Partial<PublicBuildInfo>;
  return {
    appVersion: normalizeNonEmpty(json.appVersion),
    buildDateIso: normalizeIsoDate(json.buildDateIso),
    deploymentCreatedAt: normalizeNonEmpty((json as any).deploymentCreatedAt),
  };
}

export function formatBuildDateShort(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" }).format(d);
}

function parsePossiblyEpochDate(value: string | null): Date | null {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;

  if (/^\d+$/.test(v)) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    // Support both seconds (10 digits) and milliseconds (13+ digits).
    const ms = v.length <= 10 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDeploymentUpdatedAt(
  deploymentCreatedAt: string | null,
  timeZone: string = "Europe/Vilnius"
): string | null {
  const d = parsePossiblyEpochDate(deploymentCreatedAt);
  if (!d) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const map = new Map(parts.map((p) => [p.type, p.value]));
  const yyyy = map.get("year");
  const mm = map.get("month");
  const dd = map.get("day");
  const hh = map.get("hour");
  const min = map.get("minute");

  if (!yyyy || !mm || !dd || !hh || !min) return null;
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

