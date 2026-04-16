"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { isValidUuid } from "@/lib/crm/crmUsers";
import type { ManagerKpiUserTargets } from "@/lib/crm/managerKpiDashboard";
import { MANAGER_KPI_DEFAULTS } from "@/lib/crm/managerKpiDashboard";

function clampInt(n: unknown, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x) || x < 0) return fallback;
  return Math.min(500, Math.floor(x));
}

export async function saveManagerKpiTargetsAction(rows: ManagerKpiUserTargets[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentCrmUser();
  if (!me || me.role !== "admin") {
    return { ok: false, error: "Tik administratorius gali keisti KPI tikslus." };
  }

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  for (const r of rows) {
    if (!isValidUuid(r.user_id)) continue;
    const payload = {
      user_id: r.user_id,
      daily_call_target: clampInt(r.daily_call_target, MANAGER_KPI_DEFAULTS.daily_call_target),
      daily_answered_target: clampInt(r.daily_answered_target, MANAGER_KPI_DEFAULTS.daily_answered_target),
      daily_commercial_target: clampInt(r.daily_commercial_target, MANAGER_KPI_DEFAULTS.daily_commercial_target),
    };
    const { error } = await supabase.from("crm_user_kpi_targets").upsert(payload, { onConflict: "user_id" });
    if (error) {
      const msg = error.message ?? "DB klaida";
      if (msg.includes("Could not find the table") || msg.includes("crm_user_kpi_targets")) {
        return { ok: false, error: "Trūksta DB migracijos: nerasta lentelė `crm_user_kpi_targets`. Pritaikykite `supabase/migrations/0057_crm_user_kpi_targets.sql`." };
      }
      return { ok: false, error: msg };
    }
  }

  revalidatePath("/analitika/vadybininku-kpi");
  return { ok: true };
}
