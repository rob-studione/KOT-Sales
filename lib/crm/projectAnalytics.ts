import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCallAnsweredByStatus,
  isCallNotAnsweredByStatus,
  isProjectWorkItemClosed,
  isReturnedToCandidates,
} from "@/lib/crm/projectBoardConstants";
import { VAT_INVOICE_SERIES_TITLE_ILIKE } from "@/lib/crm/vatInvoiceListFilter";
import { resolveInvoiceNetAmount } from "@/lib/crm/format";
import {
  isoDateInVilnius,
  subtractOneCivilDayVilnius,
  vilniusEndUtc,
  vilniusFirstDayOfMonthIso,
  vilniusStartUtc,
  vilniusTodayDateString,
} from "@/lib/crm/vilniusTime";

/** „Sheets“ rezultatų eilutės (pagal „Kitas veiksmas“ / paskutinį įrašą). */
export const PROJECT_ANALYTICS_OUTCOME_LABELS = [
  { id: "aktualu", label: "Aktualu pagal poreikį" },
  { id: "kitas_tiekejas", label: "Turi kitą teikėją" },
  { id: "vertimai", label: "Vertimai neaktualūs" },
  { id: "neatsiliepe", label: "Neatsiliepė" },
] as const;

export type ProjectAnalyticsPeriod = "today" | "week" | "month" | "prev_month" | "year" | "all_time" | "custom";

export type ProjectAnalyticsRange = {
  from: string;
  to: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Kalendorinės datos YYYY-MM-DD (UTC vidurnaktis kaip ribos). */
export function calendarDateTodayUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function calendarDateAddDaysUtc(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function resolveAnalyticsRange(
  period: ProjectAnalyticsPeriod,
  customFrom?: string | null,
  customTo?: string | null,
  allTimeFrom?: string | null
): ProjectAnalyticsRange {
  const today = calendarDateTodayUtc();
  const isIsoDate = (v: string | null | undefined): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (period === "custom" && customFrom && customTo && /^\d{4}-\d{2}-\d{2}$/.test(customFrom) && /^\d{4}-\d{2}-\d{2}$/.test(customTo)) {
    return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom };
  }
  if (period === "today") return { from: today, to: today };
  if (period === "week") return { from: calendarDateAddDaysUtc(today, -6), to: today };
  if (period === "month") {
    const [y, m] = today.split("-").map(Number);
    const first = `${y}-${pad2(m)}-01`;
    return { from: first, to: today };
  }
  if (period === "prev_month") {
    const [y, m] = today.split("-").map(Number);
    const prevYear = m === 1 ? y - 1 : y;
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevMonthFirst = `${prevYear}-${pad2(prevMonth)}-01`;
    const thisMonthFirst = `${y}-${pad2(m)}-01`;
    return { from: prevMonthFirst, to: calendarDateAddDaysUtc(thisMonthFirst, -1) };
  }
  if (period === "year") {
    const [y] = today.split("-").map(Number);
    return { from: `${y}-01-01`, to: today };
  }
  if (period === "all_time") {
    return { from: isIsoDate(allTimeFrom) ? allTimeFrom : today, to: today };
  }
  return { from: today, to: today };
}

function rangeToUtcBounds(range: ProjectAnalyticsRange): { startIso: string; endIso: string } {
  return {
    startIso: `${range.from}T00:00:00.000Z`,
    endIso: `${range.to}T23:59:59.999Z`,
  };
}

type ActivityRow = {
  work_item_id: string;
  occurred_at: string;
  action_type: string;
  call_status: string;
  next_action: string;
};

function bucketOutcome(nextAction: string, callStatus: string): string | null {
  const n = (nextAction ?? "").trim();
  if (/aktualu\s+pagal\s+poreikį/i.test(n)) return "aktualu";
  if (/kitą\s+teikėją/i.test(n)) return "kitas_tiekejas";
  if (/vertimai\s+neaktualūs/i.test(n)) return "vertimai";
  if (/neatsiliepė/i.test(n) || /^neatsiliepė$/i.test((callStatus ?? "").trim())) return "neatsiliepe";
  return null;
}

function invoiceMatchesParts(
  inv: { company_code: string | null; client_id: string | null },
  parts: { company_code: string | null; client_id: string | null }
): boolean {
  const ic = (inv.company_code ?? "").trim();
  const ii = (inv.client_id ?? "").trim();
  const pc = (parts.company_code ?? "").trim();
  const pi = (parts.client_id ?? "").trim();
  if (pc !== "") return ic === pc;
  if (pi !== "") return ii === pi && ic === "";
  return ic === "" && ii === "";
}

export type ProjectAnalyticsDto = {
  range: ProjectAnalyticsRange;
  /** Dabartinis mėnuo (kaip „Apžvalgoje“) – naudoti tik „skambučių per mėnesį“ grafikui. */
  monthRange: ProjectAnalyticsRange;
  kpi: {
    calls: number;
    answered: number;
    notAnswered: number;
    emails: number;
    commercial: number;
    answerRatePercent: number | null;
  };
  trend: { date: string; calls: number; answered: number; notAnswered: number }[];
  /** Skambučiai per dabartinio mėnesio dienas (grafikas pats atsifiltruoja darbo dienas). */
  monthCallsTrend: { date: string; calls: number }[];
  outcomes: Record<(typeof PROJECT_ANALYTICS_OUTCOME_LABELS)[number]["id"], number>;
  outcomesOther: number;
  work: {
    totalPicked: number;
    active: number;
    completed: number;
  };
  generated: {
    clientsCount: number;
    totalEur: number;
  };
};

export type ProjectRevenueType = "direct" | "indirect";

export type ProjectRevenueRow = {
  invoice_id: string;
  invoice_number: string | null;
  invoice_date: string;
  amount_eur: number;
  client_label: string;
  revenue_type: ProjectRevenueType;
};

function daysBetweenIso(a: string, b: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const at = Date.UTC(ay, am - 1, ad);
  const bt = Date.UTC(by, bm - 1, bd);
  const diff = bt - at;
  if (!Number.isFinite(diff)) return null;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function clientLabelFromInvoiceRow(inv: {
  company_name: string | null;
  company_code: string | null;
  client_id: string | null;
}): string {
  const n = (inv.company_name ?? "").trim();
  if (n) return n;
  const cc = (inv.company_code ?? "").trim();
  if (cc) return cc;
  const cid = (inv.client_id ?? "").trim();
  if (cid) return cid;
  return "—";
}

const PROJECT_ACTIVITY_PAGE = 1000;
const PROJECT_ACTIVITY_MAX_ROWS = 50_000;

/**
 * Activities for one project via inner join on work items.
 * Avoids `.in("work_item_id", thousandsOfIds)` which overflows the PostgREST URL (400)
 * and was silently mapped to empty KPIs on large projects.
 */
async function fetchProjectActivitiesByJoin<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  projectId: string,
  opts: { startIso: string; endIso: string; columns: string }
): Promise<T[]> {
  const select = `${opts.columns},project_work_items!inner(project_id)`;
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("project_work_item_activities")
      .select(select)
      .eq("project_work_items.project_id", projectId)
      .gte("occurred_at", opts.startIso)
      .lte("occurred_at", opts.endIso)
      .order("occurred_at", { ascending: true })
      .range(from, from + PROJECT_ACTIVITY_PAGE - 1);
    if (error) {
      console.error("[projectAnalytics] activities join", error);
      return out;
    }
    const chunk = (data ?? []) as unknown as T[];
    if (chunk.length === 0) break;
    out.push(...chunk);
    if (chunk.length < PROJECT_ACTIVITY_PAGE) break;
    from += PROJECT_ACTIVITY_PAGE;
    if (from >= PROJECT_ACTIVITY_MAX_ROWS) {
      console.error("[projectAnalytics] activities truncated at", PROJECT_ACTIVITY_MAX_ROWS);
      break;
    }
  }
  return out;
}

