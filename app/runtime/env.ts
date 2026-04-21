import pkg from "@/package.json";

export type RuntimeBuildInfo = {
  appVersion: string | null;
  buildDateIso: string | null; // YYYY-MM-DD
};

function normalizeNonEmpty(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function normalizeIsoDate(value: unknown): string | null {
  const v = normalizeNonEmpty(value);
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function getRuntimeBuildInfo(): RuntimeBuildInfo {
  const appVersion =
    normalizeNonEmpty(process.env.APP_VERSION) ??
    normalizeNonEmpty(process.env.NEXT_PUBLIC_APP_VERSION) ??
    normalizeNonEmpty(pkg.version);

  const buildDateIso =
    normalizeIsoDate(process.env.BUILD_DATE) ??
    normalizeIsoDate(process.env.VERCEL_GIT_COMMIT_DATE) ??
    normalizeIsoDate(process.env.NEXT_PUBLIC_BUILD_DATE);

  return { appVersion, buildDateIso };
}

