import { NextResponse } from "next/server";

function resolvePublicOrigin(request: Request): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (raw) {
    const trimmed = raw.replace(/\/$/, "");
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    return `https://${trimmed}`;
  }
  return new URL(request.url).origin;
}

function assertCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron requests carry this header; allows scheduling without secrets in versioned vercel.json.
  if (request.headers.get("x-vercel-cron") === "1") return null;
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const token = bearer ?? request.headers.get("x-cron-secret");
  if (secret && token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Production cron entrypoint (Vercel Cron GET) for the Neksar client-invoices sync.
 *
 * Polls a sliding `updatedSince` window (default: last 2 days) and proxies to
 * `POST /api/sync-neksar`. The overlap window + idempotent upsert/number-dedup make
 * re-processing safe, so no exact cursor is needed. Runs every 15 min via vercel.json.
 */
export async function GET(request: Request) {
  const unauthorized = assertCronAuth(request);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  const origin = resolvePublicOrigin(request);

  const lookbackDaysRaw = Number(process.env.NEKSAR_CRON_LOOKBACK_DAYS);
  const lookbackDays =
    Number.isFinite(lookbackDaysRaw) && lookbackDaysRaw > 0 ? Math.min(30, lookbackDaysRaw) : 2;
  const updatedSince = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const syncSecret = process.env.NEKSAR_SYNC_SECRET;
  if (syncSecret) {
    headers.Authorization = `Bearer ${syncSecret}`;
    headers["x-neksar-secret"] = syncSecret;
  }

  let status = 0;
  let body: unknown = null;
  try {
    const res = await fetch(`${origin}/api/sync-neksar`, {
      method: "POST",
      headers,
      body: JSON.stringify({ updatedSince, dryRun: false }),
    });
    status = res.status;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
  } catch (e) {
    return NextResponse.json(
      {
        job: "neksar-tick",
        error: e instanceof Error ? e.message : "Unknown error",
        updatedSince,
        tookMs: Date.now() - startedAt,
      },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      job: "neksar-tick",
      updatedSince,
      lookbackDays,
      syncStatus: status,
      sync: body,
      tookMs: Date.now() - startedAt,
    },
    { status: status >= 200 && status < 300 ? 200 : status >= 500 ? 502 : status }
  );
}
