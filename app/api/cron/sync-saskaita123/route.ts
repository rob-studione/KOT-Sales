import { NextResponse } from "next/server";

const DEFAULT_TZ = "Europe/Vilnius";

function partsInTimeZone(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const d = new Intl.DateTimeFormat("fr-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => d.find((p) => p.type === t)?.value;
  return {
    year: parseInt(get("year") ?? "0", 10),
    month: parseInt(get("month") ?? "0", 10),
    day: parseInt(get("day") ?? "0", 10),
    hour: parseInt(get("hour") ?? "0", 10),
    minute: parseInt(get("minute") ?? "0", 10),
  };
}

function resolvePublicOrigin(request: Request): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (raw) {
    const trimmed = raw.replace(/\/$/, "");
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    return `https://${trimmed}`;
  }
  return new URL(request.url).origin;
}

async function postSync(origin: string, lookbackDays: number): Promise<{
  status: number;
  body: unknown;
}> {
  const syncUrl = `${origin}/api/sync-saskaita123`;
  const res = await fetch(syncUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lookbackDays }),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

function assertCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const headerSecret = request.headers.get("x-cron-secret");
  const token = bearer ?? headerSecret;
  if (secret && token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Production cron entrypoint (Vercel Cron GET).
 *
 * `?job=tick` (recommended): one `every 15 minutes` UTC schedule.
 * - Frequent (lookback 1): only when local hour is within working hours (default 06–22, Europe/Vilnius).
 * - Daily (lookback 30): when local time is in the 03:00–03:14 window (configurable hour) — tracks Vilnius DST via Intl, not fixed UTC.
 * - Monthly (lookback 90): same window on day 1 only (monthly replaces daily that slot to avoid double work).
 *
 * Legacy: `?job=frequent|daily|monthly` for manual/testing (still supported).
 */
export async function GET(request: Request) {
  const unauthorized = assertCronAuth(request);
  if (unauthorized) return unauthorized;

  const tz = process.env.SYNC_CRON_TIMEZONE?.trim() || DEFAULT_TZ;
  const workStart = Number(process.env.SYNC_CRON_WORK_HOURS_START);
  const workEnd = Number(process.env.SYNC_CRON_WORK_HOURS_END);
  const WORK_START = Number.isFinite(workStart) && workStart >= 0 && workStart <= 23 ? Math.floor(workStart) : 6;
  const WORK_END = Number.isFinite(workEnd) && workEnd >= 0 && workEnd <= 23 ? Math.floor(workEnd) : 22;

  const dailyHour = Number(process.env.SYNC_CRON_DAILY_HOUR);
  const DAILY_HOUR = Number.isFinite(dailyHour) && dailyHour >= 0 && dailyHour <= 23 ? Math.floor(dailyHour) : 3;

  const { searchParams } = new URL(request.url);
  const job = searchParams.get("job") ?? "tick";

  const origin = resolvePublicOrigin(request);
  const now = new Date();
  const local = partsInTimeZone(now, tz);

  // First quarter-hour of DAILY_HOUR in local time (matches one 15-min UTC tick when cron is every 15 min).
  const inDailyReconciliationWindow =
    local.hour === DAILY_HOUR && local.minute >= 0 && local.minute < 15;

  if (job === "tick") {
    const actions: Array<{
      name: string;
      lookbackDays?: number;
      skipped?: boolean;
      reason?: string;
      syncStatus?: number;
      sync?: unknown;
    }> = [];

    const inWorkingHours = local.hour >= WORK_START && local.hour <= WORK_END;

    if (inWorkingHours) {
      const r = await postSync(origin, 1);
      actions.push({
        name: "frequent",
        lookbackDays: 1,
        syncStatus: r.status,
        sync: r.body,
      });
    } else {
      actions.push({
        name: "frequent",
        lookbackDays: 1,
        skipped: true,
        reason: "outside_working_hours",
      });
    }

    if (inDailyReconciliationWindow) {
      if (local.day === 1) {
        const r = await postSync(origin, 90);
        actions.push({
          name: "monthly",
          lookbackDays: 90,
          syncStatus: r.status,
          sync: r.body,
        });
      } else {
        const r = await postSync(origin, 30);
        actions.push({
          name: "daily",
          lookbackDays: 30,
          syncStatus: r.status,
          sync: r.body,
        });
      }
    }

    const anyFailed = actions.some((a) => a.syncStatus != null && a.syncStatus >= 400);
    const worst = actions.reduce((m, a) => (a.syncStatus != null && a.syncStatus > m ? a.syncStatus : m), 0);

    return NextResponse.json(
      {
        job: "tick",
        timeZone: tz,
        localTime: local,
        workingHoursInclusive: { start: WORK_START, end: WORK_END },
        dailyReconciliationHour: DAILY_HOUR,
        actions,
      },
      { status: anyFailed ? (worst >= 500 ? 502 : worst) : 200 }
    );
  }

  let lookbackDays: number;
  if (job === "frequent") lookbackDays = 1;
  else if (job === "daily") lookbackDays = 30;
  else if (job === "monthly") lookbackDays = 90;
  else {
    return NextResponse.json(
      { error: "invalid_job", valid: ["tick", "frequent", "daily", "monthly"] },
      { status: 400 }
    );
  }

  if (job === "frequent") {
    const hour = partsInTimeZone(new Date(), tz).hour;
    if (hour < WORK_START || hour > WORK_END) {
      return NextResponse.json({
        job: "frequent",
        skipped: true,
        reason: "outside_working_hours",
        timeZone: tz,
        hour,
        workingHoursInclusive: { start: WORK_START, end: WORK_END },
      });
    }
  }

  const { status, body } = await postSync(origin, lookbackDays);

  return NextResponse.json(
    {
      job,
      lookbackDays,
      proxiedTo: `${origin}/api/sync-saskaita123`,
      syncStatus: status,
      sync: body,
    },
    { status: status >= 200 && status < 300 ? 200 : status }
  );
}