export async function fetchProjectRevenueFeed(
  supabase: SupabaseClient,
  projectId: string,
  range: ProjectAnalyticsRange
): Promise<{
  rows: ProjectRevenueRow[];
  count: number;
  kpi: { directEur: number; indirectEur: number; totalEur: number };
}> {
  const rpc = await rpcProjectRevenueFeed(supabase, projectId, range, true);
  if (rpc.ok) {
    return {
      rows: rpc.data.rows,
      count: rpc.data.count,
      kpi: {
        directEur: rpc.data.directEur,
        indirectEur: rpc.data.indirectEur,
        totalEur: rpc.data.totalEur,
      },
    };
  }

  // Legacy fallback if RPC missing / error.
  console.warn("[projectAnalytics] project_revenue_feed fallback:", rpc.error);
  return fetchProjectRevenueFeedLegacy(supabase, projectId, range);
}

type ProjectRevenueFeedRpc = {
  rows: ProjectRevenueRow[];
  count: number;
  clientsCount: number;
  directEur: number;
  indirectEur: number;
  totalEur: number;
};

async function rpcProjectRevenueFeed(
  supabase: SupabaseClient,
  projectId: string,
  range: ProjectAnalyticsRange,
  includeRows: boolean
): Promise<{ ok: true; data: ProjectRevenueFeedRpc } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("project_revenue_feed", {
    p_project_id: projectId,
    p_from: range.from,
    p_to: range.to,
    p_include_rows: includeRows,
  });

  if (error) {
    const msg = String(error.message ?? "");
    return { ok: false, error: msg };
  }

  const payload = (data ?? {}) as {
    count?: unknown;
    clients_count?: unknown;
    kpi?: { direct_eur?: unknown; indirect_eur?: unknown; total_eur?: unknown };
    rows?: unknown;
  };
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : 0;
  };
  const rowsRaw = Array.isArray(payload.rows) ? (payload.rows as Record<string, unknown>[]) : [];
  const rows: ProjectRevenueRow[] = rowsRaw.map((r) => {
    const rt: ProjectRevenueType = String(r.revenue_type ?? "") === "indirect" ? "indirect" : "direct";
    return {
      invoice_id: String(r.invoice_id ?? ""),
      invoice_number: r.invoice_number != null ? String(r.invoice_number) : null,
      invoice_date: String(r.invoice_date ?? "").slice(0, 10),
      amount_eur: num(r.amount_eur),
      client_label: String(r.client_label ?? "—"),
      revenue_type: rt,
    };
  }).filter((r) => r.invoice_id.length > 0);

  return {
    ok: true,
    data: {
      rows,
      count: Math.max(0, Math.trunc(num(payload.count))),
      clientsCount: Math.max(0, Math.trunc(num(payload.clients_count))),
      directEur: num(payload.kpi?.direct_eur),
      indirectEur: num(payload.kpi?.indirect_eur),
      totalEur: num(payload.kpi?.total_eur),
    },
  };
}

