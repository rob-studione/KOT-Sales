import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectWorkItemDto } from "@/lib/crm/projectWorkItemDto";

export type CompletedStatusCount = { status: string; count: number };

export type CompletedWorkItemsPageResult = {
  totalAfterSearch: number;
  filteredTotal: number;
  statusCounts: CompletedStatusCount[];
  rows: ProjectWorkItemDto[];
};

function mapCompletedRow(row: Record<string, unknown>): ProjectWorkItemDto {
  const st = row.source_type;
  return {
    id: String(row.id ?? ""),
    source_type:
      st === "auto" || st === "manual_lead" || st === "linked_client" || st === "procurement_contract"
        ? st
        : null,
    source_id: row.source_id != null ? String(row.source_id) : null,
    client_key: row.client_key == null ? "" : String(row.client_key),
    client_identifier_display: String(row.client_identifier_display ?? ""),
    client_name_snapshot: String(row.client_name_snapshot ?? ""),
    assigned_to: String(row.assigned_to ?? ""),
    picked_at: String(row.picked_at ?? ""),
    snapshot_order_count: Number(row.snapshot_order_count ?? 0),
    snapshot_revenue: Number(row.snapshot_revenue ?? 0),
    snapshot_last_invoice_date:
      typeof row.snapshot_last_invoice_date === "string"
        ? row.snapshot_last_invoice_date.slice(0, 10)
        : String(row.snapshot_last_invoice_date ?? "").slice(0, 10),
    snapshot_priority: Number(row.snapshot_priority ?? 0),
    call_status: String(row.call_status ?? ""),
    next_action: String(row.next_action ?? ""),
    next_action_date:
      row.next_action_date && typeof row.next_action_date === "string"
        ? row.next_action_date.slice(0, 10)
        : null,
    comment: String(row.comment ?? ""),
    result_status: String(row.result_status ?? ""),
    client_live_all_time_revenue: null,
    client_live_last_invoice_date: null,
    client_last_invoice_number: null,
    client_invoice_email: null,
    client_invoice_phone: null,
  };
}

export async function fetchCompletedWorkItemsPage(
  supabase: SupabaseClient,
  projectId: string,
  opts: {
    pageIndex0: number;
    pageSize: number;
    search?: string | null;
    status?: string | null;
  }
): Promise<{ ok: true; data: CompletedWorkItemsPageResult } | { ok: false; error: string }> {
  const pageSize = Math.min(Math.max(Math.trunc(opts.pageSize) || 20, 1), 100);
  const pageIndex0 = Math.max(Math.trunc(opts.pageIndex0) || 0, 0);
  const search = (opts.search ?? "").trim();
  const status = (opts.status ?? "").trim();

  const { data, error } = await supabase.rpc("project_completed_work_items_page", {
    p_project_id: projectId,
    p_limit: pageSize,
    p_offset: pageIndex0 * pageSize,
    p_search: search.length > 0 ? search : null,
    p_status: status.length > 0 ? status : null,
  });

  if (error) {
    const msg = String(error.message ?? "");
    const missing =
      error.code === "42883" ||
      msg.toLowerCase().includes("project_completed_work_items_page") ||
      msg.includes("Could not find the function");
    return {
      ok: false,
      error: missing
        ? "RPC project_completed_work_items_page nerastas — pritaikykite migraciją 0126_project_completed_work_items_page.sql."
        : msg,
    };
  }

  const payload = (data ?? {}) as {
    total_after_search?: unknown;
    filtered_total?: unknown;
    status_counts?: unknown;
    items?: unknown;
  };
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  };

  const statusCountsRaw = Array.isArray(payload.status_counts)
    ? (payload.status_counts as Array<{ status?: unknown; count?: unknown }>)
    : [];
  const statusCounts: CompletedStatusCount[] = statusCountsRaw
    .map((r) => ({
      status: String(r.status ?? "").trim() || "completed",
      count: num(r.count),
    }))
    .filter((r) => r.count > 0);

  const itemsRaw = Array.isArray(payload.items) ? (payload.items as Record<string, unknown>[]) : [];

  return {
    ok: true,
    data: {
      totalAfterSearch: num(payload.total_after_search),
      filteredTotal: num(payload.filtered_total),
      statusCounts,
      rows: itemsRaw.map(mapCompletedRow).filter((r) => r.id.length > 0),
    },
  };
}
