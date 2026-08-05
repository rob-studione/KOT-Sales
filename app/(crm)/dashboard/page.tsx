import { Suspense } from "react";
import { AnalyticsDateFilterClientOnly } from "@/components/crm/AnalyticsDateFilterClientOnly";
import { SalesAnalyticsBody } from "@/components/crm/SalesAnalyticsBody";
import { SalesAnalyticsSkeleton } from "@/components/crm/SalesAnalyticsSkeleton";
import { fetchSalesDashboardFirstActivityDate, parseSalesDashboardPeriod, resolveSalesDashboardRange } from "@/lib/crm/salesAnalyticsDashboard";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  // Tik /dashboard: be `period` query — „Visas laikotarpis“ (kitur parse default lieka today).
  const period = parseSalesDashboardPeriod(typeof sp.period === "string" ? sp.period : "all_time");
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  let allTimeFrom: string | null = null;
  if (period === "all_time") {
    try {
      const supabase = await createSupabaseSsrReadOnlyClient();
      allTimeFrom = await fetchSalesDashboardFirstActivityDate(supabase);
    } catch {
      allTimeFrom = null;
    }
  }
  const range = resolveSalesDashboardRange(period, from, to, allTimeFrom);

  return (
    <div className="space-y-8">
      <Suspense fallback={<p className="text-sm text-zinc-500">Įkeliama…</p>}>
        <AnalyticsDateFilterClientOnly period={period} range={range} />
      </Suspense>
      <Suspense fallback={<SalesAnalyticsSkeleton />}>
        <SalesAnalyticsBody period={period} range={range} />
      </Suspense>
    </div>
  );
}