async function fetchProjectRevenueFeedLegacy(
  supabase: SupabaseClient,
  projectId: string,
  range: ProjectAnalyticsRange
): Promise<{
  rows: ProjectRevenueRow[];
  count: number;
  kpi: { directEur: number; indirectEur: number; totalEur: number };
}> {
  const { startIso, endIso } = rangeToUtcBounds(range);

  const { data: workRows, error: wErr } = await supabase
    .from("project_work_items")
    .select("id,client_key,result_status")
    .eq("project_id", projectId);

  if (wErr || !workRows?.length) {
    return { rows: [], count: 0, kpi: { directEur: 0, indirectEur: 0, totalEur: 0 } };
  }

  const clientKeys = [...new Set(workRows.map((r) => String(r.client_key ?? "")))].filter(Boolean);

  const actRows = await fetchProjectActivitiesByJoin<{
    work_item_id?: string;
    occurred_at?: string;
    action_type?: string;
  }>(supabase, projectId, {
    startIso,
    endIso,
    columns: "work_item_id,occurred_at,action_type",
  });

  const activities: Array<{ work_item_id: string; occurred_at: string; action_type: string }> = actRows.map((r) => ({
    work_item_id: String(r.work_item_id ?? ""),
    occurred_at: String(r.occurred_at ?? ""),
    action_type: String(r.action_type ?? "").toLowerCase(),
  }));

  const firstContactByWork = new Map<string, string>();
  for (const a of activities) {
    if (!["call", "email", "commercial", "note"].includes(a.action_type)) continue;
    const prev = firstContactByWork.get(a.work_item_id);
    if (!prev || a.occurred_at < prev) firstContactByWork.set(a.work_item_id, a.occurred_at);
  }

  const keyParts = new Map<string, { company_code: string | null; client_id: string | null }>();
  if (clientKeys.length > 0) {
    const { data: viewRows } = await supabase
      .from("v_client_list_from_invoices")
      .select("client_key,company_code,client_id")
      .in("client_key", clientKeys);
    for (const r of viewRows ?? []) {
      keyParts.set(String(r.client_key), {
        company_code: r.company_code != null ? String(r.company_code) : null,
        client_id: r.client_id != null ? String(r.client_id) : null,
      });
    }
  }

  const { data: invRows } = await supabase
    .from("invoices")
    .select("invoice_id,invoice_number,company_code,company_name,client_id,invoice_date,amount,amount_net,tax_amount,tax_rate")
    .ilike("series_title", VAT_INVOICE_SERIES_TITLE_ILIKE)
    .not("invoice_number", "ilike", "VK-000IS%")
    .not("invoice_number", "ilike", "VK-000KR%")
    .gte("invoice_date", range.from)
    .lte("invoice_date", range.to)
    .limit(8000);

  const invoices = (invRows ?? []) as Array<{
    invoice_id: string;
    invoice_number: string | null;
    company_code: string | null;
    company_name: string | null;
    client_id: string | null;
    invoice_date: string | null;
    amount: number | string | null;
  }>;

  const matchedByInvoiceId = new Map<string, ProjectRevenueRow>();
  let directEur = 0;
  let indirectEur = 0;

  for (const w of workRows) {
    const wid = String((w as { id?: string }).id ?? "");
    const ck = String((w as { client_key?: string }).client_key ?? "");
    const t0 = firstContactByWork.get(wid);
    if (!t0) continue;
    const contactDay = t0.slice(0, 10);
    const parts = keyParts.get(ck) ?? { company_code: null, client_id: null };

    for (const inv of invoices) {
      const iid = String(inv.invoice_id ?? "").trim();
      if (!iid || matchedByInvoiceId.has(iid)) continue;
      if (!invoiceMatchesParts(inv, parts)) continue;
      const invDay = typeof inv.invoice_date === "string" ? inv.invoice_date.slice(0, 10) : String(inv.invoice_date ?? "").slice(0, 10);
      if (!invDay || invDay <= contactDay) continue;
      const amt =
        resolveInvoiceNetAmount({
          amount: inv.amount,
          amount_net: (inv as { amount_net?: unknown }).amount_net,
          tax_amount: (inv as { tax_amount?: unknown }).tax_amount,
          tax_rate: (inv as { tax_rate?: unknown }).tax_rate,
        }) ?? NaN;
      if (!Number.isFinite(amt)) continue;

      const deltaDays = daysBetweenIso(contactDay, invDay);
      const revenueType: ProjectRevenueType = deltaDays != null && deltaDays <= 30 ? "direct" : "indirect";
      if (revenueType === "direct") directEur += amt;
      else indirectEur += amt;

      matchedByInvoiceId.set(iid, {
        invoice_id: iid,
        invoice_number: inv.invoice_number != null ? String(inv.invoice_number) : null,
        invoice_date: invDay,
        amount_eur: amt,
        client_label: clientLabelFromInvoiceRow(inv),
        revenue_type: revenueType,
      });
    }
  }

  const rows = [...matchedByInvoiceId.values()].sort((a, b) => {
    if (a.invoice_date !== b.invoice_date) return a.invoice_date < b.invoice_date ? 1 : -1;
    return a.invoice_id < b.invoice_id ? 1 : a.invoice_id > b.invoice_id ? -1 : 0;
  });

  return {
    rows,
    count: rows.length,
    kpi: { directEur, indirectEur, totalEur: directEur + indirectEur },
  };
}

