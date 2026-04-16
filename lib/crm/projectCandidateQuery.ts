import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeRpcCandidateRow,
  parseProjectSortOption,
  sortSnapshotCandidates,
  type SnapshotCandidateRow,
} from "@/lib/crm/projectSnapshot";
import { isManualProjectType, isProcurementProjectType, projectTypeFromDbRow } from "@/lib/crm/projectType";

export async function rpcMatchProjectCandidates(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string,
  minOrderCount: number,
  inactivityDays: number,
  projectId: string | null
): Promise<{ ok: true; rows: SnapshotCandidateRow[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("match_project_candidates", {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_min_orders: minOrderCount,
    p_inactivity_days: inactivityDays,
    p_project_id: projectId,
  });

  if (error) {
    return {
      ok: false,
      error:
        error.message +
        (error.code === "42883" || error.message.includes("match_project_candidates")
          ? " — pritaikykite migraciją 0015_project_campaign_work_items.sql."
          : ""),
    };
  }

  const raw = (data ?? []) as Record<string, unknown>[];
  return { ok: true, rows: raw.map(normalizeRpcCandidateRow) };
}

export type ProjectRulesRow = {
  id: string;
  /** `manual` — kandidatų sąrašas tuščias, kol pridedami rankiniu būdu. */
  project_type?: string | null;
  filter_date_from: string;
  filter_date_to: string;
  min_order_count: number;
  inactivity_days: number | null;
  sort_option: string;
};

export async function fetchSortedCandidatesForProject(
  supabase: SupabaseClient,
  p: ProjectRulesRow
): Promise<{ ok: true; rows: SnapshotCandidateRow[] } | { ok: false; error: string }> {
  const t = projectTypeFromDbRow(p) ?? p.project_type;
  if (isManualProjectType(t) || isProcurementProjectType(t)) {
    return { ok: true, rows: [] };
  }

  const loaded = await rpcMatchProjectCandidates(
    supabase,
    String(p.filter_date_from).slice(0, 10),
    String(p.filter_date_to).slice(0, 10),
    Number(p.min_order_count ?? 1),
    Number(p.inactivity_days ?? 90),
    p.id
  );
  if (!loaded.ok) return loaded;
  const sort = parseProjectSortOption(String(p.sort_option ?? ""));
  return { ok: true, rows: sortSnapshotCandidates(loaded.rows, sort) };
}
