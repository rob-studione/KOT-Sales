import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addCivilDaysVilnius, vilniusFirstDayOfMonthIso, vilniusMondayOfWeekIso, vilniusTodayDateString } from "@/lib/crm/vilniusTime";

const CRM_ANALYTICS_DEBUG = process.env.CRM_ANALYTICS_DEBUG === "1";

type QueryLog = { label: string; ms: number; ok: boolean; note?: string };

async function withTiming<T>(label: string, fn: () => Promise<T>, logs: QueryLog[]): Promise<T> {
  const t0 = performance.now();
  try {
    const v = await fn();
    logs.push({ label, ms: performance.now() - t0, ok: true });
    return v;
  } catch (e) {
    logs.push({ label, ms: performance.now() - t0, ok: false, note: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export type SalesDashboardPeriod = "today" | "week" | "month" | "prev_month" | "year" | "all_time" | "custom";

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
  /** PVM sąskaitų cold suma (DB su PVM; UI — be PVM). */
  coldRevenueEur: number;
  /** PVM sąskaitų returning suma (DB su PVM; UI — be PVM). */
  returningRevenueEur: number;
  /** Unikalūs klientai su priskirta sąskaita / skambučių skaičius intervale (kaip iki šiol). */
  conversionPercent: number | null;
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

export type SalesDashboardProjectRevenue = {
  projectId: string;
  projectName: string;
  coldEur: number;
  returningEur: number;
  totalEur: number;
};

export type SalesDashboardData = {
  range: SalesDashboardRange;
  period: SalesDashboardPeriod;
  /** Pardavimų filtro periodas (gali skirtis nuo veiklos). */
  salesPeriod: SalesDashboardPeriod;
  salesRange: SalesDashboardRange;
  kpi: SalesDashboardKpi;
  trend: SalesDashboardTrendDay[];
  /** Pajamos pagal projektą (bendra suma; detalės — projekto Pajamose). */
  projectRevenues: SalesDashboardProjectRevenue[];
  bestCallTimes: BestCallTimesData;
  warnings: string[];
};

export function parseSalesDashboardPeriod(raw: string | undefined | null): SalesDashboardPeriod {
  if (raw === "today" || raw === "week" || raw === "month" || raw === "prev_month" || raw === "year" || raw === "all_time" || raw === "custom") return raw;
  return "today";
}

export function resolveSalesDashboardRange(
  period: SalesDashboardPeriod,
  customFrom?: string | null,
  customTo?: string | null,
  allTimeFrom?: string | null
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
  if (period === "prev_month") {
    const [y, m] = today.split("-").map(Number);
    const prevYear = m === 1 ? y - 1 : y;
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevMonthFirst = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
    const thisMonthFirst = `${y}-${String(m).padStart(2, "0")}-01`;
    return { from: prevMonthFirst, to: addCivilDaysVilnius(thisMonthFirst, -1) };
  }
  if (period === "year") {
    const [y] = today.split("-").map(Number);
    return { from: `${y}-01-01`, to: today };
  }
  if (period === "all_time") {
    const from = allTimeFrom && /^\d{4}-\d{2}-\d{2}$/.test(allTimeFrom) ? allTimeFrom : today;
    return { from, to: today };
  }
  if (period === "custom") {
    const mon = vilniusMondayOfWeekIso(today);
    return { from: mon, to: today };
  }
  return { from: vilniusMondayOfWeekIso(today), to: today };
}

export async function fetchSalesDashboardFirstActivityDate(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from("project_work_item_activities")
    .select("occurred_at")
    .order("occurred_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const ymd = String((data as { occurred_at?: string | null }).occurred_at ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

/**
 * KPI „Pardavimai“ langas: pagal nutylėjimą = veiklos intervalas;
 * jei perduotas atskiras sales range — naudojamas jis (pvz. all_time finansams).
 */
export function resolveSalesKpiRange(
  _period: SalesDashboardPeriod,
  range: SalesDashboardRange,
  _todayIso: string,
  salesRangeOverride?: SalesDashboardRange | null
): SalesDashboardRange {
  if (
    salesRangeOverride &&
    /^\d{4}-\d{2}-\d{2}$/.test(salesRangeOverride.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(salesRangeOverride.to)
  ) {
    return salesRangeOverride.from <= salesRangeOverride.to
      ? salesRangeOverride
      : { from: salesRangeOverride.to, to: salesRangeOverride.from };
  }
  return { from: range.from, to: range.to };
}

function buildEmptyBestCallTimes(): BestCallTimesData {
  const slotStartHour = 8;
  const slotEndHour = 22;
  const slotHours = 2;
  const slotKeys: string[] = [];
  for (let h = slotStartHour; h + slotHours <= slotEndHour; h += slotHours) {
    const a = String(h).padStart(2, "0");
    const b = String(h + slotHours).padStart(2, "0");
    slotKeys.push(`${a}:00–${b}:00`);
  }
  const weekdayKeys = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const matrix: BestCallTimeCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: slotKeys.length }, () => ({ calls: 0, answered: 0, business: 0 }))
  );
  return { weekdayKeys, slotKeys, matrix, slotStartHour, slotHours };
}

type RpcV1 = {
  kpi: {
    calls: number;
    answeredCalls: number;
    commercialActions: number;
    coldRevenueEur: number;
    returningRevenueEur: number;
    conversionPercent: number | null;
  };
  trend: Array<{ date: string; calls: number; answered: number; notAnswered: number }>;
  projectRevenues: Array<{
    projectId: string;
    projectName: string;
    coldEur?: number | string;
    returningEur?: number | string;
    totalEur: number | string;
  }>;
};

function asFiniteNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function fetchSalesDashboard(
  supabase: SupabaseClient,
  period: SalesDashboardPeriod,
  range: SalesDashboardRange,
  opts?: {
    salesPeriod?: SalesDashboardPeriod;
    salesRange?: SalesDashboardRange | null;
  }
): Promise<SalesDashboardData> {
  const warnings: string[] = [];
  const logs: QueryLog[] = [];
  const t0 = performance.now();

  const todayIso = vilniusTodayDateString();
  const salesPeriod = opts?.salesPeriod ?? period;
  const salesRange = resolveSalesKpiRange(period, range, todayIso, opts?.salesRange ?? null);

  const data = await withTiming(
    "dashboard_sales_analytics_v1",
    async () => {
      const { data, error } = await supabase.rpc("dashboard_sales_analytics_v1", {
        p_range_from: range.from,
        p_range_to: range.to,
        p_sales_from: salesRange.from,
        p_sales_to: salesRange.to,
      });
      if (error) throw new Error(error.message);
      return data as unknown;
    },
    logs
  );

  const payload = (data ?? {}) as Partial<RpcV1>;
  const k = payload.kpi ?? ({} as RpcV1["kpi"]);
  const trendRaw = Array.isArray(payload.trend) ? payload.trend : [];
  const projectRevenuesRaw = Array.isArray(payload.projectRevenues) ? payload.projectRevenues : [];

  const out: SalesDashboardData = {
    range,
    period,
    salesPeriod,
    salesRange,
    kpi: {
      calls: asFiniteNumber(k.calls, 0),
      answeredCalls: asFiniteNumber(k.answeredCalls, 0),
      commercialActions: asFiniteNumber(k.commercialActions, 0),
      coldRevenueEur: asFiniteNumber(k.coldRevenueEur, 0),
      returningRevenueEur: asFiniteNumber(k.returningRevenueEur, 0),
      conversionPercent: k.conversionPercent == null ? null : asFiniteNumber(k.conversionPercent, 0),
    },
    trend: trendRaw
      .map((r) => ({
        date: String((r as any).date ?? "").slice(0, 10),
        calls: asFiniteNumber((r as any).calls, 0),
        answered: asFiniteNumber((r as any).answered, 0),
        notAnswered: asFiniteNumber((r as any).notAnswered, 0),
      }))
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)),
    projectRevenues: projectRevenuesRaw
      .map((r) => {
        const coldEur = asFiniteNumber((r as any).coldEur, 0);
        const returningEur = asFiniteNumber((r as any).returningEur, 0);
        const totalEur = asFiniteNumber((r as any).totalEur, coldEur + returningEur);
        return {
          projectId: String((r as any).projectId ?? "").trim(),
          projectName: String((r as any).projectName ?? "").trim() || "Be pavadinimo",
          coldEur,
          returningEur,
          totalEur,
        };
      })
      .filter((r) => r.projectId && r.totalEur > 0),
    bestCallTimes: buildEmptyBestCallTimes(),
    warnings,
  };

  if (CRM_ANALYTICS_DEBUG) {
    const ms = performance.now() - t0;
    for (const l of logs) {
      console.log(`[salesAnalyticsDashboard] ${l.label} ms=${l.ms.toFixed(1)} ok=${l.ok}${l.note ? ` note=${l.note}` : ""}`);
    }
    console.log(
      `[salesAnalyticsDashboard] fetchSalesDashboard_total ms=${ms.toFixed(1)} range=${range.from}..${range.to} sales=${salesRange.from}..${salesRange.to}`
    );
  }

  return out;
}
