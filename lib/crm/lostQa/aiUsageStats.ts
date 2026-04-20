import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { vilniusStartUtc, vilniusTodayDateString } from "@/lib/crm/vilniusTime";

function supabaseErrMessage(error: unknown): string {
  const raw =
    error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string"
      ? String((error as { message: string }).message)
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  const msg = raw || "Nežinoma duomenų bazės klaida.";
  if (/does not exist/i.test(msg) && /ai_usage_logs/i.test(msg)) {
    return `${msg} Pritaikyk migraciją supabase/migrations/0067_ai_usage_logs.sql.`;
  }
  return msg;
}

function ymdParts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  return { y, m, d };
}

function monthRangeUtcIsoStrings(todayYmd: string): { fromIso: string; toIso: string } {
  const { y, m } = ymdParts(todayYmd);
  const startYmd = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const start = vilniusStartUtc(startYmd);
  const nextMonth = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const nextStartYmd = `${String(nextMonth.y).padStart(4, "0")}-${String(nextMonth.m).padStart(2, "0")}-01`;
  const end = vilniusStartUtc(nextStartYmd);
  return { fromIso: start, toIso: end };
}

function dayRangeUtcIsoStrings(ymd: string): { fromIso: string; toIso: string } {
  const start = vilniusStartUtc(ymd);
  const { y, m, d } = ymdParts(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const nextYmd = `${yyyy}-${mm}-${dd}`;
  const end = vilniusStartUtc(nextYmd);
  return { fromIso: start, toIso: end };
}

function sumCostRows(rows: Array<{ cost_eur: unknown }> | null | undefined): number {
  let s = 0;
  for (const r of rows ?? []) {
    const x = typeof r.cost_eur === "number" ? r.cost_eur : Number(r.cost_eur);
    if (Number.isFinite(x)) s += x;
  }
  return s;
}

/** Sum of `cost_eur` for all AI usage log rows in the Vilnius calendar month containing `todayYmd`. */
export async function getLostQaMonthTotalAiCostEur(admin: SupabaseClient, todayYmd?: string): Promise<number> {
  const ymd = todayYmd ?? vilniusTodayDateString();
  const { fromIso: monthFrom, toIso: monthTo } = monthRangeUtcIsoStrings(ymd);
  const { data, error } = await admin
    .from("ai_usage_logs")
    .select("cost_eur")
    .gte("created_at", monthFrom)
    .lt("created_at", monthTo);
  if (error) throw new Error(supabaseErrMessage(error));
  return sumCostRows(data as any);
}

export type LostQaAiUsageStats = {
  today_cost_eur: number;
  month_cost_eur: number;
  avg_cost_per_case_eur: number;
  analyzed_cases_month: number;
};

export async function getLostQaAiUsageStats(admin: SupabaseClient): Promise<LostQaAiUsageStats> {
  const todayYmd = vilniusTodayDateString();
  const { fromIso: dayFrom, toIso: dayTo } = dayRangeUtcIsoStrings(todayYmd);
  const { fromIso: monthFrom, toIso: monthTo } = monthRangeUtcIsoStrings(todayYmd);

  const [
    { data: dayAgg, error: dayErr },
    { data: monthAgg, error: monthErr },
    { data: monthAnalyzeAgg, error: monthAnalyzeErr },
    { count: monthCasesCount, error: casesErr },
  ] = await Promise.all([
    admin.from("ai_usage_logs").select("cost_eur").gte("created_at", dayFrom).lt("created_at", dayTo),
    admin.from("ai_usage_logs").select("cost_eur").gte("created_at", monthFrom).lt("created_at", monthTo),
    admin
      .from("ai_usage_logs")
      .select("cost_eur")
      .eq("type", "analyze")
      .eq("meta->>feature", "lost_qa_case_analysis")
      .gte("created_at", monthFrom)
      .lt("created_at", monthTo),
    admin
      .from("ai_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("type", "analyze")
      .eq("meta->>feature", "lost_qa_case_analysis")
      .gte("created_at", monthFrom)
      .lt("created_at", monthTo),
  ]);

  if (dayErr) throw new Error(supabaseErrMessage(dayErr));
  if (monthErr) throw new Error(supabaseErrMessage(monthErr));
  if (monthAnalyzeErr) throw new Error(supabaseErrMessage(monthAnalyzeErr));
  if (casesErr) throw new Error(supabaseErrMessage(casesErr));

  const today_cost_eur = sumCostRows(dayAgg as any);
  const month_cost_eur = sumCostRows(monthAgg as any);

  const analyzed_cases_month = Number(monthCasesCount ?? 0);
  const month_analyze_cost_eur = sumCostRows(monthAnalyzeAgg as any);

  const avg_cost_per_case_eur =
    analyzed_cases_month > 0 ? month_analyze_cost_eur / analyzed_cases_month : 0;

  return {
    today_cost_eur: today_cost_eur,
    month_cost_eur: month_cost_eur,
    avg_cost_per_case_eur,
    analyzed_cases_month,
  };
}
