import type { SupabaseClient } from "@supabase/supabase-js";
import { logSupabaseError } from "@/lib/supabase/supabaseErrorLog";
import type { PageSize } from "@/lib/crm/pagination";
import type { ManualCandidateListStatus } from "@/lib/crm/projectPageSearchParams";

export type ManualCandidatesRpcFilters = {
  candidateStatus?: ManualCandidateListStatus;
  search?: string | null;
};

/** Visada 6 named paramų – PostgREST aiškiai renkasi vieną signatūrą; NULL = be filtro. */
function rpcManualCandidatesArgs(
  projectId: string,
  pageSize: number,
  offset: number,
  countOnly: boolean,
  filters?: ManualCandidatesRpcFilters
): Record<string, unknown> {
  const candidateStatus = filters?.candidateStatus === "netinkamas" ? "netinkamas" : "active";
  const q = (filters?.search ?? "").trim();
  return {
    p_project_id: projectId,
    p_limit: pageSize,
    p_offset: offset,
    p_count_only: countOnly,
    p_candidate_status: candidateStatus,
    p_search: q === "" ? null : q,
  };
}

/** Po migracijos 0044_project_manual_leads_import_fields.sql */
const PROJECT_MANUAL_LEADS_SELECT_FULL =
  "id,project_id,company_name,company_code,annual_revenue,annual_revenue_year,crm_status,crm_client_id,last_order_at,email,phone,contact_name,notes,status,created_at";

/** Tik 0034_project_manual_leads.sql — jei 0044 dar nepritaikyta. */
const PROJECT_MANUAL_LEADS_SELECT_LEGACY =
  "id,project_id,company_name,company_code,email,phone,contact_name,notes,created_at";

/** Kai DB dar neturi CSV importo stulpelių (migracija 0044). */
function isMissingManualLeadImportColumnsError(err: { message?: string; code?: string } | null | undefined): boolean {
  const code = String(err?.code ?? "");
  if (code === "42703") return true;
  const m = String(err?.message ?? "").toLowerCase();
  if (!m.includes("does not exist") && !m.includes("could not find")) return false;
  return (
    m.includes("annual_revenue") ||
    m.includes("crm_status") ||
    m.includes("crm_client_id") ||
    m.includes("last_order_at")
  );
}

function normalizeLegacyManualLeadRow(row: Record<string, unknown>): ProjectManualLeadRow {
  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    company_name: String(row.company_name ?? ""),
    company_code: row.company_code != null && String(row.company_code).trim() !== "" ? String(row.company_code).trim() : null,
    annual_revenue: null,
    annual_revenue_year: null,
    crm_status: "new_lead",
    crm_client_id: null,
    last_order_at: null,
    email: row.email != null && String(row.email).trim() !== "" ? String(row.email).trim() : null,
    phone: row.phone != null && String(row.phone).trim() !== "" ? String(row.phone).trim() : null,
    contact_name: row.contact_name != null && String(row.contact_name).trim() !== "" ? String(row.contact_name).trim() : null,
    notes: row.notes != null && String(row.notes).trim() !== "" ? String(row.notes).trim() : null,
    status: "active",
    created_at: String(row.created_at ?? ""),
  };
}

export type ProjectManualLeadRow = {
  id: string;
  project_id: string;
  company_name: string;
  company_code: string | null;
  annual_revenue: number | null;
  annual_revenue_year: number | null;
  crm_status: "existing_client" | "former_client" | "new_lead";
  crm_client_id: string | null;
  last_order_at: string | null;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  notes: string | null;
  status: "active" | "netinkamas";
  created_at: string;
};

export type ProjectManualLinkedClientRow = {
  id: string;
  project_id: string;
  client_key: string;
  created_at: string;
  company_name: string;
  company_code: string | null;
  email: string | null;
};

export async function fetchManualLeadsForProject(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectManualLeadRow[]> {
  const full = await supabase
    .from("project_manual_leads")
    .select(PROJECT_MANUAL_LEADS_SELECT_FULL)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (full.error) {
    logSupabaseError("projectManualLeads.fetch full select", full.error);
    if (isMissingManualLeadImportColumnsError(full.error)) {
      console.warn(
        "[projectManualLeads] Trūksta 0044 stulpelių — naudojamas LEGACY select. Pritaikyk migraciją supabase/migrations/0044_project_manual_leads_import_fields.sql"
      );
      const leg = await supabase
        .from("project_manual_leads")
        .select(PROJECT_MANUAL_LEADS_SELECT_LEGACY)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (leg.error) {
        logSupabaseError("projectManualLeads.fetch legacy select", leg.error);
        return [];
      }
      return (leg.data ?? []).map((r) => normalizeLegacyManualLeadRow(r as Record<string, unknown>));
    }
    return [];
  }
  return (full.data ?? []) as ProjectManualLeadRow[];
}

export type ManualCandidatePageRow =
  | { kind: "lead"; lead: ProjectManualLeadRow }
  | { kind: "linked"; linked: ProjectManualLinkedClientRow };

type RpcPageJson = {
  total_count?: number | string;
  items?: Array<{ kind?: string; row?: Record<string, unknown> }>;
};

function parseCrmStatus(raw: unknown): ProjectManualLeadRow["crm_status"] {
  const s = String(raw ?? "").trim();
  if (s === "existing_client" || s === "former_client" || s === "new_lead") return s;
  return "new_lead";
}

function parseManualCandidateStatus(raw: unknown): ProjectManualLeadRow["status"] {
  return String(raw ?? "").trim() === "netinkamas" ? "netinkamas" : "active";
}

function leadRowFromRpcJson(row: Record<string, unknown>): ProjectManualLeadRow {
  const rev = row.annual_revenue;
  const revNum =
    rev != null && rev !== "" && (typeof rev === "number" || (typeof rev === "string" && rev.trim() !== ""))
      ? Number(rev)
      : null;
  const y = row.annual_revenue_year;
  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    company_name: String(row.company_name ?? ""),
    company_code: row.company_code != null && String(row.company_code).trim() !== "" ? String(row.company_code).trim() : null,
    annual_revenue: revNum != null && Number.isFinite(revNum) ? revNum : null,
    annual_revenue_year: y != null && String(y).trim() !== "" ? Number(y) : null,
    crm_status: parseCrmStatus(row.crm_status),
    crm_client_id: row.crm_client_id != null && String(row.crm_client_id).trim() !== "" ? String(row.crm_client_id).trim() : null,
    last_order_at:
      row.last_order_at != null && String(row.last_order_at).trim() !== ""
        ? String(row.last_order_at).slice(0, 10)
        : null,
    email: row.email != null && String(row.email).trim() !== "" ? String(row.email).trim() : null,
    phone: row.phone != null && String(row.phone).trim() !== "" ? String(row.phone).trim() : null,
    contact_name: row.contact_name != null && String(row.contact_name).trim() !== "" ? String(row.contact_name).trim() : null,
    notes: row.notes != null && String(row.notes).trim() !== "" ? String(row.notes).trim() : null,
    status: parseManualCandidateStatus(row.status),
    created_at: String(row.created_at ?? ""),
  };
}

