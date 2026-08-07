import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isProjectWorkItemClosed,
  isReturnedToCandidates,
} from "@/lib/crm/projectBoardConstants";
import {
  WORK_ITEM_COMPLETION_RESULT_VALUES,
  PROCUREMENT_WORK_ITEM_COMPLETION_RESULT_VALUES,
} from "@/lib/crm/projectCompletion";
import {
  normalizeActivityRow,
  type ProjectWorkItemActivityDto,
} from "@/lib/crm/projectWorkItemActivityDto";
import type { ProjectWorkItemDto } from "@/lib/crm/projectWorkItemDto";

/** Uždarytos eilutės (įskaitant grąžintas) — nebe „atviros“ Darbas lentoje. */
export const PROJECT_WORK_ITEM_CLOSED_STATUSES: readonly string[] = [
  "completed",
  "closed",
  "cancelled",
  "lost",
  "neaktualus",
  "uždaryta",
  "returned_to_candidates",
  ...WORK_ITEM_COMPLETION_RESULT_VALUES,
  ...PROCUREMENT_WORK_ITEM_COMPLETION_RESULT_VALUES,
];

/** Užbaigta skirtukas — be grąžintų į kandidatus. */
export const PROJECT_WORK_ITEM_COMPLETED_TAB_STATUSES: readonly string[] =
  PROJECT_WORK_ITEM_CLOSED_STATUSES.filter((s) => s !== "returned_to_candidates");

/** Veiklos stulpeliai (ne `*`) — timeline / same-day logikai. */
export const PROJECT_WORK_ITEM_ACTIVITY_SELECT =
  "id,work_item_id,occurred_at,action_type,call_status,next_action,next_action_date,comment,performed_by";

export function isCompletedWorkItemRow(resultStatus: string | null | undefined): boolean {
  return isProjectWorkItemClosed(resultStatus) && !isReturnedToCandidates(resultStatus);
}

/** ISO riba „galimai šiandien uždaryta“ (buffer dėl TZ). */
export function recentWorkUpdatedSinceIso(hoursBack = 36): string {
  return new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();
}

