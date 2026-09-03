import { CP_CATEGORIES, type CommercialProposalSnapshot, type CpPriceCategory } from "@/lib/commercialProposal/types";

export type CpCategoryDiscounts = Record<CpPriceCategory, number>;

export const ZERO_CATEGORY_DISCOUNTS: CpCategoryDiscounts = {
  translation: 0,
  ai_translation: 0,
  additional_service: 0,
};

export function clampDiscountPct(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function parseDiscountInput(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const t = raw.trim().replace(",", ".");
  if (t === "" || t === "—") return { ok: true, value: 0 };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, error: "Neteisingas procentas." };
  return { ok: true, value: clampDiscountPct(n) };
}

export function normalizeCategoryDiscounts(
  input?: Partial<Record<string, unknown>> | null,
  fallback = 0
): CpCategoryDiscounts {
  const fb = clampDiscountPct(fallback);
  return {
    translation: clampDiscountPct(input?.translation ?? fb),
    ai_translation: clampDiscountPct(input?.ai_translation ?? fb),
    additional_service: clampDiscountPct(input?.additional_service ?? fb),
  };
}

export function categoryDiscount(discounts: CpCategoryDiscounts, category: CpPriceCategory): number {
  return discounts[category] ?? 0;
}

export function discountsFromSnapshot(snapshot: Pick<CommercialProposalSnapshot, "discounts" | "global_discount_pct">): CpCategoryDiscounts {
  return normalizeCategoryDiscounts(snapshot.discounts, snapshot.global_discount_pct);
}

export function uniformDiscountPct(discounts: CpCategoryDiscounts): number | null {
  const first = discounts.translation;
  return CP_CATEGORIES.every((c) => discounts[c] === first) ? first : null;
}

export function isLineIncluded(line: { included?: boolean }): boolean {
  return line.included !== false;
}

export function includedServicesFromLines(
  lines: Array<{ category: CpPriceCategory; included?: boolean }>
): Record<CpPriceCategory, boolean> {
  return {
    translation: lines.some((l) => l.category === "translation" && isLineIncluded(l)),
    ai_translation: lines.some((l) => l.category === "ai_translation" && isLineIncluded(l)),
    additional_service: lines.some((l) => l.category === "additional_service" && isLineIncluded(l)),
  };
}
