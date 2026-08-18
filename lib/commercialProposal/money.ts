/** Half-up to 2 decimal places (EUR cents). */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function applyGlobalDiscount(basePrice: number, discountPct: number): number {
  const d = Number.isFinite(discountPct) ? Math.min(100, Math.max(0, discountPct)) : 0;
  return roundMoney(basePrice * (1 - d / 100));
}

export function parseMoneyInput(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMoney(n);
}

/** Reference PDF uses Lithuanian decimal comma: 10,80 */
export function formatLtMoney(value: number): string {
  return roundMoney(value).toFixed(2).replace(".", ",");
}

export function formatProposalPriceCell(line: {
  is_free: boolean;
  is_from_price: boolean;
  final_price: number | null;
  currency: string;
  unit: string | null;
}): string {
  if (line.is_free) return "nemokamas";
  if (line.final_price == null) return "—";
  const amount = `${formatLtMoney(line.final_price)} ${line.currency}`.trim();
  const unit = (line.unit ?? "").trim();
  const unitPart = unit ? ` / ${unit}` : "";
  if (line.is_from_price) {
    const prefix = unit ? "nuo " : "Nuo ";
    return `${prefix}${amount}${unitPart}`;
  }
  return `${amount}${unitPart}`;
}
