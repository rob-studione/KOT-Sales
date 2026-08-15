"use client";

import nextDynamic from "next/dynamic";
import type { ManagerKpiViewModel } from "@/lib/crm/managerKpiDashboard";

const ManagerKpiDashboard = nextDynamic(
  () => import("@/components/crm/manager-kpi/ManagerKpiDashboard").then((m) => m.ManagerKpiDashboard),
  { ssr: false, loading: () => <p className="text-sm text-zinc-500">Įkeliama…</p> }
);

export function ManagerKpiDashboardClientOnly({
  model,
  canEditTargets = false,
}: {
  model: ManagerKpiViewModel;
  canEditTargets?: boolean;
}) {
  return <ManagerKpiDashboard model={model} canEditTargets={canEditTargets} />;
}

