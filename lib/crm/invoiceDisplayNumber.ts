/**
 * Invoice123 `Invoices` schema: series_title (e.g. VK-000) + series_number (integer).
 * @see https://app.invoice123.com/docs/definitions/openapi.1_0.json — components.schemas.Invoices
 */
export function formatInvoice123DisplayNumber(
  seriesTitle: string | null | undefined,
  seriesNumber: unknown
): string | null {
  const title = (seriesTitle ?? "").trim();
  const raw =
    typeof seriesNumber === "number"
      ? seriesNumber
      : typeof seriesNumber === "string" && seriesNumber.trim() !== ""
        ? Number(seriesNumber)
        : NaN;
  const n = Number.isFinite(raw) ? Math.trunc(raw) : NaN;

  if (title && Number.isFinite(n)) {
    // Match Saskaita123-style labels (e.g. VK-000 28828) — no thousands grouping on the running number.
    return `${title} ${String(n)}`.replace(/\s+/g, " ").trim();
  }
  if (title) return title;
  if (Number.isFinite(n)) return String(n);
  return null;
}

/**
 * Human-facing invoice number for UI and `invoices.invoice_number` column.
 * Prefers series_title + series_number; falls back to internal Invoice123 `id` when series is unusable.
 */
export function resolveInvoiceNumber(
  seriesTitle: string | null | undefined,
  seriesNumber: unknown,
  invoiceId: string
): string {
  const display = formatInvoice123DisplayNumber(seriesTitle, seriesNumber);
  if (display != null && display.trim() !== "") return display.trim();
  return invoiceId;
}

/** Prefer stored `invoice_number` (from sync); else derive from series or id. */
export function displayInvoiceNumberFromRow(row: {
  invoice_number?: string | null;
  series_title?: string | null;
  series_number?: number | null;
  invoice_id: string;
}): string {
  const stored = row.invoice_number?.trim();
  if (stored) return stored;
  return resolveInvoiceNumber(row.series_title, row.series_number, row.invoice_id);
}
