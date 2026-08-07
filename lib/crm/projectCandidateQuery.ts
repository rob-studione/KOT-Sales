import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeRpcCandidateRow,
  parseProjectSortOption,
  sortSnapshotCandidates,
  type ProjectSortOption,
  type SnapshotCandidateRow,
} from "@/lib/crm/projectSnapshot";
import { isManualProjectType, isProcurementProjectType, projectTypeFromDbRow } from "@/lib/crm/projectType";

export async function rpcMatchProjectCandidates(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string,
  minOrderCount: number,
  inactivityDays: number,
  projectId: string | null,
  requireBusinessId: boolean = false
): Promise<{ ok: true; rows: SnapshotCandidateRow[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("match_project_candidates", {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_min_orders: minOrderCount,
    p_inactivity_days: inactivityDays,
    p_project_id: projectId,
    p_require_business_id: requireBusinessId,
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
  candidates_require_business_id?: boolean | null;
};

export type MatchProjectCandidatesPageResult = {
  rows: SnapshotCandidateRow[];
  totalCount: number;
  sort: ProjectSortOption;
  offset: number;
  limit: number;
};

/**
 * Server-side puslapis auto kandidatams (sort + search DB pusėje).
 * Prioritetų rank = `offset + index + 1` (ta pati tvarka kaip sortSnapshotCandidates).
 * Jei paged RPC timeout / nerastas — fallback į pilną sąrašą + slice (kad UI nenulūžtų).
 */
export async function rpcMatchProjectCandidatesPage(
  supabase: SupabaseClient,
  opts: {
    dateFrom: string;
    dateTo: string;
    minOrderCount: number;
    inactivityDays: number;
    projectId: string | null;
    requireBusinessId?: boolean;
    sort: ProjectSortOption;
    limit: number;
    offset: number;
    search?: string | null;
  }
): Promise<{ ok: true; data: MatchProjectCandidatesPageResult } | { ok: false; error: string }> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit) || 20, 1), 100);
  const offset = Math.max(Math.trunc(opts.offset) || 0, 0);
  const search = (opts.search ?? "").trim();

  const { data, error } = await supabase.rpc("match_project_candidates_page", {
    p_date_from: opts.dateFrom,
    p_date_to: opts.dateTo,
    p_min_orders: opts.minOrderCount,
    p_inactivity_days: opts.inactivityDays,
    p_project_id: opts.projectId,
    p_require_business_id: Boolean(opts.requireBusinessId),
    p_sort: opts.sort,
    p_limit: limit,
    p_offset: offset,
    p_search: search.length > 0 ? search : null,
  });

  if (!error) {
    const payload = (data ?? {}) as { total_count?: unknown; items?: unknown };
    const totalRaw = payload.total_count;
    const totalCount =
      typeof totalRaw === "number" && Number.isFinite(totalRaw)
        ? Math.max(0, Math.trunc(totalRaw))
        : typeof totalRaw === "string" && Number.isFinite(Number(totalRaw))
          ? Math.max(0, Math.trunc(Number(totalRaw)))
          : 0;
    const itemsRaw = Array.isArray(payload.items) ? (payload.items as Record<string, unknown>[]) : [];
    return {
      ok: true,
      data: {
        rows: itemsRaw.map(normalizeRpcCandidateRow),
        totalCount,
        sort: opts.sort,
        offset,
        limit,
      },
    };
  }

  const msg = String(error.message ?? "");
  const missingFn =
    error.code === "42883" ||
    msg.toLowerCase().includes("match_project_candidates_page") ||
    msg.includes("Could not find the function");
  const timedOut = /statement timeout|canceling statement/i.test(msg);

  if (!missingFn && !timedOut) {
    return { ok: false, error: msg };
  }

  // Fallback: senas full RPC + JS sort/filter/slice (lėčiau, bet veikia).
  const full = await rpcMatchProjectCandidates(
    supabase,
    opts.dateFrom,
    opts.dateTo,
    opts.minOrderCount,
    opts.inactivityDays,
    opts.projectId,
    Boolean(opts.requireBusinessId)
  );
  if (!full.ok) {
    return {
      ok: false,
      error: timedOut
        ? `Kandidatų užklausa nutrūko (timeout). ${full.error}`
        : missingFn
          ? "RPC match_project_candidates_page nerastas — pritaikykite migraciją 0122/0123."
          : full.error,
    };
  }

  let rows = sortSnapshotCandidates(full.rows, opts.sort);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((c) => {
      const name = String(c.company_name ?? "").toLowerCase();
      const code = String(c.company_code ?? "").toLowerCase();
      const cid = String(c.client_id ?? "").toLowerCase();
      const ck = String(c.client_key ?? "").toLowerCase();
      return name.includes(q) || code.includes(q) || cid.includes(q) || ck.includes(q);
    });
  }
  const totalCount = rows.length;
  const pageRows = rows.slice(offset, offset + limit);
  return {
    ok: true,
    data: { rows: pageRows, totalCount, sort: opts.sort, offset, limit },
  };
}

