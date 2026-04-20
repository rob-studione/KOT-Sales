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

async function postReconciliationStep(
  origin: string,
  payload: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const secret = process.env.CRON_SECRET;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }
  const res = await fetch(`${origin}/api/sync-saskaita123/reconciliation-step`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
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
 * - Daily/monthly: chunked reconciliation jobs (`invoice_reconciliation_jobs`) — init in 03:00–03:14 Vilnius window, one step per tick.
 * - Monthly vs daily: day 1 initializes monthly (90d); other days initialize daily (30d). Large ranges use 5-day chunks, not one long POST.
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

    const reconciliation: Array<{
      name: string;
      syncStatus: number;
      sync: unknown;
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
        const initM = await postReconciliationStep(origin, { action: "init", jobType: "monthly" });
        reconciliation.push({ name: "reconciliation_init_monthly", syncStatus: initM.status, sync: initM.body });
      } else {
        const initD = await postReconciliationStep(origin, { action: "init", jobType: "daily" });
        reconciliation.push({ name: "reconciliation_init_daily", syncStatus: initD.status, sync: initD.body });
      }
    }

    const step = await postReconciliationStep(origin, { action: "run" });
    reconciliation.push({ name: "reconciliation_step", syncStatus: step.status, sync: step.body });

    const anyFailed =
      actions.some((a) => a.syncStatus != null && a.syncStatus >= 400) ||
      reconciliation.some((a) => a.syncStatus >= 400);
    const worstActions = actions.reduce(
      (m, a) => (a.syncStatus != null && a.syncStatus > m ? a.syncStatus : m),
      0
    );
    const worstReco = reconciliation.reduce((m, a) => (a.syncStatus > m ? a.syncStatus : m), 0);
    const worst = Math.max(worstActions, worstReco);

    return NextResponse.json(
      {
        job: "tick",
        timeZone: tz,
        localTime: local,
        workingHoursInclusive: { start: WORK_START, end: WORK_END },
        dailyReconciliationHour: DAILY_HOUR,
        reconciliation,
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

  const initType = job === "daily" ? "daily" : job === "monthly" ? "monthly" : null;
  if (initType) {
    const initR = await postReconciliationStep(origin, { action: "init", jobType: initType });
    const stepR = await postReconciliationStep(origin, { action: "run" });
    const legacyHttp = Math.max(initR.status, stepR.status);
    return NextResponse.json(
      {
        job,
        lookbackDays,
        reconciliationInit: { syncStatus: initR.status, sync: initR.body },
        reconciliationStep: { syncStatus: stepR.status, sync: stepR.body },
      },
      { status: legacyHttp < 400 ? 200 : legacyHttp >= 500 ? 502 : legacyHttp }
    );
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
