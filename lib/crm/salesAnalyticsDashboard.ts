import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCallAnsweredByStatus,
  isCallNotAnsweredByStatus,
  normalizeKanbanCallStatus,
} from "@/lib/crm/projectBoardConstants";
import { VAT_INVOICE_SERIES_TITLE_ILIKE } from "@/lib/crm/vatInvoiceListFilter";
import {
  eachDayInclusive,
  isoDateInVilnius,
  vilniusEndUtc,
  vilniusFirstDayOfMonthIso,
  vilniusMondayOfWeekIso,
  vilniusStartUtc,
  vilniusTodayDateString,
  VILNIUS_TZ,
} from "@/lib/crm/vilniusTime";

/** Mažiau HTTP round-trip į PostgREST. */
const ACTIVITY_PAGE_SIZE = 5000;
const MAX_ACTIVITY_ROWS = 120_000;
const MAX_INVOICE_ROWS = 50_000;

const CRM_ANALYTICS_DEBUG = process.env.CRM_ANALYTICS_DEBUG === "1";

/** Veiklos istorija KPI „Pardavimai“ (viso laiko) attribution — nuo šios datos (Vilnius). */
const REVENUE_ALL_TIME_ACTIVITY_FROM_ISO = "2000-01-01";

let activeSalesDashboardRequests = 0;

type QueryLog = {
  label: string;
  ms: number;
  timedOut: boolean;
  ok: boolean;
  note?: string;
};

function debugLog(label: string, ms: number, extra?: string) {
  if (!CRM_ANALYTICS_DEBUG) return;
  console.log(`[salesAnalyticsDashboard] ${label}: ${ms.toFixed(1)}ms${extra ? ` ${extra}` : ""}`);
}

