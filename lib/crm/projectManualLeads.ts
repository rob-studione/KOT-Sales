import type { SupabaseClient } from "@supabase/supabase-js";
import { logSupabaseError } from "@/lib/supabase/supabaseErrorLog";
import type { PageSize } from "@/lib/crm/pagination";
import type { ManualCandidateListStatus } from "@/lib/crm/projectPageSearchParams";

export type ManualLeadRevenueSort = "revenue_desc" | "revenue_asc";

export type ManualCandidatesRpcFilters = {
  candidateStatus?: ManualCandidateListStatus;
  search?: string | null;
  /** Default: revenue_desc (didžiausia apyvarta pirma). */
  revenueSort?: ManualLeadRevenueSort;
};

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
  last_invoice_date: string | null;
  crm_status: ProjectManualLeadRow["crm_status"];
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

function parseCrmStatus(raw: unknown): ProjectManualLeadRow["crm_status"] {
  const s = String(raw ?? "").trim();
  if (s === "existing_client" || s === "former_client" || s === "new_lead") return s;
  return "new_lead";
}

function parseManualCandidateStatus(raw: unknown): ProjectManualLeadRow["status"] {
  return String(raw ?? "").trim() === "netinkamas" ? "netinkamas" : "active";
}

function leadRowFromDb(row: Record<string, unknown>): ProjectManualLeadRow {
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

function sanitizeManualCandidateSearch(raw: string): string {
  return raw.replace(/[%_,.()\"'\\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Cold leads kandidatai: paprasta lentelės užklausa + rikiavimas pagal apyvartą.
 * Esami/buvę klientai čia neturi būti (valoma importu + sync) — UI nebeskenuoja CRM.
 */
export async function fetchManualProjectCandidatesPage(
  supabase: SupabaseClient,
  projectId: string,
  pageIndex0: number,
  pageSize: PageSize,
  opts?: { countOnly?: boolean } & ManualCandidatesRpcFilters
): Promise<{ rows: ManualCandidatePageRow[]; totalCount: number }> {
  const countOnly = opts?.countOnly === true;
  const candidateStatus = opts?.candidateStatus === "netinkamas" ? "netinkamas" : "active";
  const q = sanitizeManualCandidateSearch((opts?.search ?? "").trim());
  const revenueAsc = opts?.revenueSort === "revenue_asc";
  const start = pageIndex0 * pageSize;

  let query: any = supabase
    .from("project_manual_leads")
    .select(countOnly ? "id" : PROJECT_MANUAL_LEADS_SELECT_FULL, {
      count: "exact",
      head: countOnly,
    })
    .eq("project_id", projectId)
    .eq("status", candidateStatus);

  if (q) {
    query = query.or(`company_name.ilike.%${q}%,company_code.ilike.%${q}%`);
  }

  if (!countOnly) {
    query = query
      .order("annual_revenue", { ascending: revenueAsc, nullsFirst: false })
      .order("company_name", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1);
  }

  const { data, count, error } = await query;
  if (error) {
    logSupabaseError("projectManualLeads.fetch page", error);
    return { rows: [], totalCount: 0 };
  }

  if (countOnly) return { rows: [], totalCount: count ?? 0 };

  const rows: ManualCandidatePageRow[] = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    kind: "lead" as const,
    lead: leadRowFromDb(r),
  }));

  return { rows, totalCount: count ?? rows.length };
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