export async function fetchProjectAnalytics(
  supabase: SupabaseClient,
  projectId: string,
  range: ProjectAnalyticsRange,
  opts?: { includeRevenueRows?: boolean }
): Promise<ProjectAnalyticsDto & { revenueRows?: ProjectRevenueRow[] }> {
  const emptyOutcomes = Object.fromEntries(
    PROJECT_ANALYTICS_OUTCOME_LABELS.map((o) => [o.id, 0])
  ) as ProjectAnalyticsDto["outcomes"];
  const includeRows = Boolean(opts?.includeRevenueRows);

  const [overview, revenueRpc] = await Promise.all([
    rpcProjectOverviewAnalytics(supabase, projectId, range),
    rpcProjectRevenueFeed(supabase, projectId, range, includeRows),
  ]);

  if (overview.ok) {
    let generatedClients = 0;
    let generatedEur = 0;
    let revenueRows: ProjectRevenueRow[] | undefined;

    if (revenueRpc.ok) {
      generatedClients = revenueRpc.data.clientsCount;
      generatedEur = revenueRpc.data.totalEur;
      if (includeRows) revenueRows = revenueRpc.data.rows;
    } else {
      console.warn("[projectAnalytics] generated revenue RPC fallback:", revenueRpc.error);
      const legacy = await fetchProjectAnalyticsLegacy(supabase, projectId, range);
      if (!includeRows) {
        return {
          ...legacy,
          kpi: overview.data.kpi,
          monthRange: overview.data.monthRange,
          monthCallsTrend: overview.data.monthCallsTrend,
          work: overview.data.work,
          trend: [],
          outcomes: emptyOutcomes,
          outcomesOther: 0,
        };
      }
      const feedLegacy = await fetchProjectRevenueFeedLegacy(supabase, projectId, range);
      return {
        ...legacy,
        kpi: overview.data.kpi,
        monthRange: overview.data.monthRange,
        monthCallsTrend: overview.data.monthCallsTrend,
        work: overview.data.work,
        trend: [],
        outcomes: emptyOutcomes,
        outcomesOther: 0,
        generated: {
          clientsCount: feedLegacy.count > 0 ? new Set(feedLegacy.rows.map((r) => r.client_label)).size : legacy.generated.clientsCount,
          totalEur: feedLegacy.kpi.totalEur || legacy.generated.totalEur,
        },
        revenueRows: feedLegacy.rows,
      };
    }

    return {
      range,
      monthRange: overview.data.monthRange,
      kpi: overview.data.kpi,
      trend: [],
      monthCallsTrend: overview.data.monthCallsTrend,
      outcomes: emptyOutcomes,
      outcomesOther: 0,
      work: overview.data.work,
      generated: { clientsCount: generatedClients, totalEur: generatedEur },
      ...(includeRows ? { revenueRows: revenueRows ?? [] } : {}),
    };
  }

  console.warn("[projectAnalytics] project_overview_analytics fallback:", overview.error);
  const legacy = await fetchProjectAnalyticsLegacy(supabase, projectId, range);
  if (!includeRows) return legacy;
  const feed = await fetchProjectRevenueFeed(supabase, projectId, range);
  return { ...legacy, revenueRows: feed.rows };
}