function phaseLog(requestId: string, phase: string, extra?: Record<string, unknown>) {
  if (!CRM_ANALYTICS_DEBUG) return;
  const payload = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[salesAnalyticsDashboard] id=${requestId} phase=${phase}${payload}`);
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    debugLog(label, performance.now() - t0);
  }
}

async function withTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs: number,
  logs: QueryLog[]
): Promise<
  | { ok: true; value: T; ms: number; timedOut: false }
  | { ok: false; error: string; ms: number; timedOut: boolean }
> {
  const t0 = performance.now();
  try {
    const value = await fn();
    const ms = performance.now() - t0;
    logs.push({ label, ms, timedOut: false, ok: true });
    return { ok: true, value, ms, timedOut: false };
  } catch (e) {
    const ms = performance.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    logs.push({ label, ms, timedOut: false, ok: false, note: msg });
    return { ok: false, error: msg, ms, timedOut: false };
  }
}

function setLogNote(logs: QueryLog[], label: string, note: string) {
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i].label === label) {
      logs[i].note = note;
      return;
    }
  }
}

function buildTimeoutSignal(timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const anyAbortSignal = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal };
  if (typeof anyAbortSignal.timeout === "function") {
    const signal = anyAbortSignal.timeout(timeoutMs);
    return { signal, dispose: () => {} };
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  return { signal: ac.signal, dispose: () => clearTimeout(t) };
}

function buildTimeoutSignalWithLogging(
  requestId: string,
  label: string,
  timeoutMs: number
): { signal: AbortSignal; dispose: () => void } {
  const { signal, dispose } = buildTimeoutSignal(timeoutMs);
  if (CRM_ANALYTICS_DEBUG) {
    const onAbort = () => {
      console.log(`[salesAnalyticsDashboard] id=${requestId} abort label=${label} timeoutMs=${timeoutMs}`);
    };
    // Once to avoid leaks; signal may already be aborted.
    try {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    } catch {
      // ignore
    }
  }
  return { signal, dispose };
}

export type SalesDashboardPeriod = "today" | "week" | "month" | "custom";

export type SalesDashboardRange = {
  from: string;
  to: string;
};

export type ActivityRow = {
  work_item_id: string;
  occurred_at: string;
  action_type: string;
  call_status: string;
  next_action: string;
};

export type SalesDashboardKpi = {
  calls: number;
  /** Skambučiai su `call_status`, kurį laiko „atsiliepta“ (`isCallAnsweredByStatus`). */
  answeredCalls: number;
  /** Įrašai `project_work_item_activities` su `action_type = commercial` (pasirinktame intervale). */
  commercialActions: number;
  /** Sukaupta per visą laiką (pagal `invoice_date` iki šiandien); nepriklauso nuo datos filtro. */
  directRevenueEur: number;
  /** Sukaupta per visą laiką; nepriklauso nuo datos filtro. */
  influencedRevenueEur: number;
  /** `directRevenueEur` / visų laikų skambučių sk. (iš veiklos istorijos nuo 2000-01-01, gali būti apkirpta). */
  avgEurPerCall: number | null;
  /** Unikalūs klientai su priskirta sąskaita / skambučių skaičius intervale (kaip iki šiol). */
  conversionPercent: number | null;
};

export type SalesDashboardProjectRow = {
  projectId: string;
  projectName: string;
  calls: number;
  directRevenueEur: number;
  influencedRevenueEur: number;
  totalRevenueEur: number;
};

export type SalesDashboardTrendDay = {
  date: string;
  calls: number;
  answered: number;
  notAnswered: number;
};

export type BestCallTimeCell = {
  calls: number;
  answered: number;
  business: number;
};

export type BestCallTimesData = {
  /** 0..6 (Mon..Sun). */
  weekdayKeys: string[];
  /** "08:00–10:00" etc. */
  slotKeys: string[];
  /** matrix[weekdayIdx][slotIdx]. */
  matrix: BestCallTimeCell[][];
  /** Only calls within these local hours are included. */
  slotStartHour: number;
  slotHours: number;
};

export type SalesDashboardData = {
  range: SalesDashboardRange;
  period: SalesDashboardPeriod;
  kpi: SalesDashboardKpi;
  projects: SalesDashboardProjectRow[];
  trend: SalesDashboardTrendDay[];
  bestCallTimes: BestCallTimesData;
  warnings: string[];
};

export function parseSalesDashboardPeriod(raw: string | undefined | null): SalesDashboardPeriod {
  if (raw === "today" || raw === "week" || raw === "month" || raw === "custom") return raw;
  return "week";
}

export function resolveSalesDashboardRange(
  period: SalesDashboardPeriod,
  customFrom?: string | null,
  customTo?: string | null
): SalesDashboardRange {
  const today = vilniusTodayDateString();
  if (
    period === "custom" &&
    customFrom &&
    customTo &&
    /^\d{4}-\d{2}-\d{2}$/.test(customFrom) &&
    /^\d{4}-\d{2}-\d{2}$/.test(customTo)
  ) {
    return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom };
  }
  if (period === "today") return { from: today, to: today };
  if (period === "week") {
    const mon = vilniusMondayOfWeekIso(today);
    return { from: mon, to: today };
  }
  if (period === "month") {
    const first = vilniusFirstDayOfMonthIso(today);
    return { from: first, to: today };
  }
  if (period === "custom") {
    const mon = vilniusMondayOfWeekIso(today);
    return { from: mon, to: today };
  }
  return { from: vilniusMondayOfWeekIso(today), to: today };
}

async function fetchActivitiesInRange(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string,
  signal: AbortSignal
): Promise<{ rows: ActivityRow[]; truncated: boolean; rowCount: number; error: string | null }> {
  const out: ActivityRow[] = [];
  let from = 0;
  let truncated = false;
  for (;;) {
    const { data, error } = await supabase
      .from("project_work_item_activities")
      .select("work_item_id,occurred_at,action_type,call_status,next_action")
      .gte("occurred_at", startIso)
      .lte("occurred_at", endIso)
      .order("occurred_at", { ascending: true })
      .abortSignal(signal)
      .range(from, from + ACTIVITY_PAGE_SIZE - 1);
    if (error) return { rows: [], truncated: false, rowCount: 0, error: error.message };
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      out.push({
        work_item_id: String(r.work_item_id),
        occurred_at: String(r.occurred_at ?? ""),
        action_type: String(r.action_type ?? "").toLowerCase(),
        call_status: String(r.call_status ?? ""),
        next_action: String((r as { next_action?: string }).next_action ?? ""),
      });
    }
    if (rows.length < ACTIVITY_PAGE_SIZE) break;
    from += ACTIVITY_PAGE_SIZE;
    if (from >= MAX_ACTIVITY_ROWS) {
      truncated = true;
      break;
    }
  }
  return { rows: out, truncated, rowCount: out.length, error: null };
}

function sliceByRange(acts: ActivityRow[], range: SalesDashboardRange): ActivityRow[] {
  const rs = vilniusStartUtc(range.from);
  const re = vilniusEndUtc(range.to);
  return acts.filter((a) => a.occurred_at >= rs && a.occurred_at <= re);
}

function vilniusWeekdayIndex(isoUtc: string): number {
  // Mon=0 .. Sun=6
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: VILNIUS_TZ, weekday: "short" }).format(new Date(isoUtc));
  switch (wd) {
    case "Mon":
      return 0;
    case "Tue":
      return 1;
    case "Wed":
      return 2;
    case "Thu":
      return 3;
    case "Fri":
      return 4;
    case "Sat":
      return 5;
    case "Sun":
      return 6;
    default:
      return 0;
  }
}

function vilniusHour24(isoUtc: string): number {
  // "en-GB" yields 00-23 reliably in most environments.
  const hh = new Intl.DateTimeFormat("en-GB", { timeZone: VILNIUS_TZ, hour: "2-digit", hour12: false }).format(
    new Date(isoUtc)
  );
  const n = Number(hh);
  return Number.isFinite(n) ? n : 0;
}

function buildTimeSlots(slotStartHour: number, slotEndHour: number, slotHours: number): string[] {
  const out: string[] = [];
  for (let h = slotStartHour; h + slotHours <= slotEndHour; h += slotHours) {
    const a = String(h).padStart(2, "0");
    const b = String(h + slotHours).padStart(2, "0");
    out.push(`${a}:00–${b}:00`);
  }
  return out;
}

function isBusinessSuccessFromPostCall(post: ActivityRow | null): boolean {
  if (!post) return false;
  const at = post.action_type.trim().toLowerCase();
  if (at === "commercial") return true;
  const col = normalizeKanbanCallStatus(post.call_status);
  if (col === "Siųsti komercinį" || col === "Užbaigta") return true;
  if (/komerc/i.test(String(post.next_action ?? ""))) return true;
  return false;
}

function deriveBestCallTimes(rangeSlice: ActivityRow[]): BestCallTimesData {
  // Vilnius business-ish hours; spec examples start at 08:00.
  const slotStartHour = 8;
  const slotEndHour = 22;
  const slotHours = 2;
  const slotKeys = buildTimeSlots(slotStartHour, slotEndHour, slotHours);
  const weekdayKeys = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const matrix: BestCallTimeCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: slotKeys.length }, () => ({ calls: 0, answered: 0, business: 0 }))
  );

  const byWork = new Map<string, ActivityRow[]>();
  for (const a of rangeSlice) {
    const wid = String(a.work_item_id ?? "");
    if (!wid) continue;
    if (!byWork.has(wid)) byWork.set(wid, []);
    byWork.get(wid)!.push(a);
  }

  for (const acts of byWork.values()) {
    acts.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    for (let i = 0; i < acts.length; i++) {
      const cur = acts[i];
      if (cur.action_type !== "call") continue;
      const post = i + 1 < acts.length ? acts[i + 1] : null;
      const baseTime = cur.occurred_at;
      const hour = vilniusHour24(baseTime);
      const slotIdx = Math.floor((hour - slotStartHour) / slotHours);
      if (slotIdx < 0 || slotIdx >= slotKeys.length) continue;
      const wdIdx = vilniusWeekdayIndex(baseTime);
      const cell = matrix[wdIdx][slotIdx];
      cell.calls += 1;

      // Outcome must be derived from the next saved post-call status/action when available.
      const outcomeStatus = post?.call_status?.trim() ? post.call_status : cur.call_status;
      if (isCallAnsweredByStatus(outcomeStatus)) cell.answered += 1;
      if (isBusinessSuccessFromPostCall(post)) cell.business += 1;
    }
  }

  return { weekdayKeys, slotKeys, matrix, slotStartHour, slotHours };
}

async function countCallsBetweenUtc(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string,
  signal: AbortSignal
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from("project_work_item_activities")
    .select("*", { count: "exact", head: true })
    .eq("action_type", "call")
    .gte("occurred_at", startIso)
    .lte("occurred_at", endIso)
    .abortSignal(signal);
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

async function fetchFirstContactByWorkItem(
  supabase: SupabaseClient,
  warnings: string[],
  signal: AbortSignal
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await supabase.rpc("dashboard_first_contact_per_work_item").abortSignal(signal);
  if (error) {
    warnings.push(
      `Pirmo kontakto agregacija nepasiekiama (${error.message}). Pritaikykite migraciją 0021_dashboard_first_contact_aggregate.sql. Pajamos po kontakto gali būti netikslūs arba 0.`
    );
    return map;
  }
  const rows = (data ?? []) as Array<{ work_item_id?: string; first_occurred_at?: string }>;
  for (const r of rows) {
    const wid = String(r.work_item_id ?? "");
    const t = String(r.first_occurred_at ?? "");
    if (wid && t) map.set(wid, t);
  }
  if (CRM_ANALYTICS_DEBUG) {
    console.log(`[salesAnalyticsDashboard] first_contact RPC rows: ${map.size}`);
  }
  return map;
}

function matchClientKeyFromMaps(
  inv: { company_code: string | null; client_id: string | null },
  codeToKey: Map<string, string>,
  idOnlyToKey: Map<string, string>
): string | null {
  const ic = (inv.company_code ?? "").trim();
  const ii = (inv.client_id ?? "").trim();
  if (ic) {
    const k = codeToKey.get(ic);
    if (k) return k;
  }
  if (ii && !ic) {
    const k = idOnlyToKey.get(ii);
    if (k) return k;
  }
  return null;
}

function buildInvoiceLookupMaps(
  keyParts: Map<string, { company_code: string | null; client_id: string | null }>
): { codeToKey: Map<string, string>; idOnlyToKey: Map<string, string> } {
  const codeToKey = new Map<string, string>();
  const idOnlyToKey = new Map<string, string>();
  for (const [ck, parts] of keyParts) {
    const pc = (parts.company_code ?? "").trim();
    const pi = (parts.client_id ?? "").trim();
    if (pc) codeToKey.set(pc, ck);
    else if (pi) idOnlyToKey.set(pi, ck);
  }
  return { codeToKey, idOnlyToKey };
}

export async function fetchSalesDashboard(
  supabase: SupabaseClient,
  period: SalesDashboardPeriod,
  range: SalesDashboardRange
): Promise<SalesDashboardData> {
  const warnings: string[] = [];
  const logs: QueryLog[] = [];
  const TIMEOUT_MS = 8000;
  const tAll = performance.now();
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  activeSalesDashboardRequests += 1;
  if (CRM_ANALYTICS_DEBUG) {
    console.log(
      `[salesAnalyticsDashboard] request_start id=${requestId} active=${activeSalesDashboardRequests} period=${period} range=${range.from}..${range.to}`
    );
  }
  phaseLog(requestId, "start");

  const todayIso = vilniusTodayDateString();
  const weekStartIso = vilniusMondayOfWeekIso(todayIso);

  const rangeStart = vilniusStartUtc(range.from);
  const rangeEnd = vilniusEndUtc(range.to);

  if (CRM_ANALYTICS_DEBUG) {
    console.log(
      `[salesAnalyticsDashboard] range=${JSON.stringify(range)} fetchUtc=[${rangeStart.slice(0, 19)}..${rangeEnd.slice(0, 19)}] week=${weekStartIso}..${todayIso}`
    );
  }

  // KPI per spec: tik pagal pasirinktą laikotarpį (be today/week split KPI bloke).
  // Vis tiek paliekam weekStartIso/todayIso loguose, nes jie naudingi debug'ui.
  phaseLog(requestId, "kpi_start", { todayIso, weekStartIso });
  phaseLog(requestId, "kpi_end");

  const allTimeActivityStart = vilniusStartUtc(REVENUE_ALL_TIME_ACTIVITY_FROM_ISO);
  const allTimeActivityEnd = vilniusEndUtc(todayIso);

  phaseLog(requestId, "parallel_fetch_start", {
    rangeStart: rangeStart.slice(0, 19),
    rangeEnd: rangeEnd.slice(0, 19),
    allTimeStart: allTimeActivityStart.slice(0, 19),
    allTimeEnd: allTimeActivityEnd.slice(0, 19),
  });
  const [activitiesRes, activitiesAllTimeRes, workResT, projResT, firstByWorkT] = await Promise.all([
    withTimeout("activities_union_fetch", async () => {
      const { signal, dispose } = buildTimeoutSignalWithLogging(requestId, "activities_union_fetch", TIMEOUT_MS);
      try {
        return await fetchActivitiesInRange(supabase, rangeStart, rangeEnd, signal);
      } finally {
        dispose();
      }
    }, TIMEOUT_MS, logs),
    withTimeout("activities_all_time_fetch", async () => {
      const { signal, dispose } = buildTimeoutSignalWithLogging(requestId, "activities_all_time_fetch", TIMEOUT_MS);
      try {
        return await fetchActivitiesInRange(supabase, allTimeActivityStart, allTimeActivityEnd, signal);
      } finally {
        dispose();
      }
    }, TIMEOUT_MS, logs),
    withTimeout("project_work_items", async () => {
      const { signal, dispose } = buildTimeoutSignalWithLogging(requestId, "project_work_items", TIMEOUT_MS);
      try {
        return await supabase.from("project_work_items").select("id,client_key,project_id,picked_at").abortSignal(signal);
      } finally {
        dispose();
      }
    }, TIMEOUT_MS, logs),
    withTimeout("projects", async () => {
      const { signal, dispose } = buildTimeoutSignalWithLogging(requestId, "projects", TIMEOUT_MS);
      try {
        return await supabase.from("projects").select("id,name").abortSignal(signal);
      } finally {
        dispose();
      }
    }, TIMEOUT_MS, logs),
    withTimeout("first_contact_rpc", async () => {
      const { signal, dispose } = buildTimeoutSignalWithLogging(requestId, "first_contact_rpc", TIMEOUT_MS);
      try {
        return await fetchFirstContactByWorkItem(supabase, warnings, signal);
      } finally {
        dispose();
      }
    }, TIMEOUT_MS, logs),
  ]);
  phaseLog(requestId, "parallel_fetch_end");

  const unionActs = activitiesRes.ok ? activitiesRes.value.rows : [];
  const actTrunc = activitiesRes.ok ? activitiesRes.value.truncated : false;
  const activityRowCount = activitiesRes.ok ? activitiesRes.value.rowCount : 0;
  const activitiesErr = activitiesRes.ok ? activitiesRes.value.error : activitiesRes.error;
  setLogNote(
    logs,
    "activities_union_fetch",
    activitiesRes.ok
      ? `rows=${activitiesRes.value.rowCount}${activitiesRes.value.truncated ? " truncated=1" : ""}${activitiesRes.value.error ? ` err=${activitiesRes.value.error}` : ""}`
      : activitiesRes.error
  );
  if (activitiesErr) warnings.push(`Veiklos įrašai: ${activitiesErr}`);
  if (actTrunc) warnings.push(`Veiklos įrašai apkirpti po ${MAX_ACTIVITY_ROWS.toLocaleString("lt-LT")} eilučių. Rodikliai gali būti netikslūs.`);
  if (CRM_ANALYTICS_DEBUG) console.log(`[salesAnalyticsDashboard] activity rows: ${activityRowCount}`);

  const unionActsAllTime = activitiesAllTimeRes.ok ? activitiesAllTimeRes.value.rows : [];
  const allTimeActTrunc = activitiesAllTimeRes.ok ? activitiesAllTimeRes.value.truncated : false;
  setLogNote(
    logs,
    "activities_all_time_fetch",
    activitiesAllTimeRes.ok
      ? `rows=${activitiesAllTimeRes.value.rowCount}${activitiesAllTimeRes.value.truncated ? " truncated=1" : ""}${activitiesAllTimeRes.value.error ? ` err=${activitiesAllTimeRes.value.error}` : ""}`
      : activitiesAllTimeRes.error
  );
  if (activitiesAllTimeRes.ok && activitiesAllTimeRes.value.error) {
    warnings.push(`Viso laikotarpio veiklos įrašai: ${activitiesAllTimeRes.value.error}`);
  }
  if (!activitiesAllTimeRes.ok) warnings.push(`Viso laikotarpio veikla: ${activitiesAllTimeRes.error}`);
  if (allTimeActTrunc) {
    warnings.push(
      `Viso laikotarpio veiklos istorija apkirpta po ${MAX_ACTIVITY_ROWS.toLocaleString("lt-LT")} eilučių. Sukauptos pajamos ir „Vid. € / skambutį“ gali būti netikslūs.`
    );
  }

  const rangeSlice = sliceByRange(unionActs, range);
  const rangeDays = eachDayInclusive(range.from, range.to);
  phaseLog(requestId, "derive_range", { activityRowCount, rangeSlice: rangeSlice.length, rangeDays: rangeDays.length });
  const bestCallTimes = deriveBestCallTimes(rangeSlice);

  const workRes = workResT.ok ? workResT.value : null;
  const projRes = projResT.ok ? projResT.value : null;
  const firstByWork = firstByWorkT.ok ? firstByWorkT.value : new Map<string, string>();
  setLogNote(
    logs,
    "project_work_items",
    workResT.ok
      ? (workResT.value.error ? `err=${workResT.value.error.message}` : `rows=${(workResT.value.data ?? []).length}`)
      : workResT.error
  );
  setLogNote(
    logs,
    "projects",
    projResT.ok
      ? (projResT.value.error ? `err=${projResT.value.error.message}` : `rows=${(projResT.value.data ?? []).length}`)
      : projResT.error
  );
  setLogNote(logs, "first_contact_rpc", firstByWorkT.ok ? `rows=${firstByWork.size}` : firstByWorkT.error);
  phaseLog(requestId, "refs_end");

  if (workRes && workRes.error) warnings.push(`Darbo eilutės: ${workRes.error.message}`);
  if (projRes && projRes.error) warnings.push(`Projektai: ${projRes.error.message}`);
  if (!workResT.ok) warnings.push(`Darbo eilutės: ${workResT.error}`);
  if (!projResT.ok) warnings.push(`Projektai: ${projResT.error}`);
  if (!firstByWorkT.ok) warnings.push(`Pirmas kontaktas: ${firstByWorkT.error}`);

  const workItems = ((workRes?.data ?? []) as Array<{
    id: string;
    client_key: string;
    project_id: string;
    picked_at: string;
  }>);
  phaseLog(requestId, "refs_rows", { projects: (projRes?.data ?? []).length, workItems: workItems.length, firstByWork: firstByWork.size });

  const projectNames = new Map<string, string>();
  for (const p of projRes?.data ?? []) {
    projectNames.set(String((p as { id: string }).id), String((p as { name: string }).name ?? ""));
  }

  const workToProject = new Map<string, string>();
  const clientToWorks = new Map<string, typeof workItems>();
  const workToClient = new Map<string, string>();
  for (const w of workItems) {
    const wid = String(w.id);
    const ck = String(w.client_key ?? "");
    workToProject.set(wid, String(w.project_id));
    workToClient.set(wid, ck);
    if (!clientToWorks.has(ck)) clientToWorks.set(ck, []);
    clientToWorks.get(ck)!.push(w);
  }

  const clientKeys = [...new Set(workItems.map((w) => String(w.client_key ?? "")))].filter(Boolean);
  const keyParts = new Map<string, { company_code: string | null; client_id: string | null }>();
  if (clientKeys.length > 0) {
    phaseLog(requestId, "client_map_start", { clientKeys: clientKeys.length });
    const vRes = await withTimeout("v_client_list", async () => {
      const { signal, dispose } = buildTimeoutSignalWithLogging(requestId, "v_client_list", TIMEOUT_MS);
      try {
        return await supabase
          .from("v_client_list_from_invoices")
          .select("client_key,company_code,client_id")
          .in("client_key", clientKeys)
          .abortSignal(signal);
      } finally {
        dispose();
      }
    }, TIMEOUT_MS, logs);
    phaseLog(requestId, "client_map_end");

    if (!vRes.ok) {
      warnings.push(`Klientų susiejimas: ${vRes.error}`);
      setLogNote(logs, "v_client_list", vRes.error);
    } else if ((vRes.value as { error?: { message: string } | null }).error) {
      warnings.push(`Klientų susiejimas: ${(vRes.value as { error: { message: string } }).error.message}`);
      setLogNote(logs, "v_client_list", `err=${(vRes.value as { error: { message: string } }).error.message}`);
    } else {
      const viewRows = (vRes.value as { data?: unknown[] | null }).data as
        | Array<{ client_key: string; company_code: string | null; client_id: string | null }>
        | null;
      setLogNote(logs, "v_client_list", `rows=${(viewRows ?? []).length}`);
      for (const r of viewRows ?? []) {
        keyParts.set(String(r.client_key), {
          company_code: r.company_code != null ? String(r.company_code) : null,
          client_id: r.client_id != null ? String(r.client_id) : null,
        });
      }
    }
  }

  const { codeToKey, idOnlyToKey } = buildInvoiceLookupMaps(keyParts);

  const isActualuText = (s: string) => /aktualu\s+pagal\s+poreikį/i.test(String(s ?? "").trim());
  const latestStatusByClientAllTime = new Map<string, { occurred_at: string; actualu: boolean }>();
  let totalCallsAllTime = 0;
  for (const a of unionActsAllTime) {
    if (a.action_type === "call") totalCallsAllTime += 1;
    const ck = workToClient.get(a.work_item_id);
    if (!ck) continue;
    const actualu = isActualuText(a.next_action) || isActualuText(a.call_status);
    const prev = latestStatusByClientAllTime.get(ck);
    if (!prev || a.occurred_at > prev.occurred_at) {
      latestStatusByClientAllTime.set(ck, { occurred_at: a.occurred_at, actualu });
    }
  }

  const firstCallByClientAllTime = new Map<string, { occurred_at: string; projectId: string }>();
  for (const w of workItems) {
    const wid = String(w.id);
    const t0 = firstByWork.get(wid);
    if (!t0) continue;
    const ck = String(w.client_key ?? "");
    if (!ck) continue;
    const pid = String(w.project_id);
    const prev = firstCallByClientAllTime.get(ck);
    if (!prev || t0 < prev.occurred_at) {
      firstCallByClientAllTime.set(ck, { occurred_at: t0, projectId: pid });
    }
  }

  let totalCallsInRange = 0;
  let answeredCallsInRange = 0;
  let commercialActionsInRange = 0;
  const projectAgg = new Map<string, { calls: number }>();
  const trendByDay = new Map<string, { calls: number; answered: number; notAnswered: number }>();
  for (const d of rangeDays) {
    trendByDay.set(d, { calls: 0, answered: 0, notAnswered: 0 });
  }

  // Latest status bucket per client (within selected range), used for period project revenue split.
  const latestStatusByClient = new Map<string, { occurred_at: string; actualu: boolean }>();

  // First call per client within selected range (used for invoice attribution rule).
  const firstCallByClient = new Map<string, { occurred_at: string; projectId: string }>();

  for (const a of rangeSlice) {
    const at = a.action_type;
    if (at === "commercial") commercialActionsInRange += 1;

    const pid = workToProject.get(a.work_item_id);
    if (pid) {
      if (!projectAgg.has(pid)) {
        projectAgg.set(pid, { calls: 0 });
      }
      const g = projectAgg.get(pid)!;
      if (at === "call") {
        g.calls += 1;
      }
    }

    if (at === "call") {
      totalCallsInRange += 1;
      if (isCallAnsweredByStatus(a.call_status)) answeredCallsInRange += 1;
      const day = isoDateInVilnius(a.occurred_at);
      const bucket = trendByDay.get(day);
      if (bucket) {
        bucket.calls += 1;
        if (isCallAnsweredByStatus(a.call_status)) bucket.answered += 1;
        if (isCallNotAnsweredByStatus(a.call_status)) bucket.notAnswered += 1;
      }
    }

    const ck = workToClient.get(a.work_item_id);
    if (ck) {
      const actualu = isActualuText(a.next_action) || isActualuText(a.call_status);
      const prev = latestStatusByClient.get(ck);
      if (!prev || a.occurred_at > prev.occurred_at) {
        latestStatusByClient.set(ck, { occurred_at: a.occurred_at, actualu });
      }

      // First call per client for this range + its project.
      if (at === "call" && pid) {
        const prevCall = firstCallByClient.get(ck);
        if (!prevCall || a.occurred_at < prevCall.occurred_at) {
          firstCallByClient.set(ck, { occurred_at: a.occurred_at, projectId: pid });
        }
      }
    }
  }

  phaseLog(requestId, "invoices_start");
  const [invRes, invAllTimeRes] = await Promise.all([
    withTimeout("invoices_range", async () => {
      const { signal, dispose } = buildTimeoutSignalWithLogging(requestId, "invoices_range", TIMEOUT_MS);
      try {
        return await supabase
          .from("invoices")
          .select("invoice_id,company_code,client_id,invoice_date,amount")
          .ilike("series_title", VAT_INVOICE_SERIES_TITLE_ILIKE)
          .gte("invoice_date", range.from)
          .lte("invoice_date", range.to)
          .order("invoice_date", { ascending: true })
          .limit(MAX_INVOICE_ROWS)
          .abortSignal(signal);
      } finally {
        dispose();
      }
    }, TIMEOUT_MS, logs),
    withTimeout("invoices_all_time", async () => {
      const { signal, dispose } = buildTimeoutSignalWithLogging(requestId, "invoices_all_time", TIMEOUT_MS);
      try {
        return await supabase
          .from("invoices")
          .select("invoice_id,company_code,client_id,invoice_date,amount")
          .ilike("series_title", VAT_INVOICE_SERIES_TITLE_ILIKE)
          .lte("invoice_date", todayIso)
          .order("invoice_date", { ascending: true })
          .limit(MAX_INVOICE_ROWS)
          .abortSignal(signal);
      } finally {
        dispose();
      }
    }, TIMEOUT_MS, logs),
  ]);
  phaseLog(requestId, "invoices_end");

  const invResp = invRes.ok ? invRes.value : null;
  if (invResp && invResp.error) warnings.push(`Sąskaitos: ${invResp.error.message}`);
  if (!invRes.ok) warnings.push(`Sąskaitos: ${invRes.error}`);
  setLogNote(
    logs,
    "invoices_range",
    invRes.ok ? (invResp?.error ? `err=${invResp.error.message}` : `rows=${(invResp?.data ?? []).length}`) : invRes.error
  );

  const invAllResp = invAllTimeRes.ok ? invAllTimeRes.value : null;
  if (invAllResp && invAllResp.error) warnings.push(`Viso laiko sąskaitos: ${invAllResp.error.message}`);
  if (!invAllTimeRes.ok) warnings.push(`Viso laiko sąskaitos: ${invAllTimeRes.error}`);
  setLogNote(
    logs,
    "invoices_all_time",
    invAllTimeRes.ok ? (invAllResp?.error ? `err=${invAllResp.error.message}` : `rows=${(invAllResp?.data ?? []).length}`) : invAllTimeRes.error
  );

  const invoices =
    ((invResp?.data ?? []) as Array<{
      invoice_id: string;
      company_code: string | null;
      client_id: string | null;
      invoice_date: string;
      amount: string | number;
    }>) ?? [];
  phaseLog(requestId, "invoices_rows", { invoices: invoices.length });
  if (invoices.length >= MAX_INVOICE_ROWS) {
    warnings.push(`Sąskaitos apkirptos po ${MAX_INVOICE_ROWS.toLocaleString("lt-LT")} eilučių.`);
  }

  const revenueByProjectDirect = new Map<string, number>();
  const revenueByProjectInfluenced = new Map<string, number>();
  const invoiceSeenPeriod = new Set<string>();
  const clientsWithOrders = new Set<string>();

  for (const inv of invoices) {
    const iid = String((inv as { invoice_id?: string }).invoice_id ?? "");
    if (!iid || invoiceSeenPeriod.has(iid)) continue;
    const invDay =
      typeof inv.invoice_date === "string" ? inv.invoice_date.slice(0, 10) : String(inv.invoice_date ?? "").slice(0, 10);
    if (!invDay || invDay < range.from || invDay > range.to) continue;

    const matchedCk = matchClientKeyFromMaps(
      inv as { company_code: string | null; client_id: string | null },
      codeToKey,
      idOnlyToKey
    );
    if (!matchedCk) continue;
    const firstCall = firstCallByClient.get(matchedCk);
    if (!firstCall) continue; // rule: if no call -> no revenue attribution
    const callDay = firstCall.occurred_at.slice(0, 10);
    if (!callDay || invDay <= callDay) continue; // rule: invoice_date must be > call_date
    const amt = typeof inv.amount === "number" ? inv.amount : Number(inv.amount);
    if (!Number.isFinite(amt)) continue;
    invoiceSeenPeriod.add(iid);
    clientsWithOrders.add(matchedCk);
    const influenced = latestStatusByClient.get(matchedCk)?.actualu === true;

    const pid = firstCall.projectId;
    if (influenced) {
      revenueByProjectInfluenced.set(pid, (revenueByProjectInfluenced.get(pid) ?? 0) + amt);
    } else {
      revenueByProjectDirect.set(pid, (revenueByProjectDirect.get(pid) ?? 0) + amt);
    }
  }

  let kpiDirectAllTime = 0;
  let kpiInfluencedAllTime = 0;

  const invoicesAllTime =
    ((invAllResp?.data ?? []) as Array<{
      invoice_id: string;
      company_code: string | null;
      client_id: string | null;
      invoice_date: string;
      amount: string | number;
    }>) ?? [];
  if (invoicesAllTime.length >= MAX_INVOICE_ROWS) {
    warnings.push(
      `Viso laiko PVM sąskaitų sąrašas apkirptas po ${MAX_INVOICE_ROWS.toLocaleString("lt-LT")} eilučių. Sukauptos pajamos gali būti mažesnės nei tikrosios.`
    );
  }

  const invoiceSeenAllTime = new Set<string>();
  for (const inv of invoicesAllTime) {
    const iid = String((inv as { invoice_id?: string }).invoice_id ?? "");
    if (!iid || invoiceSeenAllTime.has(iid)) continue;
    const invDay =
      typeof inv.invoice_date === "string" ? inv.invoice_date.slice(0, 10) : String(inv.invoice_date ?? "").slice(0, 10);
    if (!invDay || invDay > todayIso) continue;

    const matchedCk = matchClientKeyFromMaps(
      inv as { company_code: string | null; client_id: string | null },
      codeToKey,
      idOnlyToKey
    );
    if (!matchedCk) continue;
    const firstCall = firstCallByClientAllTime.get(matchedCk);
    if (!firstCall) continue;
    const callDay = firstCall.occurred_at.slice(0, 10);
    if (!callDay || invDay <= callDay) continue;
    const amt = typeof inv.amount === "number" ? inv.amount : Number(inv.amount);
    if (!Number.isFinite(amt)) continue;
    invoiceSeenAllTime.add(iid);
    const influencedAll = latestStatusByClientAllTime.get(matchedCk)?.actualu === true;
    if (influencedAll) kpiInfluencedAllTime += amt;
    else kpiDirectAllTime += amt;
  }

  const projectIds = new Set<string>([
    ...projectAgg.keys(),
    ...revenueByProjectDirect.keys(),
    ...revenueByProjectInfluenced.keys(),
  ]);
  const projectRows: SalesDashboardProjectRow[] = [];
  for (const pid of projectIds) {
    const agg = projectAgg.get(pid) ?? { calls: 0 };
    const d = revenueByProjectDirect.get(pid) ?? 0;
    const inf = revenueByProjectInfluenced.get(pid) ?? 0;
    projectRows.push({
      projectId: pid,
      projectName: projectNames.get(pid) ?? "—",
      calls: agg.calls,
      directRevenueEur: d,
      influencedRevenueEur: inf,
      totalRevenueEur: d + inf,
    });
  }
  projectRows.sort((a, b) => b.totalRevenueEur - a.totalRevenueEur || a.projectName.localeCompare(b.projectName));

  const trend: SalesDashboardTrendDay[] = rangeDays.map((day) => {
    const b = trendByDay.get(day) ?? { calls: 0, answered: 0, notAnswered: 0 };
    return { date: day, calls: b.calls, answered: b.answered, notAnswered: b.notAnswered };
  });
  phaseLog(requestId, "finalize", { projectRows: projectRows.length, trendDays: trend.length, warnings: warnings.length });

  logs.push({
    label: "fetchSalesDashboard_total",
    ms: performance.now() - tAll,
    timedOut: false,
    ok: true,
    note: `activityRows=${activityRowCount} warnings=${warnings.length}`,
  });

  if (CRM_ANALYTICS_DEBUG) {
    for (const l of logs) {
      console.log(
        `[salesAnalyticsDashboard] id=${requestId} ${l.label} ms=${l.ms.toFixed(1)} ok=${l.ok} timeout=${l.timedOut}${l.note ? ` note=${l.note}` : ""}`
      );
    }
    console.log(
      `[salesAnalyticsDashboard] request_end id=${requestId} totalMs=${(performance.now() - tAll).toFixed(1)} warnings=${warnings.length}`
    );
  }
  activeSalesDashboardRequests = Math.max(0, activeSalesDashboardRequests - 1);
  if (CRM_ANALYTICS_DEBUG) {
    console.log(`[salesAnalyticsDashboard] request_active id=${requestId} active=${activeSalesDashboardRequests}`);
  }

  return {
    range,
    period,
    kpi: {
      calls: totalCallsInRange,
      answeredCalls: answeredCallsInRange,
      commercialActions: commercialActionsInRange,
      directRevenueEur: kpiDirectAllTime,
      influencedRevenueEur: kpiInfluencedAllTime,
      avgEurPerCall: totalCallsAllTime > 0 ? kpiDirectAllTime / totalCallsAllTime : null,
      conversionPercent: totalCallsInRange > 0 ? Math.round((clientsWithOrders.size / totalCallsInRange) * 1000) / 10 : null,
    },
    projects: projectRows,
    trend,
    bestCallTimes,
    warnings,
  };
}
