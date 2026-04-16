import { SalesAnalyticsDashboardView } from "@/components/crm/SalesAnalyticsDashboardView";
import {
  fetchSalesDashboard,
  type SalesDashboardPeriod,
  type SalesDashboardRange,
} from "@/lib/crm/salesAnalyticsDashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isoDateInVilnius,
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
      const { data: rows, error } = await supabase
        .from("project_work_item_activities")
        .select("occurred_at")
        .eq("action_type", "call")
        .gte("occurred_at", vilniusStartUtc(monthFrom))
        .lte("occurred_at", vilniusEndUtc(monthTo))
        .abortSignal(AbortSignal.timeout(8000));
      if (!error && rows) {
        const byDay = new Map<string, number>();
        for (const r of rows as Array<{ occurred_at: string }>) {
          const day = isoDateInVilnius(String(r.occurred_at));
          byDay.set(day, (byDay.get(day) ?? 0) + 1);
        }
        monthTrend = [...byDay.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, calls]) => ({ date, calls }));
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