function parseRpcPayload(data: unknown): RpcPageJson | null {
  if (data == null) return null;
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as RpcPageJson;
    } catch {
      return null;
    }
  }
  if (typeof data === "object") return data as RpcPageJson;
  return null;
}

/**
 * Vienas puslapis sujungto sąrašo (lead + linked), „blocking“ ir rikiavimas DB pusėje (RPC).
 * Reikia migracijos `0045` + `0047_manual_candidates_rpc_filters.sql` (filtrai).
 */
export async function fetchManualProjectCandidatesPage(
  supabase: SupabaseClient,
  projectId: string,
  pageIndex0: number,
  pageSize: PageSize,
  opts?: { countOnly?: boolean } & ManualCandidatesRpcFilters
): Promise<{ rows: ManualCandidatePageRow[]; totalCount: number }> {
  const countOnly = opts?.countOnly === true;
  const offset = countOnly ? 0 : pageIndex0 * pageSize;
  const rpcArgs = rpcManualCandidatesArgs(projectId, pageSize, offset, countOnly, opts);

  const { data, error } = await supabase.rpc("fetch_manual_project_candidates_page", rpcArgs);

  if (error) {
    logSupabaseError("projectManualLeads.rpc fetch_manual_project_candidates_page", error, {
      rpc: "public.fetch_manual_project_candidates_page",
      ...rpcArgs,
    });
    return { rows: [], totalCount: 0 };
  }

  const payload = parseRpcPayload(data);
  const totalRaw = payload?.total_count ?? 0;
  const totalCount = typeof totalRaw === "string" ? Number(totalRaw) : Number(totalRaw);
  const safeTotal = Number.isFinite(totalCount) ? Math.max(0, Math.floor(totalCount)) : 0;
  const rawItems = Array.isArray(payload?.items) ? payload!.items! : [];

  const rows: ManualCandidatePageRow[] = [];
  for (const it of rawItems) {
    const kind = String(it?.kind ?? "");
    const row = it?.row;
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (kind === "lead") {
      rows.push({ kind: "lead", lead: leadRowFromRpcJson(r) });
    } else if (kind === "linked") {
      const ck = String(r.client_key ?? "");
      rows.push({
        kind: "linked",
        linked: {
          id: String(r.id ?? ""),
          project_id: String(r.project_id ?? ""),
          client_key: ck,
          created_at: String(r.created_at ?? ""),
          company_name: ck,
          company_code: null,
          email: null,
        },
      });
    }
  }

  const keys = [...new Set(rows.filter((x): x is Extract<ManualCandidatePageRow, { kind: "linked" }> => x.kind === "linked").map((x) => x.linked.client_key))].filter(Boolean);
  const viewByKey = new Map<string, { company_name: string | null; company_code: string | null; email: string | null }>();
  if (keys.length > 0) {
    const { data: viewRows, error: vErr } = await supabase
      .from("v_client_list_from_invoices")
      .select("client_key,company_name,company_code,email")
      .in("client_key", keys);
    if (!vErr && viewRows) {
      for (const v of viewRows as Array<{
        client_key: string;
        company_name: string | null;
        company_code: string | null;
        email: string | null;
      }>) {
        viewByKey.set(String(v.client_key), {
          company_name: v.company_name,
          company_code: v.company_code,
          email: v.email,
        });
      }
    }
  }

  for (const item of rows) {
    if (item.kind !== "linked") continue;
    const ck = item.linked.client_key;
    const meta = viewByKey.get(ck);
    item.linked.company_name = (meta?.company_name ?? "").trim() || ck;
    item.linked.company_code =
      meta?.company_code != null && String(meta.company_code).trim() !== "" ? String(meta.company_code).trim() : null;
    item.linked.email = meta?.email != null && String(meta.email).trim() !== "" ? String(meta.email).trim() : null;
  }

  return { rows, totalCount: safeTotal };
}

/** Tik bendras matomų kandidatų skaičius (kitiems skirtukams, antraštėms). */
export async function fetchManualProjectCandidatesTotalCount(
  supabase: SupabaseClient,
  projectId: string,
  filters?: ManualCandidatesRpcFilters
): Promise<number> {
  const r = await fetchManualProjectCandidatesPage(supabase, projectId, 0, 20, {
    countOnly: true,
    ...filters,
  });
  return r.totalCount;
}
