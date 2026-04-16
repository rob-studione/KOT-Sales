/**
 * Darbo eilutės laukai. `source_*` reikalauja migracijos 0036_project_work_items_source.sql;
 * jei jos nėra, naudojame tik LEGACY sąrašą / insert be šaltinio.
 */

export const PROJECT_WORK_ITEMS_SELECT_LEGACY =
  "id,client_key,client_identifier_display,client_name_snapshot,assigned_to,picked_at,snapshot_order_count,snapshot_revenue,snapshot_last_invoice_date,snapshot_priority,call_status,next_action,next_action_date,comment,result_status";

export const PROJECT_WORK_ITEMS_SELECT_WITH_SOURCE = `${PROJECT_WORK_ITEMS_SELECT_LEGACY},source_type,source_id`;

/** PostgREST / Postgres, kai trūksta `source_type` / `source_id` (migracija 0036 nepritaikyta). */
export function isMissingWorkItemSourceColumnsError(err: { message?: string } | null | undefined): boolean {
  const m = String(err?.message ?? "").toLowerCase();
  if (!m.includes("does not exist")) return false;
  return m.includes("source_type") || m.includes("source_id");
}