function chunkIds<T>(ids: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Activities for board / Užbaigta same-day — chunked `.in()` (parallel). */
export async function loadActivitiesByWorkItemIds(
  supabase: SupabaseClient,
  workItemIds: string[]
): Promise<Record<string, ProjectWorkItemActivityDto[]>> {
  const byId: Record<string, ProjectWorkItemActivityDto[]> = {};
  if (workItemIds.length === 0) return byId;

  const results = await Promise.all(
    chunkIds(workItemIds).map((part) =>
      supabase
        .from("project_work_item_activities")
        .select(PROJECT_WORK_ITEM_ACTIVITY_SELECT)
        .in("work_item_id", part)
        .order("occurred_at", { ascending: true })
    )
  );

  for (const { data: actRows, error } of results) {
    if (error || !actRows) continue;
    for (const r of actRows) {
      const a = normalizeActivityRow(r as Record<string, unknown>);
      if (!byId[a.work_item_id]) byId[a.work_item_id] = [];
      byId[a.work_item_id]!.push(a);
    }
  }
  return byId;
}

export type ClientLiveEnrichment = {
  total_revenue: number;
  last_invoice_date: string | null;
  email: string | null;
  phone: string | null;
  invoice_number: string | null;
};

/**
 * Live client fields for Kanban footers (`v_client_list_from_invoices` + latest invoice number).
 * Chunks run in parallel; each chunk fetches view + RPC together.
 */
export async function loadClientLiveEnrichmentByKeys(
  supabase: SupabaseClient,
  clientKeys: string[]
): Promise<Map<string, ClientLiveEnrichment>> {
  const liveByKey = new Map<string, ClientLiveEnrichment>();
  const keys = [...new Set(clientKeys.map((k) => k.trim()).filter(Boolean))];
  if (keys.length === 0) return liveByKey;

  const liveResults = await Promise.all(
    chunkIds(keys).map(async (part) => {
      const [{ data }, { data: recentInv }] = await Promise.all([
        supabase
          .from("v_client_list_from_invoices")
          .select("client_key,total_revenue,last_invoice_date,email,phone")
          .in("client_key", part),
        supabase.rpc("recent_invoices_for_clients", { p_codes: part }),
      ]);
      return { data, recentInv };
    })
  );

  for (const { data, recentInv } of liveResults) {
    for (const r of (data ?? []) as Array<{
      client_key?: unknown;
      total_revenue?: unknown;
      last_invoice_date?: unknown;
      email?: unknown;
      phone?: unknown;
    }>) {
      const ck = String(r.client_key ?? "").trim();
      if (!ck) continue;
      const total = Number(r.total_revenue ?? 0);
      const lastRaw = r.last_invoice_date;
      const last =
        lastRaw == null || lastRaw === ""
          ? null
          : typeof lastRaw === "string"
            ? lastRaw.slice(0, 10)
            : String(lastRaw).slice(0, 10);
      const em = r.email != null && String(r.email).trim() !== "" ? String(r.email).trim() : null;
      const ph = r.phone != null && String(r.phone).trim() !== "" ? String(r.phone).trim() : null;
      liveByKey.set(ck, {
        total_revenue: Number.isFinite(total) ? total : 0,
        last_invoice_date: last,
        email: em,
        phone: ph,
        invoice_number: null,
      });
    }
    const firstLatestNumForKey = new Set<string>();
    for (const row of (recentInv ?? []) as Array<{
      client_key?: unknown;
      invoice_number?: unknown;
    }>) {
      const ck = String(row.client_key ?? "").trim();
      if (!ck || firstLatestNumForKey.has(ck)) continue;
      firstLatestNumForKey.add(ck);
      const entry = liveByKey.get(ck);
      if (!entry) continue;
      entry.invoice_number =
        row.invoice_number != null && String(row.invoice_number).trim() !== ""
          ? String(row.invoice_number).trim()
          : null;
    }
  }
  return liveByKey;
}

export function applyClientLiveEnrichmentToWorkItems(
  items: ProjectWorkItemDto[],
  liveByKey: Map<string, ClientLiveEnrichment>
): ProjectWorkItemDto[] {
  if (liveByKey.size === 0) return items;
  return items.map((w) => {
    if (w.source_type !== "auto" && w.source_type !== "linked_client") return w;
    const row = liveByKey.get(w.client_key);
    if (!row) return w;
    return {
      ...w,
      client_live_all_time_revenue: row.total_revenue,
      client_live_last_invoice_date: row.last_invoice_date,
      client_last_invoice_number: row.invoice_number,
      client_invoice_email: row.email,
      client_invoice_phone: row.phone,
    };
  });
}

/**
 * Darbas SSR enrichment: activities + live client fields in parallel
 * (was sequential — ~activitiesMs + liveMs; now ~max of the two).
 */
export async function enrichDarbasWorkItems(
  supabase: SupabaseClient,
  workItems: ProjectWorkItemDto[]
): Promise<{
  workItems: ProjectWorkItemDto[];
  activitiesByWorkItemId: Record<string, ProjectWorkItemActivityDto[]>;
  timings: { activitiesMs: number; liveMs: number; parallelMs: number };
}> {
  const ids = workItems.map((w) => w.id);
  const revenueKeys = workItems
    .filter((w) => (w.source_type === "auto" || w.source_type === "linked_client") && w.client_key.trim() !== "")
    .map((w) => w.client_key);

  const t0 = Date.now();
  let activitiesMs = 0;
  let liveMs = 0;
  const [activitiesByWorkItemId, liveByKey] = await Promise.all([
    (async () => {
      const t = Date.now();
      const out = await loadActivitiesByWorkItemIds(supabase, ids);
      activitiesMs = Date.now() - t;
      return out;
    })(),
    (async () => {
      const t = Date.now();
      const out = await loadClientLiveEnrichmentByKeys(supabase, revenueKeys);
      liveMs = Date.now() - t;
      return out;
    })(),
  ]);
  const parallelMs = Date.now() - t0;

  return {
    workItems: applyClientLiveEnrichmentToWorkItems(workItems, liveByKey),
    activitiesByWorkItemId,
    timings: { activitiesMs, liveMs, parallelMs },
  };
}
