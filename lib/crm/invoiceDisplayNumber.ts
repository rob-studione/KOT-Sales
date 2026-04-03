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
