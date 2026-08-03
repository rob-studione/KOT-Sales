import { NextResponse } from "next/server";
import { syncNeksarInvoices } from "@/lib/neksar/syncInvoices";

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
 * Calls syncNeksarInvoices() in-process (no self-HTTP / SITE_URL proxy).
 * Sliding updatedSince window (default: last 2 days) + idempotent upsert/number-dedup.
 * Schedule: */15 via vercel.json.
 *
 * Optional query: ?dryRun=1 for a no-write probe.
 */
export async function GET(request: Request) {
  const unauthorized = assertCronAuth(request);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";

  const lookbackDaysRaw = Number(process.env.NEKSAR_CRON_LOOKBACK_DAYS);
  const lookbackDays =
    Number.isFinite(lookbackDaysRaw) && lookbackDaysRaw > 0 ? Math.min(30, lookbackDaysRaw) : 2;
  const updatedSince = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const sync = await syncNeksarInvoices({
    updatedSince,
    dryRun,
  });

  const payload = {
    job: "neksar-tick",
    updatedSince,
    lookbackDays,
    dryRun,
    sync,
    tookMs: Date.now() - startedAt,
  };

  if (!sync.ok) {
    console.error("[cron/sync-neksar] sync failed", {
      error: sync.error,
      httpStatus: sync.httpStatus,
      updatedSince,
      lookbackDays,
      tookMs: payload.tookMs,
    });
    return NextResponse.json(payload, { status: sync.httpStatus >= 500 ? 502 : sync.httpStatus });
  }

  console.info("[cron/sync-neksar] ok", {
    dryRun,
    insertNew: sync.insertNew,
    upsertOwn: sync.upsertOwn,
    insertedOrUpdated: sync.insertedOrUpdated,
    skippedExistingOtherSource: sync.skippedExistingOtherSource,
    listRows: sync.listRows,
    tookMs: payload.tookMs,
  });

  return NextResponse.json(payload);
}
