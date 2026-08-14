import { redirect } from "next/navigation";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { hasPermission } from "@/lib/crm/permissions/check";
import { buildManagerKpiViewModel } from "@/lib/crm/managerKpiDashboard";
import { parseManagerKpiPreset } from "@/lib/crm/managerKpiPeriods";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { ManagerKpiDashboardClientOnly } from "@/components/crm/manager-kpi/ManagerKpiDashboardClientOnly";

export const dynamic = "force-dynamic";

function firstString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.find((x) => typeof x === "string" && x.length > 0);
  return undefined;
}

export default async function AnalitikaKpiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const me = await getCurrentCrmUser();
  if (!me) redirect("/login?next=/analitika/kpi");
  if (!hasPermission(me, "nav.analytics.kpi")) redirect("/dashboard");

  const sp = await searchParams;
  const periodRaw = firstString(sp.period);
  if (!periodRaw) {
    const q = new URLSearchParams();
    q.set("period", "month");
    const from = firstString(sp.from);
    const to = firstString(sp.to);
    const compare = firstString(sp.compare);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (compare === "1" || compare === "true") q.set("compare", "1");
    redirect(`/analitika/kpi?${q.toString()}`);
  }

  const period = parseManagerKpiPreset(periodRaw);
  const from = firstString(sp.from);
  const to = firstString(sp.to);
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

  return <ManagerKpiDashboardClientOnly model={model} canEditTargets={hasPermission(me, "analytics.kpi.edit_targets")} />;
}
