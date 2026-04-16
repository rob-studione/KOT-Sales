import type { SupabaseClient } from "@supabase/supabase-js";

export type ProcurementContractsSortBy = "valid_until" | "value" | "days_left";
export type ProcurementContractsSortDir = "asc" | "desc";

export type ProcurementContractsFilters = {
  /** Free-text search across organization / object / supplier. */
  q?: string | null;
  organizationNames?: string[] | null;
  suppliers?: string[] | null;
  types?: string[] | null;
  validFrom?: string | null; // YYYY-MM-DD
  validTo?: string | null; // YYYY-MM-DD
  /** Exclude contract ids (e.g. already picked into work). */
  excludeIds?: string[] | null;
};

export const PROCUREMENT_CONTRACT_STATUSES = [
  "naujas",
  "susisiekti",
  "laukiame",
  "dalyvaujame",
  "laimėta",
  "prarasta",
] as const;

export type ProcurementContractStatus = (typeof PROCUREMENT_CONTRACT_STATUSES)[number];

export type ProcurementContractRow = {
  id: string;
  project_id: string;
  import_dedupe_key?: string;
  contract_uid: string;
  contract_number: string;
  contract_object: string;
  organization_name: string;
  organization_code: string;
  supplier: string;
  value: number | null;
  valid_until: string;
  type: string;
  assigned_to: string | null;
  notify_days_before: number;
  notified_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export function procurementStatusLabelLt(status: string): string {
  switch (String(status).trim().toLowerCase()) {
    case "naujas":
      return "Naujas";
    case "susisiekti":
      return "Susisiekti";
    case "laukiame":
      return "Laukiame";
    case "dalyvaujame":
      return "Dalyvaujame";
    case "laimėta":
      return "Laimėta";
    case "prarasta":
      return "Prarasta";
    default:
      return status;
  }
}

function normalizeList(values: (string | null | undefined)[] | null | undefined): string[] {
  const out: string[] = [];
  for (const v of values ?? []) {
    const s = String(v ?? "").trim();
    if (s) out.push(s);
  }
  return [...new Set(out)];
}

function isYmd(s: string | null | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function applyProcurementContractsFilters(
  q: any,
  filters: ProcurementContractsFilters | undefined
) {
  let qb: any = q;
  const f = filters ?? {};

  const exclude = normalizeList(f.excludeIds ?? []);
  if (exclude.length > 0) {
    // PostgREST `in` expects: (a,b,c)
    const list = `(${exclude.map((x) => `"${x.replaceAll('"', "")}"`).join(",")})`;
    qb = qb.not("id", "in", list);
  }

  const orgs = normalizeList(f.organizationNames ?? []);
  if (orgs.length > 0) {
    qb = qb.in("organization_name", orgs);
  }
  const sups = normalizeList(f.suppliers ?? []);
  if (sups.length > 0) {
    qb = qb.in("supplier", sups);
  }
  const types = normalizeList(f.types ?? []);
  if (types.length > 0) {
    qb = qb.in("type", types);
  }

  if (isYmd(f.validFrom)) qb = qb.gte("valid_until", f.validFrom);
  if (isYmd(f.validTo)) qb = qb.lte("valid_until", f.validTo);

  const qText = String(f.q ?? "").trim();
  if (qText) {
    const safe = qText.replaceAll(",", " ");
    const pat = `%${safe}%`;
    qb = qb.or(`organization_name.ilike.${pat},contract_object.ilike.${pat},supplier.ilike.${pat}`);
  }

  return qb;
}

export async function fetchProcurementContractsCount(
  supabase: SupabaseClient,
  projectId: string,
  filters?: ProcurementContractsFilters
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  let q: any = supabase
    .from("project_procurement_contracts")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  q = applyProcurementContractsFilters(q, filters);

  const { count, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

export async function fetchProcurementContractsForProject(
  supabase: SupabaseClient,
  projectId: string,
  opts?: {
    limit?: number;
    offset?: number;
    sortBy?: ProcurementContractsSortBy;
    sortDir?: ProcurementContractsSortDir;
    filters?: ProcurementContractsFilters;
  }
): Promise<{ ok: true; rows: ProcurementContractRow[] } | { ok: false; error: string }> {
  const limit = opts?.limit;
  const offset = opts?.offset;
  const sortBy = opts?.sortBy ?? "valid_until";
  const sortDir = opts?.sortDir ?? "asc";

  let q: any = supabase
    .from("project_procurement_contracts")
    .select("*")
    .eq("project_id", projectId);

  q = applyProcurementContractsFilters(q, opts?.filters);

  // `days_left` is derived from `valid_until`, so ordering by `valid_until` is equivalent.
  const sortCol = sortBy === "value" ? "value" : "valid_until";
  q = q.order(sortCol, { ascending: sortDir === "asc", nullsFirst: false });

  if (typeof limit === "number" && typeof offset === "number" && limit > 0 && offset >= 0) {
    q = q.range(offset, offset + limit - 1);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as ProcurementContractRow[];
  return { ok: true, rows };
}

export async function fetchProcurementContractsValueSum(
  supabase: SupabaseClient,
  projectId: string,
  filters?: ProcurementContractsFilters
): Promise<{ ok: true; sumEur: number } | { ok: false; error: string }> {
  let q: any = supabase
    .from("project_procurement_contracts")
    .select("value")
    .eq("project_id", projectId);
  q = applyProcurementContractsFilters(q, filters);

  // NOTE: We only need values; keep a generous cap to avoid huge payloads.
  const { data, error } = await q.limit(12000);
  if (error) return { ok: false, error: error.message };
  let sum = 0;
  for (const r of (data ?? []) as Array<{ value: number | null }>) {
    const v = r?.value;
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) sum += n;
  }
  return { ok: true, sumEur: sum };
}
