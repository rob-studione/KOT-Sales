/** Normalize view / API row to list row shape (same as clients list). */
export type ClientListViewRow = {
  client_key: string;
  company_code: string | null;
  client_id: string | null;
  company_name: string | null;
  vat_code: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  last_invoice_date: string | null;
  invoice_count: number;
  total_revenue: string | number | null;
};

function toSafeNumber(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function mapRawToClientListRow(r: {
  client_key: string | null;
  company_code: string | null;
  client_id: string | null;
  company_name: string | null;
  vat_code: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  last_invoice_date: string | null;
  invoice_count: number | string | bigint | null;
  total_revenue: string | number | null;
}): ClientListViewRow {
  return {
    ...r,
    client_key: r.client_key == null ? "" : String(r.client_key),
    invoice_count: toSafeNumber(r.invoice_count),
  };
}
