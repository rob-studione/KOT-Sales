"use client";

import nextDynamic from "next/dynamic";
import type { SalesDashboardPeriod, SalesDashboardRange } from "@/lib/crm/salesAnalyticsDashboard";
import type { AnalyticsDateFilterParamKeys } from "@/components/crm/AnalyticsDateFilter";

const AnalyticsDateFilterInner = nextDynamic(
  () => import("@/components/crm/AnalyticsDateFilter").then((m) => m.AnalyticsDateFilter),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="h-9 w-44 animate-pulse rounded-lg border border-zinc-200 bg-zinc-50" />
        <div className="h-4 w-40 animate-pulse rounded bg-zinc-100" />
      </div>
    ),
  }
);

export function AnalyticsDateFilterClientOnly({
  period,
  range,
  paramKeys,
  heading = "Laikotarpis",
  rangePlacement = "below",
  align = "start",
}: {
  period: SalesDashboardPeriod;
  range: SalesDashboardRange;
  paramKeys?: AnalyticsDateFilterParamKeys;
  heading?: string;
  rangePlacement?: "below" | "beside" | "none";
  align?: "start" | "end";
}) {
  return (
    <AnalyticsDateFilterInner
      period={period}
      range={range}
      paramKeys={paramKeys}
      heading={heading}
      rangePlacement={rangePlacement}
      align={align}
    />
  );
}