type ProjectOverviewAnalyticsRpc = {
  kpi: ProjectAnalyticsDto["kpi"];
  monthRange: ProjectAnalyticsRange;
  monthCallsTrend: Array<{ date: string; calls: number }>;
  work: ProjectAnalyticsDto["work"];
};

async function rpcProjectOverviewAnalytics(
  supabase: SupabaseClient,
  projectId: string,
  range: ProjectAnalyticsRange
): Promise<{ ok: true; data: ProjectOverviewAnalyticsRpc } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("project_overview_analytics", {
    p_project_id: projectId,
    p_from: range.from,
    p_to: range.to,
  });

  if (error) {
    return { ok: false, error: String(error.message ?? "") };
  }

  const payload = (data ?? {}) as {
    kpi?: {
      calls?: unknown;
      answered?: unknown;
      notAnswered?: unknown;
      emails?: unknown;
      commercial?: unknown;
      answerRatePercent?: unknown;
    };
    monthRange?: { from?: unknown; to?: unknown };
    monthCallsTrend?: unknown;
    work?: { totalPicked?: unknown; active?: unknown; completed?: unknown };
  };

  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : 0;
  };
  const int = (v: unknown) => Math.max(0, Math.trunc(num(v)));
  const rateRaw = payload.kpi?.answerRatePercent;
  const rateNum = typeof rateRaw === "number" ? rateRaw : typeof rateRaw === "string" ? Number(rateRaw) : NaN;

  const trendRaw = Array.isArray(payload.monthCallsTrend)
    ? (payload.monthCallsTrend as Array<{ date?: unknown; calls?: unknown }>)
    : [];
  const monthFrom = String(payload.monthRange?.from ?? "").slice(0, 10);
  const monthTo = String(payload.monthRange?.to ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monthFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(monthTo)) {
    return { ok: false, error: "invalid monthRange from project_overview_analytics" };
  }

  return {
    ok: true,
    data: {
      kpi: {
        calls: int(payload.kpi?.calls),
        answered: int(payload.kpi?.answered),
        notAnswered: int(payload.kpi?.notAnswered),
        emails: int(payload.kpi?.emails),
        commercial: int(payload.kpi?.commercial),
        answerRatePercent: Number.isFinite(rateNum) ? rateNum : null,
      },
      monthRange: { from: monthFrom, to: monthTo },
      monthCallsTrend: trendRaw.map((r) => ({
        date: String(r.date ?? "").slice(0, 10),
        calls: int(r.calls),
      })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)),
      work: {
        totalPicked: int(payload.work?.totalPicked),
        active: int(payload.work?.active),
        completed: int(payload.work?.completed),
      },
    },
  };
}

