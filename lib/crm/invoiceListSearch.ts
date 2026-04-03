/**
 * Partial search on /invoices: strip characters that break PostgREST `.or()` / ILIKE patterns.
 */
export function parseInvoiceSearchInput(raw: string | string[] | undefined): string {
  const s = typeof raw === "string" ? raw : "";
  return s.trim().replace(/[%_,]/g, "");
}
