import { Suspense } from "react";
import { AnalyticsDateFilter } from "@/components/crm/AnalyticsDateFilter";
import { SalesAnalyticsBody } from "@/components/crm/SalesAnalyticsBody";
import { SalesAnalyticsSkeleton } from "@/components/crm/SalesAnalyticsSkeleton";
import { parseSalesDashboardPeriod, resolveSalesDashboardRange } from "@/lib/crm/salesAnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const period = parseSalesDashboardPeriod(typeof sp.period === "string" ? sp.period : undefined);
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const range = resolveSalesDashboardRange(period, from, to);

  return (
    <div className="space-y-8">
      <Suspense fallback={<p className="text-sm text-zinc-500">Įkeliama…</p>}>
        <AnalyticsDateFilter period={period} range={range} />
      </Suspense>
      <Suspense fallback={<SalesAnalyticsSkeleton />}>
        <SalesAnalyticsBody period={period} range={range} />
      </Suspense>
    </div>
  );
}

