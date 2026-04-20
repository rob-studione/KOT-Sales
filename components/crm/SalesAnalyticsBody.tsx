import { SalesAnalyticsDashboardView } from "@/components/crm/SalesAnalyticsDashboardView";
import {
  fetchSalesDashboard,
  type SalesDashboardPeriod,
  type SalesDashboardRange,
} from "@/lib/crm/salesAnalyticsDashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  subtractOneCivilDayVilnius,
  vilniusEndUtc,
  vilniusFirstDayOfMonthIso,
  vilniusStartUtc,
  vilniusTodayDateString,
} from "@/lib/crm/vilniusTime";

export async function SalesAnalyticsBody({
  period,
  range,
}: {
  period: SalesDashboardPeriod;
  range: SalesDashboardRange;
}) {
  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nežinoma klaida";
    return <p className="text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>;
  }

  try {
    const data = await fetchSalesDashboard(supabase, period, range);
    const todayIso = vilniusTodayDateString();
    const monthFrom = vilniusFirstDayOfMonthIso(todayIso);
    const [yy, mm] = monthFrom.split("-").map(Number);
    const nextMonthFrom =
      mm === 12 ? `${yy + 1}-01-01` : `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
    const monthTo = subtractOneCivilDayVilnius(nextMonthFrom);

    const monthRange = { from: monthFrom, to: monthTo };
    let monthTrend: Array<{ date: string; calls: number }> = [];
    try {
      const { data: rpcRows, error } = await supabase.rpc("dashboard_month_call_counts_by_day", {
        p_start_utc: vilniusStartUtc(monthFrom),
        p_end_utc: vilniusEndUtc(monthTo),
      });
      if (!error && rpcRows && Array.isArray(rpcRows)) {
        monthTrend = (rpcRows as Array<{ day: string; calls: number | string | null }>)
          .map((r) => ({
            date: String(r.day ?? "").slice(0, 10),
            calls: typeof r.calls === "number" ? r.calls : Number(r.calls ?? 0),
          }))
          .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.calls))
          .sort((a, b) => a.date.localeCompare(b.date));
      }
    } catch {
      // Graceful: chart will render empty state.
    }

    return <SalesAnalyticsDashboardView data={data} monthCallsTrend={monthTrend} monthRange={monthRange} />;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return <p className="text-sm text-red-600">Nepavyko įkelti analitikos: {message}</p>;
  }
}