async function fetchProjectAnalyticsLegacy(
  supabase: SupabaseClient,
  projectId: string,
  range: ProjectAnalyticsRange
): Promise<ProjectAnalyticsDto> {
  const { startIso, endIso } = rangeToUtcBounds(range);
  // Month range for the chart should match „Apžvalga“:
  // full current month (Vilnius civil days), not tied to period filter.
  const todayIso = vilniusTodayDateString();
  const monthFrom = vilniusFirstDayOfMonthIso(todayIso);
  const [yy, mm] = monthFrom.split("-").map(Number);
  const nextMonthFrom = mm === 12 ? `${yy + 1}-01-01` : `${yy}-${pad2(mm + 1)}-01`;
  const monthTo = subtractOneCivilDayVilnius(nextMonthFrom);
  const monthRange: ProjectAnalyticsRange = { from: monthFrom, to: monthTo };
  const monthStartIso = vilniusStartUtc(monthFrom);
  const monthEndIso = vilniusEndUtc(monthTo);

  const { data: workRows, error: wErr } = await supabase
    .from("project_work_items")
    .select("id,client_key,result_status,picked_at")
    .eq("project_id", projectId);

  if (wErr) {
    const emptyOutcomes = Object.fromEntries(PROJECT_ANALYTICS_OUTCOME_LABELS.map((o) => [o.id, 0])) as ProjectAnalyticsDto["outcomes"];
    return {
      range,
      monthRange,
      kpi: { calls: 0, answered: 0, notAnswered: 0, emails: 0, commercial: 0, answerRatePercent: null },
      trend: [],
      monthCallsTrend: [],
      outcomes: emptyOutcomes,
      outcomesOther: 0,
      work: { totalPicked: 0, active: 0, completed: 0 },
      generated: { clientsCount: 0, totalEur: 0 },
    };
  }

  if (!workRows?.length) {
    const emptyOutcomes = Object.fromEntries(PROJECT_ANALYTICS_OUTCOME_LABELS.map((o) => [o.id, 0])) as ProjectAnalyticsDto["outcomes"];
    return {
      range,
      monthRange,
      kpi: { calls: 0, answered: 0, notAnswered: 0, emails: 0, commercial: 0, answerRatePercent: null },
      trend: [],
      monthCallsTrend: [],
      outcomes: emptyOutcomes,
      outcomesOther: 0,
      work: { totalPicked: 0, active: 0, completed: 0 },
      generated: { clientsCount: 0, totalEur: 0 },
    };
  }

  const clientKeys = [...new Set(workRows.map((r) => String(r.client_key ?? "")))];

  const actRows = await fetchProjectActivitiesByJoin<{
    work_item_id?: string;
    occurred_at?: string;
    action_type?: string;
    call_status?: string;
    next_action?: string;
  }>(supabase, projectId, {
    startIso,
    endIso,
    columns: "work_item_id,occurred_at,action_type,call_status,next_action",
  });

  const activities: ActivityRow[] = actRows.map((r) => ({
    work_item_id: String(r.work_item_id ?? ""),
    occurred_at: String(r.occurred_at ?? ""),
    action_type: String(r.action_type ?? "").toLowerCase(),
    call_status: String(r.call_status ?? ""),
    next_action: String(r.next_action ?? ""),
  }));

  const monthActRows = await fetchProjectActivitiesByJoin<{
    occurred_at?: string;
    action_type?: string;
  }>(supabase, projectId, {
    startIso: monthStartIso,
    endIso: monthEndIso,
    columns: "occurred_at,action_type",
  });

  let calls = 0;
  let answered = 0;
  let notAnswered = 0;
  let emails = 0;
  let commercial = 0;

  const trendMap = new Map<string, { calls: number; answered: number; notAnswered: number }>();
  const monthCallsByDate = new Map<string, number>();

  for (const a of activities) {
    if (a.action_type === "email") emails += 1;
    if (a.action_type === "commercial") commercial += 1;
    if (a.action_type === "call") {
      calls += 1;
      const day = a.occurred_at.slice(0, 10);
      if (!trendMap.has(day)) trendMap.set(day, { calls: 0, answered: 0, notAnswered: 0 });
      const t = trendMap.get(day)!;
      t.calls += 1;
      if (isCallAnsweredByStatus(a.call_status)) {
        answered += 1;
        t.answered += 1;
      } else if (isCallNotAnsweredByStatus(a.call_status)) {
        notAnswered += 1;
        t.notAnswered += 1;
      }
    }
  }

  const monthActivities: Array<{ occurred_at: string; action_type: string }> = monthActRows.map((r) => ({
    occurred_at: String(r.occurred_at ?? ""),
    action_type: String(r.action_type ?? "").toLowerCase(),
  }));
  for (const a of monthActivities) {
    if (a.action_type !== "call") continue;
    const day = isoDateInVilnius(a.occurred_at);
    monthCallsByDate.set(day, (monthCallsByDate.get(day) ?? 0) + 1);
  }

  const answerRatePercent = calls > 0 ? Math.round((answered / calls) * 1000) / 10 : null;

  const trendDates: string[] = [];
  let d = range.from;
  while (d <= range.to) {
    trendDates.push(d);
    d = calendarDateAddDaysUtc(d, 1);
  }
  const trend = trendDates.map((date) => {
    const t = trendMap.get(date) ?? { calls: 0, answered: 0, notAnswered: 0 };
    return { date, calls: t.calls, answered: t.answered, notAnswered: t.notAnswered };
  });

  const monthTrendDates: string[] = [];
  let md = monthRange.from;
  while (md <= monthRange.to) {
    monthTrendDates.push(md);
    md = calendarDateAddDaysUtc(md, 1);
  }
  const monthCallsTrend = monthTrendDates.map((date) => ({ date, calls: monthCallsByDate.get(date) ?? 0 }));

  const latestByWork = new Map<string, ActivityRow>();
  for (const a of activities) {
    const prev = latestByWork.get(a.work_item_id);
    if (!prev || a.occurred_at > prev.occurred_at) latestByWork.set(a.work_item_id, a);
  }

  const outcomes: ProjectAnalyticsDto["outcomes"] = Object.fromEntries(
    PROJECT_ANALYTICS_OUTCOME_LABELS.map((o) => [o.id, 0])
  ) as ProjectAnalyticsDto["outcomes"];
  let outcomesOther = 0;
  for (const a of latestByWork.values()) {
    const b = bucketOutcome(a.next_action, a.call_status);
    if (b && b in outcomes) outcomes[b as keyof typeof outcomes] += 1;
    else outcomesOther += 1;
  }

  const totalPicked = workRows.length;
  let active = 0;
  let completed = 0;
  for (const w of workRows) {
    const rs = String(w.result_status ?? "");
    if (isReturnedToCandidates(rs)) continue;
    if (isProjectWorkItemClosed(rs)) completed += 1;
    else active += 1;
  }

  let generatedClients = 0;
  let generatedEur = 0;
  const revenueRpc = await rpcProjectRevenueFeed(supabase, projectId, range, false);
  if (revenueRpc.ok) {
    generatedClients = revenueRpc.data.clientsCount;
    generatedEur = revenueRpc.data.totalEur;
  } else {
    console.warn("[projectAnalytics] generated revenue RPC fallback:", revenueRpc.error);
    const keyParts = new Map<string, { company_code: string | null; client_id: string | null }>();
    if (clientKeys.length > 0) {
      const { data: viewRows } = await supabase
        .from("v_client_list_from_invoices")
        .select("client_key,company_code,client_id")
        .in("client_key", clientKeys);
      for (const r of viewRows ?? []) {
        keyParts.set(String(r.client_key), {
          company_code: r.company_code != null ? String(r.company_code) : null,
          client_id: r.client_id != null ? String(r.client_id) : null,
        });
      }
    }

    const firstContactByWork = new Map<string, string>();
    for (const a of activities) {
      if (!["call", "email", "commercial", "note"].includes(a.action_type)) continue;
      const prev = firstContactByWork.get(a.work_item_id);
      if (!prev || a.occurred_at < prev) firstContactByWork.set(a.work_item_id, a.occurred_at);
    }

    const { data: invRows } = await supabase
      .from("invoices")
      .select("invoice_id,company_code,client_id,invoice_date,amount,amount_net,tax_amount,tax_rate")
      .ilike("series_title", VAT_INVOICE_SERIES_TITLE_ILIKE)
      .not("invoice_number", "ilike", "VK-000IS%")
      .not("invoice_number", "ilike", "VK-000KR%")
      .gte("invoice_date", range.from)
      .lte("invoice_date", range.to)
      .limit(8000);

    const invoices = invRows ?? [];
    const invoiceSeen = new Set<string>();
    const clientKeysWithOrder = new Set<string>();

    for (const w of workRows) {
      const wid = String(w.id);
      const ck = String(w.client_key ?? "");
      const t0 = firstContactByWork.get(wid);
      if (!t0) continue;
      const contactDay = t0.slice(0, 10);
      const parts = keyParts.get(ck) ?? { company_code: null, client_id: null };

      for (const inv of invoices) {
        const iid = String((inv as { invoice_id?: string }).invoice_id ?? "");
        if (!iid || invoiceSeen.has(iid)) continue;
        if (!invoiceMatchesParts(inv, parts)) continue;
        const invDay =
          typeof inv.invoice_date === "string" ? inv.invoice_date.slice(0, 10) : String(inv.invoice_date ?? "").slice(0, 10);
        if (!invDay || invDay <= contactDay) continue;
        const amt =
          resolveInvoiceNetAmount({
            amount: inv.amount,
            amount_net: (inv as { amount_net?: unknown }).amount_net,
            tax_amount: (inv as { tax_amount?: unknown }).tax_amount,
            tax_rate: (inv as { tax_rate?: unknown }).tax_rate,
          }) ?? NaN;
        if (!Number.isFinite(amt)) continue;
        invoiceSeen.add(iid);
        clientKeysWithOrder.add(ck);
        generatedEur += amt;
      }
    }
    generatedClients = clientKeysWithOrder.size;
  }

  return {
    range,
    monthRange,
    kpi: {
      calls,
      answered,
      notAnswered,
      emails,
      commercial,
      answerRatePercent,
    },
    trend,
    monthCallsTrend,
    outcomes,
    outcomesOther,
    work: { totalPicked, active, completed },
    generated: { clientsCount: generatedClients, totalEur: generatedEur },
  };
}

