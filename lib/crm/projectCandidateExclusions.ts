import type { SupabaseClient } from "@supabase/supabase-js";
import type { PageSize } from "@/lib/crm/pagination";
import type { SnapshotCandidateRow } from "@/lib/crm/projectSnapshot";
import { logSupabaseError } from "@/lib/supabase/supabaseErrorLog";

export async function fetchExcludedAutoCandidatesPage(
  supabase: SupabaseClient,
  projectId: string,
  pageIndex0: number,
  pageSize: PageSize,
  opts?: { search?: string | null }
): Promise<{ rows: SnapshotCandidateRow[]; totalCount: number }> {
  const q = (opts?.search ?? "").trim();

  let base = supabase
    .from("project_candidate_exclusions")
    .select("client_key,created_at", { count: "exact" })
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (q) {
    base = base.ilike("client_key", `%${q}%`);
  }

  const from = pageIndex0 * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await base.range(from, to);

  if (error) {
    logSupabaseError("projectCandidateExclusions.fetch page", error, {
      projectId,
      pageIndex0,
      pageSize,
      q: q || null,
    });
    return { rows: [], totalCount: 0 };
  }

  const totalCount = typeof count === "number" && Number.isFinite(count) ? count : (data ?? []).length;
  const keys = (data ?? [])
    .map((r: any) => String(r.client_key ?? "").trim())
    .filter(Boolean);

  const byCode = new Map<
    string,
    { company_code: string; company_name: string | null; client_id: string | null; total_revenue: number | null; last_invoice_date: string | null }
  >();

  if (keys.length > 0) {
    const { data: viewRows, error: vErr } = await supabase
      .from("v_client_list_from_invoices")
      .select("company_code,company_name,client_id,total_revenue,last_invoice_date")
      .in("company_code", keys);
    if (vErr) {
      logSupabaseError("projectCandidateExclusions.lookup v_client_list_from_invoices", vErr, { projectId });
    } else {
      for (const v of (viewRows ?? []) as any[]) {
        const code = String(v.company_code ?? "").trim();
        if (!code) continue;
        byCode.set(code, {
          company_code: code,
          company_name: v.company_name != null ? String(v.company_name) : null,
          client_id: v.client_id != null ? String(v.client_id) : null,
          total_revenue: v.total_revenue != null ? Number(v.total_revenue) : null,
          last_invoice_date: v.last_invoice_date != null ? String(v.last_invoice_date).slice(0, 10) : null,
        });
      }
    }
  }

  const rows: SnapshotCandidateRow[] = keys.map((ck) => {
    const m = byCode.get(ck) ?? null;
    const name = (m?.company_name ?? "").trim() || ck;
    const d = m?.last_invoice_date ?? "2000-01-01";
    const revenue = m?.total_revenue != null && Number.isFinite(m.total_revenue) ? Number(m.total_revenue) : 0;
    return {
      client_key: ck,
      company_code: m?.company_code ?? null,
      client_id: m?.client_id ?? null,
      company_name: name,
      order_count: 0,
      total_revenue: revenue,
      last_invoice_date: d,
      last_invoice_anywhere: d,
    };
  });

  return { rows, totalCount };
}

