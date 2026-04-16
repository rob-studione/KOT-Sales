"use client";

import nextDynamic from "next/dynamic";
import type { BestCallTimesData } from "@/lib/crm/salesAnalyticsDashboard";

const BestCallTimeSection = nextDynamic(
  () => import("@/components/crm/BestCallTimeSection").then((m) => m.BestCallTimeSection),
  { ssr: false }
);

export function SalesAnalyticsBestCallTimeClient({ data }: { data: BestCallTimesData }) {
  return <BestCallTimeSection data={data} />;
}
