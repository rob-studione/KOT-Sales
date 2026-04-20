import { requireAdmin } from "@/lib/crm/currentUser";
import { buildManagerKpiViewModel } from "@/lib/crm/managerKpiDashboard";
import { parseManagerKpiPreset } from "@/lib/crm/managerKpiPeriods";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { ManagerKpiDashboardClientOnly } from "@/components/crm/manager-kpi/ManagerKpiDashboardClientOnly";

export const dynamic = "force-dynamic";

export default async function AnalitikaKpiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin({ mode: "redirect", redirectTo: "/dashboard" });

  const sp = await searchParams;
  const period = parseManagerKpiPreset(typeof sp.period === "string" ? sp.period : undefined);
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const compareRaw = sp.compare;
  const compare =
    compareRaw === "1" ||
    compareRaw === "true" ||
    (Array.isArray(compareRaw) && compareRaw.some((x) => x === "1" || x === "true"));

  const supabase = await createSupabaseSsrReadOnlyClient();
  const model = await buildManagerKpiViewModel(supabase, {
    preset: period,
    customFrom: from,
    customTo: to,
    compare,
  });

  return <ManagerKpiDashboardClientOnly model={model} />;
}