export async function fetchSortedCandidatesPageForProject(
  supabase: SupabaseClient,
  p: ProjectRulesRow,
  page: { pageIndex0: number; pageSize: number; search?: string | null }
): Promise<{ ok: true; data: MatchProjectCandidatesPageResult } | { ok: false; error: string }> {
  const t = projectTypeFromDbRow(p) ?? p.project_type;
  if (isManualProjectType(t) || isProcurementProjectType(t)) {
    return {
      ok: true,
      data: {
        rows: [],
        totalCount: 0,
        sort: parseProjectSortOption(String(p.sort_option ?? "")),
        offset: 0,
        limit: page.pageSize,
      },
    };
  }

  const sort = parseProjectSortOption(String(p.sort_option ?? ""));
  const pageSize = Math.min(Math.max(Math.trunc(page.pageSize) || 20, 1), 100);
  const pageIndex0 = Math.max(Math.trunc(page.pageIndex0) || 0, 0);

  return rpcMatchProjectCandidatesPage(supabase, {
    dateFrom: String(p.filter_date_from).slice(0, 10),
    dateTo: String(p.filter_date_to).slice(0, 10),
    minOrderCount: Number(p.min_order_count ?? 1),
    inactivityDays: Number(p.inactivity_days ?? 90),
    projectId: p.id,
    requireBusinessId: Boolean(p.candidates_require_business_id),
    sort,
    limit: pageSize,
    offset: pageIndex0 * pageSize,
    search: page.search,
  });
}

/** Pilnas sąrašas — preview / legacy pick fallback. Kandidatai tab naudoja paged RPC. */
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
    p.id,
    Boolean(p.candidates_require_business_id)
  );
  if (!loaded.ok) return loaded;
  const sort = parseProjectSortOption(String(p.sort_option ?? ""));
  return { ok: true, rows: sortSnapshotCandidates(loaded.rows, sort) };
}

/**
 * Pigus unikalių auto-kandidatų skaičius sidebarui (limit=1, grąžina total_count).
 * Manual / procurement → 0.
 */
export async function fetchAutomaticProjectCandidateCount(
  supabase: SupabaseClient,
  p: ProjectRulesRow
): Promise<number> {
  const t = projectTypeFromDbRow(p) ?? p.project_type;
  if (isManualProjectType(t) || isProcurementProjectType(t)) return 0;
  if (!p.filter_date_from || !p.filter_date_to) return 0;

  const page = await rpcMatchProjectCandidatesPage(supabase, {
    dateFrom: String(p.filter_date_from).slice(0, 10),
    dateTo: String(p.filter_date_to).slice(0, 10),
    minOrderCount: Number(p.min_order_count ?? 1),
    inactivityDays: Number(p.inactivity_days ?? 90),
    projectId: p.id,
    requireBusinessId: Boolean(p.candidates_require_business_id),
    sort: parseProjectSortOption(String(p.sort_option ?? "")),
    limit: 1,
    offset: 0,
    search: null,
  });
  if (!page.ok) return 0;
  return page.data.totalCount;
}

/** Parallel counts for sidebar; skips non-automatic. */
export async function fetchSidebarAutomaticCandidateCounts(
  supabase: SupabaseClient,
  projects: ProjectRulesRow[]
): Promise<Record<string, number>> {
  const auto = projects.filter((p) => {
    const t = projectTypeFromDbRow(p) ?? p.project_type;
    return !isManualProjectType(t) && !isProcurementProjectType(t);
  });
  if (auto.length === 0) return {};

  const entries = await Promise.all(
    auto.map(async (p) => {
      const n = await fetchAutomaticProjectCandidateCount(supabase, p);
      return [p.id, n] as const;
    })
  );

  const out: Record<string, number> = {};
  for (const [id, n] of entries) {
    if (n > 0) out[id] = n;
  }
  return out;
}

/** Vieno kliento pick: DB filtruoja pagal `p_client_key` (žymiai pigiau nei pilnas sąrašas). */
export async function rpcMatchProjectCandidateForPick(
  supabase: SupabaseClient,
  projectId: string,
  dateFrom: string,
  dateTo: string,
  minOrderCount: number,
  inactivityDays: number,
  clientKey: string,
  requireBusinessId: boolean = false
): Promise<{ ok: true; row: SnapshotCandidateRow | null } | { ok: false; error: string }> {
  const ck = String(clientKey ?? "").trim();
  if (!ck) return { ok: true, row: null };

  const { data, error } = await supabase.rpc("match_project_candidate_for_pick", {
    p_project_id: projectId,
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_min_orders: minOrderCount,
    p_inactivity_days: inactivityDays,
    p_client_key: ck,
    p_require_business_id: requireBusinessId,
  });

  if (error) {
    const msg = String(error.message ?? "");
    const missingFn =
      error.code === "42883" ||
      msg.toLowerCase().includes("match_project_candidate_for_pick") ||
      msg.includes("Could not find the function");
    if (missingFn) {
      return { ok: false, error: "RPC match_project_candidate_for_pick nerastas — pritaikykite migraciją 0082_match_project_candidate_for_pick.sql." };
    }
    return { ok: false, error: msg };
  }

  const raw = (data ?? []) as Record<string, unknown>[];
  if (!raw.length) return { ok: true, row: null };
  return { ok: true, row: normalizeRpcCandidateRow(raw[0]!) };
}
