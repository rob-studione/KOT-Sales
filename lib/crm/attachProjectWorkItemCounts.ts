import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectListRow } from "@/lib/crm/projectListHelpers";

const CHUNK = 400;

/** Užpildo `project_work_items` agreguota viena (keliomis) RPC užklausomis — pigiau nei PostgREST nested count. */
export async function attachProjectWorkItemCounts(
  supabase: SupabaseClient,
  rows: ProjectListRow[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (ids.length === 0) return { ok: true };

  const countMap = new Map<string, number>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc("project_work_item_counts_by_projects", {
      p_project_ids: part,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    for (const row of (data ?? []) as { project_id: string; item_count: number | string }[]) {
      countMap.set(String(row.project_id), Number(row.item_count ?? 0));
    }
  }

  for (const r of rows) {
    const n = countMap.get(r.id) ?? 0;
    r.project_work_items = [{ count: n }];
  }
  return { ok: true };
}
