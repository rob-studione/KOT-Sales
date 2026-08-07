import { Suspense } from "react";
import { AnalyticsDateFilterClientOnly } from "@/components/crm/AnalyticsDateFilterClientOnly";
import {
  SalesAnalyticsActivityView,
  SalesAnalyticsSalesView,
} from "@/components/crm/SalesAnalyticsDashboardView";
import {
  fetchSalesDashboard,
  fetchSalesDashboardFirstActivityDate,
  resolveSalesDashboardRange,
  type SalesDashboardPeriod,
  type SalesDashboardRange,
} from "@/lib/crm/salesAnalyticsDashboard";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import {
  subtractOneCivilDayVilnius,
  vilniusEndUtc,
  vilniusFirstDayOfMonthIso,
  vilniusStartUtc,
  vilniusTodayDateString,
} from "@/lib/crm/vilniusTime";

const SALES_PARAM_KEYS = {
  period: "salesPeriod",
  from: "salesFrom",
  to: "salesTo",
} as const;
/** Greita Veikla + mėnesio grafikas (sales = tas pats kaip veikla — konversija be pokyčių). */
export async function SalesAnalyticsActivityBody({
  period,
  range,
}: {
  period: SalesDashboardPeriod;
  range: SalesDashboardRange;
}) {
  let supabase;
  try {
    supabase = await createSupabaseSsrReadOnlyClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nežinoma klaida";
    return <p className="text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>;
  }

  try {
    const todayIso = vilniusTodayDateString();
    const monthFrom = vilniusFirstDayOfMonthIso(todayIso);
    const [yy, mm] = monthFrom.split("-").map(Number);
    const nextMonthFrom =
      mm === 12 ? `${yy + 1}-01-01` : `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
    const monthTo = subtractOneCivilDayVilnius(nextMonthFrom);
    const monthRange = { from: monthFrom, to: monthTo };

    const [data, monthTrend] = await Promise.all([
      fetchSalesDashboard(supabase, period, range),
      (async (): Promise<Array<{ date: string; calls: number }>> => {
        try {
          const { data: rpcRows, error } = await supabase.rpc("dashboard_month_call_counts_by_day", {
            p_start_utc: vilniusStartUtc(monthFrom),
            p_end_utc: vilniusEndUtc(monthTo),
          });
          if (error || !rpcRows || !Array.isArray(rpcRows)) return [];
          return (rpcRows as Array<{ day: string; calls: number | string | null }>)
            .map((r) => ({
              date: String(r.day ?? "").slice(0, 10),
              calls: typeof r.calls === "number" ? r.calls : Number(r.calls ?? 0),
            }))
            .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.calls))
            .sort((a, b) => a.date.localeCompare(b.date));
        } catch {
          return [];
        }
      })(),
    ]);

    return <SalesAnalyticsActivityView data={data} monthCallsTrend={monthTrend} monthRange={monthRange} />;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return <p className="text-sm text-red-600">Nepavyko įkelti analitikos: {message}</p>;
  }
}

/**
 * Pardavimai (Cold/Returning + pagal projektą) — atskiras Suspense.
 * `all_time` firstActivity tik čia (neblokuoja Veiklos).
 */
export async function SalesAnalyticsSalesBody({
  activityPeriod,
  activityRange,
  salesPeriod,
  salesFrom,
  salesTo,
}: {
  activityPeriod: SalesDashboardPeriod;
  activityRange: SalesDashboardRange;
  salesPeriod: SalesDashboardPeriod;
  salesFrom?: string;
  salesTo?: string;
}) {
  let supabase;
  try {
    supabase = await createSupabaseSsrReadOnlyClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nežinoma klaida";
    return <p className="text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>;
  }

  try {
    const allTimeFrom =
      salesPeriod === "all_time" ? await fetchSalesDashboardFirstActivityDate(supabase) : null;
    const salesRange = resolveSalesDashboardRange(salesPeriod, salesFrom, salesTo, allTimeFrom);
    const data = await fetchSalesDashboard(supabase, activityPeriod, activityRange, {
      salesPeriod,
      salesRange,
    });

    const salesPeriodHeader = (
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Pardavimų laikotarpis</div>
        <div className="mt-2">
          <Suspense fallback={<div className="h-9 w-44 animate-pulse rounded-lg border border-zinc-200 bg-zinc-50" />}>
            <AnalyticsDateFilterClientOnly
              period={salesPeriod}
              range={salesRange}
              paramKeys={SALES_PARAM_KEYS}
              heading="Pardavimų laikotarpis"
            />
          </Suspense>
        </div>
      </div>
    );

    return <SalesAnalyticsSalesView data={data} salesPeriodHeader={salesPeriodHeader} />;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return <p className="text-sm text-red-600">Nepavyko įkelti pardavimų: {message}</p>;
  }
}

/** @deprecated — naudokite Activity + Sales body. */
export async function SalesAnalyticsBody({
  period,
  range,
}: {
  period: SalesDashboardPeriod;
  range: SalesDashboardRange;
}) {
  return <SalesAnalyticsActivityBody period={period} range={range} />;
}
