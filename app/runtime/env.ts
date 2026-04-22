import pkg from "@/package.json";

export type RuntimeBuildInfo = {
  appVersion: string | null;
  buildDateIso: string | null; // YYYY-MM-DD
  deploymentCreatedAt: string | null; // raw value from env (stringified)
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

function readBuildInfoJson(): Partial<RuntimeBuildInfo> | null {
  try {
    // Keep `fs` out of client bundles (this module should stay server-only).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");

    const p = path.join(process.cwd(), "public", "build-info.json");
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const obj = parsed as Record<string, unknown>;
    return {
      buildDateIso: normalizeIsoDate(obj.buildDateIso),
      deploymentCreatedAt: normalizeNonEmpty(obj.deploymentCreatedAt),
    };
  } catch {
    return null;
  }
}

export function getRuntimeBuildInfo(): RuntimeBuildInfo {
  const appVersion =
    normalizeNonEmpty(process.env.APP_VERSION) ??
    normalizeNonEmpty(process.env.NEXT_PUBLIC_APP_VERSION) ??
    normalizeNonEmpty(pkg.version);

  const buildInfoJson = readBuildInfoJson();

  const buildDateIso =
    normalizeIsoDate(process.env.BUILD_DATE) ??
    normalizeIsoDate(process.env.NEXT_PUBLIC_BUILD_DATE) ??
    normalizeIsoDate(buildInfoJson?.buildDateIso);

  const deploymentCreatedAt =
    normalizeNonEmpty(process.env.VERCEL_DEPLOYMENT_CREATED_AT) ??
    normalizeNonEmpty(buildInfoJson?.deploymentCreatedAt);

  return { appVersion, buildDateIso, deploymentCreatedAt };
}