export async function fetchProjectOverviewCriticalKpis(
  supabase: SupabaseClient,
  projectId: string,
  range: ProjectAnalyticsRange
): Promise<{
  kpi: ProjectAnalyticsDto["kpi"];
  /** Uždaryta su „Išsiųstas laiškas“ pasirinktame periode (`work_updated_at`). */
  closedEmail: number;
  /** Uždaryta su „Išsiųstas komercinis“ pasirinktame periode (`work_updated_at`). */
  closedCommercial: number;
  /** Current calendar month trend — same overview RPC (no second round-trip). */
  monthRange: ProjectAnalyticsRange;
  monthCallsTrend: ProjectAnalyticsDto["monthCallsTrend"];
}> {
  const [overview, closed] = await Promise.all([
    rpcProjectOverviewAnalytics(supabase, projectId, range),
    fetchProjectClosedEmailCommercialCounts(supabase, projectId, range),
  ]);

  if (overview.ok) {
    return {
      kpi: overview.data.kpi,
      ...closed,
      monthRange: overview.data.monthRange,
      monthCallsTrend: overview.data.monthCallsTrend,
    };
  }

  console.warn("[projectAnalytics] critical KPIs overview RPC fallback:", overview.error);
  const { startIso, endIso } = rangeToUtcBounds(range);

  const actRows = await fetchProjectActivitiesByJoin<{
    action_type?: string;
    call_status?: string;
  }>(supabase, projectId, {
    startIso,
    endIso,
    columns: "action_type,call_status",
  });

  let calls = 0;
  let answered = 0;
  let notAnswered = 0;
  let emails = 0;
  let commercial = 0;

  for (const r of actRows) {
    const action_type = String(r.action_type ?? "").toLowerCase();
    const call_status = String(r.call_status ?? "");
    if (action_type === "email") emails += 1;
    if (action_type === "commercial") commercial += 1;
    if (action_type === "call") {
      calls += 1;
      if (isCallAnsweredByStatus(call_status)) answered += 1;
      else if (isCallNotAnsweredByStatus(call_status)) notAnswered += 1;
    }
  }

  const answerRatePercent = calls > 0 ? Math.round((answered / calls) * 1000) / 10 : null;
  const month = await fetchProjectMonthCallsTrend(supabase, projectId);

  return {
    kpi: { calls, answered, notAnswered, emails, commercial, answerRatePercent },
    ...closed,
    monthRange: month.monthRange,
    monthCallsTrend: month.monthCallsTrend,
  };
}

