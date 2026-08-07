import { cache } from "react";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import type { CrmUser } from "@/lib/crm/crmUsers";

/** Bendras projekto detalės (`/projektai/[id]/*`) eilutės tipas — naudojamas layout ir tab puslapio. */
export type ProjectDetailRow = {
  id: string;
  name: string;
  description: string;
  project_type?: string | null;
  filter_date_from: string;
  filter_date_to: string;
  min_order_count: number;
  inactivity_days: number | null;
  sort_option: string;
  status: string;
  created_at: string;
  created_by: string | null;
  owner_user_id: string | null;
  procurement_notify_days_before?: number | null;
  candidates_require_business_id?: boolean | null;
};

export const PROJECT_DETAIL_SELECT =
  "id,name,description,project_type,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option,status,created_at,created_by,owner_user_id,procurement_notify_days_before,candidates_require_business_id";

export type ProjectDetailCoreData = {
  project: ProjectDetailRow | null;
  projectError: string | null;
  crmUsers: CrmUser[];
};

/**
 * Projekto eilutė + crm_users sąrašas — naudoja tiek `layout.tsx` (antraštė), tiek `ProjectDetailTabPage`
 * (skirtukų turinys). `react.cache` sujungia abu kvietimus per tą patį request'ą į vieną DB round-trip'ą.
 */
export const loadProjectDetailCore = cache(async function loadProjectDetailCore(
  id: string
): Promise<ProjectDetailCoreData> {
  const supabase = await createSupabaseSsrReadOnlyClient();
  const [{ data: project, error: pErr }, { data: crmUsersRaw, error: crmUsersErr }] = await Promise.all([
    supabase.from("projects").select(PROJECT_DETAIL_SELECT).eq("id", id).maybeSingle(),
    supabase.from("crm_users").select("id,name,avatar_url").order("name", { ascending: true }),
  ]);
  const crmUsers: CrmUser[] = (crmUsersRaw ?? []).map(
    (u: { id?: unknown; name?: unknown; avatar_url?: string | null }) => ({
      id: String(u?.id ?? ""),
      name: String(u?.name ?? ""),
      email: "",
      role: "",
      avatar_url: u?.avatar_url ?? null,
    })
  );
  if (crmUsersErr && process.env.NODE_ENV === "development") {
    console.warn("[projektai/[id]] crm_users load failed:", crmUsersErr);
  }
  return {
    project: (project as ProjectDetailRow | null) ?? null,
    projectError: pErr ? pErr.message : null,
    crmUsers,
  };
});
