import { Suspense } from "react";
import { AnalyticsDateFilterClientOnly } from "@/components/crm/AnalyticsDateFilterClientOnly";
import { SalesAnalyticsActivityBody, SalesAnalyticsSalesBody } from "@/components/crm/SalesAnalyticsBody";
import { SalesAnalyticsSkeleton, SalesAnalyticsSalesSkeleton } from "@/components/crm/SalesAnalyticsSkeleton";
import {
  fetchSalesDashboardFirstActivityDate,
  parseSalesDashboardPeriod,
  resolveSalesDashboardRange,
} from "@/lib/crm/salesAnalyticsDashboard";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  // Veikla: be `period` — šis mėnuo (greitas first paint).
  const period = parseSalesDashboardPeriod(typeof sp.period === "string" ? sp.period : "month");
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  // Pardavimai: be `salesPeriod` — visas laikotarpis (kraunasi atskirame Suspense).
  const salesPeriod = parseSalesDashboardPeriod(
    typeof sp.salesPeriod === "string" ? sp.salesPeriod : "all_time"
  );
  const salesFrom = typeof sp.salesFrom === "string" ? sp.salesFrom : undefined;
  const salesTo = typeof sp.salesTo === "string" ? sp.salesTo : undefined;

  // Tik veiklos all_time blokuoja filterio shell'ą (pardavimų all_time — Suspense viduje).
  let activityAllTimeFrom: string | null = null;
  if (period === "all_time") {
    try {
      const supabase = await createSupabaseSsrReadOnlyClient();
      activityAllTimeFrom = await fetchSalesDashboardFirstActivityDate(supabase);
    } catch {
      activityAllTimeFrom = null;
    }
  }
  const range = resolveSalesDashboardRange(period, from, to, activityAllTimeFrom);
  const salesRangePreview = resolveSalesDashboardRange(salesPeriod, salesFrom, salesTo, null);

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">Veiklos laikotarpis</div>
        <Suspense fallback={<p className="text-sm text-zinc-500">Įkeliama…</p>}>
          <AnalyticsDateFilterClientOnly period={period} range={range} heading="Veiklos laikotarpis" />
        </Suspense>
      </div>
      <Suspense fallback={<SalesAnalyticsSkeleton />}>
        <SalesAnalyticsActivityBody period={period} range={range} />
      </Suspense>
      <Suspense
        fallback={
          <SalesAnalyticsSalesSkeleton
            salesPeriod={salesPeriod}
            rangeFrom={salesRangePreview.from}
            rangeTo={salesRangePreview.to}
          />
        }
      >
        <SalesAnalyticsSalesBody
          activityPeriod={period}
          activityRange={range}
          salesPeriod={salesPeriod}
          salesFrom={salesFrom}
          salesTo={salesTo}
        />
      </Suspense>
    </div>
  );
}