/** Laiško / komercinio uždarymai periode — pagal `work_updated_at` (uždarymo laikas). */
export async function fetchProjectClosedEmailCommercialCounts(
  supabase: SupabaseClient,
  projectId: string,
  range: ProjectAnalyticsRange
): Promise<{ closedEmail: number; closedCommercial: number }> {
  const { startIso, endIso } = rangeToUtcBounds(range);

  const { data, error } = await supabase
    .from("project_work_items")
    .select("result_status")
    .eq("project_id", projectId)
    .in("result_status", ["completion_sent_email", "completion_sent_commercial"])
    .gte("work_updated_at", startIso)
    .lte("work_updated_at", endIso)
    .limit(20000);

  if (error) {
    console.warn("[projectAnalytics] closed email/commercial counts:", error.message);
    return { closedEmail: 0, closedCommercial: 0 };
  }

  let closedEmail = 0;
  let closedCommercial = 0;
  for (const row of data ?? []) {
    const status = String(row.result_status ?? "").trim();
    if (status === "completion_sent_email") closedEmail += 1;
    else if (status === "completion_sent_commercial") closedCommercial += 1;
  }
  return { closedEmail, closedCommercial };
}

/** Tik mėnesio skambučių trendas (be revenue) — Apžvalgos grafikui. */
export async function fetchProjectMonthCallsTrend(
  supabase: SupabaseClient,
  projectId: string
): Promise<Pick<ProjectAnalyticsDto, "monthRange" | "monthCallsTrend">> {
  const today = vilniusTodayDateString();
  const overview = await rpcProjectOverviewAnalytics(supabase, projectId, { from: today, to: today });
  if (overview.ok) {
    return {
      monthRange: overview.data.monthRange,
      monthCallsTrend: overview.data.monthCallsTrend,
    };
  }

  console.warn("[projectAnalytics] month calls trend fallback:", overview.error);
  const full = await fetchProjectAnalyticsLegacy(supabase, projectId, { from: today, to: today });
  return { monthRange: full.monthRange, monthCallsTrend: full.monthCallsTrend };
}

export function parseProjectAnalyticsPeriod(raw: string | undefined | null): ProjectAnalyticsPeriod {
  if (raw === "today" || raw === "week" || raw === "month" || raw === "prev_month" || raw === "year" || raw === "all_time" || raw === "custom") return raw;
  return "week";
}

/** Apžvalgos „Pardavimai“ blokas — default visas laikotarpis (motyvuojantys skaičiai). */
export function parseProjectSalesAnalyticsPeriod(raw: string | undefined | null): ProjectAnalyticsPeriod {
  if (raw === "today" || raw === "week" || raw === "month" || raw === "prev_month" || raw === "year" || raw === "all_time" || raw === "custom") return raw;
  return "all_time";
}

export async function fetchProjectFirstActivityDate(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("project_work_item_activities")
    .select("occurred_at,project_work_items!inner(project_id)")
    .eq("project_work_items.project_id", projectId)
    .order("occurred_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const occurredAt = String((data as { occurred_at?: string | null }).occurred_at ?? "");
  const ymd = occurredAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}
