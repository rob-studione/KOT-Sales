import { displayClientName } from "@/lib/crm/format";
import { completionResultLabel, parseCompletionResult } from "@/lib/crm/projectCompletion";

export const PROJECT_SORT_OPTIONS = ["revenue_desc", "last_invoice_desc", "order_count_desc"] as const;
export type ProjectSortOption = (typeof PROJECT_SORT_OPTIONS)[number];

export function parseProjectSortOption(raw: string | null | undefined): ProjectSortOption {
  if (raw === "last_invoice_desc" || raw === "order_count_desc") return raw;
  return "revenue_desc";
}

export function projectSortLabel(sort: ProjectSortOption): string {
  switch (sort) {
    case "last_invoice_desc":
      return "Paskutinė sąskaita (naujausia, visur)";
    case "order_count_desc":
      return "Užsakymų skaičius (daugiausia, intervale)";
    default:
      return "Apyvarta (didžiausia, visur)";
  }
}

/** Row from RPC `match_project_candidates` (dynamic list). */
export type SnapshotCandidateRow = {
  client_key: string;
  company_code: string | null;
  client_id: string | null;
  company_name: string;
  order_count: number;
  total_revenue: number;
  last_invoice_date: string;
  /** Paskutinė sąskaita iš visų duomenų (neaktyvumo logikai). */
  last_invoice_anywhere: string;
};

export function normalizeRpcCandidateRow(r: Record<string, unknown>): SnapshotCandidateRow {
  const key = r.client_key == null ? "" : String(r.client_key);
  const sliceD = (v: unknown) =>
    typeof v === "string" ? v.slice(0, 10) : String(v ?? "").slice(0, 10);
  return {
    client_key: key,
    company_code: r.company_code != null ? String(r.company_code) : null,
    client_id: r.client_id != null ? String(r.client_id) : null,
    company_name: r.company_name != null ? String(r.company_name) : "",
    order_count: Number(r.order_count ?? 0),
    total_revenue: Number(r.total_revenue ?? 0),
    last_invoice_date: sliceD(r.last_invoice_date),
    last_invoice_anywhere: sliceD(r.last_invoice_anywhere ?? r.last_invoice_date),
  };
}

/** Rezultato būsena: tuščia = vykdoma; uždarius — klientas vėl gali atsirasti kandidatuose (jei taisyklės tenkina). */
export const PROJECT_RESULT_STATUS_OPTIONS = [
  "",
  "in_progress",
  "completed",
  "closed",
  "lost",
  "neaktualus",
  "cancelled",
] as const;

export type ProjectResultStatus = (typeof PROJECT_RESULT_STATUS_OPTIONS)[number];

export function projectResultStatusLabel(v: string): string {
  const completion = parseCompletionResult(v);
  if (completion) return completionResultLabel(completion);
  const s = v.trim().toLowerCase();
  switch (s) {
    case "in_progress":
      return "Vykdoma";
    case "completed":
      return "Užbaigta";
    case "closed":
      return "Uždaryta";
    case "lost":
      return "Pralaimėta";
    case "neaktualus":
      return "Neaktualus";
    case "cancelled":
      return "Atšaukta";
    case "returned_to_candidates":
      return "Grąžinta į kandidatus";
    default:
      return "—";
  }
}

/** „KlientoID“ stulpeliui – įmonės kodas, kitaip client_id, kitaip „—“. */
export function formatProjectClientIdentifier(
  company_code: string | null | undefined,
  client_id: string | null | undefined
): string {
  const cc = (company_code ?? "").trim();
  if (cc) return cc;
  const cid = (client_id ?? "").trim();
  if (cid) return cid;
  return "—";
}

/** Fiksuotas pavadinimo snapshotas (ta pati logika kaip sąrašuose). */
export function snapshotClientDisplayName(
  company_name: string,
  company_code: string | null
): string {
  const n = displayClientName(company_name || null, company_code);
  return n === "—" && !company_name?.trim() ? "—" : n;
}

export function sortSnapshotCandidates(
  rows: SnapshotCandidateRow[],
  sort: ProjectSortOption
): SnapshotCandidateRow[] {
  const copy = [...rows];
  const tieBreak = (a: SnapshotCandidateRow, b: SnapshotCandidateRow) => {
    const ak = a.client_key;
    const bk = b.client_key;
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  };
  if (sort === "revenue_desc") {
    copy.sort((a, b) => b.total_revenue - a.total_revenue || tieBreak(a, b));
  } else if (sort === "last_invoice_desc") {
    copy.sort((a, b) =>
      a.last_invoice_anywhere < b.last_invoice_anywhere
        ? 1
        : a.last_invoice_anywhere > b.last_invoice_anywhere
          ? -1
          : tieBreak(a, b)
    );
  } else {
    copy.sort((a, b) => b.order_count - a.order_count || tieBreak(a, b));
  }
  return copy;
}

export function aggregateSnapshotTotals(rows: SnapshotCandidateRow[]): {
  clientCount: number;
  totalRevenue: number;
} {
  let totalRevenue = 0;
  for (const r of rows) {
    totalRevenue += Number.isFinite(r.total_revenue) ? r.total_revenue : 0;
  }
  return { clientCount: rows.length, totalRevenue };
}
