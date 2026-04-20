export type PublicBuildInfo = {
  appVersion: string | null;
  commitHash: string | null;
  buildDateIso: string | null; // YYYY-MM-DD
};

function normalizeNonEmpty(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function normalizeCommitHash(value: unknown): string | null {
  const v = normalizeNonEmpty(value);
  if (!v) return null;
  return v.slice(0, 7);
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
    commitHash: normalizeCommitHash(process.env.NEXT_PUBLIC_COMMIT_HASH),
    buildDateIso: normalizeIsoDate(process.env.NEXT_PUBLIC_BUILD_DATE),
  };
}

export function formatBuildDateShort(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" }).format(d);
}

